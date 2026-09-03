import type { Result, ValidSolid } from 'brepjs';
import { ok, err, cut, isValidSolid } from 'brepjs';
import type { IfcGuid } from '../identity/ifcGuid.js';
import { deriveIfcGuidSync, makeElementKey, makeRelKey } from '../identity/guidDerivation.js';
import type { LocalId } from '../identity/localId.js';
import { makeLocalIdCounter } from '../identity/localId.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError } from '../errors/bimError.js';
import type {
  AnyBimElement,
  BimElement,
  WallOpeningSpec,
  SlabOpeningSpec,
} from '../types/bimTypes.js';
import type { BimTreeNode, BimTreeSummary } from './treeSummary.js';
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
  AssignsToGroupRel,
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
import type { ZoneSpec, SystemSpec } from '../specs/groupSpec.js';
import type { SurfaceStyleSpec } from '../ifc-writer/styleWriter.js';
import type { ProjectSpec, SiteSpec, BuildingSpec, StoreySpec } from '../specs/spatialSpec.js';
import type {
  BridgePartSpec,
  BridgeSpec,
  EarthworksFillSpec,
} from '../specs/infrastructureSpec.js';
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
import { disposeProductBody, type ProductBody } from '../types/productBody.js';

/** Optional identity override for created elements: a stable key (e.g. a
 *  families key path) that replaces the positional GlobalId derivation. */
export interface ElementIdentityOptions {
  readonly stableKey?: string | undefined;
}

/** Identity options for adders that create TWO elements: `stableKey` names
 *  the filler (door/window), `openingStableKey` the synthesized opening. */
export interface OpeningIdentityOptions extends ElementIdentityOptions {
  readonly openingStableKey?: string | undefined;
}

