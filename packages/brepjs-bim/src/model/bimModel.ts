import type { Result, ValidSolid } from 'brepjs';
import { ok, err } from 'brepjs';
import type { IfcGuid } from '../identity/ifcGuid.js';
import { deriveIfcGuidSync, makeElementKey, makeRelKey } from '../identity/guidDerivation.js';
import type { LocalId } from '../identity/localId.js';
import { makeLocalIdCounter, type LocalIdCounter } from '../identity/localId.js';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
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
  NestsRel,
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
import { cutOpeningSolid } from '../elementFns/cutOpeningSolid.js';
import { spaceToSolid } from '../elementFns/spaceFns.js';
import { roofToSolid } from '../elementFns/roofFns.js';
import { curtainWallToGrid } from '../elementFns/curtainWallFns.js';
import { footingToSolid, pileToSolid } from '../elementFns/foundationFns.js';
import { railingToSolid } from '../elementFns/railingFns.js';
import { coveringToSolid } from '../elementFns/coveringFns.js';
import {
  snapshotProductBodyInput,
  validateProductBody,
  wrappedResourceObject,
  type ProductBody,
} from '../types/productBody.js';
import {
  cleanupReport,
  type CleanupReport,
  type GeometryCleanupDiagnostic,
} from '../productBodyCleanup.js';
import { protectElement, retainedSolids, type ElementFields } from './modelGeometry.js';
import { reportedGeometryCleanup } from '../geometryCleanupDiagnostics.js';
import { uncertainGeneratedResources } from '../geometryGeneration.js';

export interface BodyCommitReceipt {
  readonly kind: 'COMMITTED';
  readonly localId: LocalId;
  readonly guid: IfcGuid;
  readonly cleanup: CleanupReport;
}

interface OwnedGeometry {
  readonly solid: Disposable;
  readonly resource: object | undefined;
  readonly localId?: LocalId;
  readonly itemIndex: number;
}

type GeometryOwner = { readonly resource: object | undefined } & (
  | { readonly state: 'RETIRING'; readonly localId?: LocalId; readonly itemIndex: number }
  | { readonly state: 'RETAINED'; readonly localId: LocalId; readonly itemIndex: number }
  | { readonly state: 'UNCERTAIN'; readonly localId?: LocalId; readonly itemIndex: number }
);

/** Prepared writes for one synchronous command, discarded on rejection. */
interface ModelCommand {
  readonly counter: LocalIdCounter;
  modelScope: string;
  projectId: LocalId | null;
  readonly elements: AnyBimElement[];
  readonly relationships: BimRelationship[];
  readonly stableKeys: Set<string>;
  readonly adoptions: Map<ValidSolid, Extract<GeometryOwner, { state: 'RETAINED' }>>;
  readonly generated: Map<ValidSolid, object | undefined>;
  readonly retired: OwnedGeometry[];
  readonly recipeEligibility: Map<LocalId, boolean>;
}

type RelationshipFields = {
  [K in BimRelationship['kind']]: Omit<
    Extract<BimRelationship, { readonly kind: K }>,
    'guid' | 'localId'
  >;
}[BimRelationship['kind']];

class RejectedModelCommand extends Error {
  constructor(readonly error: BimError) {
    super(error.message, { cause: error });
  }
}

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

