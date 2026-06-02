import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { computationError } from '@/core/errors.js';
import { mesh as meshShape } from '@/topology/meshFns.js';
import type { VoxelMeshInput } from './signFns.js';

const DEFAULT_DEFLECTION = 1e-3;

/**
 * Mesh a B-rep shape into the flat triangle-soup {@link VoxelMeshInput} the voxel
 * ops consume. Tessellates via the topology mesh API at `deflection` linear
 * tolerance and forwards its `{ vertices, triangles }` (already Float32Array /
 * Uint32Array). Meshing failures surface as an `err(...)` rather than a throw.
 */
export function shapeToMeshInput(
  shape: AnyShape<Dimension>,
  deflection: number = DEFAULT_DEFLECTION
): Result<VoxelMeshInput> {
  try {
    const tessellated = meshShape(shape, { tolerance: deflection });
    if (tessellated.vertices.length === 0 || tessellated.triangles.length === 0) {
      return err(
        computationError('VOXEL_SHAPE_MESH_EMPTY', 'shape tessellated to an empty triangle mesh.')
      );
    }
    return ok({ vertices: tessellated.vertices, triangles: tessellated.triangles });
  } catch (cause) {
    return err(
      computationError(
        'VOXEL_SHAPE_MESH_FAILED',
        cause instanceof Error ? cause.message : 'failed to mesh shape for voxel op.',
        cause
      )
    );
  }
}
