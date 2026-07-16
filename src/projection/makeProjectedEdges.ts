import { getKernel } from '@/kernel/index.js';
import type { KernelType } from '@/kernel/types.js';
import type { Edge, AnyShape } from '@/core/shapeTypes.js';
import { castResultShape } from '@/core/shapeTypes.js';
import { unwrap } from '@/core/result.js';
import { getEdges as _getEdges, clone } from '@/topology/shapeFns.js';
import type { Camera } from './cameraFns.js';

const getEdgesFromOc = (shape: KernelType): Edge[] => {
  if (shape.IsNull()) return [];
  // Each projected sub-result is a fresh arena compound; manage it so its slot
  // (and the borrowed edges cached on it) are freed, and return independent
  // clones the caller owns. Without this every projectEdges() leaks its result
  // compounds.
  using compound = castResultShape(shape);
  return _getEdges(compound).map((e) => unwrap(clone(e)));
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

  // projectEdges always allocates all six result compounds; getEdgesFromOc is the
  // only thing that disposes them (via `using compound`). So extract the hidden
  // compounds even when unwanted — then dispose the clones — rather than skipping
  // the calls and leaking the three hidden compounds' arena slots.
  const hiddenEdges = [
    ...getEdgesFromOc(projected.hidden.sharp),
    ...getEdgesFromOc(projected.hidden.smooth),
    ...getEdgesFromOc(projected.hidden.outline),
  ];
  let hidden: Edge[];
  if (withHiddenLines) {
    hidden = hiddenEdges;
  } else {
    for (const e of hiddenEdges) e[Symbol.dispose]();
    hidden = [];
  }

  return { visible, hidden };
}
