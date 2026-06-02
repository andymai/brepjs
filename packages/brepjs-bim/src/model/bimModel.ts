import type { Result, ValidSolid } from 'brepjs';
import { ok, err, cut } from 'brepjs';
import type { IfcGuid } from '../identity/ifcGuid.js';
import { deriveIfcGuidSync, makeElementKey, makeRelKey } from '../identity/guidDerivation.js';
import type { LocalId } from '../identity/localId.js';
import { makeLocalIdCounter } from '../identity/localId.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError } from '../errors/bimError.js';
import type { AnyBimElement, BimElement, WallOpeningSpec, SlabOpeningSpec } from '../types/bimTypes.js';
import type {
  BimRelationship,
  AggregatesRel,
  ContainedInRel,
  AssociatesMaterialRel,
  AssociatesClassificationRel,
  VoidsWallRel,
  VoidsSlabRel,
  FillsOpeningRel,
  SpaceBoundaryRel,
  NestsRel,
  ConnectsElementsRel,
  ConnectsPathElementsRel,
  CoversElementRel,
} from '../types/relationships.js';
import type { MaterialLayer } from '../types/materialTypes.js';
import type { ClassificationRef } from '../types/classificationTypes.js';
import type { WallSpec } from '../specs/wallSpec.js';
import type { SlabSpec } from '../specs/slabSpec.js';
import type { BeamSpec } from '../specs/beamSpec.js';
import type { ColumnSpec } from '../specs/columnSpec.js';
import type { DoorSpec, WindowSpec, SlabOpeningInput } from '../specs/openingSpec.js';
import type { ProxySpec } from '../specs/proxySpec.js';
import type { SpaceSpec } from '../specs/spaceSpec.js';
import type { RoofSpec } from '../specs/roofSpec.js';
import type { CurtainWallSpec } from '../specs/curtainWallSpec.js';
import type { FootingSpec, PileSpec } from '../specs/foundationSpec.js';
import type { StairSpec } from '../specs/stairSpec.js';
import type { RampSpec } from '../specs/rampSpec.js';
import type { RailingSpec } from '../specs/railingSpec.js';
import type { CoveringSpec } from '../specs/coveringSpec.js';
import type { ElementAssemblySpec } from '../specs/assemblySpec.js';
import type { SurfaceStyleSpec } from '../ifc-writer/styleWriter.js';
import type { ProjectSpec, SiteSpec, BuildingSpec, StoreySpec } from '../specs/spatialSpec.js';
import { wallToSolid } from '../elementFns/wallFns.js';
import { slabToSolid } from '../elementFns/slabFns.js';
import { beamToSolid } from '../elementFns/beamFns.js';
import { columnToSolid } from '../elementFns/columnFns.js';
import { openingToSolid } from '../elementFns/openingFns.js';
import { slabOpeningToSolid } from '../elementFns/slabOpeningFns.js';
import { spaceToSolid } from '../elementFns/spaceFns.js';
import { roofToSolid } from '../elementFns/roofFns.js';
import { curtainWallToGrid } from '../elementFns/curtainWallFns.js';
import { footingToSolid, pileToSolid } from '../elementFns/foundationFns.js';
import { railingToSolid } from '../elementFns/railingFns.js';
import { coveringToSolid } from '../elementFns/coveringFns.js';

export class BimModel {
  readonly #elements = new Map<LocalId, AnyBimElement>();
  readonly #relationships = new Map<LocalId, BimRelationship>();
  readonly #surfaceStyles = new Map<LocalId, SurfaceStyleSpec>();
  readonly #counter = makeLocalIdCounter();
  #projectId: LocalId | null = null;
  // Per-model scope mixed into every derived GlobalId so two distinct models do
  // not collide. Set from the project identity in init() before any element is
  // created; empty until init() runs.
  #modelScope = '';

  init(spec: ProjectSpec): Result<LocalId, BimError> {
    if (this.#projectId !== null) {
      return err(specError('DUPLICATE_PROJECT', 'BimModel.init() called twice — only one project per model'));
    }
    // Prefer an explicit, globally-unique projectId; otherwise fall back to the
    // project name+description (stable, but unique only per distinct name).
    this.#modelScope = spec.projectId ?? `${spec.name}::${spec.description ?? ''}`;
    const id = this.#makeElement('PROJECT', spec, null);
    this.#projectId = id;
    return ok(id);
  }

