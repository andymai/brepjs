import { type Result, ok, err, isErr } from '@/core/result.js';
import { validationError, computationError, moduleInitError } from '@/core/errors.js';
import { createKernelHandle, type Deletable } from '@/core/disposal.js';
import { getVoxel } from '@/voxel/registry.js';
import { makeFieldHandle } from '@/voxel/fieldFns.js';
import type { VoxelEngine, WasmSdf, WasmScalarField } from '@/voxel/engine.js';
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
  // The four field-modulated operators below take a per-position
  // {@link ScalarFieldHandle}. NOTE: a modulated offset/round/shell/blend yields a
  // Lipschitz field (`|∇| < 1`), not a true SDF — a downstream true-distance op on
  // the rasterized field (`offset`/`shell`) must reinit first.
  offsetField(field: ScalarFieldHandle): SdfHandle;
  roundField(field: ScalarFieldHandle): SdfHandle;
  shellField(field: ScalarFieldHandle): SdfHandle;
  smoothUnionField(other: SdfHandle, field: ScalarFieldHandle): SdfHandle;
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

/** The position-modulated operator methods, split out to keep {@link makeSdfHandle}
 * under the per-function line cap. `this` binds to the owning {@link SdfHandle} when
 * spread into its object literal. */
// Shared across every handle: methods bind `this` dynamically, so one constant
// object spread into each handle behaves identically and avoids per-call allocation.
const MODULATED_FIELD_METHODS: Pick<
  SdfHandle,
  'offsetField' | 'roundField' | 'shellField' | 'smoothUnionField'
> = {
  offsetField(this: SdfHandle, field) {
    return makeSdfHandle(this.value.offset_field(field.value));
  },
  roundField(this: SdfHandle, field) {
    return makeSdfHandle(this.value.round_field(field.value));
  },
  shellField(this: SdfHandle, field) {
    return makeSdfHandle(this.value.shell_field(field.value));
  },
  smoothUnionField(this: SdfHandle, other, field) {
    return makeSdfHandle(this.value.smooth_union_field(other.value, field.value));
  },
};

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
    ...MODULATED_FIELD_METHODS,
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

/** Options for {@link sweep}. */
export interface SdfSweepOptions {
  /** Close the spine into a loop, skipping the open-end caps. Default `false`. */
  closed?: boolean;
}

function flattenSpine(spine: [number, number, number][]): Result<Float64Array> {
  if (spine.length < 2) {
    return err(validationError('SDF_INVALID_SPINE', 'sweep spine needs at least 2 points.'));
  }
  const flat = new Float64Array(spine.length * 3);
  for (let i = 0; i < spine.length; i++) {
    const pt = spine[i] as [number, number, number];
    if (!pt.every((c) => Number.isFinite(c))) {
      return err(validationError('SDF_INVALID_SPINE', 'sweep spine coordinates must be finite.'));
    }
    flat[i * 3] = pt[0];
    flat[i * 3 + 1] = pt[1];
    flat[i * 3 + 2] = pt[2];
  }
  return ok(flat);
}

/**
 * Sweep an in-plane `profile` along a `spine` polyline using rotation-minimizing
 * frames (no 180° flip at inflections). The profile is sampled in its own
 * `(normal, binormal)` plane at every station; `opts.closed` loops the spine and
 * skips the open-end caps. The result is a pseudo-SDF (exact distance only near
 * the swept wall), which contours cleanly. `spine` needs at least 2 finite points.
 */
export function sweep(
  spine: [number, number, number][],
  profile: SdfHandle,
  opts?: SdfSweepOptions,
  id?: string
): Result<SdfHandle> {
  const flat = flattenSpine(spine);
  if (isErr(flat)) return flat;
  const closed = opts?.closed ?? false;
  return build((e) => e.Sdf.sweep(flat.value, profile.value, closed), id);
}

