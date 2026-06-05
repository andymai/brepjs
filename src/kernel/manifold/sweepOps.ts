/**
 * Sweep, loft, and extrusion operations for the manifold adapter.
 *
 * extrude/revolve run natively on manifold-3d (`Manifold.extrude` / `revolve`
 * over a recovered cross-section polygon). loft, sweep/simplePipe, helicalSweep,
 * revolveVec, and draftPrism are mesh approximations built by skinning the
 * profile along a discretized path (see {@link ./approximations.js}).
 *
 * Critically, every op records an op-node capturing EXACT intent — the profile
 * polygon and frame, the path samples, the angle/radius/pitch — so a B-rep
 * kernel can replay the real OCCT operation instead of the mesh approximation.
 * @module
 */

import type { KernelSweepOps } from '@/kernel/interfaces/sweepOps.js';
import type { KernelShape, KernelType } from '@/kernel/types.js';
import type { ManifoldModule } from './helpers.js';
import { notImplemented } from './helpers.js';
import { makeNode, type OpNode } from './opGraph.js';
import { type ManifoldShape, nodeOf, unwrap, wrap } from './meshHandle.js';
import {
  type CrossSection,
  type SweepFrame,
  type Vec3,
  add,
  cross,
  frameForNormal,
  length3,
  normalize3,
  orientPositive,
  placeRing,
  profileCrossSection,
  resampleClosed,
  rotationMinimizingFrames,
  scaleVec,
  skinRings,
  sub,
} from './approximations.js';

type ManifoldOriented = {
  rotate(r: Vec3): unknown;
  translate(t: Vec3): unknown;
  transform(m: number[]): unknown;
};
type ManifoldMeshLike = { numProp: number; vertProperties: Float32Array };

const RAD_PER_DEG = Math.PI / 180;

function asShape(shape: KernelShape): ManifoldShape {
  return shape as ManifoldShape;
}

function clampRevolveDeg(angleRad: number): number {
  const deg = angleRad * (180 / Math.PI);
  return deg > 360 ? 360 : deg;
}

interface GpComponent {
  X(): number;
  Y(): number;
  Z(): number;
}

function gpToVec3(value: unknown): Vec3 | undefined {
  const c = value as Partial<GpComponent> | null | undefined;
  if (c && typeof c.X === 'function' && typeof c.Y === 'function' && typeof c.Z === 'function') {
    return [c.X(), c.Y(), c.Z()];
  }
  return undefined;
}

/**
 * Extract (origin, direction) from a revolve axis. Accepts the manifold-native
 * `{origin, direction}` form and a gp_Ax1-style KernelType (what `createAxis1`
 * produces, matching the KernelSweepOps contract and every other adapter).
 */
function axisOriginDirection(axis: unknown): { origin: Vec3; direction: Vec3 } | undefined {
  if (axis && typeof axis === 'object') {
    const obj = axis as { origin?: unknown; direction?: unknown };
    if ('origin' in obj && 'direction' in obj) {
      return { origin: obj.origin as Vec3, direction: obj.direction as Vec3 };
    }
    const ax1 = axis as { Location?: () => unknown; Direction?: () => unknown };
    if (typeof ax1.Location === 'function' && typeof ax1.Direction === 'function') {
      const origin = gpToVec3(ax1.Location());
      const direction = gpToVec3(ax1.Direction());
      if (origin && direction) return { origin, direction };
    }
  }
  return undefined;
}

/** manifold-3d Polygons input: a single closed loop as Vec2 tuples. */
function toPolygon(section: CrossSection): Array<[number, number]> {
  return section.outline.map((p): [number, number] => [p[0], p[1]]);
}

function serializeSection(section: CrossSection): Record<string, unknown> {
  return {
    outline: section.outline,
    origin: section.origin,
    xAxis: section.xAxis,
    yAxis: section.yAxis,
  };
}

function sectionFrame(section: CrossSection): SweepFrame {
  return {
    origin: section.origin,
    xAxis: section.xAxis,
    yAxis: section.yAxis,
    tangent: normalize3(cross(section.xAxis, section.yAxis)),
  };
}

function characteristicRadius(section: CrossSection): number {
  let max = 0;
  for (const p of section.outline) max = Math.max(max, Math.hypot(p[0], p[1]));
  return max || 1;
}

