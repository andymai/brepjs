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

function same(a: Point3, b: Point3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/**
 * A polyline segment: straight, or the arc a bulge describes. The arc's midpoint lies the sagitta
 * (bulge × half the chord) off the chord's midpoint, to the right of the chord for a positive
 * (counterclockwise) bulge.
 */
function segment(a: Point3, b: Point3, bulge: number): Piece {
  const kernel = getKernel();
  if (bulge === 0) return { start: a, end: b, build: () => kernel.makeLineEdge(a, b) };
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.hypot(dx, dy);
  const s = (bulge * d) / 2;
  const mid: Point3 = [(a[0] + b[0]) / 2 + (dy / d) * s, (a[1] + b[1]) / 2 - (dx / d) * s, a[2]];
  return { start: a, end: b, build: () => kernel.makeArcEdge(a, mid, b) };
}

function entityToPieces(entity: DXFEntity): Piece[] {
  const { type, data } = entity;
  const kernel = getKernel();

  if (type === 'LINE') {
    const start: Point3 = [getNum(data, 10), getNum(data, 20), getNum(data, 30)];
    const end: Point3 = [getNum(data, 11), getNum(data, 21), getNum(data, 31)];
    return [{ start, end, build: () => kernel.makeLineEdge(start, end) }];
  }

  if (type === 'CIRCLE') {
    const center: Point3 = [getNum(data, 10), getNum(data, 20), getNum(data, 30)];
    const r = getNum(data, 40);
    const at: Point3 = [center[0] + r, center[1], center[2]];
    return [{ start: at, end: at, build: () => kernel.makeCircleEdge(center, [0, 0, 1], r) }];
  }

  if (type === 'ARC') {
    const center: Point3 = [getNum(data, 10), getNum(data, 20), getNum(data, 30)];
    const r = getNum(data, 40);
    const startAngle = (getNum(data, 50) * Math.PI) / 180;
    const endAngle = (getNum(data, 51) * Math.PI) / 180;
    const on = (t: number): Point3 => [
      center[0] + r * Math.cos(t),
      center[1] + r * Math.sin(t),
      center[2],
    ];
    return [
      {
        start: on(startAngle),
        end: on(endAngle),
        build: () => kernel.makeCircleArc(center, [0, 0, 1], r, startAngle, endAngle),
      },
    ];
  }

  if (type === 'LWPOLYLINE' || type === 'POLYLINE') {
    const vertices = polyVertices(entity);
    const closed = (getNum(data, 70) & 1) === 1;
    const pieces: Piece[] = [];
    const count = closed ? vertices.length : vertices.length - 1;
    for (let k = 0; k < count; k++) {
      const a = vertices[k];
      const b = vertices[(k + 1) % vertices.length];
      if (!a || !b || same(a.point, b.point)) continue;
      pieces.push(segment(a.point, b.point, a.bulge));
    }
    return pieces;
  }

  return [];
}

// ---------------------------------------------------------------------------
// Wire assembly
// ---------------------------------------------------------------------------

// DXF coordinates are written as decimal text, so endpoints that meet share their digits;
// rounding to this step absorbs float noise in a value read twice.
const KEY_STEP = 1e-7;

function keyOf(p: Point3): string {
  return p.map((v) => Math.round(v / KEY_STEP)).join(',');
}

/** The pieces in connected chains, each in walking order, so every chain makes one wire. */
function chainPieces(pieces: readonly Piece[]): Piece[][] {
  const at = new Map<string, Piece[]>();
  for (const p of pieces) {
    for (const k of new Set([keyOf(p.start), keyOf(p.end)])) {
      at.set(k, [...(at.get(k) ?? []), p]);
    }
  }
  const used = new Set<Piece>();
  const next = (tip: string): { piece: Piece; tip: string } | undefined => {
    for (const p of at.get(tip) ?? []) {
      if (used.has(p)) continue;
      used.add(p);
      const s = keyOf(p.start);
      return { piece: p, tip: s === tip ? keyOf(p.end) : s };
    }
    return undefined;
  };
  const chains: Piece[][] = [];
  for (const first of pieces) {
    if (used.has(first)) continue;
    used.add(first);
    const chain = [first];
    for (const [dir, from] of [
      [1, keyOf(first.end)],
      [-1, keyOf(first.start)],
    ] as const) {
      let tip = from;
      for (let step = next(tip); step; step = next(tip)) {
        if (dir === 1) chain.push(step.piece);
        else chain.unshift(step.piece);
        tip = step.tip;
      }
    }
    chains.push(chain);
  }
  return chains;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Import a DXF file from a Blob, returning kernel wires.
 *
 * Parses ASCII DXF LINE, CIRCLE, ARC, LWPOLYLINE and R12 POLYLINE entities, polyline bulges
 * included. Edges that meet end to end become one wire, so disconnected outlines come back as
 * separate wires.
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
      const chainEdges = chain.map((p) => p.build());
      edges.push(...chainEdges);
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
