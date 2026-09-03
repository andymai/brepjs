import type { BimModel } from '../model/bimModel.js';
import type { BimModelMeta } from '../ifc-writer/headerWriter.js';
import { IfcWriter } from '../ifc-writer/ifcWriter.js';
import { writeHeader, writeMapConversion } from '../ifc-writer/headerWriter.js';
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
  writeRoofGeometry,
} from '../ifc-writer/geometryWriter.js';
import {
  writeSpaceGeometry,
  writeSpaceEntity,
  writeRelSpaceBoundary,
} from '../ifc-writer/spaceWriter.js';
import { writeRoofEntity, writeRoofType } from '../ifc-writer/roofWriter.js';
import type { RoofPredefinedType } from '../specs/roofSpec.js';
import { writeCurtainWall } from '../ifc-writer/curtainWallWriter.js';
import {
  writeFootingGeometry,
  writePileGeometry,
  writeFootingEntity,
  writePileEntity,
} from '../ifc-writer/foundationWriter.js';
import { writeStairAssembly, writeRampAssembly } from '../ifc-writer/stairWriter.js';
import {
  writeRailingGeometry,
  writeRailingEntity,
  type RailingRepresentationIds,
} from '../ifc-writer/railingWriter.js';
import {
  writeCoveringGeometry,
  writeCoveringEntity,
  writeRelCoversBldgElements,
} from '../ifc-writer/coveringWriter.js';
import { writeElementAssemblyEntity, writeRelNests } from '../ifc-writer/assemblyWriter.js';
import {
  writeBridge,
  writeBridgePart,
  writeEarthworksFillEntity,
} from '../ifc-writer/infrastructureWriter.js';
import { writeTessellatedProductGeometry } from '../ifc-writer/tessellatedProductWriter.js';
import {
  writeZoneEntity,
  writeSystemEntity,
  writeRelAssignsToGroup,
} from '../ifc-writer/groupWriter.js';
import { writeSurfaceStyle, writeStyledItem } from '../ifc-writer/styleWriter.js';
import {
  writeRelConnectsElements,
  writeRelConnectsPathElements,
} from '../ifc-writer/connectivityWriter.js';
import {
  writeRelAggregates,
  writeRelContainedInSpatialStructure,
} from '../ifc-writer/relWriter.js';
import { writeMaterialLayerSet, writeMaterialSimple } from '../ifc-writer/materialWriter.js';
import type { MaterialLayer } from '../types/materialTypes.js';
import { writeClassificationRefs } from '../ifc-writer/classificationWriter.js';
import type { ClassificationRef } from '../types/classificationTypes.js';
import {
  writeWallCommonPset,
  writeManufacturerPset,
  writeCustomPsets,
  writeWallBaseQuantities,
  writeExactWallBaseQuantities,
  writeSlabCommonPset,
  writeSlabBaseQuantities,
  writeBeamCommonPset,
  writeBeamBaseQuantities,
  writeColumnCommonPset,
  writeColumnBaseQuantities,
  writeSpaceCommonPset,
  writeSpaceBaseQuantities,
  writeRoofCommonPset,
  writeRoofBaseQuantities,
  writeCurtainWallCommonPset,
  writeFootingCommonPset,
  writeFootingBaseQuantities,
  writePileCommonPset,
  writePileBaseQuantities,
  writeStairCommonPset,
  writeRampCommonPset,
  writeRailingCommonPset,
  writeCoveringCommonPset,
  resolveDensityKgM3,
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
import { writeProxyGeometry, writeProxyEntity } from '../ifc-writer/proxyWriter.js';
import { writeIfcType } from '../ifc-writer/typeWriter.js';
import type { IfcTypeName } from '../ifc-writer/typeWriter.js';
import { toIfcLengthM } from '../units/units.js';
import { checkGeometryValidity } from '../validation/geometryValidity.js';
import type { BimError } from '../errors/bimError.js';
import { ifcError } from '../errors/bimError.js';
import type { Result, ValidSolid } from 'brepjs';
import { err, ok } from 'brepjs';
import type { LocalId } from '../identity/localId.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import { deriveIfcGuidSync } from '../identity/guidDerivation.js';
import type { BimElement, WallOpeningSpec, SlabOpeningSpec } from '../types/bimTypes.js';
import { isWallOpening, isSlabOpening } from '../types/bimTypes.js';
import type { BimRelationship } from '../types/relationships.js';
import { checkReferentialIntegrity } from '../validation/referentialIntegrity.js';
import { checkSchema } from '../validation/schemaCheck.js';
import { checkRoundTrip } from '../validation/roundTrip.js';
import { checkGherkinRules } from '../validation/gherkinChecks.js';
import {
  hasErrors,
  issue,
  type ValidationReport,
  type ValidationIssue,
} from '../validation/severity.js';
import { bodySolids } from '../types/productBody.js';
import type { NonEmpty } from '../types/productBody.js';
import { preflightExactBody } from './exactBodyPreflight.js';
import { deriveExactWallQuantities } from './exactWallQuantities.js';
import {
  writeExactBodyGeometry,
  type PreparedTessellation,
} from '../ifc-writer/tessellationWriter.js';

type ExactBodyCapableElement = BimElement<'WALL'> | BimElement<'RAILING'>;

type PreflightedProductElement<E extends ExactBodyCapableElement> =
  | {
      readonly kind: 'PARAMETRIC';
      readonly element: E;
      readonly solid: ValidSolid;
    }
  | {
      readonly kind: 'EXACT';
      readonly element: E;
      readonly solids: NonEmpty<ValidSolid>;
      readonly items: NonEmpty<PreparedTessellation>;
    };

function preflightProductBodies<E extends ExactBodyCapableElement>(
  elements: readonly E[]
): Result<readonly PreflightedProductElement<E>[], BimError> {
  const preflighted: PreflightedProductElement<E>[] = [];
  for (const element of elements) {
    const body = element.geometry;
    if (body.kind === 'PARAMETRIC') {
      preflighted.push({ kind: 'PARAMETRIC', element, solid: body.solid });
      continue;
    }
    const prepared = preflightExactBody({ localId: element.localId, solids: body.solids });
    if (!prepared.ok) return err(prepared.error);
    preflighted.push({
      kind: 'EXACT',
      element,
      solids: body.solids,
      items: prepared.value,
    });
  }
  return ok(preflighted);
}

export async function toIfc(
  model: BimModel,
  meta: BimModelMeta
): Promise<Result<Uint8Array, BimError>> {
  const project = model.getProject();
  if (!project) {
    return err(ifcError('NO_PROJECT', 'BimModel has no project — call model.init() first'));
  }
  if (
    (model.getBridges().length > 0 ||
      model.getBridgeParts().length > 0 ||
      model.getEarthworksFills().length > 0) &&
    (meta.ifcSchema ?? 'IFC4') !== 'IFC4X3'
  ) {
    return err(
      ifcError(
        'IFC4X3_REQUIRED',
        'Bridge, Bridge Part, and Earthworks Fill entities require IFC4X3 serialization'
      )
    );
  }

  const authorName = [meta.author?.givenName, meta.author?.familyName]
    .filter((p): p is string => Boolean(p))
    .join(' ');
  const writerResult = await IfcWriter.create(meta.mvdViewDefinition, meta.ifcSchema, {
    author: authorName,
    organization: meta.organizationName,
  });
  if (!writerResult.ok) return writerResult;
  using w = writerResult.value;
  // Scope writer-minted GUIDs (psets/quantities/rels) to this model.
  w.setModelScope(project.guid);

  const elements = model.getAllElements();
  const relationships = model.getAllRelationships();
  const walls = model.getWalls();
  const slabs = model.getSlabs();
  const beams = model.getBeams();
  const bridges = model.getBridges();
  const bridgeParts = model.getBridgeParts();
  const earthworksFills = model.getEarthworksFills();
  const columns = model.getColumns();
  const doors = model.getDoors();
  const windows = model.getWindows();
  const proxies = model.getProxies();
  const spaces = model.getSpaces();
  const roofs = model.getRoofs();
  const curtainWalls = model.getCurtainWalls();
  const footings = model.getFootings();
  const piles = model.getPiles();
  const stairs = model.getStairs();
  const ramps = model.getRamps();
  const railings = model.getRailings();
  const coverings = model.getCoverings();
  const assemblies = model.getElementAssemblies();
  const zones = model.getZones();
  const systems = model.getSystems();

  const preflightedWallsResult = preflightProductBodies(walls);
  if (!preflightedWallsResult.ok) return err(preflightedWallsResult.error);
  const preflightedRailingsResult = preflightProductBodies(railings);
  if (!preflightedRailingsResult.ok) return err(preflightedRailingsResult.error);
  const preflightedWalls = preflightedWallsResult.value;
  const preflightedRailings = preflightedRailingsResult.value;

  const { ownerHistoryId, geomContextId, geomSubContextId, unitAssignmentId, lengthUnitId } =
    writeHeader(w, meta);

  // Georeference the model context when the project declares a CRS (GRF003).
  if (project.spec.crs !== undefined) {
    writeMapConversion(w, project.spec.crs, geomContextId, lengthUnitId);
  }

  const densityByElement = buildDensityMap(relationships);

  const idMap = new Map<LocalId, number>();
  const placementMap = new Map<LocalId, number>();

  const projectExpressId = writeProject(
    w,
    project.guid,
    project.spec.name,
    ownerHistoryId,
    unitAssignmentId,
    geomContextId
  );
  idMap.set(project.localId, projectExpressId);

  for (const el of elements) {
    if (el.category !== 'SITE') continue;
    const parentId = findParentOf(el.localId, relationships);
    const parentPlacementId = parentId !== null ? (placementMap.get(parentId) ?? null) : null;
    const { entityId, placementId } = writeSite(
      w,
      el.guid,
      el.spec,
      ownerHistoryId,
      parentPlacementId
    );
    idMap.set(el.localId, entityId);
    placementMap.set(el.localId, placementId);
  }

  for (const bridge of bridges) {
    const parentId = findParentOf(bridge.localId, relationships);
    const parentPlacementId = parentId !== null ? (placementMap.get(parentId) ?? null) : null;
    const { entityId, placementId } = writeBridge(
      w,
      bridge.guid,
      bridge.spec,
      ownerHistoryId,
      parentPlacementId
    );
    idMap.set(bridge.localId, entityId);
    placementMap.set(bridge.localId, placementId);
  }

  // Bridge Parts nest recursively and getBridgeParts() yields insertion order,
  // so write a part only once its parent's placement exists — a child written
  // first would silently anchor at the project origin.
  const pendingParts = [...bridgeParts];
  while (pendingParts.length > 0) {
    const readyIndex = pendingParts.findIndex((candidate) => {
      const candidateParentId = findParentOf(candidate.localId, relationships);
      return candidateParentId === null || placementMap.has(candidateParentId);
    });
    const [part] = pendingParts.splice(readyIndex === -1 ? 0 : readyIndex, 1);
    if (part === undefined) break;
    const parentId = findParentOf(part.localId, relationships);
    const parentPlacementId = parentId !== null ? (placementMap.get(parentId) ?? null) : null;
    const { entityId, placementId } = writeBridgePart(
      w,
      part.guid,
      part.spec,
      ownerHistoryId,
      parentPlacementId
    );
    idMap.set(part.localId, entityId);
    placementMap.set(part.localId, placementId);
  }

  for (const el of elements) {
    if (el.category !== 'BUILDING') continue;
    const parentSiteId = findParentOf(el.localId, relationships);
    const parentPlacementId =
      parentSiteId !== null ? (placementMap.get(parentSiteId) ?? null) : null;
    const { entityId, placementId } = writeBuilding(
      w,
      el.guid,
      el.spec.name,
      ownerHistoryId,
      parentPlacementId
    );
    idMap.set(el.localId, entityId);
    placementMap.set(el.localId, placementId);
  }

  for (const el of elements) {
    if (el.category !== 'STOREY') continue;
    const parentBuildingId = findParentOf(el.localId, relationships);
    const parentPlacementId =
      parentBuildingId !== null ? (placementMap.get(parentBuildingId) ?? null) : null;
    const { entityId, placementId } = writeStorey(
      w,
      el.guid,
      el.spec.name,
      el.spec.elevation,
      ownerHistoryId,
      parentPlacementId
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

  for (const [i, preflighted] of preflightedWalls.entries()) {
    const wall = preflighted.element;
    const containingId = findContainerOf(wall.localId, relationships);
    const storeyPlacementId =
      containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    const exactQuantities =
      preflighted.kind === 'EXACT'
        ? deriveExactWallQuantities({ spec: wall.spec, solids: preflighted.solids })
        : null;

    const { localPlacementId, productDefinitionShapeId } =
      preflighted.kind === 'EXACT'
        ? writeExactBodyGeometry(
            w,
            wall.spec,
            preflighted.items,
            geomSubContextId,
            storeyPlacementId
          )
        : writeWallGeometry(w, wall.spec, geomSubContextId, storeyPlacementId);
    const wallExpressId = writeWallEntity(
      w,
      wall.guid,
      `Wall ${i + 1}`,
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(wall.localId, wallExpressId);
    placementMap.set(wall.localId, localPlacementId);
    writeWallCommonPset(w, ownerHistoryId, wallExpressId, wall.spec);
    writeManufacturerPset(w, ownerHistoryId, wallExpressId, wall.spec);
    if (wall.spec.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, wallExpressId, wall.spec.customProperties);
    }
    if (preflighted.kind === 'EXACT') {
      if (exactQuantities !== null && exactQuantities.ok) {
        writeExactWallBaseQuantities(w, ownerHistoryId, wallExpressId, exactQuantities.value);
      }
    } else {
      writeWallBaseQuantities(
        w,
        ownerHistoryId,
        wallExpressId,
        wall.spec,
        openingsByWall.get(wall.localId) ?? [],
        densityByElement.get(wall.localId)
      );
    }
  }

  for (const [i, slab] of slabs.entries()) {
    const containingId = findContainerOf(slab.localId, relationships);
    const storeyPlacementId =
      containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    const { localPlacementId, productDefinitionShapeId } = writeSlabGeometry(
      w,
      slab.spec,
      geomSubContextId,
      storeyPlacementId
    );
    const slabExpressId = writeSlabEntity(
      w,
      slab.guid,
      `Slab ${i + 1}`,
      slab.spec.predefinedType,
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(slab.localId, slabExpressId);
    placementMap.set(slab.localId, localPlacementId);
    writeSlabCommonPset(w, ownerHistoryId, slabExpressId, slab.spec);
    writeManufacturerPset(w, ownerHistoryId, slabExpressId, slab.spec);
    if (slab.spec.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, slabExpressId, slab.spec.customProperties);
    }
    writeSlabBaseQuantities(
      w,
      ownerHistoryId,
      slabExpressId,
      slab.spec,
      openingsBySlab.get(slab.localId) ?? [],
      densityByElement.get(slab.localId)
    );
  }

  for (const [i, beam] of beams.entries()) {
    const containingId = findContainerOf(beam.localId, relationships);
    const storeyPlacementId =
      containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    const { localPlacementId, productDefinitionShapeId } = writeBeamGeometry(
      w,
      beam.spec,
      geomSubContextId,
      storeyPlacementId
    );
    const beamExpressId = writeBeamEntity(
      w,
      beam.guid,
      `Beam ${i + 1}`,
      beam.spec.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
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
    const storeyPlacementId =
      containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    const { localPlacementId, productDefinitionShapeId } = writeColumnGeometry(
      w,
      column.spec,
      geomSubContextId,
      storeyPlacementId
    );
    const columnExpressId = writeColumnEntity(
      w,
      column.guid,
      `Column ${i + 1}`,
      column.spec.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
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

  for (const [i, proxy] of proxies.entries()) {
    const containingId = findContainerOf(proxy.localId, relationships);
    const storeyPlacementId =
      containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    const { localPlacementId, productDefinitionShapeId } = writeProxyGeometry(
      w,
      proxy.spec,
      geomSubContextId,
      storeyPlacementId
    );
    const proxyExpressId = writeProxyEntity(
      w,
      proxy.guid,
      proxy.spec.name || `Proxy ${i + 1}`,
      proxy.spec.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(proxy.localId, proxyExpressId);
    placementMap.set(proxy.localId, localPlacementId);
    if (proxy.spec.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, proxyExpressId, proxy.spec.customProperties);
    }
  }

  for (const fill of earthworksFills) {
    const containingId = findContainerOf(fill.localId, relationships);
    const parentPlacementId =
      containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    const { localPlacementId, productDefinitionShapeId } = writeTessellatedProductGeometry(
      w,
      fill.geometry,
      geomSubContextId,
      parentPlacementId
    );
    const expressId = writeEarthworksFillEntity(
      w,
      fill.guid,
      fill.spec,
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(fill.localId, expressId);
    placementMap.set(fill.localId, localPlacementId);
    if (fill.spec.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, expressId, fill.spec.customProperties);
    }
  }

  for (const [i, space] of spaces.entries()) {
    const containingId = findContainerOf(space.localId, relationships);
    const storeyPlacementId =
      containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    const { localPlacementId, productDefinitionShapeId } = writeSpaceGeometry(
      w,
      space.spec,
      geomSubContextId,
      storeyPlacementId
    );
    const spaceExpressId = writeSpaceEntity(
      w,
      space.guid,
      space.spec.name || `Space ${i + 1}`,
      space.spec.longName ?? null,
      space.spec.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(space.localId, spaceExpressId);
    placementMap.set(space.localId, localPlacementId);
    writeSpaceCommonPset(w, ownerHistoryId, spaceExpressId, space.spec);
    if (space.spec.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, spaceExpressId, space.spec.customProperties);
    }
    writeSpaceBaseQuantities(w, ownerHistoryId, spaceExpressId, space.spec);
  }

  for (const [i, roof] of roofs.entries()) {
    const containingId = findContainerOf(roof.localId, relationships);
    const storeyPlacementId =
      containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    const { localPlacementId, productDefinitionShapeId, usedFallback } = writeRoofGeometry(
      w,
      roof.spec,
      roof.geometry,
      geomSubContextId,
      storeyPlacementId
    );
    if (usedFallback) {
      console.warn(`Roof ${i + 1} tessellation failed; IFC body is a degenerate fallback.`);
    }
    const roofExpressId = writeRoofEntity(
      w,
      roof.guid,
      `Roof ${i + 1}`,
      roof.spec.predefinedType,
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(roof.localId, roofExpressId);
    placementMap.set(roof.localId, localPlacementId);
    writeRoofCommonPset(w, ownerHistoryId, roofExpressId, roof.spec);
    writeManufacturerPset(w, ownerHistoryId, roofExpressId, roof.spec);
    if (roof.spec.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, roofExpressId, roof.spec.customProperties);
    }
    writeRoofBaseQuantities(w, ownerHistoryId, roofExpressId, roof.spec);
  }

  for (const [i, curtainWall] of curtainWalls.entries()) {
    const containingId = findContainerOf(curtainWall.localId, relationships);
    const storeyPlacementId =
      containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    // The writer also emits the wall's plates/members plus the IfcRelAggregates
    // decomposing them into the wall. Only the wall is tracked in idMap so the
    // spatial-containment relationship references the wall, not its parts.
    const { curtainWallId } = writeCurtainWall(
      w,
      curtainWall.spec,
      curtainWall.geometry,
      `elem:CURTAIN_WALL:${curtainWall.localId}`,
      `Curtain Wall ${i + 1}`,
      ownerHistoryId,
      geomSubContextId,
      storeyPlacementId
    );
    idMap.set(curtainWall.localId, curtainWallId);
    writeCurtainWallCommonPset(w, ownerHistoryId, curtainWallId, curtainWall.spec);
    if (curtainWall.spec.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, curtainWallId, curtainWall.spec.customProperties);
    }
  }

  for (const [i, footing] of footings.entries()) {
    const containingId = findContainerOf(footing.localId, relationships);
    const storeyPlacementId =
      containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    const { localPlacementId, productDefinitionShapeId } = writeFootingGeometry(
      w,
      footing.spec,
      geomSubContextId,
      storeyPlacementId
    );
    const footingExpressId = writeFootingEntity(
      w,
      footing.guid,
      `Footing ${i + 1}`,
      footing.spec.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(footing.localId, footingExpressId);
    placementMap.set(footing.localId, localPlacementId);
    writeFootingCommonPset(w, ownerHistoryId, footingExpressId, footing.spec);
    if (footing.spec.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, footingExpressId, footing.spec.customProperties);
    }
    writeFootingBaseQuantities(w, ownerHistoryId, footingExpressId, footing.spec);
  }

  for (const [i, pile] of piles.entries()) {
    const containingId = findContainerOf(pile.localId, relationships);
    const storeyPlacementId =
      containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    const { localPlacementId, productDefinitionShapeId } = writePileGeometry(
      w,
      pile.spec,
      geomSubContextId,
      storeyPlacementId
    );
    const pileExpressId = writePileEntity(
      w,
      pile.guid,
      `Pile ${i + 1}`,
      pile.spec.predefinedType ?? 'NOTDEFINED',
      pile.spec.constructionType ?? null,
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(pile.localId, pileExpressId);
    placementMap.set(pile.localId, localPlacementId);
    writePileCommonPset(w, ownerHistoryId, pileExpressId, pile.spec);
    if (pile.spec.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, pileExpressId, pile.spec.customProperties);
    }
    writePileBaseQuantities(w, ownerHistoryId, pileExpressId, pile.spec);
  }

  for (const [i, assembly] of assemblies.entries()) {
    const containingId = findContainerOf(assembly.localId, relationships);
    const storeyPlacementId =
      containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    const assemblyExpressId = writeElementAssemblyEntity(
      w,
      assembly.guid,
      assembly.spec.name ?? `Assembly ${i + 1}`,
      assembly.spec.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId,
      storeyPlacementId,
      null,
      assembly.spec.assemblyPlace ?? 'NOTDEFINED'
    );
    idMap.set(assembly.localId, assemblyExpressId);
  }

  for (const zone of zones) {
    const zoneExpressId = writeZoneEntity(
      w,
      zone.guid,
      zone.spec.name,
      zone.spec.longName ?? null,
      zone.spec.objectType ?? null,
      ownerHistoryId
    );
    idMap.set(zone.localId, zoneExpressId);
  }

  for (const system of systems) {
    const systemExpressId = writeSystemEntity(
      w,
      system.guid,
      system.spec.name,
      system.spec.longName ?? null,
      system.spec.objectType ?? null,
      ownerHistoryId
    );
    idMap.set(system.localId, systemExpressId);
  }

  for (const stair of stairs) {
    const containingId = findContainerOf(stair.localId, relationships);
    const storeyPlacementId =
      containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    const result = writeStairAssembly(
      w,
      stair.spec,
      `${stair.localId}`,
      stair.guid,
      ownerHistoryId,
      geomSubContextId,
      storeyPlacementId
    );
    if (!result.ok) return err(result.error);
    idMap.set(stair.localId, result.value.assemblyExpressId);
    writeStairCommonPset(w, ownerHistoryId, result.value.assemblyExpressId, stair.spec);
  }

  for (const ramp of ramps) {
    const containingId = findContainerOf(ramp.localId, relationships);
    const storeyPlacementId =
      containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    const result = writeRampAssembly(
      w,
      ramp.spec,
      `${ramp.localId}`,
      ramp.guid,
      ownerHistoryId,
      geomSubContextId,
      storeyPlacementId
    );
    if (!result.ok) return err(result.error);
    idMap.set(ramp.localId, result.value.assemblyExpressId);
    writeRampCommonPset(w, ownerHistoryId, result.value.assemblyExpressId, ramp.spec);
  }

  for (const [i, preflighted] of preflightedRailings.entries()) {
    const railing = preflighted.element;
    const containingId = findContainerOf(railing.localId, relationships);
    const storeyPlacementId =
      containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    let representation: RailingRepresentationIds;
    let exactBodyItemIds: readonly number[] = [];
    if (preflighted.kind === 'EXACT') {
      const exact = writeExactBodyGeometry(
        w,
        railing.spec,
        preflighted.items,
        geomSubContextId,
        storeyPlacementId
      );
      exactBodyItemIds = exact.bodyItemIds;
      representation = { ...exact, bodyItemId: null, usedFallback: false };
    } else {
      representation = writeRailingGeometry(
        w,
        railing.spec,
        preflighted.solid,
        geomSubContextId,
        storeyPlacementId
      );
    }
    const { localPlacementId, productDefinitionShapeId, bodyItemId, usedFallback } = representation;
    if (usedFallback) {
      console.warn(`Railing ${i + 1} tessellation failed; IFC body is a degenerate fallback.`);
    }
    const railingExpressId = writeRailingEntity(
      w,
      railing.guid,
      `Railing ${i + 1}`,
      railing.spec.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(railing.localId, railingExpressId);
    placementMap.set(railing.localId, localPlacementId);
    writeRailingCommonPset(w, ownerHistoryId, railingExpressId, railing.spec);
    writeManufacturerPset(w, ownerHistoryId, railingExpressId, railing.spec);
    if (railing.spec.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, railingExpressId, railing.spec.customProperties);
    }
    // POSTED railings tessellate and have no single styleable body item.
    if (preflighted.kind === 'EXACT') {
      for (const itemId of exactBodyItemIds) {
        applySurfaceStyle(w, model, railing.localId, itemId);
      }
    } else if (bodyItemId !== null) {
      applySurfaceStyle(w, model, railing.localId, bodyItemId);
    }
  }

  for (const [i, covering] of coverings.entries()) {
    const containingId = findContainerOf(covering.localId, relationships);
    const storeyPlacementId =
      containingId !== null ? (placementMap.get(containingId) ?? null) : null;
    const { localPlacementId, productDefinitionShapeId, bodyItemId } = writeCoveringGeometry(
      w,
      covering.spec,
      geomSubContextId,
      storeyPlacementId
    );
    const coveringExpressId = writeCoveringEntity(
      w,
      covering.guid,
      `Covering ${i + 1}`,
      covering.spec.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(covering.localId, coveringExpressId);
    placementMap.set(covering.localId, localPlacementId);
    writeCoveringCommonPset(w, ownerHistoryId, coveringExpressId, covering.spec);
    writeManufacturerPset(w, ownerHistoryId, coveringExpressId, covering.spec);
    if (covering.spec.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, coveringExpressId, covering.spec.customProperties);
    }
    applySurfaceStyle(w, model, covering.localId, bodyItemId);
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
      w,
      openingElement.guid,
      openingElement.spec,
      wallElement.spec,
      wallPlacementId,
      geomSubContextId,
      ownerHistoryId
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
      w,
      openingElement.guid,
      openingElement.spec,
      slabElement.spec,
      slabPlacementId,
      geomSubContextId,
      ownerHistoryId
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
    const doorExpressId = writeDoorEntity(
      w,
      door.guid,
      `Door ${i + 1}`,
      ownerHistoryId,
      openingPlacementId,
      geomSubContextId,
      toIfcLengthM(door.spec.width),
      toIfcLengthM(door.spec.height)
    );
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
    const windowExpressId = writeWindowEntity(
      w,
      win.guid,
      `Window ${i + 1}`,
      ownerHistoryId,
      openingPlacementId,
      geomSubContextId,
      toIfcLengthM(win.spec.width),
      toIfcLengthM(win.spec.height)
    );
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
      w,
      rel.guid,
      ownerHistoryId,
      structureExpressId,
      elementExpressIds
    );
  }

  for (const rel of relationships) {
    if (rel.kind !== 'SPACE_BOUNDARY') continue;
    const spaceExpressId = idMap.get(rel.spaceLocalId);
    const elementExpressId = idMap.get(rel.elementLocalId);
    if (spaceExpressId === undefined || elementExpressId === undefined) continue;
    writeRelSpaceBoundary(
      w,
      rel.guid,
      ownerHistoryId,
      spaceExpressId,
      elementExpressId,
      rel.connectionType
    );
  }

  for (const rel of relationships) {
    if (rel.kind !== 'NESTS') continue;
    const parentExpressId = idMap.get(rel.relatingObject);
    const childExpressIds = rel.relatedObjects
      .map((id) => idMap.get(id))
      .filter((id): id is number => id !== undefined);
    if (parentExpressId === undefined || childExpressIds.length === 0) continue;
    writeRelNests(w, rel.guid, ownerHistoryId, parentExpressId, childExpressIds);
  }

  for (const rel of relationships) {
    if (rel.kind !== 'COVERS_ELEMENT') continue;
    const hostExpressId = idMap.get(rel.hostLocalId);
    const coveringExpressId = idMap.get(rel.coveringLocalId);
    if (hostExpressId === undefined || coveringExpressId === undefined) continue;
    writeRelCoversBldgElements(w, rel.guid, ownerHistoryId, hostExpressId, [coveringExpressId]);
  }

  for (const rel of relationships) {
    if (rel.kind !== 'ASSIGNS_TO_GROUP') continue;
    const groupExpressId = idMap.get(rel.groupLocalId);
    const memberExpressIds = rel.memberLocalIds
      .map((id) => idMap.get(id))
      .filter((id): id is number => id !== undefined);
    if (groupExpressId === undefined || memberExpressIds.length === 0) continue;
    writeRelAssignsToGroup(w, rel.guid, ownerHistoryId, groupExpressId, memberExpressIds);
  }

  for (const rel of relationships) {
    if (rel.kind !== 'CONNECTS_ELEMENTS') continue;
    const relatingExpressId = idMap.get(rel.relatingElementLocalId);
    const relatedExpressId = idMap.get(rel.relatedElementLocalId);
    if (relatingExpressId === undefined || relatedExpressId === undefined) continue;
    writeRelConnectsElements(
      w,
      rel.guid,
      ownerHistoryId,
      relatingExpressId,
      relatedExpressId,
      rel.description ?? null
    );
  }

  for (const rel of relationships) {
    if (rel.kind !== 'CONNECTS_PATH_ELEMENTS') continue;
    const relatingExpressId = idMap.get(rel.relatingElementLocalId);
    const relatedExpressId = idMap.get(rel.relatedElementLocalId);
    if (relatingExpressId === undefined || relatedExpressId === undefined) continue;
    writeRelConnectsPathElements(
      w,
      rel.guid,
      ownerHistoryId,
      relatingExpressId,
      relatedExpressId,
      rel.relatingConnectionType,
      rel.relatedConnectionType,
      rel.description ?? null
    );
  }

  // Bare (single-name) material associations are deduplicated by material name so
  // every element sharing a material points at one IfcMaterial. Layered material
  // associations cannot be deduplicated by name (each carries its own layer
  // build-up) so each is written individually as an IfcMaterialLayerSet.
  const bySimpleMaterial = new Map<string, { guid: IfcGuid; ids: number[] }>();
  interface LayeredAssociation {
    readonly guid: IfcGuid;
    readonly layerSetName: string;
    readonly layers: readonly MaterialLayer[];
    readonly ids: number[];
    readonly direction: 'AXIS2' | 'AXIS3';
  }
  const layeredAssociations: LayeredAssociation[] = [];
  const categoryById = new Map<LocalId, string>(elements.map((e) => [e.localId, e.category]));

  for (const rel of relationships) {
    if (rel.kind !== 'ASSOCIATES_MATERIAL') continue;
    const objectExpressIds = rel.relatedObjects
      .map((id) => idMap.get(id))
      .filter((id): id is number => id !== undefined);
    if (objectExpressIds.length === 0) continue;

    if (rel.materialLayers !== undefined && rel.materialLayers.length > 0) {
      const firstObj = rel.relatedObjects[0];
      const hostCat = firstObj !== undefined ? categoryById.get(firstObj) : undefined;
      // Walls layer across their thickness (AXIS2); slabs/roofs/coverings layer
      // vertically (AXIS3). The wrong sense misrenders the build-up in viewers.
      const direction: 'AXIS2' | 'AXIS3' =
        hostCat === 'SLAB' || hostCat === 'ROOF' || hostCat === 'COVERING' ? 'AXIS3' : 'AXIS2';
      layeredAssociations.push({
        guid: rel.guid,
        layerSetName: rel.layerSetName ?? rel.materialName,
        layers: rel.materialLayers,
        ids: objectExpressIds,
        direction,
      });
      continue;
    }

    const existing = bySimpleMaterial.get(rel.materialName);
    if (existing !== undefined) {
      bySimpleMaterial.set(rel.materialName, {
        guid: existing.guid,
        ids: [...existing.ids, ...objectExpressIds],
      });
    } else {
      bySimpleMaterial.set(rel.materialName, { guid: rel.guid, ids: objectExpressIds });
    }
  }

  for (const [materialName, { guid, ids }] of bySimpleMaterial) {
    if (ids.length === 0) continue;
    writeMaterialSimple(w, guid, ownerHistoryId, materialName, ids);
  }
  for (const assoc of layeredAssociations) {
    writeMaterialLayerSet(
      w,
      assoc.guid,
      ownerHistoryId,
      { kind: 'LAYER_SET', layerSetName: assoc.layerSetName, layers: assoc.layers },
      assoc.ids,
      assoc.direction
    );
  }

  // Dedupe by system:code (not object identity) so two elements citing the same
  // classification share one IfcClassificationReference instead of producing two
  // entities with identical derived GlobalIds. Accumulate all referencing objects.
  const classByKey = new Map<string, { ref: ClassificationRef; ids: number[] }>();
  for (const rel of relationships) {
    if (rel.kind !== 'ASSOCIATES_CLASSIFICATION') continue;
    const objectExpressIds = rel.relatedObjects
      .map((id) => idMap.get(id))
      .filter((id): id is number => id !== undefined);
    if (objectExpressIds.length === 0) continue;
    const key = `${rel.ref.system}:${rel.ref.code}`;
    const entry = classByKey.get(key);
    if (entry === undefined) {
      classByKey.set(key, { ref: rel.ref, ids: [...objectExpressIds] });
    } else {
      entry.ids.push(...objectExpressIds);
    }
  }
  const byClassification = new Map<ClassificationRef, number[]>();
  for (const { ref, ids } of classByKey.values()) byClassification.set(ref, ids);
  if (byClassification.size > 0) {
    writeClassificationRefs(w, ownerHistoryId, byClassification);
  }

  writeTypeLayer(w, ownerHistoryId, model, idMap);

  return w.save();
}

interface TypeOccurrence {
  readonly localId: LocalId;
  readonly predefinedType: string;
}

/**
 * Auto-derives one IfcType per (category, predefinedType) group of occurrences
 * and one IfcRelDefinesByType linking the type to its occurrences. Type/rel
 * GUIDs are deterministic, keyed on the group, so re-serializing an identical
 * model yields identical type GlobalIds.
 */
function writeTypeLayer(
  w: IfcWriter,
  ownerHistoryId: number,
  model: BimModel,
  idMap: ReadonlyMap<LocalId, number>
): void {
  const groups: ReadonlyArray<readonly [IfcTypeName, string, readonly TypeOccurrence[]]> = [
    ['IFCWALLTYPE', 'WALL', toOccurrences(model.getWalls(), () => 'NOTDEFINED')],
    ['IFCSLABTYPE', 'SLAB', toOccurrences(model.getSlabs(), (s) => s.predefinedType)],
    ['IFCBEAMTYPE', 'BEAM', toOccurrences(model.getBeams(), (s) => s.predefinedType)],
    ['IFCCOLUMNTYPE', 'COLUMN', toOccurrences(model.getColumns(), (s) => s.predefinedType)],
    ['IFCDOORTYPE', 'DOOR', toOccurrences(model.getDoors(), () => 'NOTDEFINED')],
    ['IFCWINDOWTYPE', 'WINDOW', toOccurrences(model.getWindows(), () => 'NOTDEFINED')],
    ['IFCSPACETYPE', 'SPACE', toOccurrences(model.getSpaces(), (s) => s.predefinedType)],
    ['IFCFOOTINGTYPE', 'FOOTING', toOccurrences(model.getFootings(), (s) => s.predefinedType)],
    ['IFCPILETYPE', 'PILE', toOccurrences(model.getPiles(), (s) => s.predefinedType)],
    ['IFCRAILINGTYPE', 'RAILING', toOccurrences(model.getRailings(), (s) => s.predefinedType)],
    ['IFCCOVERINGTYPE', 'COVERING', toOccurrences(model.getCoverings(), (s) => s.predefinedType)],
  ];

  // Model-scope (project GlobalId) mixed into type/rel GUID keys so type objects
  // from distinct models do not collide — mirrors element/rel GUID scoping.
  const scope = model.getProject()?.guid ?? '';

  for (const [typeName, category, occurrences] of groups) {
    // Bucket occurrences by predefinedType so each distinct type gets one IfcType.
    const byPredefined = new Map<string, number[]>();
    for (const occ of occurrences) {
      const expressId = idMap.get(occ.localId);
      if (expressId === undefined) continue;
      const list = byPredefined.get(occ.predefinedType) ?? [];
      list.push(expressId);
      byPredefined.set(occ.predefinedType, list);
    }
    for (const [pred, expressIds] of byPredefined) {
      if (expressIds.length === 0) continue;
      const typeGuid = deriveIfcGuidSync(`type:${scope}:${category}:${pred}`);
      const relGuid = deriveIfcGuidSync(`rel-type:${scope}:${category}:${pred}`);
      writeIfcType(w, ownerHistoryId, typeName, typeGuid, relGuid, pred, expressIds);
    }
  }

  // Roof uses its own self-contained IfcRoofType writer (which carries the
  // IfcRoofTypeEnum predefined-type), grouped by predefinedType like the others.
  const roofByPredefined = new Map<RoofPredefinedType, number[]>();
  for (const roof of model.getRoofs()) {
    const expressId = idMap.get(roof.localId);
    if (expressId === undefined) continue;
    const pred = roof.spec.predefinedType;
    const list = roofByPredefined.get(pred) ?? [];
    list.push(expressId);
    roofByPredefined.set(pred, list);
  }
  for (const [pred, expressIds] of roofByPredefined) {
    if (expressIds.length === 0) continue;
    const typeGuid = deriveIfcGuidSync(`type:${scope}:ROOF:${pred}`);
    const relGuid = deriveIfcGuidSync(`rel-type:${scope}:ROOF:${pred}`);
    writeRoofType(w, ownerHistoryId, typeGuid, relGuid, pred, expressIds);
  }
}

function toOccurrences<S>(
  elements: ReadonlyArray<{ localId: LocalId; spec: S }>,
  predefined: (spec: S) => string | undefined
): TypeOccurrence[] {
  return elements.map((el) => {
    const pred = predefined(el.spec);
    return {
      localId: el.localId,
      predefinedType: pred !== undefined && pred.length > 0 ? pred : 'NOTDEFINED',
    };
  });
}

export interface ValidatedIfcResult {
  readonly bytes: Uint8Array;
  readonly report: ValidationReport;
}

/**
 * Serializes the model to IFC and runs the full validation suite: a
 * pre-serialization referential-integrity gate, then the post-save EXPRESS/STEP
 * schema gate and the write→read→re-write round-trip check. Returns both the
 * bytes and a combined report. A model that fails the integrity gate returns an
 * INTEGRITY_FAILURE BimError without serializing (unlike plain {@link toIfc},
 * which serializes unconditionally).
 */
export async function toIfcValidated(
  model: BimModel,
  meta: BimModelMeta
): Promise<Result<ValidatedIfcResult, BimError>> {
  const integrity = checkReferentialIntegrity(model);
  if (hasErrors(integrity)) {
    return err(
      ifcError(
        'INTEGRITY_FAILURE',
        'Model failed referential integrity check',
        integrity.issues.filter((i) => i.severity === 'error')
      )
    );
  }

  const bytesResult = await toIfc(model, meta);
  if (!bytesResult.ok) return bytesResult;
  const bytes = bytesResult.value;

  const geometry = collectGeometryIssues(model);
  const schema = await checkSchema(bytes);
  const roundTrip = await checkRoundTrip(bytes);
  const gherkin = await checkGherkinRules(bytes);

  // Integrity warnings (e.g. orphaned openings) are carried through alongside the
  // geometry-validity and post-save diagnostics; integrity errors already
  // short-circuited above.
  const report: ValidationReport = {
    issues: [
      ...integrity.issues,
      ...geometry.issues,
      ...schema.issues,
      ...roundTrip.issues,
      ...gherkin,
    ],
  };
  return ok({ bytes, report });
}

/**
 * Runs the GEOMETRY-VALIDITY gate over every solid-bearing element (walls,
 * slabs, beams, columns, proxies) and merges the per-element reports. Used by
 * {@link toIfcValidated}; plain {@link toIfc} stays permissive and never runs it.
 */
function collectGeometryIssues(model: BimModel): ValidationReport {
  const issues: ValidationIssue[] = [];
  const groups: ReadonlyArray<readonly [string, ReadonlyArray<{ geometry: ValidSolid }>]> = [
    ['Slab', model.getSlabs()],
    ['Beam', model.getBeams()],
    ['Column', model.getColumns()],
    ['Proxy', model.getProxies()],
    ['Earthworks Fill', model.getEarthworksFills()],
    ['Space', model.getSpaces()],
    ['Roof', model.getRoofs()],
    ['Footing', model.getFootings()],
    ['Pile', model.getPiles()],
    ['Covering', model.getCoverings()],
  ];
  for (const [label, elements] of groups) {
    elements.forEach((el, index) => {
      const report = checkGeometryValidity(el.geometry, `${label} ${index + 1}`);
      issues.push(...report.issues);
    });
  }

  const productGroups = [
    ['Wall', model.getWalls()],
    ['Railing', model.getRailings()],
  ] as const;
  for (const [label, elements] of productGroups) {
    elements.forEach((el, index) => {
      bodySolids(el.geometry).forEach((solid, itemIndex) => {
        const report = checkGeometryValidity(
          solid,
          `${label} ${index + 1} Body item ${itemIndex + 1}`
        );
        issues.push(...report.issues);
      });
    });
  }

  // Ramp flights are emitted as simplified-but-valid inclined-slab solids; surface
  // this as an info-level note (does not block export). Stair flights are real
  // stepped solids and are not flagged here.
  model.getRamps().forEach((ramp, index) => {
    if (ramp.spec.flights.length === 0) return;
    issues.push(
      issue(
        'info',
        'SIMPLIFIED_GEOMETRY',
        `Ramp ${index + 1} uses simplified inclined-slab flight geometry`
      )
    );
  });

  // Curtain wall geometry is a grid of component solids (panels + mullions);
  // validate each component individually.
  model.getCurtainWalls().forEach((cw, index) => {
    const components = [...cw.geometry.panels, ...cw.geometry.mullions];
    components.forEach((component, ci) => {
      const report = checkGeometryValidity(
        component.solid,
        `CurtainWall ${index + 1} component ${ci + 1}`
      );
      issues.push(...report.issues);
    });
  });

  return { issues };
}

/**
 * Resolves an analytic bulk density (kg/m³) per element from its material
 * association: a layered material uses the first layer that yields a density
 * (explicit `densityKgM3`, else a nominal lookup by layer name); a bare material
 * uses an explicit value if any, else a nominal lookup by material name. Elements
 * whose material has no resolvable density are absent from the map and emit no
 * weight quantity.
 */
function buildDensityMap(relationships: readonly BimRelationship[]): ReadonlyMap<LocalId, number> {
  const map = new Map<LocalId, number>();
  for (const rel of relationships) {
    if (rel.kind !== 'ASSOCIATES_MATERIAL') continue;
    let density: number | undefined;
    if (rel.materialLayers !== undefined && rel.materialLayers.length > 0) {
      for (const layer of rel.materialLayers) {
        density = resolveDensityKgM3(layer.name, layer.densityKgM3);
        if (density !== undefined) break;
      }
    } else {
      density = resolveDensityKgM3(rel.materialName, undefined);
    }
    if (density === undefined) continue;
    for (const objectId of rel.relatedObjects) {
      map.set(objectId, density);
    }
  }
  return map;
}

function findParentOf(childId: LocalId, relationships: readonly BimRelationship[]): LocalId | null {
  for (const rel of relationships) {
    if (rel.kind === 'AGGREGATES' && rel.relatedObjects.includes(childId)) {
      return rel.relatingObject;
    }
  }
  return null;
}

/**
 * Emits an IfcSurfaceStyle + IfcStyledItem for an element when the model has a
 * surface style assigned to it, linking the style to the element's body
 * representation item. No-op when no style is set.
 */
function applySurfaceStyle(
  w: IfcWriter,
  model: BimModel,
  elementLocalId: LocalId,
  bodyItemId: number
): void {
  const style = model.getSurfaceStyle(elementLocalId);
  if (style === null) return;
  const styleId = writeSurfaceStyle(w, style);
  writeStyledItem(w, bodyItemId, styleId);
}

function findContainerOf(
  elementId: LocalId,
  relationships: readonly BimRelationship[]
): LocalId | null {
  for (const rel of relationships) {
    if (rel.kind === 'CONTAINED_IN' && rel.relatedElements.includes(elementId)) {
      return rel.relatingStructure;
    }
  }
  return null;
}
