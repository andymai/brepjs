import { type Result, ok, err, isErr } from '@/core/result.js';
import { validationError, computationError } from '@/core/errors.js';
import { createKernelHandle, type Deletable } from '@/core/disposal.js';
import type { KernelMeshResult } from '@/kernel/types.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { type VoxelMeshInput, validateMesh, resolveEngine } from './signFns.js';
import type { WasmVoxelField } from './engine.js';
import { shapeToMeshInput } from './shapeMesh.js';

/** Field tuning. `resolution` sizes the longest bbox axis in voxels; `padding`
 *  is the air-margin ring (>= 1) Surface Nets needs AND the headroom an outward
 *  offset has before it clips at the grid boundary (the grid is fixed at
 *  voxelize time — size both for the intended maximum offset). */
export interface VoxelFieldOptions {
  resolution?: number;
  padding?: number;
}

/** Boolean op selector for {@link fieldBoolean} / {@link VoxelFieldHandle.boolean}. */
export type VoxelBooleanOp = 'union' | 'intersection' | 'difference';

const DEFAULT_RESOLUTION = 48;
const DEFAULT_PADDING = 2;

const BOOLEAN_OP_CODES: Record<VoxelBooleanOp, number> = {
  union: 0,
  intersection: 1,
  difference: 2,
};

function resolveGridParams(
  opts?: VoxelFieldOptions
): Result<{ resolution: number; padding: number }> {
  const resolution = opts?.resolution ?? DEFAULT_RESOLUTION;
  const padding = opts?.padding ?? DEFAULT_PADDING;
  if (!Number.isInteger(resolution) || resolution < 1) {
    return err(validationError('VOXEL_INVALID_RESOLUTION', 'resolution must be an integer >= 1.'));
  }
  if (!Number.isInteger(padding) || padding < 1) {
    return err(validationError('VOXEL_INVALID_PADDING', 'padding must be an integer >= 1.'));
  }
  return ok({ resolution, padding });
}

/**
 * Copy the buffers out of a WASM {@link VoxelRepairResult} into a plain
 * {@link KernelMeshResult}, freeing the WASM result via `using` (the getters
 * copy, so the mesh survives the free). An empty contour surfaces as an error.
 */
function meshFromField(field: WasmVoxelField): Result<KernelMeshResult> {
  const rawResult = field.contour();
  using contoured = {
    value: rawResult,
    [Symbol.dispose]() {
      rawResult.free();
    },
  };
  const { positions, normals, indices } = contoured.value;
  if (positions.length === 0 || indices.length === 0) {
    return err(
      computationError(
        'VOXEL_DEGENERATE_RESULT',
        'the voxel field contoured to an empty mesh (over-shrunk offset or disjoint operands?).'
      )
    );
  }
  const vertexCount = positions.length / 3;
  return ok({
    vertices: positions,
    normals,
    triangles: indices,
    uvs: new Float32Array(vertexCount * 2),
    faceGroups: [{ start: 0, count: indices.length / 3, faceHash: 0 }],
  });
}

/**
 * A persistent, disposable voxel field. Carries the wrapped WASM field as
 * `value` and a fluent op-chain (`.boolean().offset().shell().contour()`) that
 * throws on the rare WASM error (mirroring the `shape()` facade's
 * throw-on-`Err` convention), so a `using`-scoped chain reads cleanly:
 *
 * ```ts
 * using field = voxelField(meshA).unwrap();
 * using other = voxelField(meshB).unwrap();
 * const mesh = field.boolean(other, 'union').offset(2).contour();
 * ```
 *
 * Dispose is mandatory (FinalizationRegistry is an unreliable safety net): use
 * `using`, or call `[Symbol.dispose]()` explicitly, to free the WASM grid.
 */