  [Symbol.dispose](): void {
    for (const el of this.#elements.values()) {
      if (
        el.category === 'WALL' ||
        el.category === 'SLAB' ||
        el.category === 'BEAM' ||
        el.category === 'COLUMN' ||
        el.category === 'PROXY' ||
        el.category === 'SPACE' ||
        el.category === 'ROOF' ||
        el.category === 'FOOTING' ||
        el.category === 'PILE' ||
        el.category === 'RAILING' ||
        el.category === 'COVERING'
      ) {
        el.geometry[Symbol.dispose]();
      } else if (el.category === 'CURTAIN_WALL') {
        // Curtain wall geometry is a grid of component solids (panels + mullions).
        for (const panel of el.geometry.panels) panel.solid[Symbol.dispose]();
        for (const mullion of el.geometry.mullions) mullion.solid[Symbol.dispose]();
      }
    }
  }

  addSite(spec: SiteSpec): LocalId {
    return this.#makeElement('SITE', spec, null);
  }

  addBuilding(spec: BuildingSpec): LocalId {
    return this.#makeElement('BUILDING', spec, null);
  }

  addStorey(spec: StoreySpec): LocalId {
    return this.#makeElement('STOREY', spec, null);
  }

  addWall(spec: WallSpec): Result<LocalId, BimError> {
    const geomResult = wallToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement('WALL', spec, geomResult.value);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  addSlab(spec: SlabSpec): Result<LocalId, BimError> {
    const geomResult = slabToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement('SLAB', spec, geomResult.value);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  addBeam(spec: BeamSpec): Result<LocalId, BimError> {
    const geomResult = beamToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement('BEAM', spec, geomResult.value);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  addColumn(spec: ColumnSpec): Result<LocalId, BimError> {
    const geomResult = columnToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement('COLUMN', spec, geomResult.value);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  addSpace(spec: SpaceSpec): Result<LocalId, BimError> {
    const geomResult = spaceToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement('SPACE', spec, geomResult.value);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  addRoof(spec: RoofSpec): Result<LocalId, BimError> {
    const geomResult = roofToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement('ROOF', spec, geomResult.value);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  addCurtainWall(spec: CurtainWallSpec): Result<LocalId, BimError> {
    const gridResult = curtainWallToGrid(spec);
    if (!gridResult.ok) return err(gridResult.error);
    const id = this.#makeElement('CURTAIN_WALL', spec, gridResult.value);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  addFooting(spec: FootingSpec): Result<LocalId, BimError> {
    const geomResult = footingToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement('FOOTING', spec, geomResult.value);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  addPile(spec: PileSpec): Result<LocalId, BimError> {
    const geomResult = pileToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement('PILE', spec, geomResult.value);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  /**
   * Adds an IfcStair assembly. Geometry for each flight is built and written by
   * the IFC layer from `spec.flights`; the STAIR element itself carries no solid
   * (the assembly container's Representation is null, valid per IFC4).
   */
  addStair(spec: StairSpec): Result<LocalId, BimError> {
    const id = this.#makeElement('STAIR', spec, null);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  /**
   * Adds an IfcRamp assembly. Geometry for each flight is built and written by the
   * IFC layer from `spec.flights`; the RAMP element carries no solid of its own.
   */
  addRamp(spec: RampSpec): Result<LocalId, BimError> {
    const id = this.#makeElement('RAMP', spec, null);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  addRailing(spec: RailingSpec): Result<LocalId, BimError> {
    const geomResult = railingToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement('RAILING', spec, geomResult.value);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  /**
   * Adds an IfcCovering. When `hostLocalId` is supplied, an
   * IfcRelCoversBldgElements linking the covering to its host (e.g. a slab it
   * finishes) is recorded for export.
   */
  addCovering(spec: CoveringSpec, hostLocalId?: LocalId): Result<LocalId, BimError> {
    const geomResult = coveringToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement('COVERING', spec, geomResult.value);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    if (hostLocalId !== undefined) {
      this.#makeRel<CoversElementRel>({
        kind: 'COVERS_ELEMENT',
        hostLocalId,
        coveringLocalId: id,
      });
    }
    return ok(id);
  }

  /**
   * Adds an IfcElementAssembly grouping container. The assembly has no geometry;
   * attach parts with {@link aggregate} (IfcRelAggregates) or {@link nest}
   * (IfcRelNests, order-preserving). Returns the assembly's localId.
   */
  addElementAssembly(spec: ElementAssemblySpec): LocalId {
    return this.#makeElement('ELEMENT_ASSEMBLY', spec, null);
  }

  /**
   * Records an order-preserving IfcRelNests decomposing `parentId` into
   * `childId`. Unlike {@link aggregate}, repeated calls extend the same nesting
   * relationship in call order.
   */
  nest(parentId: LocalId, childId: LocalId): void {
    let existingRel: NestsRel | undefined;
    for (const rel of this.#relationships.values()) {
      if (rel.kind === 'NESTS' && rel.relatingObject === parentId) {
        existingRel = rel;
        break;
      }
    }
    if (existingRel !== undefined) {
      const updated: NestsRel = {
        ...existingRel,
        relatedObjects: [...existingRel.relatedObjects, childId],
      };
      this.#relationships.set(existingRel.localId, updated);
    } else {
      this.#makeRel<NestsRel>({
        kind: 'NESTS',
        relatingObject: parentId,
        relatedObjects: [childId],
      });
    }
  }

  /**
   * Records an IfcRelConnectsElements logical connection between two elements.
   * Returns the relationship's localId.
   */
  connectElements(
    relatingElementLocalId: LocalId,
    relatedElementLocalId: LocalId,
    description?: string
  ): LocalId {
    return this.#makeRel<ConnectsElementsRel>({
      kind: 'CONNECTS_ELEMENTS',
      relatingElementLocalId,
      relatedElementLocalId,
      ...(description !== undefined ? { description } : {}),
    });
  }

  /**
   * Records an IfcRelConnectsPathElements connection between two path-based
   * elements at the given path ends. Returns the relationship's localId.
   */
  connectPathElements(
    relatingElementLocalId: LocalId,
    relatedElementLocalId: LocalId,
    relatingConnectionType: 'ATSTART' | 'ATEND' | 'ATPATH' | 'NOTDEFINED',
    relatedConnectionType: 'ATSTART' | 'ATEND' | 'ATPATH' | 'NOTDEFINED',
    description?: string
  ): LocalId {
    return this.#makeRel<ConnectsPathElementsRel>({
      kind: 'CONNECTS_PATH_ELEMENTS',
      relatingElementLocalId,
      relatedElementLocalId,
      relatingConnectionType,
      relatedConnectionType,
      ...(description !== undefined ? { description } : {}),
    });
  }

  /**
   * Assigns a surface style (colour + transparency) to an element. On export the
   * style is emitted as IfcSurfaceStyle and linked to the element's body geometry
   * via IfcStyledItem (currently honoured for railings and coverings, whose body
   * representation item is surfaced by their geometry writers).
   */
  setSurfaceStyle(elementLocalId: LocalId, style: SurfaceStyleSpec): void {
    this.#surfaceStyles.set(elementLocalId, style);
  }

  getSurfaceStyle(elementLocalId: LocalId): SurfaceStyleSpec | null {
    return this.#surfaceStyles.get(elementLocalId) ?? null;
  }

  /**
   * Records an IfcRelSpaceBoundary between a space and one of its bounding
   * building elements. Returns the relationship's localId.
   */
  addSpaceBoundary(
    spaceLocalId: LocalId,
    elementLocalId: LocalId,
    connectionType: 'PHYSICAL' | 'VIRTUAL' | 'NOTDEFINED' = 'PHYSICAL'
  ): LocalId {
    return this.#makeRel<SpaceBoundaryRel>({
      kind: 'SPACE_BOUNDARY',
      spaceLocalId,
      elementLocalId,
      connectionType,
    });
  }

