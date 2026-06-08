import { type Result, ok, err, isErr } from '@/core/result.js';
import { validationError, computationError, moduleInitError } from '@/core/errors.js';
import { createKernelHandle, type Deletable } from '@/core/disposal.js';
import { getVoxel } from '@/voxel/registry.js';
import { makeFieldHandle } from '@/voxel/fieldFns.js';
import type { VoxelEngine, WasmSdf } from '@/voxel/engine.js';
import type { VoxelFieldHandle, VoxelFieldOptions } from '@/voxel/fieldFns.js';

const DEFAULT_RESOLUTION = 48;
const DEFAULT_PADDING = 2;

function resolveEngine(id: string | undefined): Result<VoxelEngine> {
  try {
    return ok(getVoxel(id));
  } catch (cause) {
    return err(
      moduleInitError(
        'VOXEL_NOT_INITIALIZED',
        cause instanceof Error ? cause.message : 'voxel engine not initialized',
        cause
      )
    );
  }
}

function resolveGridParams(
  opts?: VoxelFieldOptions
): Result<{ resolution: number; padding: number }> {
  const resolution = opts?.resolution ?? DEFAULT_RESOLUTION;
  const padding = opts?.padding ?? DEFAULT_PADDING;
  if (!Number.isInteger(resolution) || resolution < 1) {
    return err(validationError('SDF_INVALID_RESOLUTION', 'resolution must be an integer >= 1.'));
  }
  if (!Number.isInteger(padding) || padding < 1) {
    return err(validationError('SDF_INVALID_PADDING', 'padding must be an integer >= 1.'));
  }
  return ok({ resolution, padding });
}

