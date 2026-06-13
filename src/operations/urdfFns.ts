/**
 * URDF interchange: export a brepjs assembly + its joints to URDF, and import a
 * URDF document back into links and joints.
 *
 * URDF natively models single-DOF joints, so `revolute` and `prismatic` joints
 * round-trip (parents, axes, and limits preserved). Multi-DOF joints
 * (cylindrical/planar/spherical) and joints carrying a fixed `offset` (e.g.
 * Denavit-Hartenberg links) have no faithful single-joint URDF representation
 * and are reported as an error on export.
 *
 * Revolute limits are radians in URDF and degrees in brepjs, so they are
 * converted on the boundary. The XML is parsed with a small URDF-shaped reader
 * (no XML dependency); it handles the standard `<robot>/<link>/<joint>` subset.
 */

import { type Result, ok, err } from '@/core/result.js';
import { validationError, BrepErrorCode } from '@/core/errors.js';
import type { Vec3 } from '@/core/types.js';
import { quatFromAxisAngle, quatMultiply, quatRotate } from '@/utils/quaternion.js';
import type { AssemblyNode } from './assemblyFns.js';
import { walkAssembly } from './assemblyFns.js';
import { revoluteJoint, prismaticJoint, type Joint } from './jointFns.js';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export interface UrdfExportOptions {
  /** `<robot name="...">`. Default `'robot'`. */
  name?: string;
  /** Default `effort` limit emitted for every joint. Default 0. */
  effort?: number;
  /** Default `velocity` limit emitted for every joint. Default 0. */
  velocity?: number;
  /** Per-link mesh filename for a `<visual>` reference, keyed by node name. */
  meshes?: Readonly<Record<string, string>>;
}

