import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import type { ClassificationRef } from '../types/classificationTypes.js';
import { deriveIfcGuidSync } from '../identity/guidDerivation.js';

export type { ClassificationRef } from '../types/classificationTypes.js';

/** Stable derivation key for an IfcRelAssociatesClassification, keyed on the ref. */
function makeClassificationRelKey(ref: ClassificationRef): string {
  return `rel-class:${ref.system}:${ref.code}`;
}

/**
 * Writes the IFC classification entities for a set of references and associates
 * each to its elements.
 *
 * For every distinct classification system a single `IfcClassification` is
 * emitted (deduplicated by system name within this call). Each reference yields
 * one `IfcClassificationReference` pointing at that system, plus one
 * `IfcRelAssociatesClassification` linking the reference to its related objects.
 * The rel's GlobalId is derived deterministically from the reference's
 * system/code so re-exports stay byte-stable.
 *
 * @param refs maps each classification reference to the express IDs of the IFC
 *   elements it classifies.
 */
export function writeClassificationRefs(
  w: IfcWriter,
  ownerHistoryId: number,
  refs: ReadonlyMap<ClassificationRef, readonly number[]>
): void {
  // system name → IfcClassification expressId, scoped to this call only.
  const systemIds = new Map<string, number>();

  for (const [ref, relatedObjectIds] of refs) {
    if (relatedObjectIds.length === 0) continue;

    let classificationId = systemIds.get(ref.system);
    if (classificationId === undefined) {
      classificationId = w.nextId();
      w.writeLine({
        expressID: classificationId,
        type: WebIFC.IFCCLASSIFICATION,
        Source: null,
        Edition: ref.edition !== undefined ? w.mkType(WebIFC.IFCLABEL, ref.edition) : null,
        EditionDate: null,
        Name: w.mkType(WebIFC.IFCLABEL, ref.system),
        Description: null,
        Location:
          ref.location !== undefined ? w.mkType(WebIFC.IFCURIREFERENCE, ref.location) : null,
        ReferenceTokens: null,
      });
      systemIds.set(ref.system, classificationId);
    }

    const referenceId = w.nextId();
    w.writeLine({
      expressID: referenceId,
      type: WebIFC.IFCCLASSIFICATIONREFERENCE,
      Location: null,
      Identification: w.mkType(WebIFC.IFCIDENTIFIER, ref.code),
      Name: ref.description !== undefined ? w.mkType(WebIFC.IFCLABEL, ref.description) : null,
      ReferencedSource: w.ref(classificationId),
      Description: null,
      Sort: null,
    });

    w.writeLine({
      expressID: w.nextId(),
      type: WebIFC.IFCRELASSOCIATESCLASSIFICATION,
      GlobalId: w.mkType(
        WebIFC.IFCGLOBALLYUNIQUEID,
        deriveIfcGuidSync(makeClassificationRelKey(ref))
      ),
      OwnerHistory: w.ref(ownerHistoryId),
      Name: null,
      Description: null,
      RelatedObjects: relatedObjectIds.map((id) => w.ref(id)),
      RelatingClassification: w.ref(referenceId),
    });
  }
}
