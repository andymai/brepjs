import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import type { IfcGuid } from '../identity/ifcGuid.js';

/** IfcConnectionTypeEnum values used by IfcRelConnectsPathElements path ends. */
export type PathConnectionTypeIfc = 'ATSTART' | 'ATEND' | 'ATPATH' | 'NOTDEFINED';

/**
 * Emits an IfcRelConnectsElements recording a physical connection between two
 * elements. `description` optionally annotates the connection; geometry of the
 * connection is left null (logical connectivity only).
 */
export function writeRelConnectsElements(
  w: IfcWriter,
  guid: IfcGuid,
  ownerHistoryId: number,
  relatingElementId: number,
  relatedElementId: number,
  description: string | null = null
): void {
  w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCRELCONNECTSELEMENTS,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: description !== null ? w.mkType(WebIFC.IFCTEXT, description) : null,
    ConnectionGeometry: null,
    RelatingElement: w.ref(relatingElementId),
    RelatedElement: w.ref(relatedElementId),
  });
}

/**
 * Emits an IfcRelConnectsPathElements recording a connection between two
 * path-based elements (e.g. walls, beams) at specified path ends. Priority
 * arrays are emitted empty; connection geometry is left null.
 */
export function writeRelConnectsPathElements(
  w: IfcWriter,
  guid: IfcGuid,
  ownerHistoryId: number,
  relatingElementId: number,
  relatedElementId: number,
  relatingConnectionType: PathConnectionTypeIfc,
  relatedConnectionType: PathConnectionTypeIfc,
  description: string | null = null
): void {
  w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCRELCONNECTSPATHELEMENTS,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: description !== null ? w.mkType(WebIFC.IFCTEXT, description) : null,
    ConnectionGeometry: null,
    RelatingElement: w.ref(relatingElementId),
    RelatedElement: w.ref(relatedElementId),
    RelatingPriorities: [],
    RelatedPriorities: [],
    RelatedConnectionType: { type: 3, value: relatedConnectionType },
    RelatingConnectionType: { type: 3, value: relatingConnectionType },
  });
}
