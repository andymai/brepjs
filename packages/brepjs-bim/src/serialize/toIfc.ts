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
import {
  writeOpeningGeometry,
  writeDoorEntity,
  writeWindowEntity,
  writeRelVoidsElement,
  writeRelFillsElement,
  writeDoorCommonPset,
  writeWindowCommonPset,
} from '../ifc-writer/openingWriter.js';
import type { BimError } from '../errors/bimError.js';
import { ifcError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { err } from 'brepjs';
import type { LocalId } from '../identity/localId.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import type { BimElement } from '../types/bimTypes.js';
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
  const doors = model.getDoors();
  const windows = model.getWindows();

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
    placementMap.set(wall.localId, localPlacementId);
    writeWallCommonPset(w, ownerHistoryId, wallExpressId, wall.spec);
    writeManufacturerPset(w, ownerHistoryId, wallExpressId, wall.spec);
    if (wall.spec.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, wallExpressId, wall.spec.customProperties);
    }
    writeWallBaseQuantities(w, ownerHistoryId, wallExpressId, wall.spec);
  }

  const openingPlacementMap = new Map<LocalId, number>();
  const openingEntityMap = new Map<LocalId, number>();

  for (const rel of relationships) {
    if (rel.kind !== 'VOIDS_WALL') continue;
    const wallElement = elements.find(
      (el): el is BimElement<'WALL'> => el.category === 'WALL' && el.localId === rel.wallLocalId
    );
    if (wallElement === undefined) continue;
    const wallExpressId = idMap.get(rel.wallLocalId);
    const wallPlacementId = placementMap.get(rel.wallLocalId);
    if (wallExpressId === undefined || wallPlacementId === undefined) continue;

    const openingElement = elements.find((el) => el.localId === rel.openingLocalId);
    if (openingElement === undefined || openingElement.category !== 'OPENING') continue;

    const { openingEntityId, openingPlacementId } = writeOpeningGeometry(
      w, openingElement.guid, openingElement.spec, wallElement.spec, wallPlacementId, geomSubContextId, ownerHistoryId
    );
    idMap.set(rel.openingLocalId, openingEntityId);
    openingPlacementMap.set(rel.openingLocalId, openingPlacementId);
    openingEntityMap.set(rel.openingLocalId, openingEntityId);

    writeRelVoidsElement(w, rel.guid, ownerHistoryId, wallExpressId, openingEntityId);
  }

  for (const [i, door] of doors.entries()) {
    const fillsRel = relationships.find(
      (rel) => rel.kind === 'FILLS_OPENING' && rel.fillerLocalId === door.localId
    );
    if (fillsRel === undefined || fillsRel.kind !== 'FILLS_OPENING') continue;
    const openingPlacementId = openingPlacementMap.get(fillsRel.openingLocalId);
    const openingEntityId = openingEntityMap.get(fillsRel.openingLocalId);
    if (openingPlacementId === undefined || openingEntityId === undefined) continue;
    const doorExpressId = writeDoorEntity(w, door.guid, `Door ${i + 1}`, ownerHistoryId, openingPlacementId);
    idMap.set(door.localId, doorExpressId);
    writeRelFillsElement(w, fillsRel.guid, ownerHistoryId, openingEntityId, doorExpressId);
    writeDoorCommonPset(w, ownerHistoryId, doorExpressId, door.spec);
  }

  for (const [i, win] of windows.entries()) {
    const fillsRel = relationships.find(
      (rel) => rel.kind === 'FILLS_OPENING' && rel.fillerLocalId === win.localId
    );
    if (fillsRel === undefined || fillsRel.kind !== 'FILLS_OPENING') continue;
    const openingPlacementId = openingPlacementMap.get(fillsRel.openingLocalId);
    const openingEntityId = openingEntityMap.get(fillsRel.openingLocalId);
    if (openingPlacementId === undefined || openingEntityId === undefined) continue;
    const windowExpressId = writeWindowEntity(w, win.guid, `Window ${i + 1}`, ownerHistoryId, openingPlacementId);
    idMap.set(win.localId, windowExpressId);
    writeRelFillsElement(w, fillsRel.guid, ownerHistoryId, openingEntityId, windowExpressId);
    writeWindowCommonPset(w, ownerHistoryId, windowExpressId, win.spec);
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

  const byMaterial = new Map<string, { guid: IfcGuid; ids: number[] }>();
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
