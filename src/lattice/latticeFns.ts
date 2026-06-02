import { type Result, ok, err, isErr } from '@/core/result.js';
import { validationError, computationError } from '@/core/errors.js';
import type { KernelMeshResult } from '@/kernel/types.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { type VoxelMeshInput, validateMesh, resolveEngine } from '@/voxel/signFns.js';
import { shapeToMeshInput } from '@/voxel/shapeMesh.js';
import type { VoxelRepairResult } from '@/voxel/engine.js';

/** TPMS lattice families. Maps to the wasm tag (0=Gyroid, 1=SchwarzP, 2=Diamond). */
export type LatticeType = 'gyroid' | 'schwarzP' | 'diamond';

// Keyed by `string`, not `LatticeType`, so the lookup can reject an off-type tag
// arriving from an untyped JS caller (the Result contract guards that boundary).
const LATTICE_TAGS: Record<string, number | undefined> = {
  gyroid: 0,
  schwarzP: 1,
  diamond: 2,
};

/**
 * TPMS lattice tuning. `period` is the unit-cell size (world units); `thickness`
 * is the strut wall width in field units. `resolution` sizes the longest bbox
 * axis in voxels; `padding` is the positive air-margin ring (>= 1) Surface Nets
 * needs.
 */
export interface LatticeOptions {
  type: LatticeType;
  period: number;
  thickness: number;
  resolution?: number;
  padding?: number;
}

const DEFAULT_RESOLUTION = 48;
const DEFAULT_PADDING = 2;

interface ResolvedLattice {
  tag: number;
  period: number;
  thickness: number;
  resolution: number;
  padding: number;
}

function validateOptions(opts: LatticeOptions): Result<ResolvedLattice> {
  const tag = LATTICE_TAGS[opts.type];
  if (tag === undefined) {
    return err(
      validationError(
        'LATTICE_INVALID_TYPE',
        `lattice type must be one of gyroid, schwarzP, diamond (got '${opts.type}').`
      )
    );
  }
  if (!(opts.period > 0)) {
    return err(validationError('LATTICE_INVALID_PERIOD', 'period must be > 0.'));
  }
  if (!(opts.thickness > 0)) {
    return err(validationError('LATTICE_INVALID_THICKNESS', 'thickness must be > 0.'));
  }
  const resolution = opts.resolution ?? DEFAULT_RESOLUTION;
  const padding = opts.padding ?? DEFAULT_PADDING;
  if (!Number.isInteger(resolution) || resolution < 1) {
    return err(
      validationError('LATTICE_INVALID_RESOLUTION', 'resolution must be an integer >= 1.')
    );
  }
  if (!Number.isInteger(padding) || padding < 1) {
    // Surface Nets needs >= 1 voxel of air margin on every face, else the
    // extracted surface is clipped at the grid boundary.
    return err(validationError('LATTICE_INVALID_PADDING', 'padding must be an integer >= 1.'));
  }
  return ok({ tag, period: opts.period, thickness: opts.thickness, resolution, padding });
}

function toMesh(repaired: VoxelRepairResult): KernelMeshResult {
  const vertexCount = repaired.positions.length / 3;
  return {
    vertices: repaired.positions,
    normals: repaired.normals,
    triangles: repaired.indices,
    uvs: new Float32Array(vertexCount * 2),
    faceGroups: [{ start: 0, count: repaired.indices.length / 3, faceHash: 0 }],
  };
}

/**
 * Fill a solid mesh with a TPMS lattice infill: intersect the FWN-signed solid
 * with the chosen lattice shell field, then Surface-Nets contour the result.
 *
 * Returns a {@link KernelMeshResult} in world coordinates (a single face group,
 * no UVs). The TPMS field is the approximate implicit (raw trig), so the surface
 * is contoured at the zero level without distance normalization (ADR-0013).
 */
export function latticeInfill(
  mesh: VoxelMeshInput,
  opts: LatticeOptions,
  id?: string
): Result<KernelMeshResult> {
  const invalid = validateMesh(mesh);
  if (invalid) return err(invalid);
  if (mesh.vertices.length === 0 || mesh.triangles.length === 0) {
    // An empty mesh has an undefined bbox; the grid sizing would feed INF
    // arithmetic. Reject it cleanly rather than return a garbage mesh.
    return err(
      validationError('LATTICE_EMPTY_MESH', 'latticeInfill requires a non-empty triangle mesh.')
    );
  }

  const resolved = validateOptions(opts);
  if (isErr(resolved)) return resolved;

  const engine = resolveEngine(id);
  if (isErr(engine)) return engine;

  const { tag, period, thickness, resolution, padding } = resolved.value;
  try {
    // lattice_infill returns Result<_, JsError> in Rust: a grid over MAX_VOXELS
    // (reachable purely from `resolution`) surfaces as a thrown JS exception,
    // which must be caught to honour the Result contract. `using` frees the
    // WASM-owned handle on scope exit (the getters copy their buffers out, so
    // the returned mesh stays valid after free()).
    using repaired = engine.value.lattice_infill(
      mesh.vertices,
      mesh.triangles,
      resolution,
      padding,
      tag,
      period,
      thickness
    );
    return ok(toMesh(repaired));
  } catch (cause) {
    return err(
      computationError(
        'LATTICE_INFILL_FAILED',
        cause instanceof Error ? cause.message : 'lattice infill failed (grid too large?).',
        cause
      )
    );
  }
}

/**
 * Fill a B-rep shape with a TPMS lattice infill: tessellate the shape, then run
 * {@link latticeInfill} on the resulting triangle soup. Threads a meshing
 * failure straight back as an `err(...)`.
 */
export function latticeInfillShape(
  shape: AnyShape<Dimension>,
  opts: LatticeOptions,
  id?: string
): Result<KernelMeshResult> {
  const meshInput = shapeToMeshInput(shape);
  if (isErr(meshInput)) return meshInput;
  return latticeInfill(meshInput.value, opts, id);
}

/** Axis-aligned bounds for a clipped TPMS lattice. */
export interface LatticeBounds {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * Contour the infinite TPMS lattice clipped to an axis-aligned box.
 *
 * Returns a {@link KernelMeshResult} in world coordinates (a single face group,
 * no UVs). The TPMS field is the approximate implicit (raw trig), contoured at
 * the zero level without distance normalization (ADR-0013).
 */
export function tpmsLattice(
  bounds: LatticeBounds,
  opts: LatticeOptions,
  id?: string
): Result<KernelMeshResult> {
  for (let axis = 0; axis < 3; axis++) {
    const lo = bounds.min[axis];
    const hi = bounds.max[axis];
    if (lo === undefined || hi === undefined || !(lo < hi)) {
      return err(
        validationError(
          'LATTICE_INVALID_BOUNDS',
          `bounds.min must be strictly less than bounds.max on every axis (axis ${axis}).`
        )
      );
    }
  }

  const resolved = validateOptions(opts);
  if (isErr(resolved)) return resolved;

  const engine = resolveEngine(id);
  if (isErr(engine)) return engine;

  const { tag, period, thickness, resolution, padding } = resolved.value;
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;
  try {
    using repaired = engine.value.tpms_box(
      minX,
      minY,
      minZ,
      maxX,
      maxY,
      maxZ,
      resolution,
      padding,
      tag,
      period,
      thickness
    );
    return ok(toMesh(repaired));
  } catch (cause) {
    return err(
      computationError(
        'TPMS_LATTICE_FAILED',
        cause instanceof Error ? cause.message : 'tpms lattice failed (grid too large?).',
        cause
      )
    );
  }
}