export interface VoxelFieldHandle {
  /** The wrapped WASM field. Throws if the handle has been disposed. */
  readonly value: WasmVoxelField;
  /** Whether the backing WASM grid has been freed. */
  readonly disposed: boolean;
  [Symbol.dispose](): void;
  /** CSG-combine with `other` in place (marks the field for lazy reinit). */
  boolean(other: VoxelFieldHandle, op: VoxelBooleanOp): VoxelFieldHandle;
  /** Offset the surface in place (>0 outward, <0 inward); auto-reinits if dirty. */
  offset(distance: number): VoxelFieldHandle;
  /** Hollow into an inward shell in place (thickness > 0); auto-reinits if dirty. */
  shell(thickness: number): VoxelFieldHandle;
  /** Reinitialize φ to a true SDF while preserving the zero set. */
  reinit(): VoxelFieldHandle;
  /** Surface-Nets contour the current field to a mesh (the field stays alive). */
  contour(): KernelMeshResult;
}

/**
 * Bridge the wasm `.free()` lifecycle onto the `Deletable` (`.delete()`) shape
 * `createKernelHandle` expects, so `Symbol.dispose` (the `using` keyword) frees
 * the WASM grid exactly once.
 */
interface FieldDeletable extends Deletable {
  readonly raw: WasmVoxelField;
}

function fieldDeletable(raw: WasmVoxelField): FieldDeletable {
  return {
    raw,
    delete() {
      raw.free();
    },
  };
}

export function makeFieldHandle(raw: WasmVoxelField): VoxelFieldHandle {
  return makeHandle(raw);
}

function makeHandle(raw: WasmVoxelField): VoxelFieldHandle {
  // brepjs-patterns-disable: require-using-for-handles -- factory returns the handle, so it must outlive this scope
  const inner = createKernelHandle(fieldDeletable(raw));

  const handle: VoxelFieldHandle = {
    get value() {
      return inner.value.raw;
    },
    get disposed() {
      return inner.disposed;
    },
    [Symbol.dispose]() {
      inner[Symbol.dispose]();
    },
    boolean(other, op) {
      this.value.boolean(other.value, BOOLEAN_OP_CODES[op]);
      return handle;
    },
    offset(distance) {
      this.value.offset(distance);
      return handle;
    },
    shell(thickness) {
      this.value.shell(thickness);
      return handle;
    },
    reinit() {
      this.value.reinit();
      return handle;
    },
    contour() {
      const mesh = meshFromField(this.value);
      if (isErr(mesh)) throw new Error(mesh.error.message);
      return mesh.value;
    },
  };
  return handle;
}

/** Live-handle guard (the `VoxelFieldHandle` analogue of disposal's `isLive`). */
function isLive(handle: VoxelFieldHandle): boolean {
  return !handle.disposed;
}

function disposedErr<T>(): Result<T> {
  return err(validationError('VOXEL_FIELD_DISPOSED', 'the voxel field handle has been disposed.'));
}

/**
 * Voxelize a mesh into a persistent dense {@link VoxelFieldHandle}: one grid you
 * can boolean / offset / shell / reinit in place, then contour once. The handle
 * is disposable — free the WASM grid with `using` (or `[Symbol.dispose]()`).
 *
 * `resolution` sizes the longest bbox axis; `padding` is the air-margin ring.
 * Errors on an empty/invalid mesh, or if the grid would exceed the dense budget
 * (the persistent path is dense-only) or the voxel cap.
 */
export function voxelField(
  mesh: VoxelMeshInput,
  opts?: VoxelFieldOptions,
  id?: string
): Result<VoxelFieldHandle> {
  const invalid = validateMesh(mesh);
  if (invalid) return err(invalid);
  if (mesh.vertices.length === 0 || mesh.triangles.length === 0) {
    return err(
      validationError('VOXEL_EMPTY_MESH', 'voxelField requires a non-empty triangle mesh.')
    );
  }
  const params = resolveGridParams(opts);
  if (isErr(params)) return params;

  const engine = resolveEngine(id);
  if (isErr(engine)) return engine;

  try {
    const raw = new engine.value.VoxelField(
      mesh.vertices,
      mesh.triangles,
      params.value.resolution,
      params.value.padding
    );
    return ok(makeHandle(raw));
  } catch (cause) {
    return err(
      computationError(
        'VOXEL_FIELD_VOXELIZE_FAILED',
        cause instanceof Error
          ? cause.message
          : 'voxel field voxelization failed (grid too large or non-dense?).',
        cause
      )
    );
  }
}