function wallOpeningSolid(body: ProductBody): Result<ValidSolid, BimError> {
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
  readonly #owners = new Map<Disposable, GeometryOwner>();
  readonly #cleanupDiagnostics: GeometryCleanupDiagnostic[] = [];
  readonly #recipeQuantityEligible = new Set<LocalId>();
  #phase: 'ACTIVE' | 'MUTATING' | 'DISPOSING' | 'DISPOSED' = 'ACTIVE';

  #lifecycleError(): BimError | null {
    if (this.#phase === 'DISPOSED')
      return specError('MODEL_DISPOSED', 'The model has been disposed');
    if (this.#phase !== 'ACTIVE')
      return specError('MODEL_BUSY', 'A model geometry command is already running');
    return null;
  }

  #assertMutable(): void {
    const error = this.#lifecycleError();
    if (error !== null) throw new RejectedModelCommand(error);
  }

  getGeometryCleanupDiagnostics(): readonly GeometryCleanupDiagnostic[] {
    return Object.freeze([...this.#cleanupDiagnostics]);
  }

  #create(
    operation: string,
    action: (command: ModelCommand) => Result<LocalId, BimError>
  ): Result<LocalId, BimError> {
    const result = this.#mutate(operation, action);
    return result.ok ? ok(result.value.value) : result;
  }

  #mutate<T>(
    operation: string,
    action: (command: ModelCommand) => Result<T, BimError>
  ): Result<{ readonly value: T; readonly cleanup: CleanupReport }, BimError> {
    const lifecycleError = this.#lifecycleError();
    if (lifecycleError !== null) return err(lifecycleError);
    const command: ModelCommand = {
      counter: makeLocalIdCounter(this.#counter.current() + 1),
      modelScope: this.#modelScope,
      projectId: this.#projectId,
      elements: [],
      relationships: [],
      stableKeys: new Set(),
      adoptions: new Map(),
      generated: new Map(),
      retired: [],
      recipeEligibility: new Map(),
    };
    this.#phase = 'MUTATING';
    try {
      let result: Result<T, BimError>;
      try {
        result = action(command);
      } catch (cause) {
        result = err(
          cause instanceof RejectedModelCommand
            ? cause.error
            : specError('MODEL_COMMAND_FAILED', `${operation} failed before commit`, cause)
        );
      }
      if (!result.ok) {
        for (const { handle, resource, itemIndex } of uncertainGeneratedResources(result.error)) {
          this.#owners.set(handle, { state: 'UNCERTAIN', resource, itemIndex });
        }
        const priorCleanup = reportedGeometryCleanup(result.error, operation);
        this.#cleanupDiagnostics.push(...priorCleanup);
        const ownedCleanup = this.#retire(
          [...command.generated].map(([solid, resource], itemIndex) => ({
            solid,
            resource,
            itemIndex,
          })),
          operation
        );
        const cleanup = cleanupReport([
          ...priorCleanup,
          ...(ownedCleanup.kind === 'FAILED' ? ownedCleanup.diagnostics : []),
        ]);
        return err({
          ...result.error,
          cleanup,
          metadata: { ...result.error.metadata, operation, cleanup },
        });
      }
      // Prepared data only: no native calls, accessors or callbacks may run during commit.
      for (const element of command.elements) this.#elements.set(element.localId, element);
      for (const { solid, resource, localId, itemIndex } of command.retired) {
        this.#owners.set(solid, {
          state: 'RETIRING',
          resource,
          itemIndex,
          ...(localId === undefined ? {} : { localId }),
        });
      }
      for (const [solid, owner] of command.adoptions) this.#owners.set(solid, owner);
      for (const relationship of command.relationships)
        this.#relationships.set(relationship.localId, relationship);
      for (const key of command.stableKeys) this.#usedStableKeys.add(key);
      for (const [id, eligible] of command.recipeEligibility) {
        if (eligible) this.#recipeQuantityEligible.add(id);
        else this.#recipeQuantityEligible.delete(id);
      }
      while (this.#counter.current() < command.counter.current()) this.#counter.next();
      this.#modelScope = command.modelScope;
      this.#projectId = command.projectId;
      const unused = [...command.generated]
        .filter(([solid]) => !command.adoptions.has(solid))
        .map(([solid, resource], itemIndex) => ({ solid, resource, itemIndex }));
      const cleanup = this.#retire([...command.retired, ...unused], operation);
      return ok({ value: result.value, cleanup });
    } finally {
      this.#phase = 'ACTIVE';
    }
  }

  #stageElement(command: ModelCommand, element: AnyBimElement): void {
    for (const [itemIndex, solid] of retainedSolids(element).entries()) {
      const resource = this.#requireUnowned(command, solid, itemIndex);
      command.adoptions.set(solid, {
        state: 'RETAINED',
        resource,
        localId: element.localId,
        itemIndex,
      });
    }
    command.elements.push(element);
  }

  #captureResource(solid: unknown, itemIndex: number): Result<object | undefined, BimError> {
    try {
      return ok(wrappedResourceObject(solid));
    } catch (cause) {
      return err({
        ...specError('BODY_VALIDATION_FAILED', 'Item resource access threw', cause),
        metadata: { itemIndex },
      });
    }
  }

  #ownGenerated(command: ModelCommand, solids: readonly ValidSolid[]): void {
    const fresh: ValidSolid[] = [];
    // Own the entire batch before any accessor can throw, including later siblings.
    for (const solid of solids) {
      if (command.generated.has(solid)) continue;
      command.generated.set(solid, undefined);
      fresh.push(solid);
    }
    let failure: BimError | undefined;
    for (const [itemIndex, solid] of fresh.entries()) {
      const captured = this.#captureResource(solid, itemIndex);
      if (captured.ok) command.generated.set(solid, captured.value);
      else failure ??= captured.error;
    }
    if (failure !== undefined) throw new RejectedModelCommand(failure);
  }

  #prepareRetirement(element: AnyBimElement): OwnedGeometry[] {
    return retainedSolids(element).map((solid, itemIndex) => ({
      solid,
      resource: this.#owners.get(solid)?.resource,
      localId: element.localId,
      itemIndex,
    }));
  }

  #requireUnowned(command: ModelCommand, solid: unknown, itemIndex: number): object | undefined {
    const owners = [...this.#owners, ...command.adoptions];
    let owner = owners.find(([owned]) => owned === solid)?.[1];
    // Look up the public handle first: an UNCERTAIN owner may already be disposed.
    const captured =
      owner === undefined ? this.#captureResource(solid, itemIndex) : ok(owner.resource);
    if (!captured.ok) throw new RejectedModelCommand(captured.error);
    const resource = captured.value;
    if (owner === undefined && resource !== undefined) {
      owner = owners.find(([, candidate]) => candidate.resource === resource)?.[1];
    }
    if (owner !== undefined) {
      throw new RejectedModelCommand({
        ...specError(
          'BODY_OWNERSHIP_CONFLICT',
          'The model already owns this solid handle or its wrapped resource object'
        ),
        metadata: {
          itemIndex,
          ownerLocalId: owner.localId,
          ownerItemIndex: owner.itemIndex,
          ownerState: owner.state,
        },
      });
    }
    return resource;
  }

  #retire(items: readonly OwnedGeometry[], operation: string): CleanupReport {
    const attempted = new Set<Disposable>();
    const diagnostics: GeometryCleanupDiagnostic[] = [];
    for (const { solid, resource, itemIndex, localId } of items) {
      const owner = this.#owners.get(solid);
      if (attempted.has(solid) || owner?.state === 'UNCERTAIN') continue;
      attempted.add(solid);
      // Keep responsibility before invoking user-observable cleanup; a throw has an unknown outcome.
      this.#owners.set(solid, {
        state: 'UNCERTAIN',
        resource,
        itemIndex,
        ...(localId === undefined ? {} : { localId }),
      });
      try {
        solid[Symbol.dispose]();
        this.#owners.delete(solid);
      } catch (cause) {
        diagnostics.push(
          Object.freeze({
            operation,
            itemIndex,
            resourceKind: 'SHAPE',
            cause,
            ...(localId === undefined ? {} : { localId }),
          })
        );
      }
    }
    this.#cleanupDiagnostics.push(...diagnostics);
    return cleanupReport(diagnostics);
  }

  init(spec: ProjectSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    return this.#create('init', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      if (this.#projectId !== null) {
        return err(
          specError(
            'DUPLICATE_PROJECT',
            'BimModel.init() called twice — only one project per model'
          )
        );
      }
      // Prefer an explicit, globally-unique projectId; otherwise fall back to the
      // project name+description (stable, but unique only per distinct name).
      command.modelScope = snapshot.projectId ?? `${snapshot.name}::${snapshot.description ?? ''}`;
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const id = this.#makeElement(
        command,
        { category: 'PROJECT', spec: snapshot, geometry: null },
        identity?.stableKey
      );
      command.projectId = id;
      return ok(id);
    });
  }

  [Symbol.dispose](): void {
    if (this.#phase === 'DISPOSED' || this.#phase === 'DISPOSING') return;
    this.#assertMutable();
    this.#phase = 'DISPOSING';
    try {
      const retained: OwnedGeometry[] = [];
      for (const [solid, owner] of this.#owners) {
        if (owner.state === 'RETAINED')
          retained.push({
            solid,
            resource: owner.resource,
            localId: owner.localId,
            itemIndex: owner.itemIndex,
          });
      }
      const cleanup = this.#retire(retained, 'disposeModel');
      if (cleanup.kind === 'FAILED') {
        throw new AggregateError(
          cleanup.diagnostics.map(({ cause }) => cause),
          'Model geometry cleanup failed'
        );
      }
    } finally {
      this.#phase = 'DISPOSED';
    }
  }

  addSite(spec: SiteSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addSite', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      return ok(
        this.#makeElement(
          command,
          { category: 'SITE', spec: snapshot, geometry: null },
          identity?.stableKey
        )
      );
    });
  }

  addBridge(spec: BridgeSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addBridge', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      return ok(
        this.#makeElement(
          command,
          { category: 'BRIDGE', spec: snapshot, geometry: null },
          identity?.stableKey
        )
      );
    });
  }

  addBridgePart(spec: BridgePartSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addBridgePart', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      return ok(
        this.#makeElement(
          command,
          { category: 'BRIDGE_PART', spec: snapshot, geometry: null },
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
  ): Result<LocalId, BimError> {
    return this.#create('addEarthworksFill', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      if (snapshot.solid === null || snapshot.solid === undefined) {
        return err(
          specError('EARTHWORKS_FILL_NO_GEOMETRY', 'EarthworksFillSpec.solid is required')
        );
      }
      const id = this.#makeElement(
        command,
        { category: 'EARTHWORKS_FILL', spec: snapshot, geometry: snapshot.solid },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      return ok(id);
    });
  }

  addBuilding(spec: BuildingSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addBuilding', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      return ok(
        this.#makeElement(
          command,
          { category: 'BUILDING', spec: snapshot, geometry: null },
          identity?.stableKey
        )
      );
    });
  }

  addStorey(spec: StoreySpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addStorey', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      return ok(
        this.#makeElement(
          command,
          { category: 'STOREY', spec: snapshot, geometry: null },
          identity?.stableKey
        )
      );
    });
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
    return this.#create('addWall', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const geomResult = wallToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#ownGenerated(command, [geomResult.value]);
      const id = this.#makeElement(
        command,
        {
          category: 'WALL',
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

  addSlab(spec: SlabSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addSlab', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const geomResult = slabToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#ownGenerated(command, [geomResult.value]);
      const id = this.#makeElement(
        command,
        { category: 'SLAB', spec: snapshot, geometry: geomResult.value },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  addBeam(spec: BeamSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addBeam', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const geomResult = beamToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#ownGenerated(command, [geomResult.value]);
      const id = this.#makeElement(
        command,
        { category: 'BEAM', spec: snapshot, geometry: geomResult.value },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  addColumn(spec: ColumnSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addColumn', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const geomResult = columnToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#ownGenerated(command, [geomResult.value]);
      const id = this.#makeElement(
        command,
        { category: 'COLUMN', spec: snapshot, geometry: geomResult.value },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  addSpace(spec: SpaceSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addSpace', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const geomResult = spaceToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#ownGenerated(command, [geomResult.value]);
      const id = this.#makeElement(
        command,
        { category: 'SPACE', spec: snapshot, geometry: geomResult.value },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  addRoof(spec: RoofSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addRoof', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const geomResult = roofToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#ownGenerated(command, [geomResult.value]);
      const id = this.#makeElement(
        command,
        { category: 'ROOF', spec: snapshot, geometry: geomResult.value },
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
  ): Result<LocalId, BimError> {
    return this.#create('addCurtainWall', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const gridResult = curtainWallToGrid(snapshot);
      if (!gridResult.ok) return err(gridResult.error);
      this.#ownGenerated(
        command,
        [...gridResult.value.panels, ...gridResult.value.mullions].map(({ solid }) => solid)
      );
      const id = this.#makeElement(
        command,
        { category: 'CURTAIN_WALL', spec: snapshot, geometry: gridResult.value },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  addFooting(spec: FootingSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addFooting', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const geomResult = footingToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#ownGenerated(command, [geomResult.value]);
      const id = this.#makeElement(
        command,
        { category: 'FOOTING', spec: snapshot, geometry: geomResult.value },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  addPile(spec: PileSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addPile', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const geomResult = pileToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#ownGenerated(command, [geomResult.value]);
      const id = this.#makeElement(
        command,
        { category: 'PILE', spec: snapshot, geometry: geomResult.value },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  /**
   * Adds an IfcStair assembly. Geometry for each flight is built and written by
   * the IFC layer from `spec.flights`; the STAIR element itself carries no solid
   * (the assembly container's Representation is null, valid per IFC4).
   */
  addStair(spec: StairSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addStair', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const id = this.#makeElement(
        command,
        { category: 'STAIR', spec: snapshot, geometry: null },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  /**
   * Adds an IfcRamp assembly. Geometry for each flight is built and written by the
   * IFC layer from `spec.flights`; the RAMP element carries no solid of its own.
   */
  addRamp(spec: RampSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addRamp', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const id = this.#makeElement(
        command,
        { category: 'RAMP', spec: snapshot, geometry: null },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      return ok(id);
    });
  }

  addRailing(spec: RailingSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addRailing', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const geomResult = railingToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#ownGenerated(command, [geomResult.value]);
      const id = this.#makeElement(
        command,
        {
          category: 'RAILING',
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

  /** Ownership transfers only on COMMITTED, including when retirement reports failure. */
  replaceProductBody(input: {
    readonly localId: LocalId;
    readonly body: ProductBody;
  }): Result<BodyCommitReceipt, BimError> {
    const result = this.#mutate('replaceProductBody', (command) => {
      const { localId } = input;
      const target = this.#elements.get(localId);
      if (target === undefined) {
        return err(specError('BODY_TARGET_NOT_FOUND', `No element found for localId ${localId}`));
      }
      if (target.category !== 'WALL' && target.category !== 'RAILING') {
        return err(
          specError('BODY_UNSUPPORTED_CATEGORY', `Cannot replace a ${target.category} Product Body`)
        );
      }
      const captured = snapshotProductBodyInput(input.body);
      if (!captured.ok) return captured;
      for (const [itemIndex, solid] of captured.value.solids.entries())
        this.#requireUnowned(command, solid, itemIndex);
      const prepared = validateProductBody(captured.value);
      if (!prepared.ok) return prepared;
      if (target.geometry.kind === 'AUTHORITATIVE' && prepared.value.kind === 'PARAMETRIC') {
        return err(
          specError(
            'BODY_AUTHORITY_TRANSITION',
            'An authored Body cannot revert to recipe authority'
          )
        );
      }
      this.#stageElement(command, Object.freeze({ ...target, geometry: prepared.value }));
      command.retired.push(...this.#prepareRetirement(target));
      command.recipeEligibility.set(localId, false);
      return ok({ localId, guid: target.guid });
    });
    return result.ok
      ? ok(
          Object.freeze({ kind: 'COMMITTED', ...result.value.value, cleanup: result.value.cleanup })
        )
      : result;
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
    return this.#create('addCovering', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const geomResult = coveringToSolid(snapshot);
      if (!geomResult.ok) return err(geomResult.error);
      this.#ownGenerated(command, [geomResult.value]);
      const id = this.#makeElement(
        command,
        { category: 'COVERING', spec: snapshot, geometry: geomResult.value },
        identity?.stableKey
      );
      this.#associateMaterial(command, id, snapshot);
      this.#associateClassification(command, id, snapshot);
      if (hostLocalId !== undefined) {
        this.#makeRel(
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
    options?: ElementIdentityOptions
  ): Result<LocalId, BimError> {
    return this.#create('addElementAssembly', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      return ok(
        this.#makeElement(
          command,
          { category: 'ELEMENT_ASSEMBLY', spec: snapshot, geometry: null },
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
  addZone(spec: ZoneSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addZone', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      return ok(
        this.#makeElement(
          command,
          { category: 'ZONE', spec: snapshot, geometry: null },
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
  addSystem(spec: SystemSpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addSystem', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      return ok(
        this.#makeElement(
          command,
          { category: 'SYSTEM', spec: snapshot, geometry: null },
          identity?.stableKey
        )
      );
    });
  }

  /**
   * Assigns members to a zone or system via IfcRelAssignsToGroup. Repeated calls
   * for the same group extend the single relationship in call order. Returns the
   * relationship's localId.
   */
  assignToGroup(groupId: LocalId, memberIds: readonly LocalId[]): LocalId {
    this.#assertMutable();
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
    return this.#makeRel({
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
    this.#assertMutable();
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
      this.#makeRel({
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
    this.#assertMutable();
    return this.#makeRel({
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
    this.#assertMutable();
    return this.#makeRel({
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
    this.#assertMutable();
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
    this.#assertMutable();
    return this.#makeRel({
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
    this.#assertMutable();
    return this.#makeRel({
      kind: 'ASSOCIATES_CLASSIFICATION',
      ref,
      relatedObjects: [...elementLocalIds],
    });
  }

  #associateMaterial(
    command: ModelCommand,
    id: LocalId,
    spec: {
      readonly materialName: string;
      readonly materialLayers?: readonly MaterialLayer[] | undefined;
      readonly layerSetName?: string | undefined;
    }
  ): void {
    const hasLayers = spec.materialLayers !== undefined && spec.materialLayers.length > 0;
    this.#makeRel(
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
    id: LocalId,
    spec: { readonly classification?: ClassificationRef | undefined }
  ): void {
    if (spec.classification === undefined) return;
    this.#makeRel(
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
  addProxy(spec: ProxySpec, options?: ElementIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addProxy', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      if (snapshot.solid === null || snapshot.solid === undefined) {
        return err(specError('PROXY_NO_GEOMETRY', 'ProxySpec.solid is required'));
      }
      const id = this.#makeElement(
        command,
        { category: 'PROXY', spec: snapshot, geometry: snapshot.solid },
        identity?.stableKey
      );
      if (snapshot.materialName !== undefined) {
        this.#makeRel(
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

  addDoor(spec: DoorSpec, options?: OpeningIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addDoor', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const wall = this.#elements.get(snapshot.wallLocalId);
      if (wall === undefined || wall.category !== 'WALL') {
        return err(
          specError('DOOR_WALL_NOT_FOUND', `No wall found for localId ${snapshot.wallLocalId}`)
        );
      }
      const host = wallOpeningSolid(wall.geometry);
      if (!host.ok) return host;
      const keyCheck = this.#checkOpeningKeys(identity);
      if (!keyCheck.ok) return keyCheck;
      if (snapshot.offsetAlongWall + snapshot.width > wall.spec.length) {
        return err(
          specError(
            'DOOR_EXCEEDS_WALL_BOUNDS',
            'Door (offsetAlongWall + width) exceeds wall length'
          )
        );
      }
      if (snapshot.offsetFromFloor + snapshot.height > wall.spec.height) {
        return err(
          specError(
            'DOOR_EXCEEDS_WALL_BOUNDS',
            'Door (offsetFromFloor + height) exceeds wall height'
          )
        );
      }
      const openingSpec: WallOpeningSpec = {
        kind: 'WALL_OPENING',
        width: snapshot.width,
        height: snapshot.height,
        offsetAlongWall: snapshot.offsetAlongWall,
        offsetFromFloor: snapshot.offsetFromFloor,
      };

      const cutResult = cutOpeningSolid({
        host: host.value,
        makeTool: () => openingToSolid(openingSpec, wall.spec.thickness),
        hostKind: 'WALL',
      });
      if (!cutResult.ok) return err(cutResult.error);
      this.#replaceWallGeometry(command, wall, cutResult.value);

      const openingId = this.#makeElement(
        command,
        { category: 'OPENING', spec: openingSpec, geometry: null },
        identity?.openingStableKey
      );
      this.#makeRel(
        {
          kind: 'VOIDS_WALL',
          wallLocalId: snapshot.wallLocalId,
          openingLocalId: openingId,
        },
        command
      );
      const doorId = this.#makeElement(
        command,
        { category: 'DOOR', spec: snapshot, geometry: null },
        identity?.stableKey
      );
      this.#makeRel(
        {
          kind: 'FILLS_OPENING',
          openingLocalId: openingId,
          fillerLocalId: doorId,
        },
        command
      );
      this.#makeRel(
        {
          kind: 'ASSOCIATES_MATERIAL',
          materialName: snapshot.materialName,
          relatedObjects: [doorId],
        },
        command
      );
      return ok(doorId);
    });
  }

  addWindow(spec: WindowSpec, options?: OpeningIdentityOptions): Result<LocalId, BimError> {
    return this.#create('addWindow', (command) => {
      const snapshot = Object.freeze({ ...spec });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const wall = this.#elements.get(snapshot.wallLocalId);
      if (wall === undefined || wall.category !== 'WALL') {
        return err(
          specError('WINDOW_WALL_NOT_FOUND', `No wall found for localId ${snapshot.wallLocalId}`)
        );
      }
      const host = wallOpeningSolid(wall.geometry);
      if (!host.ok) return host;
      const keyCheck = this.#checkOpeningKeys(identity);
      if (!keyCheck.ok) return keyCheck;
      if (snapshot.offsetAlongWall + snapshot.width > wall.spec.length) {
        return err(
          specError(
            'WINDOW_EXCEEDS_WALL_BOUNDS',
            'Window (offsetAlongWall + width) exceeds wall length'
          )
        );
      }
      if (snapshot.offsetFromFloor + snapshot.height > wall.spec.height) {
        return err(
          specError(
            'WINDOW_EXCEEDS_WALL_BOUNDS',
            'Window (offsetFromFloor + height) exceeds wall height'
          )
        );
      }
      const openingSpec: WallOpeningSpec = {
        kind: 'WALL_OPENING',
        width: snapshot.width,
        height: snapshot.height,
        offsetAlongWall: snapshot.offsetAlongWall,
        offsetFromFloor: snapshot.offsetFromFloor,
      };

      const cutResult = cutOpeningSolid({
        host: host.value,
        makeTool: () => openingToSolid(openingSpec, wall.spec.thickness),
        hostKind: 'WALL',
      });
      if (!cutResult.ok) return err(cutResult.error);
      this.#replaceWallGeometry(command, wall, cutResult.value);

      const openingId = this.#makeElement(
        command,
        { category: 'OPENING', spec: openingSpec, geometry: null },
        identity?.openingStableKey
      );
      this.#makeRel(
        {
          kind: 'VOIDS_WALL',
          wallLocalId: snapshot.wallLocalId,
          openingLocalId: openingId,
        },
        command
      );
      const windowId = this.#makeElement(
        command,
        { category: 'WINDOW', spec: snapshot, geometry: null },
        identity?.stableKey
      );
      this.#makeRel(
        {
          kind: 'FILLS_OPENING',
          openingLocalId: openingId,
          fillerLocalId: windowId,
        },
        command
      );
      this.#makeRel(
        {
          kind: 'ASSOCIATES_MATERIAL',
          materialName: snapshot.materialName,
          relatedObjects: [windowId],
        },
        command
      );
      return ok(windowId);
    });
  }

  addSlabOpening(
    input: SlabOpeningInput,
    options?: ElementIdentityOptions
  ): Result<LocalId, BimError> {
    return this.#create('addSlabOpening', (command) => {
      const snapshot = Object.freeze({ ...input });
      const identity = options === undefined ? undefined : Object.freeze({ ...options });
      const keyCheck = this.#checkStableKey(identity);
      if (!keyCheck.ok) return keyCheck;
      const slab = this.#elements.get(snapshot.slabLocalId);
      if (slab === undefined || slab.category !== 'SLAB') {
        return err(
          specError(
            'SLAB_OPENING_SLAB_NOT_FOUND',
            `No slab found for localId ${snapshot.slabLocalId}`
          )
        );
      }
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
      for (const rel of this.#relationships.values()) {
        if (rel.kind !== 'VOIDS_SLAB' || rel.slabLocalId !== snapshot.slabLocalId) continue;
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
        sizeX: snapshot.sizeX,
        sizeY: snapshot.sizeY,
        offsetX: snapshot.offsetX,
        offsetY: snapshot.offsetY,
      };

      const cutResult = cutOpeningSolid({
        host: slab.geometry,
        makeTool: () => slabOpeningToSolid(openingSpec, slab.spec.thickness),
        hostKind: 'SLAB',
      });
      if (!cutResult.ok) return err(cutResult.error);
      this.#replaceSlabGeometry(command, slab, cutResult.value);

      const openingId = this.#makeElement(
        command,
        { category: 'OPENING', spec: openingSpec, geometry: null },
        identity?.stableKey
      );
      this.#makeRel(
        {
          kind: 'VOIDS_SLAB',
          slabLocalId: snapshot.slabLocalId,
          openingLocalId: openingId,
        },
        command
      );
      return ok(openingId);
    });
  }

  #replaceWallGeometry(
    command: ModelCommand,
    wall: BimElement<'WALL'>,
    newGeometry: ValidSolid
  ): void {
    this.#ownGenerated(command, [newGeometry]);
    const prepared = protectElement({
      ...wall,
      geometry: { kind: 'PARAMETRIC', solids: [newGeometry] },
    });
    if (!prepared.ok) throw new RejectedModelCommand(prepared.error);
    this.#stageElement(command, prepared.value);
    command.retired.push(...this.#prepareRetirement(wall));
    // Opening edits preserve the existing recipe eligibility, never restore it.
  }

  #replaceSlabGeometry(
    command: ModelCommand,
    slab: BimElement<'SLAB'>,
    newGeometry: ValidSolid
  ): void {
    this.#ownGenerated(command, [newGeometry]);
    const prepared = protectElement({ ...slab, geometry: newGeometry });
    if (!prepared.ok) throw new RejectedModelCommand(prepared.error);
    this.#stageElement(command, prepared.value);
    command.retired.push(...this.#prepareRetirement(slab));
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
    this.#assertMutable();
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
      this.#makeRel({
        kind: 'AGGREGATES',
        relatingObject: parentId,
        relatedObjects: [childId],
      });
    }
  }

  placeIn(elementId: LocalId, containerId: LocalId): void {
    this.#assertMutable();
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
      this.#makeRel({
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

  /** Whether recipe commands still justify this element's recipe-derived quantities. */
  isRecipeQuantityEligible(id: LocalId): boolean {
    return this.#recipeQuantityEligible.has(id);
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

  #makeElement(command: ModelCommand, fields: ElementFields, stableKey?: string): LocalId {
    if (
      stableKey !== undefined &&
      (this.#usedStableKeys.has(stableKey) || command.stableKeys.has(stableKey))
    ) {
      throw new RejectedModelCommand(
        specError('DUPLICATE_STABLE_KEY', `BimModel: duplicate stableKey '${stableKey}'`)
      );
    }
    if (fields.category === 'PROXY' || fields.category === 'EARTHWORKS_FILL') {
      this.#requireUnowned(command, fields.geometry, 0);
    }
    const localId = command.counter.next();
    const guid = deriveIfcGuidSync(
      stableKey !== undefined
        ? `elem:${command.modelScope}:${stableKey}`
        : makeElementKey(command.modelScope, fields.category, localId)
    );
    const prepared = protectElement({ ...fields, guid, localId });
    if (!prepared.ok) throw new RejectedModelCommand(prepared.error);
    this.#stageElement(command, prepared.value);
    if (stableKey !== undefined) command.stableKeys.add(stableKey);
    command.recipeEligibility.set(localId, true);
    return localId;
  }

  #makeRel(fields: RelationshipFields, command?: ModelCommand): LocalId {
    if (command === undefined) this.#assertMutable();
    const localId = (command?.counter ?? this.#counter).next();
    const guid = deriveIfcGuidSync(
      makeRelKey(command?.modelScope ?? this.#modelScope, fields.kind, localId)
    );
    const rel = Object.freeze({ ...fields, guid, localId });
    if (command === undefined) this.#relationships.set(localId, rel);
    else command.relationships.push(rel);
    return localId;
  }
}
