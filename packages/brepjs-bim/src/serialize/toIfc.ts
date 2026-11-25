import { placementSchedule, writeDocumentPlacements } from './documentPlacements.js';
import type { BimDocument } from '../model/bimDocument.js';
import type { BimModelMeta } from '../ifc-writer/headerWriter.js';
import { IfcWriter } from '../ifc-writer/ifcWriter.js';
import {
  writeHeader,
  writeGeometricSubContext,
  writeMapConversion,
} from '../ifc-writer/headerWriter.js';
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
import {
  writeCurtainWall,
  writePlate,
  writeMember,
  writeComponentGeometry,
} from '../ifc-writer/curtainWallWriter.js';
import {
  writeFootingGeometry,
  writePileGeometry,
  writeFootingEntity,
  writePileEntity,
} from '../ifc-writer/foundationWriter.js';
import { writeStairAssembly, writeRampAssembly } from '../ifc-writer/stairWriter.js';
import { writeRailingEntity } from '../ifc-writer/railingWriter.js';
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
  writeWallBodyQuantities,
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
  writePanelBody,
  writeWindowEntity,
  writeRelVoidsElement,
  writeRelFillsElement,
  writeDoorCommonPset,
  writeWindowCommonPset,
} from '../ifc-writer/openingWriter.js';
import { writeProxyEntity } from '../ifc-writer/proxyWriter.js';
import { writeIfcType } from '../ifc-writer/typeWriter.js';
import type { IfcTypeName } from '../ifc-writer/typeWriter.js';
import { toIfcLengthM } from '../units/units.js';
import { checkGeometryValidity } from '../validation/geometryValidity.js';
import type { BimError } from '../errors/bimError.js';
import { ifcError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { err, ok } from 'brepjs';
import { ordinalOf, type RecordRef } from '../identity/recordRef.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import { deriveIfcGuidSync } from '../identity/guidDerivation.js';
import type {
  AnyBimElement,
  BimElement,
  WallOpeningSpec,
  SlabOpeningSpec,
} from '../types/bimTypes.js';
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
import { bodySolids, measureBodyMaterial } from '../types/body.js';
import type { NonEmpty } from '../types/body.js';
import { preflightBody } from './bodyPreflight.js';
import { deriveWallQuantities } from './wallQuantities.js';
import { writeBodyGeometry, type PreparedTessellation } from '../ifc-writer/tessellationWriter.js';

type BodyElement = Extract<AnyBimElement, { representation: 'BODY' }>;

interface PreflightedProductElement<E extends BodyElement> {
  readonly element: E;
  readonly items: NonEmpty<PreparedTessellation>;
}

function preflightBodies<E extends BodyElement>(
  elements: readonly E[]
): Result<readonly PreflightedProductElement<E>[], BimError> {
  const preflighted: PreflightedProductElement<E>[] = [];
  for (const element of elements) {
    const prepared = preflightBody({
      localId: element.localId,
      solids: bodySolids(element.geometry),
    });
    if (!prepared.ok) return err(prepared.error);
    preflighted.push({
      element,
      items: prepared.value,
    });
  }
  return ok(preflighted);
}

/** Use analytic parameters only while model ownership still binds them to this Body. */
function writeRetainedBody(
  writer: IfcWriter,
  element: BodyElement,
  contextId: number,
  placementId: number
) {
  const prepared = preflightBody({
    localId: element.localId,
    solids: element.geometry.solids,
  });
  if (!prepared.ok) return prepared;
  return ok(writeBodyGeometry(writer, prepared.value, contextId, placementId));
}

function writeMaterialQuantities(
  element: BodyElement,
  issues: ValidationIssue[],
  write: (netVolumeM3: number) => void
): void {
  const measured = measureBodyMaterial(element.geometry.solids);
  if (measured.ok) write(measured.value / 1_000_000_000);
  else
    issues.push(
      issue(
        'warning',
        'BODY_QUANTITY_OMITTED',
        'Could not measure the retained material',
        element.localId,
        { guid: element.guid, cause: measured.error }
      )
    );
}

export async function toIfc(
  model: BimDocument,
  meta: BimModelMeta
): Promise<Result<Uint8Array, BimError>> {
  const serialized = await serializeIfc(model, meta);
  return serialized.ok ? ok(serialized.value.bytes) : serialized;
}

interface SerializedIfc {
  readonly bytes: Uint8Array;
  readonly issues: readonly ValidationIssue[];
}

async function serializeIfc(
  model: BimDocument,
  meta: BimModelMeta
): Promise<Result<SerializedIfc, BimError>> {
  const revision = model.revision;
  const issues: ValidationIssue[] = [];
  const project = model.getProject();
  if (!project) {
    return err(ifcError('NO_PROJECT', 'BimDocument has no project — call model.init() first'));
  }
  const live = model.record(project.localId);
  if (!live.ok) return live;
  const elements = model.getAllElements();
  const relationships = model.getAllRelationships();
  if ((meta.ifcSchema ?? 'IFC4') !== 'IFC4X3') {
    const civil = elements.find(
      (el) =>
        el.category === 'BRIDGE' ||
        el.category === 'BRIDGE_PART' ||
        el.category === 'EARTHWORKS_FILL'
    );
    if (civil) {
      const edge = relationships.find(
        (edge) => edge.kind === 'CONTAINED_IN' && edge.relatingStructure === civil.localId
      );
      return err(
        ifcError(
          'IFC4X3_REQUIRED',
          'Bridge, Bridge Part, and Earthworks Fill entities require IFC4X3 serialization',
          undefined,
          {
            record: civil.localId,
            ...(edge?.kind === 'CONTAINED_IN'
              ? { container: edge.relatingStructure, children: edge.relatedElements }
              : {}),
          }
        )
      );
    }
  }
  const schedule = placementSchedule(elements);
  if (!schedule.ok) return schedule;
  if (relationships.some((edge) => edge.kind === 'VOIDS' && edge.hostCategory === 'ROOF'))
    return err(
      ifcError(
        'IFC_ROOF_OPENING_UNSUPPORTED',
        'Cannot encode the already-cut Roof void relationship'
      )
    );
  const unsupportedStandalone = elements.find(
    (element) =>
      element.category === 'SIGN' ||
      ((element.category === 'MEMBER' || element.category === 'PLATE') && element.spec === null)
  );
  if (unsupportedStandalone) {
    const dependent = schedule.value.find(
      (entry) => entry.parent === unsupportedStandalone.localId
    );
    if (dependent)
      return err(
        ifcError(
          'IFC_UNREPRESENTABLE_PLACEMENT_PARENT',
          'Authored placement parent has no supported IFC encoding',
          undefined,
          { record: dependent.record, parent: dependent.parent }
        )
      );
    return err(
      ifcError(
        'IFC_UNSUPPORTED_CLASSIFICATION',
        `Standalone ${unsupportedStandalone.category} export has no qualified IFC encoding`,
        undefined,
        { localId: unsupportedStandalone.localId, category: unsupportedStandalone.category }
      )
    );
  }

  const containment = checkReferentialIntegrity({ elements, relationships }).issues.filter(
    (issue) => issue.code === 'ELEMENT_NOT_CONTAINED' || issue.code === 'ELEMENT_DOUBLE_CONTAINED'
  );
  if (containment.length)
    return err(
      ifcError(
        'INTEGRITY_FAILURE',
        'IFC delivery requires exactly one spatial container for these elements',
        containment
      )
    );
  const authorName = [meta.author?.givenName, meta.author?.familyName]
    .filter((p): p is string => Boolean(p))
    .join(' ');
  const writerResult = await IfcWriter.create(meta.mvdViewDefinition, meta.ifcSchema, {
    author: authorName,
    organization: meta.organizationName,
  });
  if (!writerResult.ok) return writerResult;
  using w = writerResult.value;
  if (model.revision !== revision)
    return err(
      ifcError(
        'DOCUMENT_CHANGED_DURING_EXPORT',
        'Document changed during IFC writer initialization'
      )
    );
  // Scope writer-minted GUIDs (psets/quantities/rels) to this model.
  w.setModelScope(project.guid);

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

  const preflightedWallsResult = preflightBodies(walls);
  if (!preflightedWallsResult.ok) return err(preflightedWallsResult.error);
  const preflightedRailingsResult = preflightBodies(railings);
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

  const idMap = new Map<RecordRef, number>();
  const placementOf = writeDocumentPlacements(w, schedule.value);

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
    const placementId = placementOf(el.localId);
    const { entityId } = writeSite(w, el.guid, el.spec, ownerHistoryId, placementId);
    idMap.set(el.localId, entityId);
  }

  for (const bridge of bridges) {
    const placementId = placementOf(bridge.localId);
    const { entityId } = writeBridge(w, bridge.guid, bridge.spec, ownerHistoryId, placementId);
    idMap.set(bridge.localId, entityId);
  }

  for (const part of bridgeParts) {
    const placementId = placementOf(part.localId);
    const { entityId } = writeBridgePart(w, part.guid, part.spec, ownerHistoryId, placementId);
    idMap.set(part.localId, entityId);
  }

  for (const el of elements) {
    if (el.category !== 'BUILDING') continue;
    const placementId = placementOf(el.localId);
    const { entityId } = writeBuilding(w, el.guid, el.spec.name, ownerHistoryId, placementId);
    idMap.set(el.localId, entityId);
  }

  for (const el of elements) {
    if (el.category !== 'STOREY') continue;
    const placementId = placementOf(el.localId);
    const { entityId } = writeStorey(
      w,
      el.guid,
      el.spec.name,
      el.spec.elevation,
      ownerHistoryId,
      placementId
    );
    idMap.set(el.localId, entityId);
  }

  const openingsByWall = new Map<RecordRef, WallOpeningSpec[]>();
  for (const rel of relationships) {
    if (rel.kind !== 'VOIDS' || rel.hostCategory !== 'WALL') continue;
    const opening = elements.find((el) => el.localId === rel.openingLocalId);
    if (opening === undefined || opening.category !== 'OPENING')
      return err(
        ifcError('UNSUPPORTED_OPENING_DEFINITION', 'Void relationship requires an Opening')
      );
    if (!isWallOpening(opening.spec))
      return err(ifcError('UNSUPPORTED_OPENING_DEFINITION', 'Unsupported wall Opening'));
    const list = openingsByWall.get(rel.hostLocalId) ?? [];
    list.push(opening.spec);
    openingsByWall.set(rel.hostLocalId, list);
  }

  const openingsBySlab = new Map<RecordRef, SlabOpeningSpec[]>();
  for (const rel of relationships) {
    if (rel.kind !== 'VOIDS' || rel.hostCategory !== 'SLAB') continue;
    const opening = elements.find((el) => el.localId === rel.openingLocalId);
    if (opening === undefined || opening.category !== 'OPENING')
      return err(
        ifcError('UNSUPPORTED_OPENING_DEFINITION', 'Void relationship requires an Opening')
      );
    if (!isSlabOpening(opening.spec))
      return err(ifcError('UNSUPPORTED_OPENING_DEFINITION', 'Unsupported slab Opening'));
    const list = openingsBySlab.get(rel.hostLocalId) ?? [];
    list.push(opening.spec);
    openingsBySlab.set(rel.hostLocalId, list);
  }

  for (const [i, preflighted] of preflightedWalls.entries()) {
    const wall = preflighted.element;
    const productPlacement = placementOf(wall.localId);
    const bodyQuantities = deriveWallQuantities({
      spec: wall.spec,
      solids: bodySolids(wall.geometry),
    });

    const { localPlacementId, productDefinitionShapeId, bodyItemIds } = writeBodyGeometry(
      w,
      preflighted.items,
      geomSubContextId,
      productPlacement
    );
    const wallExpressId = writeWallEntity(
      w,
      wall.guid,
      `Wall ${i + 1}`,
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(wall.localId, wallExpressId);
    if (wall.spec !== null) writeWallCommonPset(w, ownerHistoryId, wallExpressId, wall.spec);
    if (wall.spec !== null) writeManufacturerPset(w, ownerHistoryId, wallExpressId, wall.spec);
    if (wall.spec?.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, wallExpressId, wall.spec.customProperties);
    }
    for (const itemId of bodyItemIds) applySurfaceStyle(w, model, wall.localId, itemId);
    if (!bodyQuantities.ok) {
      issues.push(
        issue(
          'warning',
          'WALL_QUANTITY_OMITTED',
          'Wall quantities omitted because occupied material volume could not be measured',
          wall.localId,
          { guid: wall.guid, cause: bodyQuantities.error }
        )
      );
    } else if (wall.spec !== null && model.isRecipeQuantityEligible(wall.localId)) {
      writeWallBaseQuantities(
        w,
        ownerHistoryId,
        wallExpressId,
        wall.spec,
        openingsByWall.get(wall.localId) ?? [],
        bodyQuantities.value.netVolumeM3,
        densityByElement.get(wall.localId)
      );
    } else {
      writeWallBodyQuantities(w, ownerHistoryId, wallExpressId, bodyQuantities.value);
    }
  }

  for (const [i, slab] of slabs.entries()) {
    const productPlacement = placementOf(slab.localId);
    const geometry =
      slab.spec !== null && model.isRecipeQuantityEligible(slab.localId)
        ? ok(writeSlabGeometry(w, slab.spec, geomSubContextId, productPlacement))
        : writeRetainedBody(w, slab, geomSubContextId, productPlacement);
    if (!geometry.ok) return geometry;
    const { localPlacementId, productDefinitionShapeId } = geometry.value;
    const slabExpressId = writeSlabEntity(
      w,
      slab.guid,
      `Slab ${i + 1}`,
      slab.spec?.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(slab.localId, slabExpressId);
    if (slab.spec !== null) writeSlabCommonPset(w, ownerHistoryId, slabExpressId, slab.spec);
    if (slab.spec !== null) writeManufacturerPset(w, ownerHistoryId, slabExpressId, slab.spec);
    if (slab.spec?.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, slabExpressId, slab.spec?.customProperties);
    }
    writeMaterialQuantities(slab, issues, (netM3) =>
      writeSlabBaseQuantities(
        w,
        ownerHistoryId,
        slabExpressId,
        model.isRecipeQuantityEligible(slab.localId) ? slab.spec : null,
        netM3,
        openingsBySlab.get(slab.localId) ?? [],
        densityByElement.get(slab.localId)
      )
    );
  }

  for (const [i, beam] of beams.entries()) {
    const productPlacement = placementOf(beam.localId);
    const geometry =
      beam.spec !== null && model.isRecipeQuantityEligible(beam.localId)
        ? ok(writeBeamGeometry(w, beam.spec, geomSubContextId, productPlacement))
        : writeRetainedBody(w, beam, geomSubContextId, productPlacement);
    if (!geometry.ok) return geometry;
    const { localPlacementId, productDefinitionShapeId } = geometry.value;
    const beamExpressId = writeBeamEntity(
      w,
      beam.guid,
      `Beam ${i + 1}`,
      beam.spec?.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(beam.localId, beamExpressId);
    if (beam.spec !== null) writeBeamCommonPset(w, ownerHistoryId, beamExpressId, beam.spec);
    if (beam.spec !== null) writeManufacturerPset(w, ownerHistoryId, beamExpressId, beam.spec);
    if (beam.spec?.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, beamExpressId, beam.spec?.customProperties);
    }
    writeMaterialQuantities(beam, issues, (netM3) =>
      writeBeamBaseQuantities(
        w,
        ownerHistoryId,
        beamExpressId,
        model.isRecipeQuantityEligible(beam.localId) ? beam.spec : null,
        netM3
      )
    );
  }

  for (const [i, column] of columns.entries()) {
    const productPlacement = placementOf(column.localId);
    const geometry =
      column.spec !== null && model.isRecipeQuantityEligible(column.localId)
        ? ok(writeColumnGeometry(w, column.spec, geomSubContextId, productPlacement))
        : writeRetainedBody(w, column, geomSubContextId, productPlacement);
    if (!geometry.ok) return geometry;
    const { localPlacementId, productDefinitionShapeId } = geometry.value;
    const columnExpressId = writeColumnEntity(
      w,
      column.guid,
      `Column ${i + 1}`,
      column.spec?.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(column.localId, columnExpressId);
    if (column.spec !== null)
      writeColumnCommonPset(w, ownerHistoryId, columnExpressId, column.spec);
    if (column.spec !== null)
      writeManufacturerPset(w, ownerHistoryId, columnExpressId, column.spec);
    if (column.spec?.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, columnExpressId, column.spec?.customProperties);
    }
    writeMaterialQuantities(column, issues, (netM3) =>
      writeColumnBaseQuantities(
        w,
        ownerHistoryId,
        columnExpressId,
        model.isRecipeQuantityEligible(column.localId) ? column.spec : null,
        netM3
      )
    );
  }

  for (const [i, proxy] of proxies.entries()) {
    const productPlacement = placementOf(proxy.localId);
    const geometry = writeRetainedBody(w, proxy, geomSubContextId, productPlacement);
    if (!geometry.ok) return geometry;
    const { localPlacementId, productDefinitionShapeId } = geometry.value;
    const proxyExpressId = writeProxyEntity(
      w,
      proxy.guid,
      proxy.spec?.name || `Proxy ${i + 1}`,
      proxy.spec?.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(proxy.localId, proxyExpressId);
    if (proxy.spec?.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, proxyExpressId, proxy.spec?.customProperties);
    }
  }

  for (const fill of earthworksFills) {
    const productPlacement = placementOf(fill.localId);
    const geometry = writeRetainedBody(w, fill, geomSubContextId, productPlacement);
    if (!geometry.ok) return geometry;
    const { localPlacementId, productDefinitionShapeId } = geometry.value;
    const expressId = writeEarthworksFillEntity(
      w,
      fill.guid,
      fill.spec ?? { name: 'Earthworks Fill' },
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(fill.localId, expressId);
    if (fill.spec?.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, expressId, fill.spec?.customProperties);
    }
  }

  for (const [i, space] of spaces.entries()) {
    const productPlacement = placementOf(space.localId);
    const geometry =
      space.spec !== null && model.isRecipeQuantityEligible(space.localId)
        ? ok(writeSpaceGeometry(w, space.spec, geomSubContextId, productPlacement))
        : writeRetainedBody(w, space, geomSubContextId, productPlacement);
    if (!geometry.ok) return geometry;
    const { localPlacementId, productDefinitionShapeId } = geometry.value;
    const spaceExpressId = writeSpaceEntity(
      w,
      space.guid,
      space.spec?.name || `Space ${i + 1}`,
      space.spec?.longName ?? null,
      space.spec?.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(space.localId, spaceExpressId);
    if (space.spec !== null) writeSpaceCommonPset(w, ownerHistoryId, spaceExpressId, space.spec);
    if (space.spec?.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, spaceExpressId, space.spec?.customProperties);
    }
    writeMaterialQuantities(space, issues, (netM3) =>
      writeSpaceBaseQuantities(
        w,
        ownerHistoryId,
        spaceExpressId,
        model.isRecipeQuantityEligible(space.localId) ? space.spec : null,
        netM3
      )
    );
  }

  for (const [i, roof] of roofs.entries()) {
    const productPlacement = placementOf(roof.localId);
    const geometry =
      roof.spec !== null &&
      model.isRecipeQuantityEligible(roof.localId) &&
      roof.spec?.pitch === undefined
        ? ok(
            writeRoofGeometry(
              w,
              roof.spec,
              roof.geometry.solids[0],
              geomSubContextId,
              productPlacement
            )
          )
        : writeRetainedBody(w, roof, geomSubContextId, productPlacement);
    if (!geometry.ok) return geometry;
    const { localPlacementId, productDefinitionShapeId } = geometry.value;
    const roofExpressId = writeRoofEntity(
      w,
      roof.guid,
      `Roof ${i + 1}`,
      roof.spec?.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(roof.localId, roofExpressId);
    if (roof.spec !== null) writeRoofCommonPset(w, ownerHistoryId, roofExpressId, roof.spec);
    if (roof.spec !== null) writeManufacturerPset(w, ownerHistoryId, roofExpressId, roof.spec);
    if (roof.spec?.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, roofExpressId, roof.spec?.customProperties);
    }
    if (roof.spec !== null && model.isRecipeQuantityEligible(roof.localId))
      writeRoofBaseQuantities(w, ownerHistoryId, roofExpressId, roof.spec);
  }

  for (const [i, curtainWall] of curtainWalls.entries()) {
    const productPlacement = placementOf(curtainWall.localId);
    if (!curtainWall.placement)
      return err(ifcError('MISSING_PLACEMENT', 'Curtain Wall requires placement'));
    const wallPlacement = productPlacement;
    const curtainWallId = writeCurtainWall(
      w,
      curtainWall.spec,
      curtainWall.guid,
      `Curtain Wall ${i + 1}`,
      ownerHistoryId,
      wallPlacement
    );
    idMap.set(curtainWall.localId, curtainWallId);
    writeCurtainWallCommonPset(w, ownerHistoryId, curtainWallId, curtainWall.spec);
    if (curtainWall.spec.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, curtainWallId, curtainWall.spec.customProperties);
    }
  }

  for (const child of elements) {
    if (child.category !== 'MEMBER' && child.category !== 'PLATE') continue;
    if (!child.spec)
      return err(
        ifcError('IFC_UNSUPPORTED_CLASSIFICATION', 'Unsupported standalone curtain component')
      );
    const childPlacement = placementOf(child.localId);
    const geometry = model.isRecipeQuantityEligible(child.localId)
      ? ok(writeComponentGeometry(w, child.spec.size, geomSubContextId, childPlacement))
      : writeRetainedBody(w, child, geomSubContextId, childPlacement);
    if (!geometry.ok) return geometry;
    const write = child.category === 'PLATE' ? writePlate : writeMember;
    const id = write(
      w,
      child.guid,
      child.spec.name,
      ownerHistoryId,
      geometry.value.localPlacementId,
      geometry.value.productDefinitionShapeId
    );
    idMap.set(child.localId, id);
  }

  for (const [i, footing] of footings.entries()) {
    const productPlacement = placementOf(footing.localId);
    const geometry =
      footing.spec !== null && model.isRecipeQuantityEligible(footing.localId)
        ? ok(writeFootingGeometry(w, footing.spec, geomSubContextId, productPlacement))
        : writeRetainedBody(w, footing, geomSubContextId, productPlacement);
    if (!geometry.ok) return geometry;
    const { localPlacementId, productDefinitionShapeId } = geometry.value;
    const footingExpressId = writeFootingEntity(
      w,
      footing.guid,
      `Footing ${i + 1}`,
      footing.spec?.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(footing.localId, footingExpressId);
    if (footing.spec !== null)
      writeFootingCommonPset(w, ownerHistoryId, footingExpressId, footing.spec);
    if (footing.spec?.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, footingExpressId, footing.spec?.customProperties);
    }
    writeMaterialQuantities(footing, issues, (netM3) =>
      writeFootingBaseQuantities(
        w,
        ownerHistoryId,
        footingExpressId,
        model.isRecipeQuantityEligible(footing.localId) ? footing.spec : null,
        netM3
      )
    );
  }

  for (const [i, pile] of piles.entries()) {
    const productPlacement = placementOf(pile.localId);
    const geometry =
      pile.spec !== null && model.isRecipeQuantityEligible(pile.localId)
        ? ok(writePileGeometry(w, pile.spec, geomSubContextId, productPlacement))
        : writeRetainedBody(w, pile, geomSubContextId, productPlacement);
    if (!geometry.ok) return geometry;
    const { localPlacementId, productDefinitionShapeId } = geometry.value;
    const pileExpressId = writePileEntity(
      w,
      pile.guid,
      `Pile ${i + 1}`,
      pile.spec?.predefinedType ?? 'NOTDEFINED',
      pile.spec?.constructionType ?? null,
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(pile.localId, pileExpressId);
    if (pile.spec !== null) writePileCommonPset(w, ownerHistoryId, pileExpressId, pile.spec);
    if (pile.spec?.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, pileExpressId, pile.spec?.customProperties);
    }
    writeMaterialQuantities(pile, issues, (netM3) =>
      writePileBaseQuantities(
        w,
        ownerHistoryId,
        pileExpressId,
        model.isRecipeQuantityEligible(pile.localId) ? pile.spec : null,
        netM3
      )
    );
  }

  for (const [i, assembly] of assemblies.entries()) {
    const productPlacement = placementOf(assembly.localId);
    const assemblyExpressId = writeElementAssemblyEntity(
      w,
      assembly.guid,
      assembly.spec.name ?? `Assembly ${i + 1}`,
      assembly.spec.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId,
      productPlacement,
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
    const productPlacement = placementOf(stair.localId);
    if (stair.spec === null)
      return err(
        ifcError(
          'FLIGHT_ASSOCIATION_REQUIRED',
          'Typed flight export requires the original generated flights'
        )
      );
    const result = writeStairAssembly(
      w,
      stair.spec,
      String(ordinalOf(stair.localId)),
      stair.geometry,
      stair.localId,
      stair.guid,
      ownerHistoryId,
      geomSubContextId,
      productPlacement
    );
    if (!result.ok) return err(result.error);
    idMap.set(stair.localId, result.value.assemblyExpressId);
    writeStairCommonPset(w, ownerHistoryId, result.value.assemblyExpressId, stair.spec);
  }

  for (const ramp of ramps) {
    const productPlacement = placementOf(ramp.localId);
    if (ramp.spec === null)
      return err(
        ifcError(
          'FLIGHT_ASSOCIATION_REQUIRED',
          'Typed flight export requires the original generated flights'
        )
      );
    const result = writeRampAssembly(
      w,
      ramp.spec,
      String(ordinalOf(ramp.localId)),
      ramp.geometry,
      ramp.localId,
      ramp.guid,
      ownerHistoryId,
      geomSubContextId,
      productPlacement
    );
    if (!result.ok) return err(result.error);
    idMap.set(ramp.localId, result.value.assemblyExpressId);
    writeRampCommonPset(w, ownerHistoryId, result.value.assemblyExpressId, ramp.spec);
  }

  for (const [i, preflighted] of preflightedRailings.entries()) {
    const railing = preflighted.element;
    const productPlacement = placementOf(railing.localId);
    const { localPlacementId, productDefinitionShapeId, bodyItemIds } = writeBodyGeometry(
      w,
      preflighted.items,
      geomSubContextId,
      productPlacement
    );
    const railingExpressId = writeRailingEntity(
      w,
      railing.guid,
      `Railing ${i + 1}`,
      railing.spec?.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(railing.localId, railingExpressId);
    if (railing.spec !== null)
      writeRailingCommonPset(w, ownerHistoryId, railingExpressId, railing.spec);
    if (railing.spec !== null)
      writeManufacturerPset(w, ownerHistoryId, railingExpressId, railing.spec);
    if (railing.spec?.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, railingExpressId, railing.spec.customProperties);
    }
    for (const itemId of bodyItemIds) applySurfaceStyle(w, model, railing.localId, itemId);
  }

  for (const [i, covering] of coverings.entries()) {
    const productPlacement = placementOf(covering.localId);
    const geometry =
      covering.spec !== null && model.isRecipeQuantityEligible(covering.localId)
        ? ok(writeCoveringGeometry(w, covering.spec, geomSubContextId, productPlacement))
        : writeRetainedBody(w, covering, geomSubContextId, productPlacement);
    if (!geometry.ok) return geometry;
    const { localPlacementId, productDefinitionShapeId } = geometry.value;
    const coveringExpressId = writeCoveringEntity(
      w,
      covering.guid,
      `Covering ${i + 1}`,
      covering.spec?.predefinedType ?? 'NOTDEFINED',
      ownerHistoryId,
      localPlacementId,
      productDefinitionShapeId
    );
    idMap.set(covering.localId, coveringExpressId);
    if (covering.spec !== null)
      writeCoveringCommonPset(w, ownerHistoryId, coveringExpressId, covering.spec);
    if (covering.spec !== null)
      writeManufacturerPset(w, ownerHistoryId, coveringExpressId, covering.spec);
    if (covering.spec?.customProperties !== undefined) {
      writeCustomPsets(w, ownerHistoryId, coveringExpressId, covering.spec?.customProperties);
    }
    const items =
      'bodyItemIds' in geometry.value ? geometry.value.bodyItemIds : [geometry.value.bodyItemId];
    for (const item of items) applySurfaceStyle(w, model, covering.localId, item);
  }

  let referenceContextId: number | undefined;

  for (const rel of relationships) {
    if (rel.kind !== 'VOIDS' || rel.hostCategory !== 'WALL') continue;
    const wallElement = elements.find(
      (el): el is BimElement<'WALL'> => el.category === 'WALL' && el.localId === rel.hostLocalId
    );
    if (wallElement === undefined) continue;
    const wallExpressId = idMap.get(rel.hostLocalId);
    if (wallExpressId === undefined)
      return err(ifcError('IFC_OPENING_HOST_UNSUPPORTED', 'Opening host was not emitted'));

    const openingElement = elements.find((el) => el.localId === rel.openingLocalId);
    if (openingElement === undefined || openingElement.category !== 'OPENING') continue;
    if (!isWallOpening(openingElement.spec)) continue;
    if (openingElement.placement?.kind !== 'LOCAL_FRAME')
      return err(
        ifcError('PLACEMENT_REFERENCE_UNRESOLVED', 'Opening export requires a local frame')
      );
    if (wallElement.spec === null)
      return err(
        ifcError(
          'OPENING_HOST_FACTS_MISSING',
          'Opening reference requires a supported host thickness'
        )
      );

    // The retained Wall Body already contains its apertures. IFC Reference
    // openings preserve the void/fill relationships without requesting a cut.
    referenceContextId ??= writeGeometricSubContext(w, geomContextId, 'Reference');
    const { openingEntityId } = writeOpeningGeometry(
      w,
      openingElement.guid,
      openingElement.spec,
      wallElement.spec,
      placementOf(rel.openingLocalId),
      referenceContextId,
      ownerHistoryId,
      'Reference'
    );
    idMap.set(rel.openingLocalId, openingEntityId);

    writeRelVoidsElement(w, rel.guid, ownerHistoryId, wallExpressId, openingEntityId);
  }

  for (const rel of relationships) {
    if (rel.kind !== 'VOIDS' || rel.hostCategory !== 'SLAB') continue;
    const slabElement = elements.find(
      (el): el is BimElement<'SLAB'> => el.category === 'SLAB' && el.localId === rel.hostLocalId
    );
    if (slabElement === undefined) continue;
    const slabExpressId = idMap.get(rel.hostLocalId);
    if (slabExpressId === undefined)
      return err(ifcError('IFC_OPENING_HOST_UNSUPPORTED', 'Opening host was not emitted'));

    const openingElement = elements.find((el) => el.localId === rel.openingLocalId);
    if (openingElement === undefined || openingElement.category !== 'OPENING') continue;
    if (!isSlabOpening(openingElement.spec)) continue;
    if (openingElement.placement?.kind !== 'LOCAL_FRAME')
      return err(
        ifcError('PLACEMENT_REFERENCE_UNRESOLVED', 'Opening export requires a local frame')
      );

    if (slabElement.spec === null)
      return err(
        ifcError('OPENING_HOST_RECIPE_REQUIRED', 'Slab opening requires retained thickness')
      );
    const alreadyCut = !model.isRecipeQuantityEligible(slabElement.localId);
    if (alreadyCut) referenceContextId ??= writeGeometricSubContext(w, geomContextId, 'Reference');
    const { openingEntityId } = writeSlabOpeningGeometry(
      w,
      openingElement.guid,
      openingElement.spec,
      slabElement.spec,
      placementOf(rel.openingLocalId),
      alreadyCut ? (referenceContextId ?? geomSubContextId) : geomSubContextId,
      ownerHistoryId,
      alreadyCut ? 'Reference' : 'Body'
    );
    idMap.set(rel.openingLocalId, openingEntityId);

    writeRelVoidsElement(w, rel.guid, ownerHistoryId, slabExpressId, openingEntityId);
  }

  for (const fillers of [doors, windows]) {
    for (const [index, filler] of fillers.entries()) {
      const fill = relationships.find(
        (rel) => rel.kind === 'FILLS_OPENING' && rel.fillerLocalId === filler.localId
      );
      const opening = fill?.kind === 'FILLS_OPENING' ? fill.openingLocalId : undefined;
      const placementId = placementOf(filler.localId);
      if (opening !== undefined && !idMap.has(opening))
        return err(
          ifcError('UNSUPPORTED_OPENING_DEFINITION', 'Missing exported Opening for filler')
        );
      const width = filler.spec ? toIfcLengthM(filler.spec.width) : null;
      const height = filler.spec ? toIfcLengthM(filler.spec.height) : null;
      const geometry =
        width !== null && height !== null && model.isRecipeQuantityEligible(filler.localId)
          ? ok({
              localPlacementId: placementId,
              productDefinitionShapeId: writePanelBody(
                w,
                width,
                height,
                toIfcLengthM(100),
                geomSubContextId
              ),
            })
          : writeRetainedBody(w, filler, geomSubContextId, placementId);
      if (!geometry.ok) return geometry;
      const writeEntity = filler.category === 'DOOR' ? writeDoorEntity : writeWindowEntity;
      const label = filler.category === 'DOOR' ? 'Door' : 'Window';
      const id = writeEntity(
        w,
        filler.guid,
        `${label} ${index + 1}`,
        ownerHistoryId,
        geometry.value.localPlacementId,
        geometry.value.productDefinitionShapeId,
        width,
        height
      );
      idMap.set(filler.localId, id);
      if (fill?.kind === 'FILLS_OPENING') {
        const openingEntityId = idMap.get(fill.openingLocalId);
        if (openingEntityId === undefined)
          return err(ifcError('OPENING_NOT_FOUND', 'Filler Opening missing'));
        writeRelFillsElement(w, fill.guid, ownerHistoryId, openingEntityId, id);
      }
      if (filler.spec)
        (filler.category === 'DOOR' ? writeDoorCommonPset : writeWindowCommonPset)(
          w,
          ownerHistoryId,
          id,
          filler.spec
        );
    }
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
    if (structureExpressId === undefined || elementExpressIds.length !== rel.relatedElements.length)
      return err(
        ifcError(
          'IFC_UNREPRESENTABLE_CONTAINER',
          'Cannot emit authored spatial containment',
          undefined,
          { relationship: rel.localId }
        )
      );
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
  const categoryById = new Map<RecordRef, string>(elements.map((e) => [e.localId, e.category]));

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

  for (const { record, parent } of schedule.value) {
    if (parent !== undefined && (!idMap.has(record) || !idMap.has(parent)))
      return err(
        ifcError(
          'IFC_UNREPRESENTABLE_PLACEMENT_PARENT',
          'Placement edge requires both products in the delivered IFC',
          undefined,
          { record, parent }
        )
      );
  }
  const saved = w.save();
  return saved.ok ? ok({ bytes: saved.value, issues }) : saved;
}

interface TypeOccurrence {
  readonly localId: RecordRef;
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
  model: BimDocument,
  idMap: ReadonlyMap<RecordRef, number>
): void {
  const groups: ReadonlyArray<readonly [IfcTypeName, string, readonly TypeOccurrence[]]> = [
    ['IFCWALLTYPE', 'WALL', toOccurrences(model.getWalls(), () => 'NOTDEFINED')],
    ['IFCSLABTYPE', 'SLAB', toOccurrences(model.getSlabs(), (s) => s?.predefinedType)],
    ['IFCBEAMTYPE', 'BEAM', toOccurrences(model.getBeams(), (s) => s?.predefinedType)],
    ['IFCCOLUMNTYPE', 'COLUMN', toOccurrences(model.getColumns(), (s) => s?.predefinedType)],
    ['IFCDOORTYPE', 'DOOR', toOccurrences(model.getDoors(), () => 'NOTDEFINED')],
    ['IFCWINDOWTYPE', 'WINDOW', toOccurrences(model.getWindows(), () => 'NOTDEFINED')],
    ['IFCSPACETYPE', 'SPACE', toOccurrences(model.getSpaces(), (s) => s?.predefinedType)],
    ['IFCFOOTINGTYPE', 'FOOTING', toOccurrences(model.getFootings(), (s) => s?.predefinedType)],
    ['IFCPILETYPE', 'PILE', toOccurrences(model.getPiles(), (s) => s?.predefinedType)],
    ['IFCRAILINGTYPE', 'RAILING', toOccurrences(model.getRailings(), (s) => s?.predefinedType)],
    ['IFCCOVERINGTYPE', 'COVERING', toOccurrences(model.getCoverings(), (s) => s?.predefinedType)],
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
    const pred = roof.spec?.predefinedType ?? 'NOTDEFINED';
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
  elements: ReadonlyArray<{ localId: RecordRef; spec: S }>,
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
 * INTEGRITY_FAILURE before serialization. Both paths preserve the authored
 * containment and placement edges.
 */
export async function toIfcValidated(
  model: BimDocument,
  meta: BimModelMeta
): Promise<Result<ValidatedIfcResult, BimError>> {
  const revision = model.revision;
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

  const serialized = await serializeIfc(model, meta);
  if (!serialized.ok) return serialized;
  if (model.revision !== revision)
    return err(
      ifcError('DOCUMENT_CHANGED_DURING_EXPORT', 'Document changed during IFC validation')
    );
  const { bytes } = serialized.value;

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
      ...serialized.value.issues,
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
function collectGeometryIssues(model: BimDocument): ValidationReport {
  const issues: ValidationIssue[] = [];
  for (const element of model.getAllElements()) {
    if (element.representation !== 'BODY') continue;
    bodySolids(element.geometry).forEach((solid, itemIndex) => {
      const report = checkGeometryValidity(
        solid,
        `${element.category} ${element.guid} Body item ${itemIndex + 1}`
      );
      issues.push(...report.issues);
    });
  }

  // Ramp flights are emitted as simplified-but-valid inclined-slab solids; surface
  // this as an info-level note (does not block export). Stair flights are real
  // stepped solids and are not flagged here.
  model.getRamps().forEach((ramp, index) => {
    if (!ramp.spec?.flights.length) return;
    issues.push(
      issue(
        'info',
        'SIMPLIFIED_GEOMETRY',
        `Ramp ${index + 1} uses simplified inclined-slab flight geometry`
      )
    );
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
function buildDensityMap(
  relationships: readonly BimRelationship[]
): ReadonlyMap<RecordRef, number> {
  const map = new Map<RecordRef, number>();
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

/**
 * Emits an IfcSurfaceStyle + IfcStyledItem for an element when the model has a
 * surface style assigned to it, linking the style to the element's body
 * representation item. No-op when no style is set.
 */
function applySurfaceStyle(
  w: IfcWriter,
  model: BimDocument,
  elementLocalId: RecordRef,
  bodyItemId: number
): void {
  const style = model.getSurfaceStyle(elementLocalId);
  if (style === null) return;
  const styleId = writeSurfaceStyle(w, style);
  writeStyledItem(w, bodyItemId, styleId);
}
