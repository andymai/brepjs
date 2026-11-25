import { bodyClassifications,type BodyClassification } from '../types/bimTypes.js';
import {
capturePlacement,type PlacementDefinition
} from '../types/placementDefinition.js';
import type { Result,ValidSolid } from 'brepjs';
import { ok,err } from 'brepjs';
import type { IfcGuid } from '../identity/ifcGuid.js';
import { deriveIfcGuidSync,makeElementKey,makeRelKey } from '../identity/guidDerivation.js';
import type { RecordRef } from '../identity/recordRef.js';
import { recordCounter,ordinalOf } from '../identity/recordRef.js';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type {
AnyBimElement,
BimElement
} from '../types/bimTypes.js';
import type { BimTreeNode,BimTreeSummary } from './treeSummary.js';
import type {
BimRelationship,
AggregatesRel,
ContainedInRel,
NestsRel,
AssignsToGroupRel,
} from '../types/relationships.js';
import type { ClassificationRef } from '../types/classificationTypes.js';
import type { SurfaceStyleSpec } from '../ifc-writer/styleWriter.js';
import type { ProjectSpec } from '../specs/spatialSpec.js';
import {
snapshotBodyInput,
validateBody,
wrappedResourceObject,
type Body,
type NonEmpty,
} from '../types/body.js';
import {
cleanupReport,
type CleanupReport,
type GeometryCleanupDiagnostic,
} from '../bodyCleanup.js';
import { protectElement,retainedSolids,type ElementFields } from './modelGeometry.js';
import { reportedGeometryCleanup } from '../geometryCleanupDiagnostics.js';
import { uncertainGeneratedResources } from '../geometryGeneration.js';

export interface BodyCommitReceipt {
  readonly kind: 'COMMITTED';
  readonly localId: RecordRef;
  readonly guid: IfcGuid;
  readonly cleanup: CleanupReport;
}

interface OwnedGeometry {
  readonly solid: Disposable;
  readonly resource: object | undefined;
  readonly localId?: RecordRef;
  readonly itemIndex: number;
}

type GeometryOwner = { readonly resource: object | undefined } & (
  | { readonly state: 'RETIRING'; readonly localId?: RecordRef; readonly itemIndex: number }
  | { readonly state: 'RETAINED'; readonly localId: RecordRef; readonly itemIndex: number }
  | { readonly state: 'UNCERTAIN'; readonly localId?: RecordRef; readonly itemIndex: number }
);

/** Prepared writes for one synchronous command, discarded on rejection. */
export interface ModelCommand {
  readonly counter: ReturnType<typeof recordCounter>;
  modelScope: string;
  projectId: RecordRef | null;
  readonly elements: AnyBimElement[];
  readonly relationships: BimRelationship[];
  readonly stableKeys: Map<string, RecordRef>;
  readonly adoptions: Map<ValidSolid, Extract<GeometryOwner, { state: 'RETAINED' }>>;
  readonly generated: Map<ValidSolid, object | undefined>;
  readonly retired: OwnedGeometry[];
  readonly recipeEligibility: Map<RecordRef, boolean>;
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
  readonly solids?: NonEmpty<ValidSolid>;
}
export const prepareRecords = Symbol("prepareRecords");
export class BimDocument {
  readonly #elements = new Map<RecordRef, AnyBimElement>();
  readonly #relationships = new Map<RecordRef, BimRelationship>();
  readonly #surfaceStyles = new Map<RecordRef, SurfaceStyleSpec>();
  readonly #counter = recordCounter();
  #projectId: RecordRef | null = null;
  // Per-model scope mixed into every derived GlobalId so two distinct models do
  // not collide. Set from the project identity in init() before any element is
  // created; empty until init() runs.
  #modelScope = '';
  readonly #usedStableKeys = new Set<string>();
  readonly #keyIndex = new Map<string, RecordRef>();

  lookupKey(key: string): Result<RecordRef, BimError> {
    const ref = this.#keyIndex.get(key);
    return ref !== undefined && this.getElement(ref) !== null ? ok(ref) : err(specError('RECORD_NOT_FOUND', `No live record for key ${key}`));
  }

