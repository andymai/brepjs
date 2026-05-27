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
  writeSlabEntity,
  writeBeamEntity,
  writeColumnEntity,
} from '../ifc-writer/entityWriter.js';
import {
  writeWallGeometry,
  writeSlabGeometry,
  writeBeamGeometry,
  writeColumnGeometry,
} from '../ifc-writer/geometryWriter.js';
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
  writeSlabCommonPset,
  writeSlabBaseQuantities,
  writeBeamCommonPset,
  writeBeamBaseQuantities,
  writeColumnCommonPset,
  writeColumnBaseQuantities,
} from '../ifc-writer/psetWriter.js';
import {
  writeOpeningGeometry,
  writeSlabOpeningGeometry,
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
import type { BimElement, WallOpeningSpec, SlabOpeningSpec } from '../types/bimTypes.js';
import { isWallOpening, isSlabOpening } from '../types/bimTypes.js';
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
  const slabs = model.getSlabs();
  const beams = model.getBeams();
  const columns = model.getColumns();
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

  const openingsByWall = new Map<LocalId, WallOpeningSpec[]>();
  for (const rel of relationships) {
    if (rel.kind !== 'VOIDS_WALL') continue;
    const opening = elements.find((el) => el.localId === rel.openingLocalId);
    if (opening === undefined || opening.category !== 'OPENING') continue;
    if (!isWallOpening(opening.spec)) continue;
    const list = openingsByWall.get(rel.wallLocalId) ?? [];
    list.push(opening.spec);
    openingsByWall.set(rel.wallLocalId, list);
  }

  const openingsBySlab = new Map<LocalId, SlabOpeningSpec[]>();
  for (const rel of relationships) {
    if (rel.kind !== 'VOIDS_SLAB') continue;
    const opening = elements.find((el) => el.localId === rel.openingLocalId);
    if (opening === undefined || opening.category !== 'OPENING') continue;
    if (!isSlabOpening(opening.spec)) continue;
    const list = openingsBySlab.get(rel.slabLocalId) ?? [];
    list.push(opening.spec);
    openingsBySlab.set(rel.slabLocalId, list);
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
    writeWallBaseQuantities(
      w, ownerHistoryId, wallExpressId, wall.spec,
      openingsByWall.get(wall.localId) ?? []
    );
  }

  for (const [i, slab] of slabs.entries()) {
    const containingId = findContainerOf(slab.localId, relationships);
    const storeyPlacementId = containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    const { localPlacementId, productDefinitionShapeId } = writeSlabGeometry(
      w, slab.spec, geomSubContextId, storeyPlacementId
    );
    const slabExpressId = writeSlabEntity(
      w, slab.guid, `Slab ${i + 1}`, slab.spec.predefinedType,
      ownerHistoryId, localPlacementId, productDefinitionShapeId
    );
    idMap.set(slab.localId, slabExpressId);
    placementMap.set(slab.localId, localPlacementId);
    writeSlabCommonPset(w, ownerHistoryId, slabExpressId, slab.spec);
    writeManufacturerPset(w, ownerHistoryId, slabExpressId, slab.spec);
    if (slab.spec.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, slabExpressId, slab.spec.customProperties);
    }
    writeSlabBaseQuantities(
      w, ownerHistoryId, slabExpressId, slab.spec,
      openingsBySlab.get(slab.localId) ?? []
    );
  }

  for (const [i, beam] of beams.entries()) {
    const containingId = findContainerOf(beam.localId, relationships);
    const storeyPlacementId = containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    const { localPlacementId, productDefinitionShapeId } = writeBeamGeometry(
      w, beam.spec, geomSubContextId, storeyPlacementId
    );
    const beamExpressId = writeBeamEntity(
      w, beam.guid, `Beam ${i + 1}`, beam.spec.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId, localPlacementId, productDefinitionShapeId
    );
    idMap.set(beam.localId, beamExpressId);
    placementMap.set(beam.localId, localPlacementId);
    writeBeamCommonPset(w, ownerHistoryId, beamExpressId, beam.spec);
    writeManufacturerPset(w, ownerHistoryId, beamExpressId, beam.spec);
    if (beam.spec.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, beamExpressId, beam.spec.customProperties);
    }
    writeBeamBaseQuantities(w, ownerHistoryId, beamExpressId, beam.spec);
  }

  for (const [i, column] of columns.entries()) {
    const containingId = findContainerOf(column.localId, relationships);
    const storeyPlacementId = containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    const { localPlacementId, productDefinitionShapeId } = writeColumnGeometry(
      w, column.spec, geomSubContextId, storeyPlacementId
    );
    const columnExpressId = writeColumnEntity(
      w, column.guid, `Column ${i + 1}`, column.spec.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId, localPlacementId, productDefinitionShapeId
    );
    idMap.set(column.localId, columnExpressId);
    placementMap.set(column.localId, localPlacementId);
    writeColumnCommonPset(w, ownerHistoryId, columnExpressId, column.spec);
    writeManufacturerPset(w, ownerHistoryId, columnExpressId, column.spec);
    if (column.spec.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, columnExpressId, column.spec.customProperties);
    }
    writeColumnBaseQuantities(w, ownerHistoryId, columnExpressId, column.spec);
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
    if (!isWallOpening(openingElement.spec)) continue;

    const { openingEntityId, openingPlacementId } = writeOpeningGeometry(
      w, openingElement.guid, openingElement.spec, wallElement.spec, wallPlacementId, geomSubContextId, ownerHistoryId
    );
    idMap.set(rel.openingLocalId, openingEntityId);
    openingPlacementMap.set(rel.openingLocalId, openingPlacementId);
    openingEntityMap.set(rel.openingLocalId, openingEntityId);

    writeRelVoidsElement(w, rel.guid, ownerHistoryId, wallExpressId, openingEntityId);
  }

  for (const rel of relationships) {
    if (rel.kind !== 'VOIDS_SLAB') continue;
    const slabElement = elements.find(
      (el): el is BimElement<'SLAB'> => el.category === 'SLAB' && el.localId === rel.slabLocalId
    );
    if (slabElement === undefined) continue;
    const slabExpressId = idMap.get(rel.slabLocalId);
    const slabPlacementId = placementMap.get(rel.slabLocalId);
    if (slabExpressId === undefined || slabPlacementId === undefined) continue;

    const openingElement = elements.find((el) => el.localId === rel.openingLocalId);
    if (openingElement === undefined || openingElement.category !== 'OPENING') continue;
    if (!isSlabOpening(openingElement.spec)) continue;

    const { openingEntityId } = writeSlabOpeningGeometry(
      w, openingElement.guid, openingElement.spec, slabElement.spec, slabPlacementId, geomSubContextId, ownerHistoryId
    );
    idMap.set(rel.openingLocalId, openingEntityId);

    writeRelVoidsElement(w, rel.guid, ownerHistoryId, slabExpressId, openingEntityId);
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