/**
 * Boolean two meshes into ONE co-registered, chainable {@link VoxelFieldHandle}:
 * voxelize both onto a single shared grid sized to their union bbox, combine by
 * `op`, and keep the field. This is THE correct way to "boolean then chain
 * offset/shell" two independently-described meshes — unlike {@link fieldBoolean},
 * which requires the operands to already share grid geometry. The result is
 * dirty (the blend drifts the gradient), so a subsequent offset/shell
 * auto-reinitializes. The handle is disposable — free it with `using`.
 *
 * `op` is `'difference'` = A − B. Errors on an empty/invalid mesh, or if the
 * shared grid would exceed the dense budget (the persistent path is dense-only).
 */
export function voxelBooleanField(
  a: VoxelMeshInput,
  b: VoxelMeshInput,
  op: VoxelBooleanOp,
  opts?: VoxelFieldOptions,
  id?: string
): Result<VoxelFieldHandle> {
  const invalidA = validateMesh(a);
  if (invalidA) return err(invalidA);
  const invalidB = validateMesh(b);
  if (invalidB) return err(invalidB);
  if (a.vertices.length === 0 || a.triangles.length === 0) {
    return err(
      validationError(
        'VOXEL_EMPTY_MESH',
        'voxelBooleanField requires a non-empty mesh for operand A.'
      )
    );
  }
  if (b.vertices.length === 0 || b.triangles.length === 0) {
    return err(
      validationError(
        'VOXEL_EMPTY_MESH',
        'voxelBooleanField requires a non-empty mesh for operand B.'
      )
    );
  }
  const params = resolveGridParams(opts);
  if (isErr(params)) return params;

  const engine = resolveEngine(id);
  if (isErr(engine)) return engine;

  try {
    const raw = engine.value.VoxelField.boolean_of(
      a.vertices,
      a.triangles,
      b.vertices,
      b.triangles,
      BOOLEAN_OP_CODES[op],
      params.value.resolution,
      params.value.padding
    );
    return ok(makeHandle(raw));
  } catch (cause) {
    return err(
      computationError(
        'VOXEL_FIELD_BOOLEAN_FAILED',
        cause instanceof Error
          ? cause.message
          : 'voxel field boolean failed (grid too large or non-dense?).',
        cause
      )
    );
  }
}

/**
 * CSG-combine two fields IN PLACE, returning the SAME `handle` for chaining. The
 * min/max blend keeps the zero set exact but drifts the gradient near the join,
 * so a subsequent {@link fieldOffset}/{@link fieldShell} auto-reinitializes.
 *
 * PRECONDITION: both operands must be CO-REGISTERED — same origin, spacing, AND
 * dims. Two fields built by {@link voxelField} from DIFFERENT meshes generally do
 * NOT share geometry (each sizes its grid to its own bbox), and the WASM guard
 * rejects that mismatch as an `err(...)` rather than silently blending mismatched
 * coordinate frames. For the easy co-registered path, build the field directly
 * from both meshes with {@link voxelBooleanField}.
 */
export function fieldBoolean(
  handle: VoxelFieldHandle,
  other: VoxelFieldHandle,
  op: VoxelBooleanOp
): Result<VoxelFieldHandle> {
  if (!isLive(handle) || !isLive(other)) return disposedErr();
  try {
    handle.value.boolean(other.value, BOOLEAN_OP_CODES[op]);
    return ok(handle);
  } catch (cause) {
    return err(
      computationError(
        'VOXEL_FIELD_BOOLEAN_FAILED',
        cause instanceof Error ? cause.message : 'voxel field boolean failed (dim mismatch?).',
        cause
      )
    );
  }
}

/**
 * Offset the field's surface IN PLACE (>0 outward, <0 inward), returning the
 * SAME `handle`. Auto-reinitializes first if the field is dirty (post-boolean),
 * so the iso-shift always rides a true SDF.
 */
