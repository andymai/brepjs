import { getKernel } from '../kernel/index.js';
import type { OcType } from '../kernel/types.js';
import { gcWithScope } from '../core/memory.js';
import { cast } from '../topology/cast.js';
import { unwrap } from '../core/result.js';
import type { Edge, AnyShape } from '../topology/shapes.js';
import type { ProjectionCamera } from './ProjectionCamera.js';

const getEdges = (shape: OcType): Edge[] => {
  if (shape.IsNull()) return [];
  return unwrap(cast(shape)).edges;
};

/**
 * Project a 3D shape onto a 2D plane using hidden-line removal (HLR).
 *
 * @param withHiddenLines - If `true`, also returns hidden (occluded) edges.
 * @returns Separate arrays of visible and hidden projected edges.
 */
export function makeProjectedEdges(
  shape: AnyShape,
  camera: ProjectionCamera,
  withHiddenLines = true
): { visible: Edge[]; hidden: Edge[] } {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const hiddenLineRemoval = r(new oc.HLRBRep_Algo_1());
  hiddenLineRemoval.Add_2(shape.wrapped, 0);

  const projector = r(new oc.HLRAlgo_Projector_2(camera.wrapped));
  hiddenLineRemoval.Projector_1(projector);

  hiddenLineRemoval.Update();
  hiddenLineRemoval.Hide_1();

  const hlrShapes = r(
    new oc.HLRBRep_HLRToShape(r(new oc.Handle_HLRBRep_Algo_2(hiddenLineRemoval)))
  );

  const visible = [
    ...getEdges(hlrShapes.VCompound_1()),
    ...getEdges(hlrShapes.Rg1LineVCompound_1()),
    ...getEdges(hlrShapes.OutLineVCompound_1()),
  ];

  visible.forEach((e) => oc.BRepLib.BuildCurves3d_2(e.wrapped));

  const hidden = withHiddenLines
    ? [
        ...getEdges(hlrShapes.HCompound_1()),
        ...getEdges(hlrShapes.Rg1LineHCompound_1()),
        ...getEdges(hlrShapes.OutLineHCompound_1()),
      ]
    : [];

  hidden.forEach((e) => oc.BRepLib.BuildCurves3d_2(e.wrapped));

  return { visible, hidden };
}
