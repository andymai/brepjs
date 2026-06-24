/**
 * Transform-only instancing — hold ONE source shape + N placements without
 * copying the kernel shape. Real geometry (a Compound, or a fused solid) or a
 * render payload (one mesh + N matrices) is produced only on demand.
 *
 * A 10x10 grid is 1 solid + 100 transforms, not 100 booleans. Materialize-on-
 * export keeps the kernel work deferred; `instancedMesh` meshes the source once
 * for an instanced (e.g. three.js InstancedMesh) preview.
 */

import { ok, err, type Result } from '@/core/result.js';
import type { AnyShape, Dimension, Shape3D } from '@/core/shapeTypes.js';
import { isShape3D } from '@/core/shapeTypes.js';
import type { Matrix4x4, Vec3 } from '@/core/types.js';
import { validationError } from '@/core/errors.js';
import { applyMatrix } from '@/topology/transformFns.js';
import { makeCompound } from '@/topology/solidBuilders.js';
import { fuseAll } from '@/topology/booleanFns.js';
import { mesh, type ShapeMesh, type MeshOptions } from '@/topology/meshFns.js';
import { gridPattern } from './patternFns.js';

/** Grid provenance, set by `instanceGrid`, lets `materialize({fuse})` route
 *  through the faster kernel `gridPattern` path instead of fusing N copies. */
interface GridSpec {
  readonly cols: number;
  readonly rows: number;
  readonly pitchX: number;
  readonly pitchY: number;
}

/**
 * One source shape replicated across N placements. Not a kernel-backed shape
 * (no `.wrapped`) — an app-level container that owns the single source handle.
 */
export interface InstancedShape<D extends Dimension = '3D'> extends Disposable {
  readonly __instanced: true;
  /** The single shared source shape (owned — disposed with this container). */
  readonly source: AnyShape<D>;
  /** Per-instance world transforms (row-major 4x4). */
  readonly placements: ReadonlyArray<Matrix4x4>;
  /** Present when built by `instanceGrid` — enables the gridPattern fuse path. */
  readonly grid?: GridSpec | undefined;
  [Symbol.dispose](): void;
}

function translation(v: Vec3): Matrix4x4 {
  return [
    [1, 0, 0, v[0]],
    [0, 1, 0, v[1]],
    [0, 0, 1, v[2]],
    [0, 0, 0, 1],
  ];
}

function isVec3Array(p: readonly Matrix4x4[] | readonly Vec3[]): p is readonly Vec3[] {
  const first = p[0];
  return first !== undefined && typeof first[0] === 'number';
}

function make<D extends Dimension>(
  source: AnyShape<D>,
  placements: ReadonlyArray<Matrix4x4>,
  grid?: GridSpec
): InstancedShape<D> {
  return {
    __instanced: true,
    source,
    placements,
    grid,
    [Symbol.dispose]() {
      source[Symbol.dispose]();
    },
  };
}

/** Type guard for an InstancedShape. */
export function isInstanced(x: unknown): x is InstancedShape<Dimension> {
  return (
    typeof x === 'object' && x !== null && (x as { __instanced?: unknown }).__instanced === true
  );
}

/**
 * Instance a shape across explicit placements. `Vec3[]` is translate-only sugar
 * for `Matrix4x4[]`. The source is owned by the returned container.
 */
export function instance<D extends Dimension>(
  source: AnyShape<D>,
  placements: readonly Matrix4x4[] | readonly Vec3[]
): InstancedShape<D> {
  // Deep-copy matrices so later caller mutation can't change our placements.
  const mats = isVec3Array(placements)
    ? placements.map(translation)
    : placements.map((m) => m.map((row) => [...row]) as Matrix4x4);
  return make(source, mats);
}

export interface InstanceGridOptions {
  readonly cols: number;
  readonly rows: number;
  readonly pitchX: number;
  readonly pitchY: number;
}

/** Instance a shape across a cols x rows grid in the XY plane. */
export function instanceGrid<D extends Dimension>(
  source: AnyShape<D>,
  opts: InstanceGridOptions
): InstancedShape<D> {
  const { cols, rows, pitchX, pitchY } = opts;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
    throw new RangeError(
      `instanceGrid: cols and rows must be positive integers, got ${cols}x${rows}`
    );
  }
  const placements: Matrix4x4[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      placements.push(translation([i * pitchX, j * pitchY, 0]));
    }
  }
  return make(source, placements, { cols, rows, pitchX, pitchY });
}

/** Number of placements. */
export function instanceCount(inst: InstancedShape<Dimension>): number {
  return inst.placements.length;
}

export interface MaterializeOptions {
  /** Fuse the placed copies into a single solid (3D only). Default: false —
   *  returns a Compound of separate placed parts. */
  readonly fuse?: boolean;
}

/**
 * Produce real geometry: a Compound of N placed copies (default), or a single
 * fused solid (`fuse: true`, 3D only). This is where the N kernel transforms
 * happen. A grid-built instance fuses via the faster kernel `gridPattern`.
 */
export function materialize<D extends Dimension>(
  inst: InstancedShape<D>,
  opts: MaterializeOptions = {}
): Result<AnyShape<Dimension>> {
  const { source, placements, grid } = inst;

  if (placements.length === 0) {
    return err(validationError('INSTANCE_EMPTY', 'materialize: instance has no placements'));
  }

  if (opts.fuse) {
    if (!isShape3D(source)) {
      return err(
        validationError('MATERIALIZE_NOT_3D', 'materialize({fuse:true}) requires a 3D source shape')
      );
    }
    // Grid provenance → kernel bulk-copy + nested fuse (≈20% faster than
    // fusing N app-space copies; see benchmarks/gridPattern.bench.test.ts).
    if (grid) {
      return gridPattern(
        source,
        [1, 0, 0],
        [0, 1, 0],
        grid.cols,
        grid.rows,
        grid.pitchX,
        grid.pitchY
      );
    }
    return combine(source, placements, true);
  }

  return combine(source, placements, false);
}

// Place the source at each matrix, then combine into a Compound or fused solid.
// Transient copies are disposed once the result is built (and on a failed
// placement) — except one the result aliases, since fuseAll of a single shape
// returns that shape itself. makeCompound/fuseAll keep their own refcounted
// references, so disposing the inputs can't corrupt the result.
function combine<D extends Dimension>(
  source: AnyShape<D>,
  placements: ReadonlyArray<Matrix4x4>,
  fuse: boolean
): Result<AnyShape<Dimension>> {
  const copies: AnyShape<D>[] = [];
  for (const m of placements) {
    const placed = applyMatrix(source, m);
    if (!placed.ok) {
      for (const c of copies) c[Symbol.dispose]();
      return placed;
    }
    copies.push(placed.value);
  }
  // Arbitrary placements needn't share faces, so no sameFace glue here.
  const result = fuse ? fuseAll(copies as Shape3D[], { unsafe: true }) : ok(makeCompound(copies));
  for (const c of copies) {
    if (!result.ok || c !== result.value) c[Symbol.dispose]();
  }
  return result;
}

export interface InstancedMesh {
  /** The source shape meshed ONCE. */
  readonly geometry: ShapeMesh;
  /** Per-instance transforms — feed to e.g. three.js InstancedMesh. */
  readonly instances: ReadonlyArray<Matrix4x4>;
}

/**
 * Mesh the source once and return it alongside the placements — the
 * "one tessellation, N placements" render payload for an instanced draw.
 */
export function instancedMesh(inst: InstancedShape<Dimension>, opts?: MeshOptions): InstancedMesh {
  return { geometry: mesh(inst.source, opts), instances: inst.placements };
}
