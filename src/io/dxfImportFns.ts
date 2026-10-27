/**
 * DXF file import -- parse ASCII DXF entities into kernel wires.
 */

import { getKernel } from '@/kernel/index.js';
import type { KernelShape } from '@/kernel/types.js';
import type { Wire } from '@/core/shapeTypes.js';
import { createWire } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { ioError, BrepErrorCode } from '@/core/errors.js';

export interface DXFImportOptions {
  readonly layer?: string;
}

interface DXFEntity {
  readonly type: string;
  readonly layer: string;
  readonly data: Map<number, string>;
  /** Every group in file order; a polyline repeats its vertex codes. */
  readonly pairs: readonly (readonly [number, string])[];
}

type Point3 = [number, number, number];

interface PolylineVertex {
  readonly point: Point3;
  /** tan(θ/4) of the arc to the next vertex; 0 is a straight segment. */
  readonly bulge: number;
}

/** One edge to build, with the endpoints wire assembly chains on. */
interface Piece {
  readonly start: Point3;
  readonly end: Point3;
  build(): KernelShape;
}

// ---------------------------------------------------------------------------
// DXF Parser
// ---------------------------------------------------------------------------

function parseEntities(text: string): DXFEntity[] {
  const lines = text.split(/\r?\n/);
  const entities: DXFEntity[] = [];
  let inEntities = false;
  let current:
    | { type: string; layer: string; data: Map<number, string>; pairs: [number, string][] }
    | undefined;

  for (let i = 0; i < lines.length - 1; i += 2) {
    const codeLine = lines[i];
    const valueLine = lines[i + 1];
    if (codeLine === undefined || valueLine === undefined) continue;
    const code = parseInt(codeLine.trim(), 10);
    const value = valueLine.trim();

    if (isNaN(code)) continue;

    if (code === 2 && value === 'ENTITIES') {
      inEntities = true;
      continue;
    }

    if (!inEntities) continue;

    if (code === 0) {
      if (value === 'ENDSEC' || value === 'EOF') {
        if (current) entities.push(current);
        break;
      }

      if (current) entities.push(current);
      current = { type: value, layer: '0', data: new Map(), pairs: [] };
      continue;
    }

    if (current) {
      current.pairs.push([code, value]);
      if (code === 8) {
        current.layer = value;
      } else {
        current.data.set(code, value);
      }
    }
  }

  return entities;
}

function num(value: string | undefined, fallback = 0): number {
  if (value === undefined) return fallback;
  const n = parseFloat(value);
  return isNaN(n) ? fallback : n;
}

function getNum(data: Map<number, string>, code: number, fallback = 0): number {
  return num(data.get(code), fallback);
}

/** LWPOLYLINE vertices: each 10 starts one and its 20 and 42 follow; 38 is the elevation. */
function lwVertices(entity: DXFEntity): PolylineVertex[] {
  const z = getNum(entity.data, 38);
  const out: { point: Point3; bulge: number }[] = [];
  for (const [code, value] of entity.pairs) {
    const last = out[out.length - 1];
    if (code === 10) out.push({ point: [num(value), 0, z], bulge: 0 });
    else if (code === 20 && last) last.point[1] = num(value);
    else if (code === 42 && last) last.bulge = num(value);
  }
  return out;
}

/**
 * The DXF R12 polyline: a POLYLINE header, its VERTEX entities, then SEQEND. They arrive as
 * separate entities, so the header gathers the vertices that follow it.
 */
function gatherPolylines(entities: readonly DXFEntity[]): DXFEntity[] {
  const out: DXFEntity[] = [];
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e === undefined) continue;
    if (e.type !== 'POLYLINE') {
      if (e.type !== 'VERTEX' && e.type !== 'SEQEND') out.push(e);
      continue;
    }
    const vertices: [number, string][] = [];
    let j = i + 1;
    for (; j < entities.length && entities[j]?.type === 'VERTEX'; j++) {
      const v = entities[j];
      if (v === undefined) continue;
      vertices.push(
        [10, v.data.get(10) ?? '0'],
        [20, v.data.get(20) ?? '0'],
        [30, v.data.get(30) ?? '0'],
        [42, v.data.get(42) ?? '0']
      );
    }
    if (entities[j]?.type === 'SEQEND') j++;
    // The header's own 10/20/30 is a placeholder point, not a vertex.
    const own = e.pairs.filter(([code]) => code !== 10 && code !== 20 && code !== 30);
    out.push({ ...e, pairs: [...own, ...vertices] });
    i = j - 1;
  }
  return out;
}