export function fieldOffset(handle: VoxelFieldHandle, distance: number): Result<VoxelFieldHandle> {
  if (!isLive(handle)) return disposedErr();
  if (!Number.isFinite(distance)) {
    return err(validationError('VOXEL_INVALID_DISTANCE', 'distance must be a finite number.'));
  }
  try {
    handle.value.offset(distance);
    return ok(handle);
  } catch (cause) {
    return err(
      computationError(
        'VOXEL_FIELD_OFFSET_FAILED',
        cause instanceof Error ? cause.message : 'voxel field offset failed.',
        cause
      )
    );
  }
}

/**
 * Hollow the field into an inward shell of `thickness` IN PLACE, returning the
 * SAME `handle`. Auto-reinitializes first if dirty; the result is dirty again
 * (the shell re-introduces a kink).
 */
export function fieldShell(handle: VoxelFieldHandle, thickness: number): Result<VoxelFieldHandle> {
  if (!isLive(handle)) return disposedErr();
  if (!Number.isFinite(thickness) || thickness <= 0) {
    return err(
      validationError('VOXEL_INVALID_THICKNESS', 'thickness must be a finite number > 0.')
    );
  }
  try {
    handle.value.shell(thickness);
    return ok(handle);
  } catch (cause) {
    return err(
      computationError(
        'VOXEL_FIELD_SHELL_FAILED',
        cause instanceof Error ? cause.message : 'voxel field shell failed.',
        cause
      )
    );
  }
}

/**
 * Explicitly reinitialize φ to a true SDF (|∇φ|=1) while preserving the zero
 * set, returning the SAME `handle`. Idempotent on a clean field. Offset/shell
 * already auto-reinitialize, so this is for advanced control only.
 */
export function fieldReinit(handle: VoxelFieldHandle): Result<VoxelFieldHandle> {
  if (!isLive(handle)) return disposedErr();
  try {
    handle.value.reinit();
    return ok(handle);
  } catch (cause) {
    return err(
      computationError(
        'VOXEL_FIELD_REINIT_FAILED',
        cause instanceof Error ? cause.message : 'voxel field reinit failed.',
        cause
      )
    );
  }
}

/**
 * Surface-Nets contour the current field to a {@link KernelMeshResult}. The
 * field stays alive and chainable afterwards (contour borrows it). An empty
 * contour surfaces as `VOXEL_DEGENERATE_RESULT`.
 */
export function fieldContour(handle: VoxelFieldHandle): Result<KernelMeshResult> {
  if (!isLive(handle)) return disposedErr();
  try {
    return meshFromField(handle.value);
  } catch (cause) {
    return err(
      computationError(
        'VOXEL_FIELD_CONTOUR_FAILED',
        cause instanceof Error ? cause.message : 'voxel field contour failed.',
        cause
      )
    );
  }
}

/**
 * Voxelize a B-rep shape into a persistent {@link VoxelFieldHandle}: tessellate
 * it, then run {@link voxelField}. Threads a meshing failure back as an
 * `err(...)`. The handle is disposable — free it with `using`.
 */
export function voxelFieldFromShape(
  shape: AnyShape<Dimension>,
  opts?: VoxelFieldOptions,
  id?: string
): Result<VoxelFieldHandle> {
  const meshInput = shapeToMeshInput(shape);
  if (isErr(meshInput)) return meshInput;
  return voxelField(meshInput.value, opts, id);
}

/**
 * Boolean two B-rep shapes into one co-registered, chainable
 * {@link VoxelFieldHandle}: tessellate both, then run {@link voxelBooleanField}.
 * `op` is `'difference'` = A − B. Threads either meshing failure back as an
 * `err(...)`. The handle is disposable — free it with `using`.
 */
export function voxelBooleanFieldShapes(
  a: AnyShape<Dimension>,
  b: AnyShape<Dimension>,
  op: VoxelBooleanOp,
  opts?: VoxelFieldOptions,
  id?: string
): Result<VoxelFieldHandle> {
  const meshA = shapeToMeshInput(a);
  if (isErr(meshA)) return meshA;
  const meshB = shapeToMeshInput(b);
  if (isErr(meshB)) return meshB;
  return voxelBooleanField(meshA.value, meshB.value, op, opts, id);
}
