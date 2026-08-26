import * as WebIFC from 'web-ifc';
import type { ValidSolid } from 'brepjs';
import type { IfcWriter } from './ifcWriter.js';
import { writeAxis2Placement3D } from './headerWriter.js';
import { writeTessellation, type TessellationOutput } from './tessellationWriter.js';

export interface TessellatedProductRepresentationIds {
  readonly localPlacementId: number;
  readonly productDefinitionShapeId: number;
  readonly tessellation: TessellationOutput;
}

/** Write a tessellated body in the coordinate frame supplied by the caller. */
export function writeTessellatedProductGeometry(
  w: IfcWriter,
  solid: ValidSolid,
  geomSubContextId: number,
  parentPlacementId: number | null
): TessellatedProductRepresentationIds {
  const placement3DId = writeAxis2Placement3D(w, [0, 0, 0]);
  const localPlacementId = w.nextId();
  w.writeLine({
    expressID: localPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: parentPlacementId !== null ? w.ref(parentPlacementId) : null,
    RelativePlacement: w.ref(placement3DId),
  });

  const tessellation = writeTessellation(w, solid, geomSubContextId, localPlacementId);
  return {
    localPlacementId,
    productDefinitionShapeId: tessellation.productDefinitionShapeId,
    tessellation,
  };
}
