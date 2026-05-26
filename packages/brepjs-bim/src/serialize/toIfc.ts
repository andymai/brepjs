import type { BimModel } from '../model/bimModel.js';
import type { BimModelMeta } from '../ifc-writer/headerWriter.js';
import { IfcWriter } from '../ifc-writer/ifcWriter.js';
import { writeHeader } from '../ifc-writer/headerWriter.js';
import {
  writeProject,
  writeSite,
  writeBuilding,
  writeStorey,
  writeWallEntity,
} from '../ifc-writer/entityWriter.js';
import { writeWallGeometry } from '../ifc-writer/geometryWriter.js';
import {
  writeRelAggregates,
  writeRelContainedInSpatialStructure,
  writeRelAssociatesMaterial,
} from '../ifc-writer/relWriter.js';
import {
  writeWallCommonPset,
  writeManufacturerPset,
  writeCustomPsets,
  writeWallBaseQuantities,
} from '../ifc-writer/psetWriter.js';
import type { BimError } from '../errors/bimError.js';
import { ifcError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { err } from 'brepjs';
import type { LocalId } from '../identity/localId.js';
import type { BimRelationship } from '../types/relationships.js';

export async function toIfc(
  model: BimModel,
  meta: BimModelMeta
): Promise<Result<Uint8Array, BimError>> {
  const project = model.getProject();
  if (!project) {
    return err(ifcError('NO_PROJECT', 'BimModel has no project — call model.init() first'));
  }

  const writerResult = await IfcWriter.create();
  if (!writerResult.ok) return writerResult;
  const w = writerResult.value;

  const elements = model.getAllElements();
  const relationships = model.getAllRelationships();
  const walls = model.getWalls();

  const { ownerHistoryId, geomContextId, geomSubContextId, unitAssignmentId } = writeHeader(w, meta);

  const idMap = new Map<LocalId, number>();
  const placementMap = new Map<LocalId, number>();

  const projectExpressId = writeProject(
    w, project.guid, project.spec.name, ownerHistoryId, unitAssignmentId, geomContextId
  );
  idMap.set(project.localId, projectExpressId);

  for (const el of elements) {
    if (el.category !== 'SITE') continue;
    const { entityId, placementId } = writeSite(w, el.guid, el.spec.name, ownerHistoryId);
    idMap.set(el.localId, entityId);
    placementMap.set(el.localId, placementId);
  }

  for (const el of elements) {
    if (el.category !== 'BUILDING') continue;
    const parentSiteId = findParentOf(el.localId, relationships);
    const parentPlacementId = parentSiteId !== null ? (placementMap.get(parentSiteId) ?? null) : null;
    const { entityId, placementId } = writeBuilding(
      w, el.guid, el.spec.name, ownerHistoryId, parentPlacementId
    );
    idMap.set(el.localId, entityId);
    placementMap.set(el.localId, placementId);
  }

  for (const el of elements) {
    if (el.category !== 'STOREY') continue;
    const parentBuildingId = findParentOf(el.localId, relationships);
    const parentPlacementId = parentBuildingId !== null ? (placementMap.get(parentBuildingId) ?? null) : null;
    const { entityId, placementId } = writeStorey(
      w, el.guid, el.spec.name, el.spec.elevation, ownerHistoryId, parentPlacementId
    );
    idMap.set(el.localId, entityId);
    placementMap.set(el.localId, placementId);
  }

  for (const [i, wall] of walls.entries()) {
    const containingId = findContainerOf(wall.localId, relationships);
    const storeyPlacementId = containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    const { localPlacementId, productDefinitionShapeId } = writeWallGeometry(
      w, wall.spec, geomSubContextId, storeyPlacementId
    );
    const wallExpressId = writeWallEntity(
      w, wall.guid, `Wall ${i + 1}`, ownerHistoryId, localPlacementId, productDefinitionShapeId
    );
    idMap.set(wall.localId, wallExpressId);
    writeWallCommonPset(w, ownerHistoryId, wallExpressId, wall.spec);
    writeManufacturerPset(w, ownerHistoryId, wallExpressId, wall.spec);
    if (wall.spec.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, wallExpressId, wall.spec.customProperties);
    }
    writeWallBaseQuantities(w, ownerHistoryId, wallExpressId, wall.spec);
  }

  for (const rel of relationships) {
    if (rel.kind !== 'AGGREGATES') continue;
    const parentExpressId = idMap.get(rel.relatingObject);
    const childExpressIds = rel.relatedObjects
      .map((id) => idMap.get(id))
      .filter((id): id is number => id !== undefined);
    if (parentExpressId === undefined || childExpressIds.length === 0) continue;
    writeRelAggregates(w, rel.guid, ownerHistoryId, parentExpressId, childExpressIds);
  }

  for (const rel of relationships) {
    if (rel.kind !== 'CONTAINED_IN') continue;
    const structureExpressId = idMap.get(rel.relatingStructure);
    const elementExpressIds = rel.relatedElements
      .map((id) => idMap.get(id))
      .filter((id): id is number => id !== undefined);
    if (structureExpressId === undefined || elementExpressIds.length === 0) continue;
    writeRelContainedInSpatialStructure(
      w, rel.guid, ownerHistoryId, structureExpressId, elementExpressIds
    );
  }

  const byMaterial = new Map<string, { guid: string; ids: number[] }>();
  for (const rel of relationships) {
    if (rel.kind !== 'ASSOCIATES_MATERIAL') continue;
    const objectExpressIds = rel.relatedObjects
      .map((id) => idMap.get(id))
      .filter((id): id is number => id !== undefined);
    const existing = byMaterial.get(rel.materialName);
    if (existing !== undefined) {
      byMaterial.set(rel.materialName, { guid: existing.guid, ids: [...existing.ids, ...objectExpressIds] });
    } else {
      byMaterial.set(rel.materialName, { guid: rel.guid, ids: objectExpressIds });
    }
  }
  for (const [materialName, { guid, ids }] of byMaterial) {
    if (ids.length === 0) continue;
    writeRelAssociatesMaterial(w, guid, ownerHistoryId, materialName, ids);
  }

  return w.save();
}

function findParentOf(childId: LocalId, relationships: readonly BimRelationship[]): LocalId | null {
  for (const rel of relationships) {
    if (rel.kind === 'AGGREGATES' && rel.relatedObjects.includes(childId)) {
      return rel.relatingObject;
    }
  }
  return null;
}

function findContainerOf(elementId: LocalId, relationships: readonly BimRelationship[]): LocalId | null {
  for (const rel of relationships) {
    if (rel.kind === 'CONTAINED_IN' && rel.relatedElements.includes(elementId)) {
      return rel.relatingStructure;
    }
  }
  return null;
}