  record(ref: RecordRef): Result<AnyBimElement, BimError> {
    const record = this.getElement(ref);
    return record === null ? err(specError('RECORD_NOT_FOUND', 'Expected a live reference issued by this document')) : ok(record);
  }
  readonly #owners = new Map<Disposable, GeometryOwner>();
  readonly #cleanupDiagnostics: GeometryCleanupDiagnostic[] = [];
  readonly #recipeQuantityEligible = new Set<RecordRef>();
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
    action: (command: ModelCommand) => Result<RecordRef, BimError>
  ): Result<RecordRef, BimError> {
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
      counter: recordCounter(this.#counter.current() + 1),
      modelScope: this.#modelScope,
      projectId: this.#projectId,
      elements: [],
      relationships: [],
      stableKeys: new Map(),
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
      for (const [key, ref] of command.stableKeys) {
        this.#usedStableKeys.add(key);
        this.#keyIndex.set(key, ref);
      }
      for (const [id, eligible] of command.recipeEligibility) {
        if (eligible) this.#recipeQuantityEligible.add(id);
        else this.#recipeQuantityEligible.delete(id);
      }
      this.#counter.advanceTo(command.counter.current());
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

  init(spec: ProjectSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> {
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
        {
          category: 'PROJECT',
          representation: 'NONE',
          reason: 'SPATIAL',
          placement: null,
          spec: snapshot,
          geometry: null,
        },
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

  /** Reject a duplicate stableKey BEFORE any geometry is built, so the
   *  Result-returning adders never allocate a solid they cannot store. */
  #checkStableKey(options: ElementIdentityOptions | undefined): Result<void, BimError> {
    const key = options?.stableKey;
    if (key !== undefined && this.#usedStableKeys.has(key)) {
      return err(specError('DUPLICATE_STABLE_KEY', `BimModel: duplicate stableKey '${key}'`));
    }
    return ok(undefined);
  }

  addAuthoredBody(input: {
    readonly category: BodyClassification;
    readonly placement: PlacementDefinition;
    readonly solids: Extract<Body, { kind: 'AUTHORITATIVE' }>['solids'];
    readonly stableKey?: string;
    readonly metadata?: Readonly<{ name?: string; description?: string }>;
    readonly openingLocalId?: RecordRef;
  }): Result<RecordRef, BimError> {
    return this.#create('addAuthoredBody', (command) => {
      const { category, stableKey } = input;
      if (!bodyClassifications.includes(category)) {
        return err(specError('BODY_UNSUPPORTED_CATEGORY', 'Unsupported Body classification'));
      }
      if (input.openingLocalId !== undefined) {
        const valid = this.#checkFillTarget(category, input.openingLocalId);
        if (!valid.ok) return valid;
      }
      const placement = capturePlacement(input.placement, input.openingLocalId);
      if (!placement.ok) return placement;
      const id = this.#makeElement(
        command,
        {
          category,
          representation: 'BODY',
          spec: null,
          ...(input.metadata !== undefined
            ? { metadata: Object.freeze({ ...input.metadata }) }
            : {}),
          placement: placement.value,
          geometry: { kind: 'AUTHORITATIVE', solids: input.solids },
        },
        stableKey
      );
      if (input.openingLocalId !== undefined)
        this.#makeRel(
          { kind: 'FILLS_OPENING', openingLocalId: input.openingLocalId, fillerLocalId: id },
          command
        );
      command.recipeEligibility.set(id, false);
      return ok(id);
    });
  }

  /** Ownership transfers only on COMMITTED, including when retirement reports failure. */
  replaceBody(input: {
    readonly localId: RecordRef;
    readonly body: Body;
  }): Result<BodyCommitReceipt, BimError> {
    const result = this.#mutate('replaceBody', (command) => {
      const { localId } = input;
      const target = this.#elements.get(localId);
      if (target === undefined) {
        return err(specError('BODY_TARGET_NOT_FOUND', `No element found for localId ${localId}`));
      }
      if (target.representation !== 'BODY') {
        return err(
          specError('BODY_UNSUPPORTED_CATEGORY', `Cannot replace a ${target.category} Body`)
        );
      }
      const prepared = this.#prepareBody(command, input.body);
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
   * Assigns members to a zone or system via IfcRelAssignsToGroup. Repeated calls
   * for the same group extend the single relationship in call order. Returns the
   * relationship's localId.
   */
  assignToGroup(groupId: RecordRef, memberIds: readonly RecordRef[]): RecordRef {
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
  nest(parentId: RecordRef, childId: RecordRef): void {
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
    relatingElementLocalId: RecordRef,
    relatedElementLocalId: RecordRef,
    description?: string
  ): RecordRef {
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
    relatingElementLocalId: RecordRef,
    relatedElementLocalId: RecordRef,
    relatingConnectionType: 'ATSTART' | 'ATEND' | 'ATPATH' | 'NOTDEFINED',
    relatedConnectionType: 'ATSTART' | 'ATEND' | 'ATPATH' | 'NOTDEFINED',
    description?: string
  ): RecordRef {
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
  setSurfaceStyle(elementLocalId: RecordRef, style: SurfaceStyleSpec): void {
    this.#assertMutable();
    this.#surfaceStyles.set(elementLocalId, style);
  }

  getSurfaceStyle(elementLocalId: RecordRef): SurfaceStyleSpec | null {
    return this.#surfaceStyles.get(elementLocalId) ?? null;
  }

  /**
   * Records an IfcRelSpaceBoundary between a space and one of its bounding
   * building elements. Returns the relationship's localId.
   */
  addSpaceBoundary(
    spaceLocalId: RecordRef,
    elementLocalId: RecordRef,
    connectionType: 'PHYSICAL' | 'VIRTUAL' | 'NOTDEFINED' = 'PHYSICAL'
  ): RecordRef {
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
  addClassification(ref: ClassificationRef, elementLocalIds: readonly RecordRef[]): RecordRef {
    this.#assertMutable();
    return this.#makeRel({
      kind: 'ASSOCIATES_CLASSIFICATION',
      ref,
      relatedObjects: [...elementLocalIds],
    });
  }

  #checkFillTarget(category: BodyClassification, opening: RecordRef): Result<void, BimError> {
    if (category !== 'DOOR' && category !== 'WINDOW')
      return err(specError('INVALID_FILLER', 'Only Doors or Windows can fill an Opening'));
    const target = this.#elements.get(opening);
    if (target?.category !== 'OPENING')
      return err(specError('OPENING_NOT_FOUND', 'Expected a supported Opening'));
    if (
      [...this.#relationships.values()].some(
        (rel) => rel.kind === 'FILLS_OPENING' && rel.openingLocalId === opening
      )
    )
      return err(specError('OPENING_ALREADY_FILLED', 'Opening already has a filler'));
    return ok(undefined);
  }

  #replaceCutBody(
    command: ModelCommand,
    host: BimElement<'WALL'> | BimElement<'SLAB'>,
    newGeometry: ValidSolid
  ): void {
    this.#ownGenerated(command, [newGeometry]);
    const prepared = protectElement({
      ...host,
      geometry: { kind: 'PARAMETRIC', solids: [newGeometry] } satisfies Body,
    });
    if (!prepared.ok) throw new RejectedModelCommand(prepared.error);
    this.#stageElement(command, prepared.value);
    command.retired.push(...this.#prepareRetirement(host));
    // Opening edits preserve the existing recipe eligibility, never restore it.
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

  aggregate(parentId: RecordRef, childId: RecordRef): void {
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

  placeIn(elementId: RecordRef, containerId: RecordRef): void {
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

  getElement(id: RecordRef): AnyBimElement | null {
    return this.#phase === 'DISPOSED' ? null : this.#elements.get(id) ?? null;
  }

  /** Follow explicit decomposition only. Placement parenting is a separate relation. */
  getChildren(id: RecordRef): readonly AnyBimElement[] {
    const children = new Set<RecordRef>();
    for (const rel of this.#relationships.values()) {
      if ((rel.kind === 'AGGREGATES' || rel.kind === 'NESTS') && rel.relatingObject === id)
        for (const child of rel.relatedObjects) children.add(child);
    }
    return [...children].flatMap((child) => {
      const record = this.#elements.get(child);
      return record === undefined ? [] : [record];
    });
  }

  /** Whether recipe commands still justify this element's recipe-derived quantities. */
  isRecipeQuantityEligible(id: RecordRef): boolean {
    return this.#recipeQuantityEligible.has(id);
  }

  /**
   * A serializable summary of the model's structure, rooted at the project and
   * walking the IFC spatial hierarchy (AGGREGATES: project → site → building →
   * storey) plus the elements contained in each storey (placeIn). Useful for a
   * read-only tree view of the model across a worker boundary.
   */
  toTreeSummary(): BimTreeSummary {
    const aggregated = new Map<RecordRef, RecordRef[]>();
    const contained = new Map<RecordRef, RecordRef[]>();
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
      const name = el.spec !== null && 'name' in el.spec ? el.spec.name : el.metadata?.name;
      const base = typeof name === 'string' && name.length > 0 ? name : el.category;
      return el.category === 'STOREY' && typeof el.spec.elevation === 'number'
        ? `${base} (+${el.spec.elevation} mm)`
        : base;
    };

    // `seen` guards against a malformed relationship cycle re-entering a node.
    const seen = new Set<RecordRef>();
    const build = (id: RecordRef): BimTreeNode | null => {
      if (seen.has(id)) return null;
      seen.add(id);
      const el = this.#elements.get(id);
      if (el === undefined) return null;
      const childIds = [...(aggregated.get(id) ?? []), ...(contained.get(id) ?? [])];
      const children = childIds.map(build).filter((n): n is BimTreeNode => n !== null);
      return { id: el.guid, label: labelFor(el), category: el.category, children };
    };

    const root = this.#projectId !== null ? build(this.#projectId) : null;
    // Count the nodes actually in the tree, not this.#elements.size — the latter
    // includes internal OPENING elements (created by addDoorAndCutWall/addWindowAndCutWall) that have
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

  #prepareBody(command: ModelCommand, input: Body): Result<Body, BimError> {
    const captured = snapshotBodyInput(input);
    if (!captured.ok) return captured;
    for (const [itemIndex, solid] of captured.value.solids.entries())
      this.#requireUnowned(command, solid, itemIndex);
    return validateBody(captured.value);
  }

  #makeElement(command: ModelCommand, fields: ElementFields, stableKey?: string): RecordRef {
    if (
      stableKey !== undefined &&
      (this.#usedStableKeys.has(stableKey) || command.stableKeys.has(stableKey))
    ) {
      throw new RejectedModelCommand(
        specError('DUPLICATE_STABLE_KEY', `BimModel: duplicate stableKey '${stableKey}'`)
      );
    }
    const localId = command.counter.next();
    const guid = deriveIfcGuidSync(
      stableKey !== undefined
        ? `elem:${command.modelScope}:${stableKey}`
        : makeElementKey(command.modelScope, fields.category, ordinalOf(localId))
    );
    if (fields.representation === 'BODY') {
      const body = this.#prepareBody(command, fields.geometry);
      if (!body.ok) throw new RejectedModelCommand(body.error);
      this.#stageElement(
        command,
        Object.freeze({ ...fields, guid, localId, geometry: body.value })
      );
    } else {
      const prepared = protectElement({ ...fields, guid, localId });
      if (!prepared.ok) throw new RejectedModelCommand(prepared.error);
      this.#stageElement(command, prepared.value);
    }
    if (stableKey !== undefined) command.stableKeys.set(stableKey, localId);
    command.recipeEligibility.set(localId, true);
    return localId;
  }

  #makeRel(fields: RelationshipFields, command?: ModelCommand): RecordRef {
    if (command === undefined) this.#assertMutable();
    const localId = (command?.counter ?? this.#counter).next();
    const guid = deriveIfcGuidSync(
      makeRelKey(command?.modelScope ?? this.#modelScope, fields.kind, ordinalOf(localId))
    );
    const rel = Object.freeze({ ...fields, guid, localId });
    if (command === undefined) this.#relationships.set(localId, rel);
    else command.relationships.push(rel);
    return localId;
  }
  [prepareRecords]() { return { create: this.#create.bind(this), checkStableKey: this.#checkStableKey.bind(this), makeElement: this.#makeElement.bind(this), ownGenerated: this.#ownGenerated.bind(this), makeRel: this.#makeRel.bind(this), checkFillTarget: this.#checkFillTarget.bind(this), replaceCutBody: this.#replaceCutBody.bind(this), relationships: this.#relationships as ReadonlyMap<RecordRef, BimRelationship>, elements: this.#elements as ReadonlyMap<RecordRef, AnyBimElement> }; }
}