function polyVertices(entity: DXFEntity): PolylineVertex[] {
  if (entity.type === 'LWPOLYLINE') return lwVertices(entity);
  const out: PolylineVertex[] = [];
  const p = entity.pairs;
  for (let k = 0; k < p.length; k++) {
    if (p[k]?.[0] !== 10) continue;
    out.push({
      point: [num(p[k]?.[1]), num(p[k + 1]?.[1]), num(p[k + 2]?.[1])],
      bulge: num(p[k + 3]?.[1]),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Entity -> edge pieces
// ---------------------------------------------------------------------------

// Points closer than this, in drawing units, are one point: an edge shorter is dropped, and
// endpoints this close are chained. It is OCCT's confusion tolerance, below which no kernel
// builds an edge either.
const JOIN_TOL = 1e-7;
const TURN = 2 * Math.PI;

interface Ocs {
  readonly normal: Point3;
  /** The default extrusion: OCS and world coordinates are the same. */
  readonly identity: boolean;
  toWorld(p: Point3): Point3;
}

function cross(a: Point3, b: Point3): Point3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit(v: Point3): Point3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * The entity's object coordinate system, from its extrusion direction (210/220/230), by DXF's
 * arbitrary axis algorithm. Planar entities (circles, arcs, 2D polylines) store their points in
 * it; the default extrusion +Z makes it the world frame.
 */
function ocsOf(data: Map<number, string>): Ocs {
  const normal = unit([getNum(data, 210), getNum(data, 220), getNum(data, 230, 1)]);
  if (normal[0] === 0 && normal[1] === 0 && normal[2] > 0) {
    return { normal: [0, 0, 1], identity: true, toWorld: (p) => p };
  }
  const nearZ = Math.abs(normal[0]) < 1 / 64 && Math.abs(normal[1]) < 1 / 64;
  const ax = unit(cross(nearZ ? [0, 1, 0] : [0, 0, 1], normal));
  const ay = unit(cross(normal, ax));
  return {
    normal,
    identity: false,
    toWorld: ([x, y, z]) => [
      ax[0] * x + ay[0] * y + normal[0] * z,
      ax[1] * x + ay[1] * y + normal[1] * z,
      ax[2] * x + ay[2] * y + normal[2] * z,
    ],
  };
}

function apart(a: Point3, b: Point3): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > JOIN_TOL;
}

function linePiece(a: Point3, b: Point3): Piece {
  return { start: a, end: b, build: () => getKernel().makeLineEdge(a, b) };
}

/**
 * An ARC entity about OCS center `c`, counterclockwise from angle `from` through `sweep` (0, 2π].
 * In the default OCS, which is most files, it's built from its center and angles, which stays
 * exact for a shallow arc. In a rotated OCS, whose in-plane axes the kernel doesn't share, it goes
 * through three points on it, or is a line when its sagitta is under the tolerance.
 */
function arcPiece(c: Point3, r: number, from: number, sweep: number, ocs: Ocs): Piece {
  const on = (t: number): Point3 =>
    ocs.toWorld([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t), c[2]]);
  const start = on(from);
  const end = on(from + sweep);
  if (ocs.identity) {
    return {
      start,
      end,
      build: () => getKernel().makeCircleArc(c, [0, 0, 1], r, from, from + sweep),
    };
  }
  if (r * (1 - Math.cos(sweep / 2)) <= JOIN_TOL) return linePiece(start, end);
  const mid = on(from + sweep / 2);
  return { start, end, build: () => getKernel().makeArcEdge(start, mid, end) };
}

/**
 * A polyline segment in its OCS: straight, or the arc a bulge describes. A bulge is tan(θ/4) of
 * the arc's included angle, counterclockwise when positive, so the arc's midpoint lies the sagitta
 * (bulge × half the chord) off the chord's midpoint, to its right for a positive bulge. The arc
 * goes through the supplied vertices exactly, so it meets its neighbours; one whose sagitta is
 * under the tolerance is a line to the kernel and is built as one.
 */
function segment(a: Point3, b: Point3, bulge: number, ocs: Ocs): Piece {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.hypot(dx, dy);
  const s = (bulge * d) / 2;
  if (Math.abs(s) <= JOIN_TOL) return linePiece(ocs.toWorld(a), ocs.toWorld(b));
  const mid: Point3 = [(a[0] + b[0]) / 2 + (dy / d) * s, (a[1] + b[1]) / 2 - (dx / d) * s, a[2]];
  const [wa, wm, wb] = [ocs.toWorld(a), ocs.toWorld(mid), ocs.toWorld(b)];
  return { start: wa, end: wb, build: () => getKernel().makeArcEdge(wa, wm, wb) };
}

// POLYLINE flag bits: 1 closed, 8 a 3D polyline, 16 a polygon mesh, 64 a polyface mesh.
const CLOSED = 1;
const POLYLINE_3D = 8;
const MESH_FORMS = 16 | 64;

function polylinePieces(entity: DXFEntity): Piece[] {
  const flags = getNum(entity.data, 70);
  // A mesh's vertices are grid or face records, not an outline to connect.
  if (entity.type === 'POLYLINE' && (flags & MESH_FORMS) !== 0) return [];
  const is3d = entity.type === 'POLYLINE' && (flags & POLYLINE_3D) !== 0;
  const ocs: Ocs = is3d
    ? { normal: [0, 0, 1], identity: true, toWorld: (p) => p }
    : ocsOf(entity.data);
  // A 2D POLYLINE keeps its elevation on the header; its vertices are in the OCS plane.
  const elevation = entity.type === 'POLYLINE' && !is3d ? getNum(entity.data, 30) : undefined;
  const vertices = polyVertices(entity).map((v) =>
    elevation === undefined ? v : { ...v, point: [v.point[0], v.point[1], elevation] as Point3 }
  );
  const closed = (flags & CLOSED) === CLOSED;
  const pieces: Piece[] = [];
  const count = closed ? vertices.length : vertices.length - 1;
  for (let k = 0; k < count; k++) {
    const a = vertices[k];
    const b = vertices[(k + 1) % vertices.length];
    if (!a || !b || !apart(a.point, b.point)) continue;
    pieces.push(segment(a.point, b.point, is3d ? 0 : a.bulge, ocs));
  }
  return pieces;
}

function entityToPieces(entity: DXFEntity): Piece[] {
  const { type, data } = entity;

  if (type === 'LINE') {
    // LINE endpoints are world coordinates; its extrusion only orients a thickness.
    const start: Point3 = [getNum(data, 10), getNum(data, 20), getNum(data, 30)];
    const end: Point3 = [getNum(data, 11), getNum(data, 21), getNum(data, 31)];
    return apart(start, end) ? [linePiece(start, end)] : [];
  }

  if (type === 'CIRCLE' || type === 'ARC') {
    const ocs = ocsOf(data);
    const c: Point3 = [getNum(data, 10), getNum(data, 20), getNum(data, 30)];
    const r = getNum(data, 40);
    if (!(r > 0) || !Number.isFinite(r)) return [];
    if (type === 'CIRCLE') {
      const center = ocs.toWorld(c);
      const at = ocs.toWorld([c[0] + r, c[1], c[2]]);
      return [
        { start: at, end: at, build: () => getKernel().makeCircleEdge(center, ocs.normal, r) },
      ];
    }
    // An arc runs counterclockwise about the extrusion from its start angle to its end angle.
    const from = (getNum(data, 50) * Math.PI) / 180;
    const to = (getNum(data, 51) * Math.PI) / 180;
    if (!Number.isFinite(from) || !Number.isFinite(to)) return [];
    let sweep = (to - from) % TURN;
    if (sweep <= 0) sweep += TURN;
    return [arcPiece(c, r, from % TURN, sweep, ocs)];
  }

  if (type === 'LWPOLYLINE' || type === 'POLYLINE') return polylinePieces(entity);

  return [];
}

// ---------------------------------------------------------------------------
// Wire assembly
// ---------------------------------------------------------------------------

/** Gives endpoints within JOIN_TOL of each other one id, by a grid of JOIN_TOL cells. */
function pointIds(): (p: Point3) => number {
  const cells = new Map<string, { p: Point3; id: number }[]>();
  let next = 0;
  return (p) => {
    const c = p.map((v) => Math.floor(v / JOIN_TOL));
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const hit = cells
            .get(`${(c[0] ?? 0) + dx},${(c[1] ?? 0) + dy},${(c[2] ?? 0) + dz}`)
            ?.find((e) => !apart(e.p, p));
          if (hit) return hit.id;
        }
      }
    }
    const key = c.join(',');
    const id = next++;
    const cell = cells.get(key);
    if (cell) cell.push({ p, id });
    else cells.set(key, [{ p, id }]);
    return id;
  };
}

