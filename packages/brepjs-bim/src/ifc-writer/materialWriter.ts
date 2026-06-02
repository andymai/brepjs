import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import type { MaterialLayer } from '../types/materialTypes.js';
import { toIfcLengthM } from '../units/units.js';

export type { MaterialLayer } from '../types/materialTypes.js';

export interface MaterialLayerSetSpec {
  readonly kind: 'LAYER_SET';
  readonly layerSetName: string;
  readonly layers: readonly MaterialLayer[];
  /** Offset of the layer set from the element reference line, in mm (default 0). */
  readonly offsetFromReferenceLine?: number | undefined;
}

export interface MaterialProfileSpec {
  readonly kind: 'PROFILE_SET';
  readonly profileSetName: string;
  /** Name of the profile; the profile geometry is referenced by name only. */
  readonly profileName: string;
  readonly materialName: string;
}

export type MaterialSpec = MaterialLayerSetSpec | MaterialProfileSpec;

// IFCLOGICAL unknown sentinel; layers carry a tri-state ventilation flag.
const LOGICAL_TRUE = 'T';
const LOGICAL_FALSE = 'F';
const LOGICAL_UNKNOWN = 'U';

function writeMaterial(w: IfcWriter, name: string): number {
  return w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCMATERIAL,
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    Category: null,
  });
}

function writeMaterialLayer(w: IfcWriter, layer: MaterialLayer): number {
  const materialId = writeMaterial(w, layer.name);
  const isVentilated =
    layer.isVentilated === undefined
      ? LOGICAL_UNKNOWN
      : layer.isVentilated
        ? LOGICAL_TRUE
        : LOGICAL_FALSE;
  return w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCMATERIALLAYER,
    Material: w.ref(materialId),
    LayerThickness: w.mkType(WebIFC.IFCNONNEGATIVELENGTHMEASURE, toIfcLengthM(layer.thicknessMm)),
    IsVentilated: w.mkType(WebIFC.IFCLOGICAL, isVentilated),
    Name: w.mkType(WebIFC.IFCLABEL, layer.name),
    Description: null,
    Category: null,
    Priority: layer.priority !== undefined ? w.mkType(WebIFC.IFCINTEGER, layer.priority) : null,
  });
}

function writeRelAssociatesMaterial(
  w: IfcWriter,
  guid: IfcGuid,
  ownerHistoryId: number,
  relatingMaterialId: number,
  relatedObjectIds: readonly number[]
): number {
  return w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCRELASSOCIATESMATERIAL,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    RelatedObjects: relatedObjectIds.map((id) => w.ref(id)),
    RelatingMaterial: w.ref(relatingMaterialId),
  });
}

/**
 * Writes IfcMaterialLayer × N + IfcMaterialLayerSet + IfcMaterialLayerSetUsage,
 * then associates the usage with the related objects via IfcRelAssociatesMaterial.
 * The rel GlobalId comes from `guid` (a deterministic, caller-supplied GUID).
 * Returns the IfcRelAssociatesMaterial express ID, or 0 if the layer list is
 * empty (nothing is written).
 */
export function writeMaterialLayerSet(
  w: IfcWriter,
  guid: IfcGuid,
  ownerHistoryId: number,
  spec: MaterialLayerSetSpec,
  relatedObjectIds: readonly number[],
  direction: 'AXIS2' | 'AXIS3' = 'AXIS2'
): number {
  if (spec.layers.length === 0) {
    console.warn(`materialWriter: layer set "${spec.layerSetName}" has no layers; skipping write`);
    return 0;
  }

  const layerIds = spec.layers.map((layer) => writeMaterialLayer(w, layer));
  const layerSetId = w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCMATERIALLAYERSET,
    MaterialLayers: layerIds.map((id) => w.ref(id)),
    LayerSetName: w.mkType(WebIFC.IFCLABEL, spec.layerSetName),
    Description: null,
  });

  const offsetM = toIfcLengthM(spec.offsetFromReferenceLine ?? 0);
  const usageId = w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCMATERIALLAYERSETUSAGE,
    ForLayerSet: w.ref(layerSetId),
    LayerSetDirection: { type: 3, value: direction },
    DirectionSense: { type: 3, value: 'POSITIVE' },
    OffsetFromReferenceLine: w.mkType(WebIFC.IFCLENGTHMEASURE, offsetM),
    ReferenceExtent: null,
  });

  return writeRelAssociatesMaterial(w, guid, ownerHistoryId, usageId, relatedObjectIds);
}

/**
 * Writes a IfcMaterialProfileSet referencing a single named profile + material,
 * then associates it with the related objects via IfcRelAssociatesMaterial.
 * Profile geometry is referenced by name only (no IfcProfileDef geometry).
 * Returns the IfcRelAssociatesMaterial express ID.
 */
export function writeMaterialProfileSet(
  w: IfcWriter,
  guid: IfcGuid,
  ownerHistoryId: number,
  spec: MaterialProfileSpec,
  relatedObjectIds: readonly number[]
): number {
  const materialId = writeMaterial(w, spec.materialName);
  const profileId = w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCMATERIALPROFILE,
    Name: w.mkType(WebIFC.IFCLABEL, spec.profileName),
    Description: null,
    Material: w.ref(materialId),
    Profile: null,
    Priority: null,
    Category: null,
  });
  const profileSetId = w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCMATERIALPROFILESET,
    Name: w.mkType(WebIFC.IFCLABEL, spec.profileSetName),
    Description: null,
    MaterialProfiles: [w.ref(profileId)],
    CompositeProfile: null,
  });

  return writeRelAssociatesMaterial(w, guid, ownerHistoryId, profileSetId, relatedObjectIds);
}

/**
 * Writes a bare IfcMaterial + IfcRelAssociatesMaterial. This is the
 * single-material path used when no layer/profile spec is present.
 */
export function writeMaterialSimple(
  w: IfcWriter,
  guid: IfcGuid,
  ownerHistoryId: number,
  materialName: string,
  relatedObjectIds: readonly number[]
): void {
  const materialId = writeMaterial(w, materialName);
  writeRelAssociatesMaterial(w, guid, ownerHistoryId, materialId, relatedObjectIds);
}