function meshVertices(shape: ManifoldShape): Vec3[] {
  const solid = unwrap(shape) as { getMesh?: () => ManifoldMeshLike } | undefined;
  const mesh = solid?.getMesh?.();
  if (!mesh) return [];
  const stride = mesh.numProp;
  const count = Math.floor(mesh.vertProperties.length / stride);
  const pts: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    pts.push([
      mesh.vertProperties[i * stride] ?? 0,
      mesh.vertProperties[i * stride + 1] ?? 0,
      mesh.vertProperties[i * stride + 2] ?? 0,
    ]);
  }
  return pts;
}

/**
 * Recover path sample points from a spine handle. The spine's op-node carries
 * its polyline under `path` or `points`; otherwise we fall back to the spine
 * mesh's vertices in order, then to a unit +Z segment. Replay uses the recorded
 * `path` verbatim.
 */
function spinePath(spine: KernelShape, segments: number): Vec3[] {
  const shape = asShape(spine);
  const params = (shape.node as { params?: Record<string, unknown> } | undefined)?.params;
  const recorded =
    (params?.['path'] as Vec3[] | undefined) ?? (params?.['points'] as Vec3[] | undefined);
  if (recorded && recorded.length >= 2) {
    return recorded.map((p): Vec3 => [p[0], p[1], p[2]]);
  }
  const meshPts = meshVertices(shape);
  if (meshPts.length >= 2) return meshPts;

  const out: Vec3[] = [];
  const n = Math.max(2, segments);
  for (let i = 0; i < n; i++) out.push([0, 0, i / (n - 1)]);
  return out;
}

function spineNodeOrSynthetic(spine: KernelShape): OpNode {
  const shape = spine as ManifoldShape | undefined;
  return shape?.node ?? makeNode('spine', {}, []);
}

/**
 * Place a +Z extrusion so its base sits at the section origin and it grows along
 * `dir`. Sections are typically in the XY plane; this keeps the common case
 * exact and otherwise re-bases onto the section frame.
 */
export function orientExtrusion(
  solid: ManifoldOriented,
  section: CrossSection,
  dir: Vec3
): ManifoldOriented {
  // The base is built in manifold-local space: the outline lives in XY (local
  // x = outline.x, local y = outline.y) extruded along +Z. Re-base it onto the
  // section's world frame with a full basis transform — manifold X→xAxis,
  // Y→yAxis, Z→extrude dir — then translate to the plane origin.
  //
  // A basis transform (not an Euler rotate) is required: the previous rotate
  // aligned ONLY the extrude axis to `dir` and left the in-plane (x,y) axes at
  // their defaults, so any sketch on a non-XY plane was mis-oriented — e.g. a
  // 'YZ' scoop ramp landed mirrored below Z=0. Manifold's Mat4 is column-major
  // (cols 0-2 = where local X/Y/Z map, col 3 = translation).
  const x = section.xAxis;
  const y = section.yAxis;
  const o = section.origin;
  // prettier-ignore
  const matrix = [
    x[0], x[1], x[2], 0,
    y[0], y[1], y[2], 0,
    dir[0], dir[1], dir[2], 0,
    o[0], o[1], o[2], 1,
  ];
  return solid.transform(matrix) as ManifoldOriented;
}

/**
 * Express the section outline as (radius, axialOffset) pairs relative to the
 * revolution axis, suitable for Manifold.revolve (which spins about local Y).
 */
function profileRadialOutline(
  section: CrossSection,
  axisOrigin: Vec3,
  axisDirection: Vec3
): Array<[number, number]> {
  const axis = normalize3(axisDirection);
  return section.outline.map((p): [number, number] => {
    const world = add(
      section.origin,
      add(scaleVec(section.xAxis, p[0]), scaleVec(section.yAxis, p[1]))
    );
    const rel = sub(world, axisOrigin);
    const axial = rel[0] * axis[0] + rel[1] * axis[1] + rel[2] * axis[2];
    const radius = length3(sub(rel, scaleVec(axis, axial)));
    return [radius, axial];
  });
}

/**
 * Re-base a Manifold.revolve result (spun about local +Y at origin) onto the
 * world revolution axis: rotate local +Y onto the axis direction via a single
 * rotation about their cross product, then translate to the axis origin.
 */