/** Explicit world bounds `[min..max]` for {@link SdfHandle.rasterizeIn}. */
export interface SdfBounds {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * A disposable handle around an analytic SDF expression. Every combinator clones
 * into a NEW wasm node and returns a NEW handle (the wasm `Sdf` is a value, not a
 * mutable builder), so an `SdfHandle` is immutable — the receiver stays valid and
 * must be disposed independently. `rasterize` produces a banded-SDF
 * {@link VoxelFieldHandle} you can boolean / offset / shell / contour.
 *
 * Dispose is mandatory: use `using`, or call `[Symbol.dispose]()`, to free the
 * WASM expression tree. Intermediate handles in a chain (`a.union(b).shell(t)`)
 * each own a wasm allocation; bind them to `using` or dispose them explicitly.
 */
export interface SdfHandle {
  /** The wrapped WASM expression. Throws if the handle has been disposed. */
  readonly value: WasmSdf;
  /** Whether the backing WASM expression has been freed. */
  readonly disposed: boolean;
  [Symbol.dispose](): void;
  union(other: SdfHandle): SdfHandle;
  intersection(other: SdfHandle): SdfHandle;
  difference(other: SdfHandle): SdfHandle;
  smoothUnion(other: SdfHandle, k: number): SdfHandle;
  smoothIntersection(other: SdfHandle, k: number): SdfHandle;
  smoothDifference(other: SdfHandle, k: number): SdfHandle;
  offset(distance: number): SdfHandle;
  round(radius: number): SdfHandle;
  shell(thickness: number): SdfHandle;
  onion(thickness: number): SdfHandle;
  translate(x: number, y: number, z: number): SdfHandle;
  rotate(ax: number, ay: number, az: number, angle: number): SdfHandle;
  scale(s: number): SdfHandle;
  /** Rasterize into a banded-SDF field over the expression's analytic bounds. */
  rasterize(opts?: VoxelFieldOptions): Result<VoxelFieldHandle>;
  /** Rasterize over explicit world bounds (clips unbounded primitives). */
  rasterizeIn(bounds: SdfBounds, opts?: VoxelFieldOptions): Result<VoxelFieldHandle>;
}

/**
 * Bridge the wasm `.free()` lifecycle onto the `Deletable` (`.delete()`) shape
 * `createKernelHandle` expects, so `Symbol.dispose` frees the WASM expression once.
 */
interface SdfDeletable extends Deletable {
  readonly raw: WasmSdf;
}

function sdfDeletable(raw: WasmSdf): SdfDeletable {
  return {
    raw,
    delete() {
      raw.free();
    },
  };
}

function makeSdfHandle(raw: WasmSdf): SdfHandle {
  // brepjs-patterns-disable: require-using-for-handles -- factory returns the handle, so it must outlive this scope
  const inner = createKernelHandle(sdfDeletable(raw));

  const handle: SdfHandle = {
    get value() {
      return inner.value.raw;
    },
    get disposed() {
      return inner.disposed;
    },
    [Symbol.dispose]() {
      inner[Symbol.dispose]();
    },
    union(other) {
      return makeSdfHandle(this.value.union(other.value));
    },
    intersection(other) {
      return makeSdfHandle(this.value.intersection(other.value));
    },
    difference(other) {
      return makeSdfHandle(this.value.difference(other.value));
    },
    smoothUnion(other, k) {
      return makeSdfHandle(this.value.smooth_union(other.value, k));
    },
    smoothIntersection(other, k) {
      return makeSdfHandle(this.value.smooth_intersection(other.value, k));
    },
    smoothDifference(other, k) {
      return makeSdfHandle(this.value.smooth_difference(other.value, k));
    },
    offset(distance) {
      return makeSdfHandle(this.value.offset(distance));
    },
    round(radius) {
      return makeSdfHandle(this.value.round(radius));
    },
    shell(thickness) {
      return makeSdfHandle(this.value.shell(thickness));
    },
    onion(thickness) {
      return makeSdfHandle(this.value.onion(thickness));
    },
    translate(x, y, z) {
      return makeSdfHandle(this.value.translate(x, y, z));
    },
    rotate(ax, ay, az, angle) {
      return makeSdfHandle(this.value.rotate(ax, ay, az, angle));
    },
    scale(s) {
      return makeSdfHandle(this.value.scale(s));
    },
    rasterize(opts) {
      return rasterizeField(this.value, opts);
    },
    rasterizeIn(bounds, opts) {
      return rasterizeFieldIn(this.value, bounds, opts);
    },
  };
  return handle;
}

function rasterizeField(
  sdf: WasmSdf,
  opts: VoxelFieldOptions | undefined
): Result<VoxelFieldHandle> {
  const params = resolveGridParams(opts);
  if (isErr(params)) return params;
  try {
    return ok(makeFieldHandle(sdf.rasterize(params.value.resolution, params.value.padding)));
  } catch (cause) {
    return rasterizeError(cause);
  }
}

function rasterizeFieldIn(
  sdf: WasmSdf,
  bounds: SdfBounds,
  opts: VoxelFieldOptions | undefined
): Result<VoxelFieldHandle> {
  const params = resolveGridParams(opts);
  if (isErr(params)) return params;
  const invalid = validateBounds(bounds);
  if (invalid) return err(invalid);
  try {
    const field = sdf.rasterize_in(
      bounds.min[0],
      bounds.min[1],
      bounds.min[2],
      bounds.max[0],
      bounds.max[1],
      bounds.max[2],
      params.value.resolution,
      params.value.padding
    );
    return ok(makeFieldHandle(field));
  } catch (cause) {
    return rasterizeError(cause);
  }
}

function rasterizeError(cause: unknown): Result<VoxelFieldHandle> {
  return err(
    computationError(
      'SDF_RASTERIZE_FAILED',
      cause instanceof Error ? cause.message : 'SDF rasterization failed (grid too large?).',
      cause
    )
  );
}

function validateBounds(bounds: SdfBounds): ReturnType<typeof validationError> | null {
  const all = [...bounds.min, ...bounds.max];
  if (!all.every((v) => Number.isFinite(v))) {
    return validationError('SDF_INVALID_BOUNDS', 'bounds must be finite numbers.');
  }
  for (let axis = 0; axis < 3; axis++) {
    if ((bounds.max[axis] as number) <= (bounds.min[axis] as number)) {
      return validationError('SDF_INVALID_BOUNDS', 'bounds max must exceed min on every axis.');
    }
  }
  return null;
}

function build(make: (engine: VoxelEngine) => WasmSdf, id?: string): Result<SdfHandle> {
  const engine = resolveEngine(id);
  if (isErr(engine)) return engine;
  try {
    return ok(makeSdfHandle(make(engine.value)));
  } catch (cause) {
    return err(
      computationError(
        'SDF_BUILD_FAILED',
        cause instanceof Error ? cause.message : 'SDF primitive construction failed.',
        cause
      )
    );
  }
}

/** A sphere of radius `r`, centered at the origin. */
export function sphere(r: number, id?: string): Result<SdfHandle> {
  return build((e) => e.Sdf.sphere(r), id);
}

/** An axis-aligned box of half-extents `(hx, hy, hz)`, centered at the origin. */
export function box(hx: number, hy: number, hz: number, id?: string): Result<SdfHandle> {
  return build((e) => e.Sdf.box_(hx, hy, hz), id);
}

/** A box with rounded edges of radius `r`. */
export function roundedBox(
  hx: number,
  hy: number,
  hz: number,
  r: number,
  id?: string
): Result<SdfHandle> {
  return build((e) => e.Sdf.rounded_box(hx, hy, hz, r), id);
}

/** A capped cylinder, axis +Z, radius `r`, total height `h`, centered at origin. */
export function cylinder(r: number, h: number, id?: string): Result<SdfHandle> {
  return build((e) => e.Sdf.cylinder(r, h), id);
}

/** A capped cone centered at the origin: base radius `r` at z = −h/2 tapering to an apex at z = +h/2. */
export function cone(r: number, h: number, id?: string): Result<SdfHandle> {
  return build((e) => e.Sdf.cone(r, h), id);
}

/** A capsule: a line segment `a`→`b` of radius `r`. */
export function capsule(
  a: [number, number, number],
  b: [number, number, number],
  r: number,
  id?: string
): Result<SdfHandle> {
  return build((e) => e.Sdf.capsule(a[0], a[1], a[2], b[0], b[1], b[2], r), id);
}

/** A torus in the XY plane (axis +Z): a `minor`-radius tube on a `major` circle. */
export function torus(major: number, minor: number, id?: string): Result<SdfHandle> {
  return build((e) => e.Sdf.torus(major, minor), id);
}

/** A half-space: the plane through `h·n` with outward normal `n` (normalized). */
export function plane(n: [number, number, number], h: number, id?: string): Result<SdfHandle> {
  return build((e) => e.Sdf.plane(n[0], n[1], n[2], h), id);
}