/** The pieces in connected chains, each in walking order, so every chain makes one wire. */
function chainPieces(pieces: readonly Piece[]): Piece[][] {
  const idOf = pointIds();
  const ends = pieces.map((p) => [idOf(p.start), idOf(p.end)] as const);
  const at = new Map<number, number[]>();
  ends.forEach(([s, e], i) => {
    for (const id of s === e ? [s] : [s, e]) {
      const list = at.get(id);
      if (list) list.push(i);
      else at.set(id, [i]);
    }
  });
  const used = new Set<number>();
  // Each point's list is scanned once overall: used pieces stay behind its cursor.
  const cursor = new Map<number, number>();
  const step = (tip: number): { i: number; tip: number } | undefined => {
    const list = at.get(tip) ?? [];
    let c = cursor.get(tip) ?? 0;
    while (c < list.length && used.has(list[c] ?? -1)) c++;
    cursor.set(tip, c + 1);
    const i = list[c];
    if (i === undefined) return undefined;
    used.add(i);
    const [s, e] = ends[i] ?? [tip, tip];
    return { i, tip: s === tip ? e : s };
  };
  const chains: Piece[][] = [];
  pieces.forEach((first, i) => {
    if (used.has(i)) return;
    used.add(i);
    const chain = [first];
    const [s, e] = ends[i] ?? [0, 0];
    for (const [dir, from] of [
      [1, e],
      [-1, s],
    ] as const) {
      for (let hop = step(from); hop; hop = step(hop.tip)) {
        const piece = pieces[hop.i];
        if (!piece) continue;
        if (dir === 1) chain.push(piece);
        else chain.unshift(piece);
      }
    }
    chains.push(chain);
  });
  return chains;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Import a DXF file from a Blob, returning kernel wires.
 *
 * Parses ASCII DXF LINE, CIRCLE, ARC, LWPOLYLINE and R12 POLYLINE entities, polyline bulges
 * included, in world coordinates (planar entities are mapped out of their object coordinate
 * system). Polygon and polyface meshes are skipped. Edges that meet end to end become one wire,
 * so disconnected outlines come back as separate wires.
 *
 * @param blob - A Blob containing ASCII DXF data.
 * @param options - Optional import settings (layer filter).
 * @returns A `Result` wrapping an array of wires.
 */
export async function importDXF(blob: Blob, options?: DXFImportOptions): Promise<Result<Wire[]>> {
  let text: string;
  try {
    text = await blob.text();
  } catch (cause: unknown) {
    return err(ioError(BrepErrorCode.DXF_IMPORT_FAILED, 'Failed to read DXF blob', cause));
  }

  const allEntities = gatherPolylines(parseEntities(text));
  const entities =
    options?.layer !== undefined
      ? allEntities.filter((e) => e.layer === options.layer)
      : allEntities;

  const pieces = entities.flatMap(entityToPieces);
  if (pieces.length === 0) {
    return ok([]);
  }

  const kernel = getKernel();
  const edges: KernelShape[] = [];
  const wires: Wire[] = [];
  try {
    for (const chain of chainPieces(pieces)) {
      const chainEdges: KernelShape[] = [];
      for (const p of chain) {
        // Kept for the finally before the next build can throw.
        const edge = p.build();
        edges.push(edge);
        chainEdges.push(edge);
      }
      wires.push(createWire(kernel.makeWire(chainEdges)));
    }
    return ok(wires);
  } catch (cause: unknown) {
    for (const w of wires) w[Symbol.dispose]();
    return err(
      ioError(BrepErrorCode.DXF_IMPORT_FAILED, 'Failed to convert DXF entities to geometry', cause)
    );
  } finally {
    // The wire holds its own references to its edges, so the loose handles are freed.
    for (const edge of edges) kernel.dispose(edge);
  }
}
