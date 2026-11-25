import { z } from 'zod';
import type { FrameInput } from '../placementFrame.js';
import type { AuthoredBodyInput, BimDocument } from './bimDocument.js';
import { snapshotData as captureRecipe } from './documentGraph.js';
import { wallOpeningFrame, slabOpeningFrame } from '../elementFns/openingFrames.js';
import { realizeFlights, bindFlightItems } from './flightBody.js';
import { stairFlightToSolid } from '../elementFns/stairFns.js';
import { rampFlightToSolid } from '../elementFns/rampFns.js';
import {
  capturePlacement,
  identityPlacement,
  type PlacementDefinition,
} from '../types/placementDefinition.js';
import type { Result, ValidSolid } from 'brepjs';
import { box, translate, ok, err } from 'brepjs';
import { ordinalOf, type RecordRef } from '../identity/recordRef.js';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type { WallOpeningSpec, SlabOpeningSpec } from '../types/bimTypes.js';
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
import type { SiteSpec, BuildingSpec, StoreySpec } from '../specs/spatialSpec.js';
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
import { cutOpeningSolid } from '../elementFns/cutOpeningSolid.js';
import { spaceToSolid } from '../elementFns/spaceFns.js';
import { roofToSolid } from '../elementFns/roofFns.js';
import { curtainWallToGrid } from '../elementFns/curtainWallFns.js';
import { footingToSolid, pileToSolid } from '../elementFns/foundationFns.js';
import { railingToSolid } from '../elementFns/railingFns.js';
import { coveringToSolid } from '../elementFns/coveringFns.js';
import { type Body, type NonEmpty } from '../types/body.js';
import {
  prepareRecords,
  type ModelCommand,
  type ElementIdentityOptions,
  type OpeningIdentityOptions,
} from './bimDocument.js';
const roofOpening = z.strictObject({
  kind: z.literal('ROOF_OPENING'),
  sizeX: z.number().positive(),
  sizeY: z.number().positive(),
  depth: z.number().positive(),
});
export class BimAuthoring {
  /** The supplied solids already contain the void. Its definition records intent only. */
  addRoofWithOpening(
    input: Pick<AuthoredBodyInput, 'solids' | 'placement' | 'metadata'> & {
      readonly stableKey: string;
      readonly opening: {
        readonly slot: string;
        readonly frame: FrameInput;
        readonly definition: z.infer<typeof roofOpening>;
      };
    }
  ): Result<{ readonly roof: RecordRef; readonly opening: RecordRef }, BimError> {
    return this.#access.edit('addRoofWithOpening', (command) => {
      if (!input.stableKey?.trim() || !input.opening?.slot?.trim())
        return err(specError('INVALID_OPENING_KEY', 'Roof and void slot require stable keys'));
      const definition = roofOpening.safeParse(input.opening.definition);
      if (!definition.success)
        return err(
          specError(
            'UNSUPPORTED_OPENING_DEFINITION',
            'Expected a rectangular already-cut through opening',
            definition.error
          )
        );
      const roof = this.#access.adopt(command, { ...input, category: 'ROOF' });
      if (!roof.ok) return roof;
      const placement = capturePlacement(
        { kind: 'LOCAL_FRAME', frame: input.opening.frame },
        roof.value
      );
      if (!placement.ok) return placement;
      const opening = this.#access.makeElement(
        command,
        {
          category: 'OPENING',
          representation: 'NONE',
          reason: 'OPENING_REFERENCE',
          placement: placement.value,
          spec: Object.freeze(definition.data),
          geometry: null,
        },
        input.stableKey + '/void/' + encodeURIComponent(input.opening.slot)
      );
      this.#access.makeRel(
        { kind: 'VOIDS', hostCategory: 'ROOF', hostLocalId: roof.value, openingLocalId: opening },
        command
      );
      return ok(Object.freeze({ roof: roof.value, opening }));
    });
  }

  readonly #access;
  constructor(private readonly document: BimDocument) {
    this.#access = document[prepareRecords]();
  }

  addSite(
    spec: SiteSpec,
    options?: ElementIdentityOptions & { readonly placementParent?: RecordRef }
  ): Result<RecordRef, BimError> {
    return this.#access.create('addSite', (command) => {
      const snapshot = captureRecipe(spec);
      const placement = capturePlacement(
        {
          kind: 'LOCAL_FRAME',
          frame: {
            origin: snapshot.origin ?? [0, 0, 0],
            axisX: snapshot.axisX ?? [1, 0, 0],
            axisZ: snapshot.axisZ ?? [0, 0, 1],
          },
        },
        options?.placementParent
      );
      if (!placement.ok) return placement;
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      return ok(
        this.#access.makeElement(
          command,
          {
            category: 'SITE',
            representation: 'NONE',
            reason: 'SPATIAL',
            placement: placement.value,
            spec: snapshot,
            geometry: null,
          },
          identity?.stableKey
        )
      );
    });
  }

  addBridge(
    spec: BridgeSpec,
    options?: ElementIdentityOptions & { readonly placementParent?: RecordRef }
  ): Result<RecordRef, BimError> {
    return this.#access.create('addBridge', (command) => {
      const snapshot = captureRecipe(spec);
      const placement = capturePlacement(
        {
          kind: 'LOCAL_FRAME',
          frame: {
            origin: snapshot.origin ?? [0, 0, 0],
            axisX: snapshot.axisX ?? [1, 0, 0],
            axisZ: snapshot.axisZ ?? [0, 0, 1],
          },
        },
        options?.placementParent
      );
      if (!placement.ok) return placement;
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      return ok(
        this.#access.makeElement(
          command,
          {
            category: 'BRIDGE',
            representation: 'NONE',
            reason: 'SPATIAL',
            placement: placement.value,
            spec: snapshot,
            geometry: null,
          },
          identity?.stableKey
        )
      );
    });
  }

  addBridgePart(
    spec: BridgePartSpec,
    options?: ElementIdentityOptions & { readonly placementParent?: RecordRef }
  ): Result<RecordRef, BimError> {
    return this.#access.create('addBridgePart', (command) => {
      const snapshot = captureRecipe(spec);
      const placement = capturePlacement(
        {
          kind: 'LOCAL_FRAME',
          frame: {
            origin: snapshot.origin ?? [0, 0, 0],
            axisX: snapshot.axisX ?? [1, 0, 0],
            axisZ: snapshot.axisZ ?? [0, 0, 1],
          },
        },
        options?.placementParent
      );
      if (!placement.ok) return placement;
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      return ok(
        this.#access.makeElement(
          command,
          {
            category: 'BRIDGE_PART',
            representation: 'NONE',
            reason: 'SPATIAL',
            placement: placement.value,
            spec: snapshot,
            geometry: null,
          },
          identity?.stableKey
        )
      );
    });
  }

  /** Adds a typed IfcEarthworksFill body. Ownership of `spec.solid` transfers
   * to the model only when this call succeeds. */
  addEarthworksFill(
    spec: EarthworksFillSpec,
    options?: ElementIdentityOptions
  ): Result<RecordRef, BimError> {
    return this.#access.create('addEarthworksFill', (command) => {
      const { solid, ...metadata } = spec;
      const snapshot = captureRecipe(metadata);
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      if (solid === null || solid === undefined) {
        return err(
          specError('EARTHWORKS_FILL_NO_GEOMETRY', 'EarthworksFillSpec.solid is required')
        );
      }
      const placement = capturePlacement({
        kind: 'LOCAL_FRAME',
        frame: { origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1] },
      });
      if (!placement.ok) return placement;
      const id = this.#access.makeElement(
        command,
        {
          category: 'EARTHWORKS_FILL',
          representation: 'BODY',
          placement: placement.value,
          spec: snapshot,
          geometry: { kind: 'AUTHORITATIVE', solids: [solid] },
        },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      return ok(id);
    });
  }

  addBuilding(
    spec: BuildingSpec,
    options?: ElementIdentityOptions & { readonly placementParent?: RecordRef }
  ): Result<RecordRef, BimError> {
    return this.#access.create('addBuilding', (command) => {
      const snapshot = captureRecipe(spec);
      const placement = capturePlacement(
        {
          kind: 'LOCAL_FRAME',
          frame: {
            origin: snapshot.origin ?? [0, 0, 0],
            axisX: snapshot.axisX ?? [1, 0, 0],
            axisZ: snapshot.axisZ ?? [0, 0, 1],
          },
        },
        options?.placementParent
      );
      if (!placement.ok) return placement;
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      return ok(
        this.#access.makeElement(
          command,
          {
            category: 'BUILDING',
            representation: 'NONE',
            reason: 'SPATIAL',
            placement: placement.value,
            spec: snapshot,
            geometry: null,
          },
          identity?.stableKey
        )
      );
    });
  }

  addStorey(
    spec: StoreySpec,
    options?: ElementIdentityOptions & { readonly placementParent?: RecordRef }
  ): Result<RecordRef, BimError> {
    return this.#access.create('addStorey', (command) => {
      const snapshot = captureRecipe(spec);
      const placement = capturePlacement(
        {
          kind: 'LOCAL_FRAME',
          frame: {
            origin: snapshot.origin ?? [0, 0, spec.elevation],
            axisX: snapshot.axisX ?? [1, 0, 0],
            axisZ: snapshot.axisZ ?? [0, 0, 1],
          },
        },
        options?.placementParent
      );
      if (!placement.ok) return placement;
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      return ok(
        this.#access.makeElement(
          command,
          {
            category: 'STOREY',
            representation: 'NONE',
            reason: 'SPATIAL',
            placement: placement.value,
            spec: snapshot,
            geometry: null,
          },
          identity?.stableKey
        )
      );
    });
  }

  #checkOpeningKeys(options: OpeningIdentityOptions | undefined): Result<void, BimError> {
    const filler = this.#access.checkStableKey(options);
    if (!filler.ok) return filler;
    const opening = this.#access.checkStableKey({ stableKey: options?.openingStableKey });
    if (!opening.ok) return opening;
    if (options?.stableKey !== undefined && options.stableKey === options.openingStableKey) {
      return err(
        specError(
          'DUPLICATE_STABLE_KEY',
          `BimDocument: stableKey and openingStableKey are both '${options.stableKey}'`
        )
      );
    }
    return ok(undefined);
  }

  addWall(spec: WallSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> {
    return this.#access.create('addWall', (command) => {
      const snapshot = captureRecipe(spec);
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const placement = capturePlacement({ kind: 'LOCAL_FRAME', frame: snapshot });
      if (!placement.ok) return placement;
      const geomResult = wallToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#access.ownGenerated(command, [geomResult.value]);
      const id = this.#access.makeElement(
        command,
        {
          category: 'WALL',
          representation: 'BODY',
          placement: placement.value,
          spec: snapshot,
          geometry: { kind: 'PARAMETRIC', solids: [geomResult.value] },
        },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  addSlab(spec: SlabSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> {
    return this.#access.create('addSlab', (command) => {
      const snapshot = captureRecipe(spec);
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const placement = capturePlacement({ kind: 'LOCAL_FRAME', frame: snapshot });
      if (!placement.ok) return placement;
      const geomResult = slabToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#access.ownGenerated(command, [geomResult.value]);
      const id = this.#access.makeElement(
        command,
        {
          category: 'SLAB',
          spec: snapshot,
          representation: 'BODY',
          placement: placement.value,
          geometry: { kind: 'PARAMETRIC', solids: [geomResult.value] },
        },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  addBeam(spec: BeamSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> {
    return this.#access.create('addBeam', (command) => {
      const snapshot = captureRecipe(spec);
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const placement = capturePlacement({ kind: 'LOCAL_FRAME', frame: snapshot });
      if (!placement.ok) return placement;
      const geomResult = beamToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#access.ownGenerated(command, [geomResult.value]);
      const id = this.#access.makeElement(
        command,
        {
          category: 'BEAM',
          spec: snapshot,
          representation: 'BODY',
          placement: placement.value,
          geometry: { kind: 'PARAMETRIC', solids: [geomResult.value] },
        },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  addColumn(spec: ColumnSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> {
    return this.#access.create('addColumn', (command) => {
      const snapshot = captureRecipe(spec);
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const placement = capturePlacement({ kind: 'LOCAL_FRAME', frame: snapshot });
      if (!placement.ok) return placement;
      const geomResult = columnToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#access.ownGenerated(command, [geomResult.value]);
      const id = this.#access.makeElement(
        command,
        {
          category: 'COLUMN',
          spec: snapshot,
          representation: 'BODY',
          placement: placement.value,
          geometry: { kind: 'PARAMETRIC', solids: [geomResult.value] },
        },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  addSpace(spec: SpaceSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> {
    return this.#access.create('addSpace', (command) => {
      const snapshot = captureRecipe(spec);
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const placement = capturePlacement({ kind: 'LOCAL_FRAME', frame: snapshot });
      if (!placement.ok) return placement;
      const geomResult = spaceToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#access.ownGenerated(command, [geomResult.value]);
      const id = this.#access.makeElement(
        command,
        {
          category: 'SPACE',
          spec: snapshot,
          representation: 'BODY',
          placement: placement.value,
          geometry: { kind: 'PARAMETRIC', solids: [geomResult.value] },
        },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  addRoof(spec: RoofSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> {
    return this.#access.create('addRoof', (command) => {
      const snapshot = captureRecipe(spec);
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const placement = capturePlacement({ kind: 'LOCAL_FRAME', frame: snapshot });
      if (!placement.ok) return placement;
      const geomResult = roofToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#access.ownGenerated(command, [geomResult.value]);
      const id = this.#access.makeElement(
        command,
        {
          category: 'ROOF',
          spec: snapshot,
          representation: 'BODY',
          placement: placement.value,
          geometry: { kind: 'PARAMETRIC', solids: [geomResult.value] },
        },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  addCurtainWall(
    spec: CurtainWallSpec,
    options?: ElementIdentityOptions
  ): Result<RecordRef, BimError> {
    return this.#access.create('addCurtainWall', (command) => {
      const snapshot = captureRecipe(spec);
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const placement = capturePlacement({ kind: 'LOCAL_FRAME', frame: snapshot });
      if (!placement.ok) return placement;
      const gridResult = curtainWallToGrid(snapshot);
      if (!gridResult.ok) return err(gridResult.error);
      this.#access.ownGenerated(
        command,
        [...gridResult.value.panels, ...gridResult.value.mullions].map(({ solid }) => solid)
      );
      const id = this.#access.makeElement(
        command,
        {
          category: 'CURTAIN_WALL',
          representation: 'NONE',
          reason: 'ASSEMBLY',
          placement: placement.value,
          spec: snapshot,
          geometry: null,
        },
        identity?.stableKey
      );
      const childIds: RecordRef[] = [];
      for (const category of ['PLATE', 'MEMBER'] as const) {
        const components =
          category === 'PLATE' ? gridResult.value.panels : gridResult.value.mullions;
        for (const [index, component] of components.entries()) {
          const childPlacement = capturePlacement({
            kind: 'LOCAL_FRAME',
            relativeTo: id,
            frame: { origin: component.origin, axisX: [1, 0, 0], axisZ: [0, 0, 1] },
          });
          if (!childPlacement.ok) return childPlacement;
          const childId = this.#access.makeElement(
            command,
            {
              category,
              representation: 'BODY',
              placement: childPlacement.value,
              spec: captureRecipe({
                size: component.size,
                name: `${category === 'PLATE' ? 'Panel' : 'Mullion'} ${index}`,
              }),
              geometry: { kind: 'PARAMETRIC', solids: [component.solid] },
            },
            `${identity?.stableKey ?? 'curtain-wall/' + String(ordinalOf(id))}/${category}/${index}`
          );
          childIds.push(childId);
        }
      }
      this.#access.makeRel(
        { kind: 'AGGREGATES', relatingObject: id, relatedObjects: Object.freeze(childIds) },
        command
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  addFooting(spec: FootingSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> {
    return this.#access.create('addFooting', (command) => {
      const snapshot = captureRecipe(spec);
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const placement = capturePlacement({ kind: 'LOCAL_FRAME', frame: snapshot });
      if (!placement.ok) return placement;
      const geomResult = footingToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#access.ownGenerated(command, [geomResult.value]);
      const id = this.#access.makeElement(
        command,
        {
          category: 'FOOTING',
          spec: snapshot,
          representation: 'BODY',
          placement: placement.value,
          geometry: { kind: 'PARAMETRIC', solids: [geomResult.value] },
        },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  addPile(spec: PileSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> {
    return this.#access.create('addPile', (command) => {
      const snapshot = captureRecipe(spec);
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const placement = capturePlacement({ kind: 'LOCAL_FRAME', frame: snapshot });
      if (!placement.ok) return placement;
      const geomResult = pileToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#access.ownGenerated(command, [geomResult.value]);
      const id = this.#access.makeElement(
        command,
        {
          category: 'PILE',
          spec: snapshot,
          representation: 'BODY',
          placement: placement.value,
          geometry: { kind: 'PARAMETRIC', solids: [geomResult.value] },
        },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  /** Realize each stair flight once in assembly coordinates. */
  addStair(spec: StairSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> {
    return this.#access.create('addStair', (command) => {
      const snapshot = captureRecipe(spec);
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const realized = realizeFlights(snapshot.flights, stairFlightToSolid, (solids) =>
        this.#access.ownGenerated(command, solids)
      );
      if (!realized.ok) return realized;
      const id = this.#access.makeElement(
        command,
        {
          category: 'STAIR',
          representation: 'BODY',
          placement: identityPlacement,
          spec: snapshot,
          geometry: { kind: 'PARAMETRIC', solids: realized.value.solids },
        },
        identity?.stableKey
      );
      const record = command.elements.at(-1);
      if (record?.representation !== 'BODY' || record.localId !== id)
        throw new Error('Missing staged flight Body');
      bindFlightItems(record.geometry, id, realized.value.items);
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  /** Realize each ramp flight once in assembly coordinates. */
  addRamp(spec: RampSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> {
    return this.#access.create('addRamp', (command) => {
      const snapshot = captureRecipe(spec);
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const realized = realizeFlights(snapshot.flights, rampFlightToSolid, (solids) =>
        this.#access.ownGenerated(command, solids)
      );
      if (!realized.ok) return realized;
      const id = this.#access.makeElement(
        command,
        {
          category: 'RAMP',
          representation: 'BODY',
          placement: identityPlacement,
          spec: snapshot,
          geometry: { kind: 'PARAMETRIC', solids: realized.value.solids },
        },
        identity?.stableKey
      );
      const record = command.elements.at(-1);
      if (record?.representation !== 'BODY' || record.localId !== id)
        throw new Error('Missing staged flight Body');
      bindFlightItems(record.geometry, id, realized.value.items);
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  addRailing(spec: RailingSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> {
    return this.#access.create('addRailing', (command) => {
      const snapshot = captureRecipe(spec);
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const placement = capturePlacement({ kind: 'LOCAL_FRAME', frame: snapshot });
      if (!placement.ok) return placement;
      const geomResult = railingToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#access.ownGenerated(command, [geomResult.value]);
      const id = this.#access.makeElement(
        command,
        {
          category: 'RAILING',
          representation: 'BODY',
          placement: placement.value,
          spec: snapshot,
          geometry: { kind: 'PARAMETRIC', solids: [geomResult.value] },
        },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  /**
   * Adds an IfcCovering. When `hostLocalId` is supplied, an
   * IfcRelCoversBldgElements linking the covering to its host (e.g. a slab it
   * finishes) is recorded for export.
   */
  addCovering(
    spec: CoveringSpec,
    hostLocalId?: RecordRef,
    options?: ElementIdentityOptions
  ): Result<RecordRef, BimError> {
    return this.#access.create('addCovering', (command) => {
      const snapshot = captureRecipe(spec);
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const placement = capturePlacement({ kind: 'LOCAL_FRAME', frame: snapshot });
      if (!placement.ok) return placement;
      const geomResult = coveringToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#access.ownGenerated(command, [geomResult.value]);
      const id = this.#access.makeElement(
        command,
        {
          category: 'COVERING',
          spec: snapshot,
          representation: 'BODY',
          placement: placement.value,
          geometry: { kind: 'PARAMETRIC', solids: [geomResult.value] },
        },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      if (hostLocalId !== undefined) {
        this.#access.makeRel(
          {
            kind: 'COVERS_ELEMENT',
            hostLocalId,
            coveringLocalId: id,
          },
          command
        );
      }
      return ok(id);
    });
  }

  /**
   * Adds an IfcElementAssembly grouping container. The assembly has no geometry;
   * attach parts with {@link aggregate} (IfcRelAggregates) or {@link nest}
   * (IfcRelNests, order-preserving). Returns the assembly's localId.
   */
  addElementAssembly(
    spec: ElementAssemblySpec,
    options?: ElementIdentityOptions & { readonly placementParent?: RecordRef }
  ): Result<RecordRef, BimError> {
    return this.#access.create('addElementAssembly', (command) => {
      const snapshot = captureRecipe(spec);
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const placement = capturePlacement(identityPlacement, options?.placementParent);
      if (!placement.ok) return placement;
      return ok(
        this.#access.makeElement(
          command,
          {
            category: 'ELEMENT_ASSEMBLY',
            representation: 'NONE',
            reason: 'ASSEMBLY',
            placement: placement.value,
            spec: snapshot,
            geometry: null,
          },
          identity?.stableKey
        )
      );
    });
  }

  /**
   * Adds an IfcZone grouping object (a thermal/fire/occupancy zone). The zone
   * carries no geometry; attach members (spaces or other elements) with
   * {@link assignToGroup}. Returns the zone's localId as a Result.
   */
  addZone(spec: ZoneSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> {
    return this.#access.create('addZone', (command) => {
      const snapshot = captureRecipe(spec);
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      return ok(
        this.#access.makeElement(
          command,
          {
            category: 'ZONE',
            representation: 'NONE',
            reason: 'GROUP',
            placement: null,
            spec: snapshot,
            geometry: null,
          },
          identity?.stableKey
        )
      );
    });
  }

  /**
   * Adds an IfcSystem grouping object (an HVAC/electrical/plumbing system). The
   * system carries no geometry; attach members with {@link assignToGroup}.
   * Returns the system's localId as a Result.
   */
  addSystem(spec: SystemSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> {
    return this.#access.create('addSystem', (command) => {
      const snapshot = captureRecipe(spec);
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      return ok(
        this.#access.makeElement(
          command,
          {
            category: 'SYSTEM',
            representation: 'NONE',
            reason: 'GROUP',
            placement: null,
            spec: snapshot,
            geometry: null,
          },
          identity?.stableKey
        )
      );
    });
  }

  #associateMaterial(
    command: ModelCommand,
    id: RecordRef,
    spec: {
      readonly materialName: string;
      readonly materialLayers?: readonly MaterialLayer[] | undefined;
      readonly layerSetName?: string | undefined;
    }
  ): void {
    const hasLayers = spec.materialLayers !== undefined && spec.materialLayers.length > 0;
    this.#access.makeRel(
      {
        kind: 'ASSOCIATES_MATERIAL',
        materialName: spec.materialName,
        relatedObjects: [id],
        ...(hasLayers
          ? {
              materialLayers: spec.materialLayers,
              layerSetName: spec.layerSetName ?? spec.materialName,
            }
          : {}),
      },
      command
    );
  }

  #associateClassification(
    command: ModelCommand,
    id: RecordRef,
    spec: { readonly classification?: ClassificationRef | undefined }
  ): void {
    if (spec.classification === undefined) return;
    this.#access.makeRel(
      {
        kind: 'ASSOCIATES_CLASSIFICATION',
        ref: spec.classification,
        relatedObjects: [id],
      },
      command
    );
  }

  /**
   * Adds an IfcBuildingElementProxy. The model TAKES OWNERSHIP of `spec.solid`
   * and disposes it on model disposal; the caller must not dispose it (see
   * {@link ProxySpec.solid}).
   */
  addProxy(spec: ProxySpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> {
    return this.#access.create('addProxy', (command) => {
      const { solid, ...metadata } = spec;
      const snapshot = captureRecipe(metadata);
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      if (solid === null || solid === undefined) {
        return err(specError('PROXY_NO_GEOMETRY', 'ProxySpec.solid is required'));
      }
      const placement = capturePlacement({
        kind: 'LOCAL_FRAME',
        frame: { origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1] },
      });
      if (!placement.ok) return placement;
      const id = this.#access.makeElement(
        command,
        {
          category: 'PROXY',
          representation: 'BODY',
          placement: placement.value,
          spec: snapshot,
          geometry: { kind: 'AUTHORITATIVE', solids: [solid] },
        },
        identity?.stableKey
      );
      if (snapshot.materialName !== undefined) {
        this.#access.makeRel(
          {
            kind: 'ASSOCIATES_MATERIAL',
            materialName: snapshot.materialName,
            relatedObjects: [id],
          },
          command
        );
      }
      return ok(id);
    });
  }

  #fillerBody(
    command: ModelCommand,
    spec: { width: number; height: number },
    solids?: NonEmpty<ValidSolid>
  ): Result<Body, BimError> {
    if (solids !== undefined) return ok({ kind: 'AUTHORITATIVE', solids });
    if (![spec.width, spec.height].every((n) => Number.isFinite(n) && n > 0))
      return err(specError('INVALID_PANEL', 'Panel dimensions must be positive'));
    const blank = box(spec.width, spec.height, 100);
    this.#access.ownGenerated(command, [blank]);
    const panel = translate(blank, [-spec.width / 2, -spec.height / 2, 0]);
    this.#access.ownGenerated(command, [panel]);
    return ok({ kind: 'PARAMETRIC', solids: [panel] });
  }

  addFillerPanel(input: {
    category: 'DOOR' | 'WINDOW';
    width: number;
    height: number;
    materialName: string;
    placement: PlacementDefinition;
    stableKey?: string;
    openingLocalId?: RecordRef;
  }): Result<RecordRef, BimError> {
    return this.#access.create('addFillerPanel', (command) => {
      const { category, width, height, materialName, stableKey, openingLocalId } = input;
      if (category !== 'DOOR' && category !== 'WINDOW')
        return err(specError('INVALID_FILLER', 'Expected a Door or Window'));
      if (openingLocalId !== undefined) {
        const target = this.#access.checkFillTarget(category, openingLocalId);
        if (!target.ok) return target;
      }
      const placement = capturePlacement(input.placement, input.openingLocalId);
      if (!placement.ok) return placement;
      const spec = Object.freeze({ width, height, materialName });
      const panel = this.#fillerBody(command, spec);
      if (!panel.ok) return panel;
      const id = this.#access.makeElement(
        command,
        {
          category,
          spec,
          representation: 'BODY',
          placement: placement.value,
          geometry: panel.value,
        },
        stableKey
      );
      if (openingLocalId !== undefined)
        this.#access.makeRel({ kind: 'FILLS_OPENING', openingLocalId, fillerLocalId: id }, command);
      this.#associateMaterial(command, id, spec);
      return ok(id);
    });
  }

  addDoorAndCutWall(spec: DoorSpec, options?: OpeningIdentityOptions): Result<RecordRef, BimError> {
    return this.#cutWallForFiller('DOOR', spec, options);
  }

  addWindowAndCutWall(
    spec: WindowSpec,
    options?: OpeningIdentityOptions
  ): Result<RecordRef, BimError> {
    return this.#cutWallForFiller('WINDOW', spec, options);
  }

  #cutWallForFiller(
    category: 'DOOR' | 'WINDOW',
    spec: DoorSpec | WindowSpec,
    options?: OpeningIdentityOptions
  ): Result<RecordRef, BimError> {
    return this.#access.create(
      category === 'DOOR' ? 'addDoorAndCutWall' : 'addWindowAndCutWall',
      (command) => {
        const snapshot = captureRecipe(spec);
        const identity = options === undefined ? undefined : Object.freeze({ ...options });
        if ('kind' in snapshot && snapshot.kind !== 'WALL_OPENING')
          return err(
            specError(
              'UNSUPPORTED_OPENING_DEFINITION',
              'Only rectangular wall openings are supported'
            )
          );
        if (
          ![
            snapshot.width,
            snapshot.height,
            snapshot.offsetFromFloor,
            snapshot.offsetAlongWall,
          ].every(Number.isFinite) ||
          snapshot.offsetAlongWall < 0 ||
          snapshot.offsetFromFloor < 0
        )
          return err(specError('INVALID_OPENING', 'Invalid opening dimensions or offsets'));
        const found = this.document.record(snapshot.wallLocalId);
        const wall = found.ok ? found.value : null;
        if (wall === null || wall.category !== 'WALL') {
          return err(
            specError(`${category}_WALL_NOT_FOUND`, 'Expected a Wall reference in this document')
          );
        }
        if (wall.spec === null)
          return err(
            specError('BODY_OPENING_REQUIRES_RECIPE', 'Cutting an opening requires a recipe host')
          );
        const host = wallOpeningSolid(wall.geometry);
        if (!host.ok) return host;
        if (!this.document.isRecipeQuantityEligible(wall.localId))
          return err(
            specError('BODY_OPENING_REQUIRES_RECIPE', 'Cutting this Wall needs its original recipe')
          );
        const keyCheck = this.#checkOpeningKeys(identity);
        if (!keyCheck.ok) return keyCheck;
        if (snapshot.offsetAlongWall + snapshot.width > wall.spec.length) {
          return err(specError(`${category}_EXCEEDS_WALL_BOUNDS`, 'Filler exceeds wall length'));
        }
        if (snapshot.offsetFromFloor + snapshot.height > wall.spec.height) {
          return err(specError(`${category}_EXCEEDS_WALL_BOUNDS`, 'Filler exceeds wall height'));
        }
        const wallThickness = wall.spec.thickness;
        const openingSpec: WallOpeningSpec = {
          kind: 'WALL_OPENING',
          width: snapshot.width,
          height: snapshot.height,
          offsetAlongWall: snapshot.offsetAlongWall,
          offsetFromFloor: snapshot.offsetFromFloor,
        };

        const openingPlacement = capturePlacement({
          kind: 'LOCAL_FRAME',
          frame: wallOpeningFrame(openingSpec, wallThickness),
          relativeTo: wall.localId,
        });
        if (!openingPlacement.ok) return openingPlacement;
        const cutResult = cutOpeningSolid({
          host: host.value,
          makeTool: () => openingToSolid(openingSpec, wallThickness),
          hostKind: 'WALL',
        });
        if (!cutResult.ok) return err(cutResult.error);
        this.#access.replaceGeneratedBody(command, wall, {
          kind: 'PARAMETRIC',
          solids: [cutResult.value],
        });

        const openingId = this.#access.makeElement(
          command,
          {
            category: 'OPENING',
            representation: 'NONE',
            reason: 'OPENING_REFERENCE',
            placement: openingPlacement.value,
            spec: openingSpec,
            geometry: null,
          },
          identity?.openingStableKey
        );
        this.#access.makeRel(
          {
            kind: 'VOIDS',
            hostCategory: 'WALL',
            hostLocalId: snapshot.wallLocalId,
            openingLocalId: openingId,
          },
          command
        );
        const filler = this.#fillerBody(command, snapshot, options?.solids);
        if (!filler.ok) return filler;
        const fillerId = this.#access.makeElement(
          command,
          {
            category,
            representation: 'BODY',
            placement: Object.freeze({ ...identityPlacement, relativeTo: openingId }),
            spec: snapshot,
            geometry: filler.value,
          },
          identity?.stableKey
        );
        command.recipeEligibility.set(fillerId, options?.solids === undefined);
        this.#access.makeRel(
          {
            kind: 'FILLS_OPENING',
            openingLocalId: openingId,
            fillerLocalId: fillerId,
          },
          command
        );
        this.#access.makeRel(
          {
            kind: 'ASSOCIATES_MATERIAL',
            materialName: snapshot.materialName,
            relatedObjects: [fillerId],
          },
          command
        );
        return ok(fillerId);
      }
    );
  }

  addSlabOpening(
    input: SlabOpeningInput,
    options?: ElementIdentityOptions
  ): Result<RecordRef, BimError> {
    return this.#access.create('addSlabOpening', (command) => {
      const snapshot = Object.freeze({ ...input });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#access.checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      if ('kind' in snapshot && snapshot.kind !== 'SLAB_OPENING')
        return err(
          specError(
            'UNSUPPORTED_OPENING_DEFINITION',
            'Only rectangular slab openings are supported'
          )
        );
      if (
        ![snapshot.sizeX, snapshot.sizeY, snapshot.offsetX, snapshot.offsetY].every(
          Number.isFinite
        ) ||
        snapshot.sizeX <= 0 ||
        snapshot.sizeY <= 0 ||
        snapshot.offsetX < 0 ||
        snapshot.offsetY < 0
      )
        return err(
          specError('INVALID_SLAB_OPENING_INPUT', 'Invalid slab opening dimensions or offsets')
        );
      const found = this.document.record(snapshot.slabLocalId);
      const slab = found.ok ? found.value : null;
      if (slab === null || slab.category !== 'SLAB') {
        return err(
          specError('SLAB_OPENING_SLAB_NOT_FOUND', 'Expected a Slab reference in this document')
        );
      }
      if (
        slab.spec === null ||
        slab.geometry.kind !== 'PARAMETRIC' ||
        !this.document.isRecipeQuantityEligible(slab.localId)
      ) {
        return err(
          specError('BODY_OPENING_REQUIRES_RECIPE', 'Cutting this Slab needs its original recipe')
        );
      }
      const thickness = slab.spec.thickness;
      if (snapshot.offsetX + snapshot.sizeX > slab.spec.length) {
        return err(
          specError(
            'SLAB_OPENING_EXCEEDS_SLAB_BOUNDS',
            'Opening (offsetX + sizeX) exceeds slab length'
          )
        );
      }
      if (snapshot.offsetY + snapshot.sizeY > slab.spec.width) {
        return err(
          specError(
            'SLAB_OPENING_EXCEEDS_SLAB_BOUNDS',
            'Opening (offsetY + sizeY) exceeds slab width'
          )
        );
      }
      // Reject overlap with existing slab openings — overlapping rectangles would
      // double-subtract from NetArea/NetVolume in Qto_SlabBaseQuantities.
      const ax0 = snapshot.offsetX;
      const ax1 = snapshot.offsetX + snapshot.sizeX;
      const ay0 = snapshot.offsetY;
      const ay1 = snapshot.offsetY + snapshot.sizeY;
      for (const rel of this.document.getAllRelationships()) {
        if (rel.kind !== 'VOIDS' || rel.hostLocalId !== snapshot.slabLocalId) continue;
        const other = this.document.getElement(rel.openingLocalId);
        if (other === null || other.category !== 'OPENING') continue;
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
        sizeX: snapshot.sizeX,
        sizeY: snapshot.sizeY,
        offsetX: snapshot.offsetX,
        offsetY: snapshot.offsetY,
      };

      const openingPlacement = capturePlacement({
        kind: 'LOCAL_FRAME',
        frame: slabOpeningFrame(openingSpec),
        relativeTo: slab.localId,
      });
      if (!openingPlacement.ok) return openingPlacement;
      const cutResult = cutOpeningSolid({
        host: slab.geometry.solids[0],
        makeTool: () => slabOpeningToSolid(openingSpec, thickness),
        hostKind: 'SLAB',
      });
      if (!cutResult.ok) return err(cutResult.error);
      this.#access.replaceGeneratedBody(command, slab, {
        kind: 'PARAMETRIC',
        solids: [cutResult.value],
      });

      const openingId = this.#access.makeElement(
        command,
        {
          category: 'OPENING',
          representation: 'NONE',
          reason: 'OPENING_REFERENCE',
          placement: openingPlacement.value,
          spec: openingSpec,
          geometry: null,
        },
        identity?.stableKey
      );
      this.#access.makeRel(
        {
          kind: 'VOIDS',
          hostCategory: 'SLAB',
          hostLocalId: snapshot.slabLocalId,
          openingLocalId: openingId,
        },
        command
      );
      return ok(openingId);
    });
  }
}

function wallOpeningSolid(body: Body): Result<ValidSolid, BimError> {
  if (body.kind === 'AUTHORITATIVE') {
    return err(
      specError(
        'AUTHORITATIVE_WALL_BODY_IMMUTABLE',
        'Cannot add an opening to an authoritative Wall Body'
      )
    );
  }
  if (body.solids.length !== 1) {
    return err(
      specError(
        'MULTI_ITEM_WALL_OPENING_UNSUPPORTED',
        'Wall openings require a singleton PARAMETRIC Body'
      )
    );
  }
  return ok(body.solids[0]);
}

/** Recipe commands operate on the supplied document's transaction. */
export function authoring(document: BimDocument) {
  return new BimAuthoring(document);
}