  /**
   * Associates a classification reference with one or more elements, creating an
   * IfcRelAssociatesClassification on export. Returns the relationship's localId.
   */
  addClassification(ref: ClassificationRef, elementLocalIds: readonly LocalId[]): LocalId {
    return this.#makeRel<AssociatesClassificationRel>({
      kind: 'ASSOCIATES_CLASSIFICATION',
      ref,
      relatedObjects: [...elementLocalIds],
    });
  }

  #associateMaterial(
    id: LocalId,
    spec: {
      readonly materialName: string;
      readonly materialLayers?: readonly MaterialLayer[] | undefined;
      readonly layerSetName?: string | undefined;
    }
  ): void {
    const hasLayers = spec.materialLayers !== undefined && spec.materialLayers.length > 0;
    this.#makeRel<AssociatesMaterialRel>({
      kind: 'ASSOCIATES_MATERIAL',
      materialName: spec.materialName,
      relatedObjects: [id],
      ...(hasLayers
        ? {
            materialLayers: spec.materialLayers,
            layerSetName: spec.layerSetName ?? spec.materialName,
          }
        : {}),
    });
  }

  #associateClassification(
    id: LocalId,
    spec: { readonly classification?: ClassificationRef | undefined }
  ): void {
    if (spec.classification === undefined) return;
    this.#makeRel<AssociatesClassificationRel>({
      kind: 'ASSOCIATES_CLASSIFICATION',
      ref: spec.classification,
      relatedObjects: [id],
    });
  }

  /**
   * Adds an IfcBuildingElementProxy. The model TAKES OWNERSHIP of `spec.solid`
   * and disposes it on model disposal; the caller must not dispose it (see
   * {@link ProxySpec.solid}).
   */
  addProxy(spec: ProxySpec): Result<LocalId, BimError> {
    if (spec.solid === null || spec.solid === undefined) {
      return err(specError('PROXY_NO_GEOMETRY', 'ProxySpec.solid is required'));
    }
    const id = this.#makeElement('PROXY', spec, spec.solid);
    if (spec.materialName !== undefined) {
      this.#makeRel<AssociatesMaterialRel>({
        kind: 'ASSOCIATES_MATERIAL',
        materialName: spec.materialName,
        relatedObjects: [id],
      });
    }
    return ok(id);
  }

  addDoor(spec: DoorSpec): Result<LocalId, BimError> {
    const wall = this.#elements.get(spec.wallLocalId);
    if (wall === undefined || wall.category !== 'WALL') {
      return err(specError('DOOR_WALL_NOT_FOUND', `No wall found for localId ${spec.wallLocalId}`));
    }
    if (spec.offsetAlongWall + spec.width > wall.spec.length) {
      return err(specError('DOOR_EXCEEDS_WALL_BOUNDS', 'Door (offsetAlongWall + width) exceeds wall length'));
    }
    if (spec.offsetFromFloor + spec.height > wall.spec.height) {
      return err(specError('DOOR_EXCEEDS_WALL_BOUNDS', 'Door (offsetFromFloor + height) exceeds wall height'));
    }
    const openingSpec: WallOpeningSpec = {
      kind: 'WALL_OPENING',
      width: spec.width,
      height: spec.height,
      offsetAlongWall: spec.offsetAlongWall,
      offsetFromFloor: spec.offsetFromFloor,
    };

    const cutResult = this.#cutWallGeometry(wall, openingSpec);
    if (!cutResult.ok) return err(cutResult.error);
    this.#replaceWallGeometry(wall, cutResult.value);

    const openingId = this.#makeElement('OPENING', openingSpec, null);
    this.#makeRel<VoidsWallRel>({ kind: 'VOIDS_WALL', wallLocalId: spec.wallLocalId, openingLocalId: openingId });
    const doorId = this.#makeElement('DOOR', spec, null);
    this.#makeRel<FillsOpeningRel>({ kind: 'FILLS_OPENING', openingLocalId: openingId, fillerLocalId: doorId });
    this.#makeRel<AssociatesMaterialRel>({
      kind: 'ASSOCIATES_MATERIAL',
      materialName: spec.materialName,
      relatedObjects: [doorId],
    });
    return ok(doorId);
  }

  addWindow(spec: WindowSpec): Result<LocalId, BimError> {
    const wall = this.#elements.get(spec.wallLocalId);
    if (wall === undefined || wall.category !== 'WALL') {
      return err(specError('WINDOW_WALL_NOT_FOUND', `No wall found for localId ${spec.wallLocalId}`));
    }
    if (spec.offsetAlongWall + spec.width > wall.spec.length) {
      return err(specError('WINDOW_EXCEEDS_WALL_BOUNDS', 'Window (offsetAlongWall + width) exceeds wall length'));
    }
    if (spec.offsetFromFloor + spec.height > wall.spec.height) {
      return err(specError('WINDOW_EXCEEDS_WALL_BOUNDS', 'Window (offsetFromFloor + height) exceeds wall height'));
    }
    const openingSpec: WallOpeningSpec = {
      kind: 'WALL_OPENING',
      width: spec.width,
      height: spec.height,
      offsetAlongWall: spec.offsetAlongWall,
      offsetFromFloor: spec.offsetFromFloor,
    };

    const cutResult = this.#cutWallGeometry(wall, openingSpec);
    if (!cutResult.ok) return err(cutResult.error);
    this.#replaceWallGeometry(wall, cutResult.value);

    const openingId = this.#makeElement('OPENING', openingSpec, null);
    this.#makeRel<VoidsWallRel>({ kind: 'VOIDS_WALL', wallLocalId: spec.wallLocalId, openingLocalId: openingId });
    const windowId = this.#makeElement('WINDOW', spec, null);
    this.#makeRel<FillsOpeningRel>({ kind: 'FILLS_OPENING', openingLocalId: openingId, fillerLocalId: windowId });
    this.#makeRel<AssociatesMaterialRel>({
      kind: 'ASSOCIATES_MATERIAL',
      materialName: spec.materialName,
      relatedObjects: [windowId],
    });
    return ok(windowId);
  }

  addSlabOpening(input: SlabOpeningInput): Result<LocalId, BimError> {
    const slab = this.#elements.get(input.slabLocalId);
    if (slab === undefined || slab.category !== 'SLAB') {
      return err(specError('SLAB_OPENING_SLAB_NOT_FOUND', `No slab found for localId ${input.slabLocalId}`));
    }
    if (input.offsetX + input.sizeX > slab.spec.length) {
      return err(specError('SLAB_OPENING_EXCEEDS_SLAB_BOUNDS', 'Opening (offsetX + sizeX) exceeds slab length'));
    }
    if (input.offsetY + input.sizeY > slab.spec.width) {
      return err(specError('SLAB_OPENING_EXCEEDS_SLAB_BOUNDS', 'Opening (offsetY + sizeY) exceeds slab width'));
    }
    // Reject overlap with existing slab openings — overlapping rectangles would
    // double-subtract from NetArea/NetVolume in Qto_SlabBaseQuantities.
    const ax0 = input.offsetX;
    const ax1 = input.offsetX + input.sizeX;
    const ay0 = input.offsetY;
    const ay1 = input.offsetY + input.sizeY;
    for (const rel of this.#relationships.values()) {
      if (rel.kind !== 'VOIDS_SLAB' || rel.slabLocalId !== input.slabLocalId) continue;
      const other = this.#elements.get(rel.openingLocalId);
      if (other === undefined || other.category !== 'OPENING') continue;
      if (other.spec.kind !== 'SLAB_OPENING') continue;
      const bx0 = other.spec.offsetX;
      const bx1 = other.spec.offsetX + other.spec.sizeX;
      const by0 = other.spec.offsetY;
      const by1 = other.spec.offsetY + other.spec.sizeY;
      if (ax0 < bx1 && bx0 < ax1 && ay0 < by1 && by0 < ay1) {
        return err(specError('SLAB_OPENING_OVERLAP', 'Slab opening overlaps an existing opening on the same slab'));
      }
    }

    const openingSpec: SlabOpeningSpec = {
      kind: 'SLAB_OPENING',
      sizeX: input.sizeX,
      sizeY: input.sizeY,
      offsetX: input.offsetX,
      offsetY: input.offsetY,
    };

    const cutResult = this.#cutSlabGeometry(slab, openingSpec);
    if (!cutResult.ok) return err(cutResult.error);
    this.#replaceSlabGeometry(slab, cutResult.value);

    const openingId = this.#makeElement('OPENING', openingSpec, null);
    this.#makeRel<VoidsSlabRel>({ kind: 'VOIDS_SLAB', slabLocalId: input.slabLocalId, openingLocalId: openingId });
    return ok(openingId);
  }

  #cutWallGeometry(
    wall: BimElement<'WALL'>,
    openingSpec: WallOpeningSpec
  ): Result<ValidSolid, BimError> {
    const toolResult = openingToSolid(openingSpec, wall.spec.thickness);
    if (!toolResult.ok) return err(toolResult.error);
    using tool = toolResult.value;
    const cutResult = cut(wall.geometry, tool);
    if (!cutResult.ok) {
      return err(
        fromBrepError(cutResult.error, 'WALL_CUT_FAILED', 'Boolean cut of wall with opening failed')
      );
    }
    return ok(cutResult.value);
  }

  #replaceWallGeometry(wall: BimElement<'WALL'>, newGeometry: ValidSolid): void {
    const oldGeometry = wall.geometry;
    const replaced: BimElement<'WALL'> = { ...wall, geometry: newGeometry };
    this.#elements.set(wall.localId, replaced);
    oldGeometry[Symbol.dispose]();
  }

  #cutSlabGeometry(
    slab: BimElement<'SLAB'>,
    openingSpec: SlabOpeningSpec
  ): Result<ValidSolid, BimError> {
    const toolResult = slabOpeningToSolid(openingSpec, slab.spec.thickness);
    if (!toolResult.ok) return err(toolResult.error);
    using tool = toolResult.value;
    const cutResult = cut(slab.geometry, tool);
    if (!cutResult.ok) {
      return err(
        fromBrepError(cutResult.error, 'SLAB_CUT_FAILED', 'Boolean cut of slab with opening failed')
      );
    }
    return ok(cutResult.value);
  }

  #replaceSlabGeometry(slab: BimElement<'SLAB'>, newGeometry: ValidSolid): void {
    const oldGeometry = slab.geometry;
    const replaced: BimElement<'SLAB'> = { ...slab, geometry: newGeometry };
    this.#elements.set(slab.localId, replaced);
    oldGeometry[Symbol.dispose]();
  }

  getDoors(): BimElement<'DOOR'>[] {
    const doors: BimElement<'DOOR'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'DOOR') doors.push(el);
    }
    return doors;
  }

  getWindows(): BimElement<'WINDOW'>[] {
    const windows: BimElement<'WINDOW'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'WINDOW') windows.push(el);
    }
    return windows;
  }

  aggregate(parentId: LocalId, childId: LocalId): void {
    let existingRel: AggregatesRel | undefined;
    for (const rel of this.#relationships.values()) {
      if (rel.kind === 'AGGREGATES' && rel.relatingObject === parentId) {
        existingRel = rel;
        break;
      }
    }
    if (existingRel !== undefined) {
      const updated: AggregatesRel = {
        ...existingRel,
        relatedObjects: [...existingRel.relatedObjects, childId],
      };
      this.#relationships.set(existingRel.localId, updated);
    } else {
      this.#makeRel<AggregatesRel>({
        kind: 'AGGREGATES',
        relatingObject: parentId,
        relatedObjects: [childId],
      });
    }
  }

  placeIn(elementId: LocalId, containerId: LocalId): void {
    let existingRel: ContainedInRel | undefined;
    for (const rel of this.#relationships.values()) {
      if (rel.kind === 'CONTAINED_IN' && rel.relatingStructure === containerId) {
        existingRel = rel;
        break;
      }
    }
    if (existingRel !== undefined) {
      const updated: ContainedInRel = {
        ...existingRel,
        relatedElements: [...existingRel.relatedElements, elementId],
      };
      this.#relationships.set(existingRel.localId, updated);
    } else {
      this.#makeRel<ContainedInRel>({
        kind: 'CONTAINED_IN',
        relatingStructure: containerId,
        relatedElements: [elementId],
      });
    }
  }

  getProject(): BimElement<'PROJECT'> | null {
    if (this.#projectId === null) return null;
    const el = this.#elements.get(this.#projectId);
    return el?.category === 'PROJECT' ? el : null;
  }

  getElement(id: LocalId): AnyBimElement | null {
    return this.#elements.get(id) ?? null;
  }

  getWalls(): BimElement<'WALL'>[] {
    const walls: BimElement<'WALL'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'WALL') walls.push(el);
    }
    return walls;
  }

  getSlabs(): BimElement<'SLAB'>[] {
    const slabs: BimElement<'SLAB'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'SLAB') slabs.push(el);
    }
    return slabs;
  }

  getBeams(): BimElement<'BEAM'>[] {
    const beams: BimElement<'BEAM'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'BEAM') beams.push(el);
    }
    return beams;
  }

  getColumns(): BimElement<'COLUMN'>[] {
    const columns: BimElement<'COLUMN'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'COLUMN') columns.push(el);
    }
    return columns;
  }

  getProxies(): BimElement<'PROXY'>[] {
    const proxies: BimElement<'PROXY'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'PROXY') proxies.push(el);
    }
    return proxies;
  }

  getSpaces(): BimElement<'SPACE'>[] {
    const spaces: BimElement<'SPACE'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'SPACE') spaces.push(el);
    }
    return spaces;
  }

  getRoofs(): BimElement<'ROOF'>[] {
    const roofs: BimElement<'ROOF'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'ROOF') roofs.push(el);
    }
    return roofs;
  }

  getCurtainWalls(): BimElement<'CURTAIN_WALL'>[] {
    const curtainWalls: BimElement<'CURTAIN_WALL'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'CURTAIN_WALL') curtainWalls.push(el);
    }
    return curtainWalls;
  }

  getFootings(): BimElement<'FOOTING'>[] {
    const footings: BimElement<'FOOTING'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'FOOTING') footings.push(el);
    }
    return footings;
  }

  getPiles(): BimElement<'PILE'>[] {
    const piles: BimElement<'PILE'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'PILE') piles.push(el);
    }
    return piles;
  }

  getStairs(): BimElement<'STAIR'>[] {
    const stairs: BimElement<'STAIR'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'STAIR') stairs.push(el);
    }
    return stairs;
  }

  getRamps(): BimElement<'RAMP'>[] {
    const ramps: BimElement<'RAMP'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'RAMP') ramps.push(el);
    }
    return ramps;
  }

  getRailings(): BimElement<'RAILING'>[] {
    const railings: BimElement<'RAILING'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'RAILING') railings.push(el);
    }
    return railings;
  }

  getCoverings(): BimElement<'COVERING'>[] {
    const coverings: BimElement<'COVERING'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'COVERING') coverings.push(el);
    }
    return coverings;
  }

  getElementAssemblies(): BimElement<'ELEMENT_ASSEMBLY'>[] {
    const assemblies: BimElement<'ELEMENT_ASSEMBLY'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'ELEMENT_ASSEMBLY') assemblies.push(el);
    }
    return assemblies;
  }

  getAllElements(): AnyBimElement[] {
    return [...this.#elements.values()];
  }

  getAllRelationships(): BimRelationship[] {
    return [...this.#relationships.values()];
  }

  #makeElement<C extends AnyBimElement['category']>(
    category: C,
    spec: Extract<AnyBimElement, { category: C }>['spec'],
    geometry: Extract<AnyBimElement, { category: C }>['geometry']
  ): LocalId {
    const localId = this.#counter.next();
    // Deterministic GUID keyed on (category, localId) so re-serializing an
    // identical model yields byte-for-byte identical GlobalIds.
    const guid: IfcGuid = deriveIfcGuidSync(makeElementKey(this.#modelScope, category, localId));
    const el = { guid, localId, category, spec, geometry } as AnyBimElement;
    this.#elements.set(localId, el);
    return localId;
  }

  #makeRel<R extends BimRelationship>(
    fields: Omit<R, 'guid' | 'localId'>
  ): LocalId {
    const localId = this.#counter.next();
    // Deterministic GUID keyed on (kind, localId). localIds are assigned in a
    // fixed sequence, so an identical model produces identical relationship GUIDs.
    const guid: IfcGuid = deriveIfcGuidSync(makeRelKey(this.#modelScope, fields.kind, localId));
    const rel = { ...fields, guid, localId } as unknown as BimRelationship;
    this.#relationships.set(localId, rel);
    return localId;
  }
}
