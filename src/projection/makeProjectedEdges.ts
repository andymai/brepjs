import { getKernel } from '@/kernel/index.js';
import type { KernelType } from '@/kernel/types.js';
import type { Edge, AnyShape } from '@/core/shapeTypes.js';
import { castShape } from '@/core/shapeTypes.js';
import { getEdges as _getEdges } from '@/topology/shapeFns.js';
import type { Camera } from './cameraFns.js';

const getEdgesFromOc = (shape: KernelType): Edge[] => {
  if (shape.IsNull()) return [];
  return _getEdges(castShape(shape));
};

/**
 * Project a 3D shape onto a 2D plane using hidden-line removal (HLR).
 *
 * @param camera - Camera defining the projection plane.
 * @param withHiddenLines - If `true`, also returns hidden (occluded) edges.
 * @returns Separate arrays of visible and hidden projected edges.
 */
export function makeProjectedEdges(
  shape: AnyShape,
  camera: Camera,
  withHiddenLines = true
): { visible: Edge[]; hidden: Edge[] } {
  const projected = getKernel().projectEdges(
    shape.wrapped,
    [...camera.position],
    [...camera.direction],
    [...camera.xAxis]
  );

  const visible = [
    ...getEdgesFromOc(projected.visible.sharp),
    ...getEdgesFromOc(projected.visible.smooth),
    ...getEdgesFromOc(projected.visible.outline),
  ];

  const hidden = withHiddenLines
    ? [
        ...getEdgesFromOc(projected.hidden.sharp),
        ...getEdgesFromOc(projected.hidden.smooth),
        ...getEdgesFromOc(projected.hidden.outline),
      ]
    : [];

  return { visible, hidden };
}