function orientRevolution(
  solid: ManifoldOriented,
  axisOrigin: Vec3,
  axisDirection: Vec3
): ManifoldOriented {
  let placed = solid;
  const axis = normalize3(axisDirection);
  const alignedY = Math.abs(axis[0]) < 1e-9 && Math.abs(axis[2]) < 1e-9 && axis[1] > 0;
  if (!alignedY) {
    const angle = Math.acos(Math.max(-1, Math.min(1, axis[1]))) * (180 / Math.PI);
    let rotAxis = cross([0, 1, 0], axis);
    if (length3(rotAxis) < 1e-9) rotAxis = [1, 0, 0];
    rotAxis = normalize3(rotAxis);
    placed = placed.rotate([
      rotAxis[0] * angle,
      rotAxis[1] * angle,
      rotAxis[2] * angle,
    ]) as ManifoldOriented;
  }
  if (axisOrigin[0] !== 0 || axisOrigin[1] !== 0 || axisOrigin[2] !== 0) {
    placed = placed.translate([axisOrigin[0], axisOrigin[1], axisOrigin[2]]) as ManifoldOriented;
  }
  return placed;
}

function helicalPath(
  axisOrigin: Vec3,
  axisDirection: Vec3,
  radius: number,
  pitch: number,
  turns: number
): Vec3[] {
  const axis = normalize3(axisDirection);
  const { xAxis, yAxis } = frameForNormal(axis);
  const totalAngle = turns * 2 * Math.PI;
  const steps = Math.max(8, Math.ceil(Math.abs(turns) * 24));
  const height = pitch * turns;
  const pts: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = totalAngle * t;
    const radial = add(
      scaleVec(xAxis, radius * Math.cos(a)),
      scaleVec(yAxis, radius * Math.sin(a))
    );
    pts.push(add(axisOrigin, add(radial, scaleVec(axis, height * t))));
  }
  return pts;
}

