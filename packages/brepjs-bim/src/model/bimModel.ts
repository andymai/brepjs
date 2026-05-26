import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { IfcGuid } from '../identity/ifcGuid.js';
import { newIfcGuid } from '../identity/ifcGuid.js';
import type { LocalId } from '../identity/localId.js';
import { makeLocalIdCounter } from '../identity/localId.js';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type { AnyBimElement, BimElement } from '../types/bimTypes.js';
import type {
  BimRelationship,
  AggregatesRel,
  ContainedInRel,
  AssociatesMaterialRel,
} from '../types/relationships.js';
import type { WallSpec } from '../specs/wallSpec.js';
import type { ProjectSpec, SiteSpec, BuildingSpec, StoreySpec } from '../specs/spatialSpec.js';
import { wallToSolid } from '../elementFns/wallFns.js';

export class BimModel {
  readonly #elements = new Map<LocalId, AnyBimElement>();
  readonly #relationships = new Map<LocalId, BimRelationship>();
  readonly #counter = makeLocalIdCounter();
  #projectId: LocalId | null = null;

  init(spec: ProjectSpec): Result<LocalId, BimError> {
    if (this.#projectId !== null) {
      return err(specError('DUPLICATE_PROJECT', 'BimModel.init() called twice — only one project per model'));
    }
    const id = this.#makeElement('PROJECT', spec, null);
    this.#projectId = id;
    return ok(id);
  }

  [Symbol.dispose](): void {
    for (const el of this.#elements.values()) {
      if (el.category === 'WALL') {
        el.geometry[Symbol.dispose]();
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
    this.#makeRel<AssociatesMaterialRel>({
      kind: 'ASSOCIATES_MATERIAL',
      materialName: spec.materialName,
      relatedObjects: [id],
    });
    return ok(id);
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
    const guid: IfcGuid = newIfcGuid();
    const el = { guid, localId, category, spec, geometry } as AnyBimElement;
    this.#elements.set(localId, el);
    return localId;
  }

  #makeRel<R extends BimRelationship>(
    fields: Omit<R, 'guid' | 'localId'>
  ): LocalId {
    const localId = this.#counter.next();
    const guid: IfcGuid = newIfcGuid();
    const rel = { ...fields, guid, localId } as unknown as BimRelationship;
    this.#relationships.set(localId, rel);
    return localId;
  }
}