export interface UrdfDocument {
  readonly name: string;
  readonly links: string[];
  readonly joints: Joint[];
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Format a number for XML, normalizing -0 to 0. */
function fmt(n: number): string {
  return String(n === 0 ? 0 : n);
}

function vec(v: Vec3): string {
  return `${fmt(v[0])} ${fmt(v[1])} ${fmt(v[2])}`;
}

/**
 * Serialize an assembly's links and revolute/prismatic joints to a URDF string.
 * Returns an error if any joint is multi-DOF or carries a fixed `offset`, since
 * URDF cannot represent those as a single joint.
 */
export function exportURDF(
  assembly: AssemblyNode,
  options: UrdfExportOptions = {}
): Result<string> {
  const robot = options.name ?? 'robot';
  const effort = options.effort ?? 0;
  const velocity = options.velocity ?? 0;
  const meshes = options.meshes ?? {};

  const links: string[] = [];
  const joints: Joint[] = [];
  walkAssembly(assembly, (n) => {
    links.push(n.name);
    if (n.joints) joints.push(...(n.joints as readonly Joint[]));
  });

  for (const j of joints) {
    if (j.type !== 'revolute' && j.type !== 'prismatic') {
      return err(
        validationError(
          BrepErrorCode.VALIDATION_FAILED,
          `exportURDF: joint '${j.parent}->${j.child}' is '${j.type}'; URDF supports only revolute and prismatic joints`
        )
      );
    }
    if (j.offset) {
      return err(
        validationError(
          BrepErrorCode.VALIDATION_FAILED,
          `exportURDF: joint '${j.parent}->${j.child}' carries a fixed offset (e.g. a DH link) that URDF cannot represent as a single joint`
        )
      );
    }
  }

  const lines: string[] = ['<?xml version="1.0"?>', `<robot name="${escapeXml(robot)}">`];
  for (const link of links) {
    const mesh = meshes[link];
    if (mesh) {
      lines.push(
        `  <link name="${escapeXml(link)}">`,
        `    <visual><geometry><mesh filename="${escapeXml(mesh)}"/></geometry></visual>`,
        `  </link>`
      );
    } else {
      lines.push(`  <link name="${escapeXml(link)}"/>`);
    }
  }

  for (const j of joints) {
    const toRad = j.type === 'revolute';
    const lower = toRad ? j.min * DEG2RAD : j.min;
    const upper = toRad ? j.max * DEG2RAD : j.max;
    // brepjs prismatic FK slides from the parent origin and ignores axis.origin,
    // so emit a zero origin to keep the URDF faithful to brepjs's own kinematics
    // (a non-zero origin would make a ROS consumer place the slider differently).
    const origin: Vec3 = j.type === 'prismatic' ? [0, 0, 0] : j.axis.origin;
    lines.push(
      `  <joint name="${escapeXml(`${j.parent}_to_${j.child}`)}" type="${j.type}">`,
      `    <parent link="${escapeXml(j.parent)}"/>`,
      `    <child link="${escapeXml(j.child)}"/>`,
      `    <origin xyz="${vec(origin)}" rpy="0 0 0"/>`,
      `    <axis xyz="${vec(j.axis.direction)}"/>`,
      `    <limit lower="${fmt(lower)}" upper="${fmt(upper)}" effort="${fmt(effort)}" velocity="${fmt(velocity)}"/>`,
      `  </joint>`
    );
  }

  lines.push('</robot>', '');
  return ok(lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Read a string attribute from a tag's attribute text. */
function attr(text: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(text);
  return m?.[1];
}

/** Parse a whitespace-separated numeric triple, defaulting missing components to 0. */
function triple(s: string | undefined, fallback: Vec3): Vec3 {
  if (!s) return fallback;
  const parts = s.trim().split(/\s+/).map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/** Rotate an axis by a URDF roll-pitch-yaw (fixed-axis XYZ) triple in radians. */
function applyRpy(axis: Vec3, rpy: Vec3): Vec3 {
  const q = quatMultiply(
    quatMultiply(quatFromAxisAngle([0, 0, 1], rpy[2]), quatFromAxisAngle([0, 1, 0], rpy[1])),
    quatFromAxisAngle([1, 0, 0], rpy[0])
  );
  return quatRotate(q, axis);
}

/**
 * Parse a URDF document into its robot name, link names, and revolute/prismatic
 * joints. `continuous` joints become revolute with a full -180..180 range;
 * `fixed`/`floating`/`planar` joints are skipped (their links are still listed).
 * A non-zero `<origin rpy>` is folded into the joint axis direction; its
 * residual frame rotation is not represented (URDF's pre-motion frame offset has
 * no single-joint brepjs equivalent).
 */
export function importURDF(xml: string): Result<UrdfDocument> {
  const robotMatch = /<robot\b([^>]*)>/.exec(xml);
  if (!robotMatch) {
    return err(
      validationError(BrepErrorCode.VALIDATION_FAILED, 'importURDF: no <robot> element found')
    );
  }
  const name = attr(robotMatch[1] ?? '', 'name') ?? 'robot';

  const links: string[] = [];
  const linkRe = /<link\b([^>]*?)(?:\/>|>)/g;
  for (let m = linkRe.exec(xml); m; m = linkRe.exec(xml)) {
    const n = attr(m[1] ?? '', 'name');
    if (n) links.push(n);
  }

  const joints: Joint[] = [];
  const jointRe = /<joint\b([^>]*)>([\s\S]*?)<\/joint>/g;
  for (let m = jointRe.exec(xml); m; m = jointRe.exec(xml)) {
    const head = m[1] ?? '';
    const body = m[2] ?? '';
    const type = attr(head, 'type') ?? 'fixed';
    if (type === 'fixed' || type === 'floating' || type === 'planar') continue;

    const parentTag = /<parent\b([^>]*?)\/?>/.exec(body);
    const childTag = /<child\b([^>]*?)\/?>/.exec(body);
    const parent = attr(parentTag?.[1] ?? '', 'link');
    const child = attr(childTag?.[1] ?? '', 'link');
    if (!parent || !child) {
      return err(
        validationError(
          BrepErrorCode.VALIDATION_FAILED,
          `importURDF: joint missing parent/child link (${attr(head, 'name') ?? 'unnamed'})`
        )
      );
    }

    const originTag = /<origin\b([^>]*?)\/?>/.exec(body);
    const axisTag = /<axis\b([^>]*?)\/?>/.exec(body);
    const limitTag = /<limit\b([^>]*?)\/?>/.exec(body);

    const origin = triple(attr(originTag?.[1] ?? '', 'xyz'), [0, 0, 0]);
    const rpy = triple(attr(originTag?.[1] ?? '', 'rpy'), [0, 0, 0]);
    const rawAxis = triple(attr(axisTag?.[1] ?? '', 'xyz'), [1, 0, 0]); // URDF default +X
    const direction = applyRpy(rawAxis, rpy);

    const lowerRaw = Number(attr(limitTag?.[1] ?? '', 'lower') ?? NaN);
    const upperRaw = Number(attr(limitTag?.[1] ?? '', 'upper') ?? NaN);

    if (type === 'prismatic') {
      const opts =
        Number.isFinite(lowerRaw) && Number.isFinite(upperRaw)
          ? { min: lowerRaw, max: upperRaw }
          : {};
      joints.push(prismaticJoint(parent, child, { origin, direction }, opts));
    } else if (type === 'revolute' || type === 'continuous') {
      // continuous → full range
      const opts =
        type === 'continuous' || !Number.isFinite(lowerRaw) || !Number.isFinite(upperRaw)
          ? { min: -180, max: 180 }
          : { min: lowerRaw * RAD2DEG, max: upperRaw * RAD2DEG };
      joints.push(revoluteJoint(parent, child, { origin, direction }, opts));
    } else {
      return err(
        validationError(
          BrepErrorCode.VALIDATION_FAILED,
          `importURDF: joint '${attr(head, 'name') ?? 'unnamed'}' has unrecognized type '${type}'`
        )
      );
    }
  }

  return ok({ name, links, joints });
}