/**
 * A disposable handle around a position-varying scalar field (brepjs-implicit Phase
 * 2b). Fed to the {@link SdfHandle} modulated operators (`offsetField`, `shellField`,
 * …) to vary an operator parameter per voxel. Like {@link SdfHandle} it is a value —
 * the constructors return fresh fields — and dispose is mandatory (`using`, or
 * `[Symbol.dispose]()`) to free the WASM allocation.
 */
export interface ScalarFieldHandle {
  /** The wrapped WASM field. Throws if the handle has been disposed. */
  readonly value: WasmScalarField;
  /** Whether the backing WASM field has been freed. */
  readonly disposed: boolean;
  [Symbol.dispose](): void;
}

interface ScalarFieldDeletable extends Deletable {
  readonly raw: WasmScalarField;
}

function scalarFieldDeletable(raw: WasmScalarField): ScalarFieldDeletable {
  return {
    raw,
    delete() {
      raw.free();
    },
  };
}

function makeScalarFieldHandle(raw: WasmScalarField): ScalarFieldHandle {
  // brepjs-patterns-disable: require-using-for-handles -- factory returns the handle, so it must outlive this scope
  const inner = createKernelHandle(scalarFieldDeletable(raw));
  return {
    get value() {
      return inner.value.raw;
    },
    get disposed() {
      return inner.disposed;
    },
    [Symbol.dispose]() {
      inner[Symbol.dispose]();
    },
  };
}

function buildField(
  make: (engine: VoxelEngine) => WasmScalarField,
  id?: string
): Result<ScalarFieldHandle> {
  const engine = resolveEngine(id);
  if (isErr(engine)) return engine;
  try {
    return ok(makeScalarFieldHandle(make(engine.value)));
  } catch (cause) {
    return err(
      computationError(
        'SDF_FIELD_BUILD_FAILED',
        cause instanceof Error ? cause.message : 'scalar field construction failed.',
        cause
      )
    );
  }
}

/** A spatially constant field — reproduces a constant operator parameter exactly. */
export function fieldConst(c: number, id?: string): Result<ScalarFieldHandle> {
  return buildField((e) => e.ScalarField.constant(c), id);
}

/**
 * A field that ramps `lo → hi` as `coord[axis]` goes `a → b`, clamped to the
 * endpoint band outside `[a, b]`. `axis` is 0 (x), 1 (y), or 2 (z).
 */
export function fieldAxialRamp(
  axis: number,
  a: number,
  b: number,
  lo: number,
  hi: number,
  id?: string
): Result<ScalarFieldHandle> {
  return buildField((e) => e.ScalarField.axial_ramp(axis, a, b, lo, hi), id);
}

/**
 * A field by radial distance from the line through `center` along `axis`: `lo → hi`
 * as that distance goes `r0 → r1`, clamped. `axis` is 0 (x), 1 (y), or 2 (z).
 */
export function fieldRadialRamp(
  center: [number, number, number],
  axis: number,
  r0: number,
  r1: number,
  lo: number,
  hi: number,
  id?: string
): Result<ScalarFieldHandle> {
  return buildField(
    (e) => e.ScalarField.radial_ramp(center[0], center[1], center[2], axis, r0, r1, lo, hi),
    id
  );
}

/**
 * A field from an {@link SdfHandle}'s signed distance, affinely remapped to
 * `sdf.eval(p) * scale + offset`. UNBOUNDED — drive a bounds-affecting op
 * (`offsetField`/`shellField`) with it only via `rasterizeIn` or wrapped in
 * {@link fieldClamp}.
 */
export function fieldFromSdf(
  sdf: SdfHandle,
  scale: number,
  offset: number,
  id?: string
): Result<ScalarFieldHandle> {
  return buildField((e) => e.ScalarField.from_sdf(sdf.value, scale, offset), id);
}

/**
 * Clamp another field's value to `[min, max]` — bounds an otherwise unbounded
 * {@link fieldFromSdf} so it can safely drive offset/shell.
 */
export function fieldClamp(
  field: ScalarFieldHandle,
  min: number,
  max: number,
  id?: string
): Result<ScalarFieldHandle> {
  return buildField((e) => e.ScalarField.clamp(field.value, min, max), id);
}