function interpScale(scaleValues: number[]): ((t: number) => number) | undefined {
  if (scaleValues.length === 0) return undefined;
  return (t: number): number => {
    const idx = t * (scaleValues.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(scaleValues.length - 1, lo + 1);
    const frac = idx - lo;
    return (scaleValues[lo] ?? 1) * (1 - frac) + (scaleValues[hi] ?? 1) * frac;
  };
}

function extrudeOp(
  module: ManifoldModule,
  face: KernelShape,
  direction: [number, number, number],
  length: number
): KernelShape {
  const section = profileCrossSection(face);
  const dir = normalize3([direction[0], direction[1], direction[2]]);
  const height = length3([direction[0] * length, direction[1] * length, direction[2] * length]);
  // Outer contour plus any holes (CW-wound) → manifold subtracts the holes.
  const polygons: Array<[number, number]>[] = [
    toPolygon(section),
    ...(section.holes ?? []).map((h) => h.map((p) => [p[0], p[1]] as [number, number])),
  ];
  const base = orientPositive(
    module,
    module.Manifold.extrude(polygons, height)
  ) as ManifoldOriented;
  const solid = orientExtrusion(base, section, dir);
  return wrap(
    solid,
    makeNode(
      'extrude',
      {
        outline: section.outline,
        holes: section.holes,
        origin: section.origin,
        xAxis: section.xAxis,
        yAxis: section.yAxis,
        direction: [direction[0], direction[1], direction[2]],
        length,
      },
      [nodeOf(asShape(face))]
    )
  );
}

function revolveOp(
  module: ManifoldModule,
  shape: KernelShape,
  axisOrigin: Vec3,
  axisDirection: Vec3,
  angleRad: number,
  op: string,
  params: Readonly<Record<string, unknown>>
): KernelShape {
  const section = profileCrossSection(shape);
  const angleDeg = clampRevolveDeg(angleRad);
  const radial = profileRadialOutline(section, axisOrigin, axisDirection);
  const base = module.Manifold.revolve([radial], 0, angleDeg) as ManifoldOriented;
  const solid = orientRevolution(base, axisOrigin, axisDirection);
  return wrap(solid, makeNode(op, params, [nodeOf(asShape(shape))]));
}

/**
 * Rotate `ring`'s point order to the cyclic offset that best lines up with
 * `ref` (minimizes Σ‖ring[(j+off)%n] − ref[j]‖²). Both rings must share a
 * vertex count. Keeps loft correspondence from twisting between dissimilar
 * sections.
 */
function alignRing(ring: Vec3[], ref: Vec3[]): Vec3[] {
  const n = ring.length;
  if (n === 0 || ref.length !== n) return ring;
  let bestOff = 0;
  let bestCost = Infinity;
  for (let off = 0; off < n; off++) {
    let cost = 0;
    for (let j = 0; j < n && cost < bestCost; j++) {
      const a = ring[(j + off) % n] ?? [0, 0, 0];
      const b = ref[j] ?? [0, 0, 0];
      const dx = a[0] - b[0];
      const dy = a[1] - b[1];
      const dz = a[2] - b[2];
      cost += dx * dx + dy * dy + dz * dz;
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestOff = off;
    }
  }
  if (bestOff === 0) return ring;
  const out: Vec3[] = [];
  for (let j = 0; j < n; j++) out.push(ring[(j + bestOff) % n] ?? [0, 0, 0]);
  return out;
}

function loftOp(
  module: ManifoldModule,
  wires: KernelShape[],
  op: string,
  extraParams: Readonly<Record<string, unknown>>
): KernelShape {
  if (wires.length < 2) {
    throw new Error('manifold: loft requires at least two profiles');
  }
  const sections = wires.map(profileCrossSection);
  // Sections may have different vertex counts (e.g. a circle vs a rounded rect).
  // Resample every outline to a shared count (the max, by arc length) so
  // skinRings can connect them by index.
  const target = sections.reduce((mx, s) => Math.max(mx, s.outline.length), 0);
  const rings: Vec3[][] = sections.map((s) =>
    placeRing({ ...s, outline: resampleClosed(s.outline, target) }, sectionFrame(s))
  );
  // Align correspondence: skinRings connects ring[i][j]→ring[i+1][j] by index, so
  // each ring's start point must line up with the previous ring's. Rotate every
  // ring to the cyclic offset that minimizes squared distance to its predecessor,
  // otherwise dissimilar sections (circle→rect) skin into a twisted, low-volume
  // solid.
  for (let i = 1; i < rings.length; i++) {
    rings[i] = alignRing(rings[i] ?? [], rings[i - 1] ?? []);
  }
  const solid = skinRings(module, rings);
  return wrap(
    solid,
    makeNode(
      op,
      { sections: sections.map(serializeSection), ...extraParams },
      wires.map((w) => nodeOf(asShape(w)))
    )
  );
}

function sweepAlong(
  module: ManifoldModule,
  profile: KernelShape,
  path: Vec3[],
  spineNode: OpNode,
  op: string,
  extraParams: Readonly<Record<string, unknown>>,
  scaleAt?: (t: number) => number
): KernelShape {
  const section = profileCrossSection(profile);
  const frames = rotationMinimizingFrames(path, section.xAxis);
  const n = frames.length;
  const rings: Vec3[][] = frames.map((f, i) => {
    const scale = scaleAt ? scaleAt(n > 1 ? i / (n - 1) : 0) : 1;
    return placeRing(section, f, scale);
  });
  const solid = skinRings(module, rings);
  return wrap(
    solid,
    makeNode(
      op,
      {
        section: serializeSection(section),
        path: path.map((p): Vec3 => [p[0], p[1], p[2]]),
        ...extraParams,
      },
      [nodeOf(asShape(profile)), spineNode]
    )
  );
}

function draftPrismOp(
  module: ManifoldModule,
  shape: KernelShape,
  face: KernelShape,
  height: number | null,
  angleDeg: number,
  fuse: boolean
): KernelShape {
  if (height === null) return shape;

  const section = profileCrossSection(face);
  const normal = normalize3(cross(section.xAxis, section.yAxis));
  const taper = Math.tan(angleDeg * RAD_PER_DEG);
  const topFrame: SweepFrame = {
    origin: add(section.origin, scaleVec(normal, height)),
    xAxis: section.xAxis,
    yAxis: section.yAxis,
    tangent: normal,
  };
  const topScale = 1 + (taper * height) / characteristicRadius(section);
  const prism = skinRings(module, [
    placeRing(section, sectionFrame(section), 1),
    placeRing(section, topFrame, topScale),
  ]);

  const node = makeNode(
    'draftPrism',
    {
      outline: section.outline,
      origin: section.origin,
      xAxis: section.xAxis,
      yAxis: section.yAxis,
      height,
      angleDeg,
      fuse,
    },
    [nodeOf(asShape(face))]
  );

  if (fuse) {
    const base = asShape(shape);
    return wrap(unwrap(base).add(prism), makeNode('makeFuse', {}, [nodeOf(base), node]));
  }
  return wrap(prism, node);
}

function revolveEntries(module: ManifoldModule): Pick<KernelSweepOps, 'revolve' | 'revolveVec'> {
  return {
    revolve: (shape, axis, angle) => {
      const resolved = axisOriginDirection(axis);
      if (!resolved) {
        throw new Error(
          'manifold: revolve could not read the axis; pass {origin,direction}, a gp_Ax1, or use revolveVec'
        );
      }
      const { origin, direction } = resolved;
      const section = profileCrossSection(shape);
      return revolveOp(module, shape, origin, direction, angle, 'revolve', {
        ...serializeSection(section),
        axisOrigin: [origin[0], origin[1], origin[2]],
        axisDirection: [direction[0], direction[1], direction[2]],
        angleDeg: clampRevolveDeg(angle),
      });
    },
    revolveVec: (shape, center, direction, angle) => {
      const section = profileCrossSection(shape);
      return revolveOp(module, shape, center, direction, angle, 'revolveVec', {
        ...serializeSection(section),
        center: [center[0], center[1], center[2]],
        direction: [direction[0], direction[1], direction[2]],
        angleDeg: clampRevolveDeg(angle),
      });
    },
  };
}

function sweepFamilyEntries(
  module: ManifoldModule
): Pick<
  KernelSweepOps,
  'sweep' | 'simplePipe' | 'sweepWithOptions' | 'sweepPipeShell' | 'helicalSweep'
> {
  return {
    sweep: (wire, spine, options) => {
      const extra: Record<string, unknown> = {};
      if (options?.transitionMode !== undefined) extra['transitionMode'] = options.transitionMode;
      return sweepAlong(
        module,
        wire,
        spinePath(spine, 16),
        spineNodeOrSynthetic(spine),
        'sweep',
        extra
      );
    },
    simplePipe: (profile, spine) =>
      sweepAlong(
        module,
        profile,
        spinePath(spine, 16),
        spineNodeOrSynthetic(spine),
        'simplePipe',
        {}
      ),
    sweepWithOptions: (profile, pathEdge, contactMode, scaleValues, segments) =>
      sweepAlong(
        module,
        profile,
        spinePath(pathEdge, Math.max(2, segments || 16)),
        spineNodeOrSynthetic(pathEdge),
        'sweepWithOptions',
        { contactMode, scaleValues: [...scaleValues], segments },
        interpScale(scaleValues)
      ),
    sweepPipeShell: (profile, spine, options) => {
      const extra: Record<string, unknown> = {};
      if (options?.transitionMode !== undefined) extra['transitionMode'] = options.transitionMode;
      const shape = sweepAlong(
        module,
        profile,
        spinePath(spine, 16),
        spineNodeOrSynthetic(spine),
        'sweepPipeShell',
        extra
      );
      if (options?.shellMode) return { shape, firstShape: profile, lastShape: profile };
      return shape;
    },
    helicalSweep: (profile, axisOrigin, axisDirection, radius, pitch, turns) =>
      sweepAlong(
        module,
        profile,
        helicalPath(axisOrigin, axisDirection, radius, pitch, turns),
        spineNodeOrSynthetic(profile),
        'helicalSweep',
        {
          axisOrigin: [axisOrigin[0], axisOrigin[1], axisOrigin[2]],
          axisDirection: [axisDirection[0], axisDirection[1], axisDirection[2]],
          radius,
          pitch,
          turns,
        }
      ),
  };
}

export function makeSweepOps(module: ManifoldModule): KernelSweepOps {
  return {
    extrude: (face, direction, length) => extrudeOp(module, face, direction, length),
    ...revolveEntries(module),
    loft: (wires, ruled) => loftOp(module, wires, 'loft', { ruled: ruled ?? false }),
    loftAdvanced: (wires, options) =>
      loftOp(module, wires, 'loftAdvanced', {
        solid: options?.solid ?? true,
        ruled: options?.ruled ?? false,
        tolerance: options?.tolerance,
      }),
    ...sweepFamilyEntries(module),
    draftPrism: (shape, face, _baseFace, height, angleDeg, fuse) =>
      draftPrismOp(module, shape, face, height, angleDeg, fuse),
    buildExtrusionLaw: (profile, length, endFactor): KernelType => ({
      type: 'extrusionLaw',
      profile,
      length,
      endFactor,
    }),
    loftBatch: () => notImplemented('loftBatch'),
    extrudeBatch: (entries) => entries.map((e) => extrudeOp(module, e.face, e.direction, e.length)),
  };
}