function exactWallBodyImmutable(): Result<never, BimError> {
  return err(
    specError(
      'EXACT_WALL_BODY_IMMUTABLE',
      'Cannot add an opening after a wall has taken an exact Product Body'
    )
  );
}

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
  readonly #usedStableKeys = new Set<string>();

  init(spec: ProjectSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    if (this.#projectId !== null) {
      return err(
        specError('DUPLICATE_PROJECT', 'BimModel.init() called twice — only one project per model')
      );
    }
    // Prefer an explicit, globally-unique projectId; otherwise fall back to the
    // project name+description (stable, but unique only per distinct name).
    this.#modelScope = spec.projectId ?? `${spec.name}::${spec.description ?? ''}`;
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    const id = this.#makeElement('PROJECT', spec, null, options?.stableKey);
    this.#projectId = id;
    return ok(id);
  }

  [Symbol.dispose](): void {
    for (const el of this.#elements.values()) {
      if (
        el.category === 'SLAB' ||
        el.category === 'BEAM' ||
        el.category === 'COLUMN' ||
        el.category === 'PROXY' ||
        el.category === 'EARTHWORKS_FILL' ||
        el.category === 'SPACE' ||
        el.category === 'ROOF' ||
        el.category === 'FOOTING' ||
        el.category === 'PILE' ||
        el.category === 'COVERING'
      ) {
        el.geometry[Symbol.dispose]();
      } else if (el.category === 'WALL' || el.category === 'RAILING') {
        disposeProductBody(el.geometry);
      } else if (el.category === 'CURTAIN_WALL') {
        // Curtain wall geometry is a grid of component solids (panels + mullions).
        for (const panel of el.geometry.panels) panel.solid[Symbol.dispose]();
        for (const mullion of el.geometry.mullions) mullion.solid[Symbol.dispose]();
      }
    }
  }

  addSite(spec: SiteSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    return ok(this.#makeElement('SITE', spec, null, options?.stableKey));
  }

  addBridge(spec: BridgeSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    return ok(this.#makeElement('BRIDGE', spec, null, options?.stableKey));
  }

  addBridgePart(spec: BridgePartSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    return ok(this.#makeElement('BRIDGE_PART', spec, null, options?.stableKey));
  }

  /** Adds a typed IfcEarthworksFill body. Ownership of `spec.solid` transfers
   * to the model only when this call succeeds. */
  addEarthworksFill(
    spec: EarthworksFillSpec,
    options?: ElementIdentityOptions
  ): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    if (spec.solid === null || spec.solid === undefined) {
      return err(specError('EARTHWORKS_FILL_NO_GEOMETRY', 'EarthworksFillSpec.solid is required'));
    }
    const id = this.#makeElement('EARTHWORKS_FILL', spec, spec.solid, options?.stableKey);
    this.#associateMaterial(id, spec);
    return ok(id);
  }

  addBuilding(spec: BuildingSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    return ok(this.#makeElement('BUILDING', spec, null, options?.stableKey));
  }

  addStorey(spec: StoreySpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    return ok(this.#makeElement('STOREY', spec, null, options?.stableKey));
  }

  /** Reject a duplicate stableKey BEFORE any geometry is built, so the
   *  Result-returning adders never allocate a solid they cannot store. */
  #checkStableKey(options: ElementIdentityOptions | undefined): Result<void, BimError> {
    const key = options?.stableKey;
    if (key !== undefined && this.#usedStableKeys.has(key)) {
      return err(specError('DUPLICATE_STABLE_KEY', `BimModel: duplicate stableKey '${key}'`));
    }
    return ok(undefined);
  }

  #checkOpeningKeys(options: OpeningIdentityOptions | undefined): Result<void, BimError> {
    const filler = this.#checkStableKey(options);
    if (!filler.ok) return filler;
    const opening = this.#checkStableKey({ stableKey: options?.openingStableKey });
    if (!opening.ok) return opening;
    if (options?.stableKey !== undefined && options.stableKey === options.openingStableKey) {
      return err(
        specError(
          'DUPLICATE_STABLE_KEY',
          `BimModel: stableKey and openingStableKey are both '${options.stableKey}'`
        )
      );
    }
    return ok(undefined);
  }

  addWall(spec: WallSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    const geomResult = wallToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement(
      'WALL',
      spec,
      { kind: 'PARAMETRIC', solid: geomResult.value },
      options?.stableKey
    );
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  addSlab(spec: SlabSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    const geomResult = slabToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement('SLAB', spec, geomResult.value, options?.stableKey);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  addBeam(spec: BeamSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    const geomResult = beamToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement('BEAM', spec, geomResult.value, options?.stableKey);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  addColumn(spec: ColumnSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    const geomResult = columnToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement('COLUMN', spec, geomResult.value, options?.stableKey);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  addSpace(spec: SpaceSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    const geomResult = spaceToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement('SPACE', spec, geomResult.value, options?.stableKey);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  addRoof(spec: RoofSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    const geomResult = roofToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement('ROOF', spec, geomResult.value, options?.stableKey);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  addCurtainWall(
    spec: CurtainWallSpec,
    options?: ElementIdentityOptions
  ): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    const gridResult = curtainWallToGrid(spec);
    if (!gridResult.ok) return err(gridResult.error);
    const id = this.#makeElement('CURTAIN_WALL', spec, gridResult.value, options?.stableKey);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  addFooting(spec: FootingSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    const geomResult = footingToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement('FOOTING', spec, geomResult.value, options?.stableKey);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  addPile(spec: PileSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    const geomResult = pileToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement('PILE', spec, geomResult.value, options?.stableKey);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  /**
   * Adds an IfcStair assembly. Geometry for each flight is built and written by
   * the IFC layer from `spec.flights`; the STAIR element itself carries no solid
   * (the assembly container's Representation is null, valid per IFC4).
   */
  addStair(spec: StairSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    const id = this.#makeElement('STAIR', spec, null, options?.stableKey);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  /**
   * Adds an IfcRamp assembly. Geometry for each flight is built and written by the
   * IFC layer from `spec.flights`; the RAMP element carries no solid of its own.
   */
  addRamp(spec: RampSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    const id = this.#makeElement('RAMP', spec, null, options?.stableKey);
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  addRailing(spec: RailingSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    const geomResult = railingToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement(
      'RAILING',
      spec,
      { kind: 'PARAMETRIC', solid: geomResult.value },
      options?.stableKey
    );
    this.#associateMaterial(id, spec);
    this.#associateClassification(id, spec);
    return ok(id);
  }

  /**
   * Atomically replaces a parametric wall or railing Body with authoritative,
   * caller-owned exact solids. Success transfers every supplied handle to this
   * model. Failure leaves both the model and all supplied handles unchanged.
   */
  takeExactProductBody(
    localId: LocalId,
    body: Extract<ProductBody, { readonly kind: 'EXACT' }>
  ): Result<void, BimError> {
    const target = this.#elements.get(localId);
    if (target === undefined) {
      return err(
        specError('EXACT_BODY_TARGET_NOT_FOUND', `No element found for localId ${localId}`)
      );
    }
    if (target.category !== 'WALL' && target.category !== 'RAILING') {
      return err(
        specError(
          'EXACT_BODY_UNSUPPORTED_CATEGORY',
          `Exact Product Bodies are supported only for walls and railings, not ${target.category}`
        )
      );
    }
    if (target.geometry.kind === 'EXACT') {
      return err(
        specError(
          'EXACT_BODY_ALREADY_EXACT',
          `Element ${localId} already has an exact Product Body`
        )
      );
    }

    const solids: readonly ValidSolid[] = body.solids;
    if (solids.length === 0) {
      return err(
        specError('EXACT_BODY_EMPTY', 'An exact Product Body must contain at least one solid')
      );
    }
    if (solids.includes(target.geometry.solid)) {
      return err(
        specError(
          'EXACT_BODY_SOLID_OWNERSHIP_CONFLICT',
          `Exact Product Body for ${localId} reuses the target parametric solid`
        )
      );
    }
    const identities = new Set<ValidSolid>();
    for (const [itemIndex, solid] of solids.entries()) {
      if (identities.has(solid)) {
        return err(
          specError(
            'EXACT_BODY_DUPLICATE_SOLID',
            `Exact Product Body item ${itemIndex} duplicates an earlier handle`
          )
        );
      }
      identities.add(solid);
      if (solid.disposed) {
        return err(
          specError(
            'EXACT_BODY_SOLID_DISPOSED',
            `Exact Product Body item ${itemIndex} is already disposed`
          )
        );
      }
      try {
        if (!isValidSolid(solid)) {
          return err(
            specError(
              'EXACT_BODY_SOLID_INVALID',
              `Exact Product Body item ${itemIndex} is not a valid solid`
            )
          );
        }
      } catch (cause) {
        return err(
          specError(
            'EXACT_BODY_SOLID_INVALID',
            `Exact Product Body item ${itemIndex} could not be validated`,
            cause
          )
        );
      }
    }

    const replaced = { ...target, geometry: body } as BimElement<'WALL'> | BimElement<'RAILING'>;
    this.#elements.set(localId, replaced);
    disposeProductBody(target.geometry);
    return ok(undefined);
  }

  /**
   * Adds an IfcCovering. When `hostLocalId` is supplied, an
   * IfcRelCoversBldgElements linking the covering to its host (e.g. a slab it
   * finishes) is recorded for export.
   */
  addCovering(
    spec: CoveringSpec,
    hostLocalId?: LocalId,
    options?: ElementIdentityOptions
  ): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    const geomResult = coveringToSolid(spec);
    if (!geomResult.ok) return err(geomResult.error);
    const id = this.#makeElement('COVERING', spec, geomResult.value, options?.stableKey);
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
  addElementAssembly(
    spec: ElementAssemblySpec,
    options?: ElementIdentityOptions
  ): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    return ok(this.#makeElement('ELEMENT_ASSEMBLY', spec, null, options?.stableKey));
  }

  /**
   * Adds an IfcZone grouping object (a thermal/fire/occupancy zone). The zone
   * carries no geometry; attach members (spaces or other elements) with
   * {@link assignToGroup}. Returns the zone's localId as a Result.
   */
  addZone(spec: ZoneSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    return ok(this.#makeElement('ZONE', spec, null, options?.stableKey));
  }

  /**
   * Adds an IfcSystem grouping object (an HVAC/electrical/plumbing system). The
   * system carries no geometry; attach members with {@link assignToGroup}.
   * Returns the system's localId as a Result.
   */
  addSystem(spec: SystemSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    return ok(this.#makeElement('SYSTEM', spec, null, options?.stableKey));
  }

  /**
   * Assigns members to a zone or system via IfcRelAssignsToGroup. Repeated calls
   * for the same group extend the single relationship in call order. Returns the
   * relationship's localId.
   */
  assignToGroup(groupId: LocalId, memberIds: readonly LocalId[]): LocalId {
    let existingRel: AssignsToGroupRel | undefined;
    for (const rel of this.#relationships.values()) {
      if (rel.kind === 'ASSIGNS_TO_GROUP' && rel.groupLocalId === groupId) {
        existingRel = rel;
        break;
      }
    }
    if (existingRel !== undefined) {
      const updated: AssignsToGroupRel = {
        ...existingRel,
        memberLocalIds: [...existingRel.memberLocalIds, ...memberIds],
      };
      this.#relationships.set(existingRel.localId, updated);
      return existingRel.localId;
    }
    return this.#makeRel<AssignsToGroupRel>({
      kind: 'ASSIGNS_TO_GROUP',
      groupLocalId: groupId,
      memberLocalIds: [...memberIds],
    });
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
  addProxy(spec: ProxySpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    if (spec.solid === null || spec.solid === undefined) {
      return err(specError('PROXY_NO_GEOMETRY', 'ProxySpec.solid is required'));
    }
    const id = this.#makeElement('PROXY', spec, spec.solid, options?.stableKey);
    if (spec.materialName !== undefined) {
      this.#makeRel<AssociatesMaterialRel>({
        kind: 'ASSOCIATES_MATERIAL',
        materialName: spec.materialName,
        relatedObjects: [id],
      });
    }
    return ok(id);
  }

  addDoor(spec: DoorSpec, options?: OpeningIdentityOptions): Result<LocalId, BimError> {
    const wall = this.#elements.get(spec.wallLocalId);
    if (wall === undefined || wall.category !== 'WALL') {
      return err(specError('DOOR_WALL_NOT_FOUND', `No wall found for localId ${spec.wallLocalId}`));
    }
    if (wall.geometry.kind === 'EXACT') return exactWallBodyImmutable();
    const keyCheck = this.#checkOpeningKeys(options);
    if (!keyCheck.ok) return keyCheck;
    if (spec.offsetAlongWall + spec.width > wall.spec.length) {
      return err(
        specError('DOOR_EXCEEDS_WALL_BOUNDS', 'Door (offsetAlongWall + width) exceeds wall length')
      );
    }
    if (spec.offsetFromFloor + spec.height > wall.spec.height) {
      return err(
        specError('DOOR_EXCEEDS_WALL_BOUNDS', 'Door (offsetFromFloor + height) exceeds wall height')
      );
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

    const openingId = this.#makeElement('OPENING', openingSpec, null, options?.openingStableKey);
    this.#makeRel<VoidsWallRel>({
      kind: 'VOIDS_WALL',
      wallLocalId: spec.wallLocalId,
      openingLocalId: openingId,
    });
    const doorId = this.#makeElement('DOOR', spec, null, options?.stableKey);
    this.#makeRel<FillsOpeningRel>({
      kind: 'FILLS_OPENING',
      openingLocalId: openingId,
      fillerLocalId: doorId,
    });
    this.#makeRel<AssociatesMaterialRel>({
      kind: 'ASSOCIATES_MATERIAL',
      materialName: spec.materialName,
      relatedObjects: [doorId],
    });
    return ok(doorId);
  }

  addWindow(spec: WindowSpec, options?: OpeningIdentityOptions): Result<LocalId, BimError> {
    const wall = this.#elements.get(spec.wallLocalId);
    if (wall === undefined || wall.category !== 'WALL') {
      return err(
        specError('WINDOW_WALL_NOT_FOUND', `No wall found for localId ${spec.wallLocalId}`)
      );
    }
    if (wall.geometry.kind === 'EXACT') return exactWallBodyImmutable();
    const keyCheck = this.#checkOpeningKeys(options);
    if (!keyCheck.ok) return keyCheck;
    if (spec.offsetAlongWall + spec.width > wall.spec.length) {
      return err(
        specError(
          'WINDOW_EXCEEDS_WALL_BOUNDS',
          'Window (offsetAlongWall + width) exceeds wall length'
        )
      );
    }
    if (spec.offsetFromFloor + spec.height > wall.spec.height) {
      return err(
        specError(
          'WINDOW_EXCEEDS_WALL_BOUNDS',
          'Window (offsetFromFloor + height) exceeds wall height'
        )
      );
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

    const openingId = this.#makeElement('OPENING', openingSpec, null, options?.openingStableKey);
    this.#makeRel<VoidsWallRel>({
      kind: 'VOIDS_WALL',
      wallLocalId: spec.wallLocalId,
      openingLocalId: openingId,
    });
    const windowId = this.#makeElement('WINDOW', spec, null, options?.stableKey);
    this.#makeRel<FillsOpeningRel>({
      kind: 'FILLS_OPENING',
      openingLocalId: openingId,
      fillerLocalId: windowId,
    });
    this.#makeRel<AssociatesMaterialRel>({
      kind: 'ASSOCIATES_MATERIAL',
      materialName: spec.materialName,
      relatedObjects: [windowId],
    });
    return ok(windowId);
  }

  addSlabOpening(
    input: SlabOpeningInput,
    options?: ElementIdentityOptions
  ): Result<LocalId, BimError> {
    const keyCheck = this.#checkStableKey(options);
    if (!keyCheck.ok) return keyCheck;
    const slab = this.#elements.get(input.slabLocalId);
    if (slab === undefined || slab.category !== 'SLAB') {
      return err(
        specError('SLAB_OPENING_SLAB_NOT_FOUND', `No slab found for localId ${input.slabLocalId}`)
      );
    }
    if (input.offsetX + input.sizeX > slab.spec.length) {
      return err(
        specError(
          'SLAB_OPENING_EXCEEDS_SLAB_BOUNDS',
          'Opening (offsetX + sizeX) exceeds slab length'
        )
      );
    }
    if (input.offsetY + input.sizeY > slab.spec.width) {
      return err(
        specError(
          'SLAB_OPENING_EXCEEDS_SLAB_BOUNDS',
          'Opening (offsetY + sizeY) exceeds slab width'
        )
      );
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
        return err(
          specError(
            'SLAB_OPENING_OVERLAP',
            'Slab opening overlaps an existing opening on the same slab'
          )
        );
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

    const openingId = this.#makeElement('OPENING', openingSpec, null, options?.stableKey);
    this.#makeRel<VoidsSlabRel>({
      kind: 'VOIDS_SLAB',
      slabLocalId: input.slabLocalId,
      openingLocalId: openingId,
    });
    return ok(openingId);
  }

  #cutWallGeometry(
    wall: BimElement<'WALL'>,
    openingSpec: WallOpeningSpec
  ): Result<ValidSolid, BimError> {
    if (wall.geometry.kind === 'EXACT') {
      return exactWallBodyImmutable();
    }
    const toolResult = openingToSolid(openingSpec, wall.spec.thickness);
    if (!toolResult.ok) return err(toolResult.error);
    using tool = toolResult.value;
    const cutResult = cut(wall.geometry.solid, tool);
    if (!cutResult.ok) {
      return err(
        fromBrepError(cutResult.error, 'WALL_CUT_FAILED', 'Boolean cut of wall with opening failed')
      );
    }
    return ok(cutResult.value);
  }

  #replaceWallGeometry(wall: BimElement<'WALL'>, newGeometry: ValidSolid): void {
    const oldGeometry = wall.geometry;
    const replaced: BimElement<'WALL'> = {
      ...wall,
      geometry: { kind: 'PARAMETRIC', solid: newGeometry },
    };
    this.#elements.set(wall.localId, replaced);
    disposeProductBody(oldGeometry);
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

  /**
   * A serializable summary of the model's structure, rooted at the project and
   * walking the IFC spatial hierarchy (AGGREGATES: project → site → building →
   * storey) plus the elements contained in each storey (placeIn). Useful for a
   * read-only tree view of the model across a worker boundary.
   */
  toTreeSummary(): BimTreeSummary {
    const aggregated = new Map<LocalId, LocalId[]>();
    const contained = new Map<LocalId, LocalId[]>();
    for (const rel of this.#relationships.values()) {
      if (rel.kind === 'AGGREGATES') {
        const list = aggregated.get(rel.relatingObject) ?? [];
        list.push(...rel.relatedObjects);
        aggregated.set(rel.relatingObject, list);
      } else if (rel.kind === 'CONTAINED_IN') {
        const list = contained.get(rel.relatingStructure) ?? [];
        list.push(...rel.relatedElements);
        contained.set(rel.relatingStructure, list);
      }
    }

    const labelFor = (el: AnyBimElement): string => {
      const spec = el.spec as { name?: string; elevation?: number };
      const base = typeof spec.name === 'string' && spec.name.length > 0 ? spec.name : el.category;
      return el.category === 'STOREY' && typeof spec.elevation === 'number'
        ? `${base} (+${spec.elevation} mm)`
        : base;
    };

    // `seen` guards against a malformed relationship cycle re-entering a node.
    const seen = new Set<LocalId>();
    const build = (id: LocalId): BimTreeNode | null => {
      if (seen.has(id)) return null;
      seen.add(id);
      const el = this.#elements.get(id);
      if (el === undefined) return null;
      const childIds = [...(aggregated.get(id) ?? []), ...(contained.get(id) ?? [])];
      const children = childIds.map(build).filter((n): n is BimTreeNode => n !== null);
      return { id, label: labelFor(el), category: el.category, children };
    };

    const root = this.#projectId !== null ? build(this.#projectId) : null;
    // Count the nodes actually in the tree, not this.#elements.size — the latter
    // includes internal OPENING elements (created by addDoor/addWindow) that have
    // no CONTAINED_IN relationship and never appear in the tree, so the header
    // count would not match what the panel renders.
    const countNodes = (node: BimTreeNode): number =>
      1 + node.children.reduce((sum, c) => sum + countNodes(c), 0);
    return { root, elementCount: root ? countNodes(root) : 0 };
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

  getBridges(): BimElement<'BRIDGE'>[] {
    const bridges: BimElement<'BRIDGE'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'BRIDGE') bridges.push(el);
    }
    return bridges;
  }

  getBridgeParts(): BimElement<'BRIDGE_PART'>[] {
    const parts: BimElement<'BRIDGE_PART'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'BRIDGE_PART') parts.push(el);
    }
    return parts;
  }

  getEarthworksFills(): BimElement<'EARTHWORKS_FILL'>[] {
    const fills: BimElement<'EARTHWORKS_FILL'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'EARTHWORKS_FILL') fills.push(el);
    }
    return fills;
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

  getZones(): BimElement<'ZONE'>[] {
    const zones: BimElement<'ZONE'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'ZONE') zones.push(el);
    }
    return zones;
  }

  getSystems(): BimElement<'SYSTEM'>[] {
    const systems: BimElement<'SYSTEM'>[] = [];
    for (const el of this.#elements.values()) {
      if (el.category === 'SYSTEM') systems.push(el);
    }
    return systems;
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
    geometry: Extract<AnyBimElement, { category: C }>['geometry'],
    stableKey?: string
  ): LocalId {
    const localId = this.#counter.next();
    // Deterministic GUID. Default key: (category, localId), so re-serializing
    // an identical model is byte-for-byte stable. A caller-supplied stableKey
    // (e.g. a families key path) replaces the positional key, making the
    // GlobalId stable under element reordering as well. Duplicates would mint
    // two elements sharing a GlobalId — an IFC validity break — so they throw.
    if (stableKey !== undefined) {
      if (this.#usedStableKeys.has(stableKey)) {
        throw new Error(`BimModel: duplicate stableKey '${stableKey}'`);
      }
      this.#usedStableKeys.add(stableKey);
    }
    const guid: IfcGuid = deriveIfcGuidSync(
      stableKey !== undefined
        ? `elem:${this.#modelScope}:${stableKey}`
        : makeElementKey(this.#modelScope, category, localId)
    );
    const el = { guid, localId, category, spec, geometry } as AnyBimElement;
    this.#elements.set(localId, el);
    return localId;
  }

  #makeRel<R extends BimRelationship>(fields: Omit<R, 'guid' | 'localId'>): LocalId {
    const localId = this.#counter.next();
    // Deterministic GUID keyed on (kind, localId). localIds are assigned in a
    // fixed sequence, so an identical model produces identical relationship GUIDs.
    const guid: IfcGuid = deriveIfcGuidSync(makeRelKey(this.#modelScope, fields.kind, localId));
    const rel = { ...fields, guid, localId } as unknown as BimRelationship;
    this.#relationships.set(localId, rel);
    return localId;
  }
}
