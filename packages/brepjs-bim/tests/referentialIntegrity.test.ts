import { describe, it, expect } from 'vitest';
import type { AnyBimElement, BimCategory } from '../src/types/bimTypes.js';
import type {
  BimRelationship,
  ContainedInRel,
  AggregatesRel,
  VoidsWallRel,
  VoidsSlabRel,
  FillsOpeningRel,
} from '../src/types/relationships.js';
import type { LocalId } from '../src/identity/localId.js';
import type { IfcGuid } from '../src/identity/ifcGuid.js';
import { checkReferentialIntegrity } from '../src/validation/referentialIntegrity.js';
import { hasErrors, countBySeverity } from '../src/validation/severity.js';

const id = (n: number): LocalId => n as LocalId;
const guid = (s: string): IfcGuid => s as unknown as IfcGuid;

// Minimal element stub — the integrity checker only reads category + localId,
// never geometry, so casting through unknown keeps tests free of WASM init.
function elem(localId: number, category: BimCategory): AnyBimElement {
  return {
    guid: guid(`g-${localId}`),
    localId: id(localId),
    category,
    spec: {},
    geometry: null,
  } as unknown as AnyBimElement;
}

function containedIn(localId: number, structure: number, elements: number[]): ContainedInRel {
  return {
    kind: 'CONTAINED_IN',
    guid: guid(`rel-${localId}`),
    localId: id(localId),
    relatingStructure: id(structure),
    relatedElements: elements.map(id),
  };
}

function aggregates(localId: number, parent: number, children: number[]): AggregatesRel {
  return {
    kind: 'AGGREGATES',
    guid: guid(`rel-${localId}`),
    localId: id(localId),
    relatingObject: id(parent),
    relatedObjects: children.map(id),
  };
}

function voidsWall(localId: number, wall: number, opening: number): VoidsWallRel {
  return {
    kind: 'VOIDS_WALL',
    guid: guid(`rel-${localId}`),
    localId: id(localId),
    wallLocalId: id(wall),
    openingLocalId: id(opening),
  };
}

function voidsSlab(localId: number, slab: number, opening: number): VoidsSlabRel {
  return {
    kind: 'VOIDS_SLAB',
    guid: guid(`rel-${localId}`),
    localId: id(localId),
    slabLocalId: id(slab),
    openingLocalId: id(opening),
  };
}

function fillsOpening(localId: number, opening: number, filler: number): FillsOpeningRel {
  return {
    kind: 'FILLS_OPENING',
    guid: guid(`rel-${localId}`),
    localId: id(localId),
    openingLocalId: id(opening),
    fillerLocalId: id(filler),
  };
}

// A fully wired clean model: project→site→building→storey, one wall + slab
// each contained once, a wall opening filled by a door.
function cleanModel(): {
  elements: AnyBimElement[];
  relationships: BimRelationship[];
} {
  const elements: AnyBimElement[] = [
    elem(1, 'PROJECT'),
    elem(2, 'SITE'),
    elem(3, 'BUILDING'),
    elem(4, 'STOREY'),
    elem(5, 'WALL'),
    elem(6, 'SLAB'),
    elem(7, 'OPENING'),
    elem(8, 'DOOR'),
  ];
  const relationships: BimRelationship[] = [
    aggregates(100, 1, [2]),
    aggregates(101, 2, [3]),
    aggregates(102, 3, [4]),
    containedIn(103, 4, [5, 6, 8]),
    voidsWall(104, 5, 7),
    fillsOpening(105, 7, 8),
  ];
  return { elements, relationships };
}

describe('checkReferentialIntegrity', () => {
  describe('clean model', () => {
    it('produces no issues', () => {
      const { elements, relationships } = cleanModel();
      const report = checkReferentialIntegrity({ elements, relationships });
      expect(report.issues).toEqual([]);
      expect(hasErrors(report)).toBe(false);
    });
  });

  describe('orphaned elements', () => {
    it('flags a wall not contained in any spatial structure', () => {
      const { elements, relationships } = cleanModel();
      // Drop the wall (5) from the only containment rel.
      const broken = relationships.map((r) =>
        r.kind === 'CONTAINED_IN' ? containedIn(103, 4, [6, 8]) : r,
      );
      const report = checkReferentialIntegrity({ elements, relationships: broken });
      expect(hasErrors(report)).toBe(true);
      const orphan = report.issues.find((i) => i.code === 'ELEMENT_NOT_CONTAINED');
      expect(orphan).toBeDefined();
      expect(orphan?.severity).toBe('error');
      expect(orphan?.entity).toBe(5);
    });

    it('does not flag spatial structure elements as orphans', () => {
      const elements: AnyBimElement[] = [
        elem(1, 'PROJECT'),
        elem(2, 'SITE'),
        elem(3, 'BUILDING'),
        elem(4, 'STOREY'),
      ];
      // No CONTAINED_IN at all, but no physical elements either.
      const relationships: BimRelationship[] = [
        aggregates(100, 1, [2]),
        aggregates(101, 2, [3]),
        aggregates(102, 3, [4]),
      ];
      const report = checkReferentialIntegrity({ elements, relationships });
      expect(report.issues).toEqual([]);
    });
  });

  describe('duplicate containment', () => {
    it('flags an element contained in more than one structure', () => {
      const { elements, relationships } = cleanModel();
      // Wall 5 contained again by a second storey rel.
      const broken: BimRelationship[] = [...relationships, containedIn(106, 4, [5])];
      const report = checkReferentialIntegrity({ elements, relationships: broken });
      expect(hasErrors(report)).toBe(true);
      const dup = report.issues.find((i) => i.code === 'ELEMENT_DOUBLE_CONTAINED');
      expect(dup).toBeDefined();
      expect(dup?.severity).toBe('error');
      expect(dup?.entity).toBe(5);
    });
  });

  describe('voids/fills inconsistencies', () => {
    it('flags a VOIDS_WALL referencing a missing host wall', () => {
      const { elements, relationships } = cleanModel();
      // Opening 7 voids a nonexistent wall (99).
      const broken = relationships.map((r) =>
        r.kind === 'VOIDS_WALL' ? voidsWall(104, 99, 7) : r,
      );
      const report = checkReferentialIntegrity({ elements, relationships: broken });
      const issue = report.issues.find((i) => i.code === 'VOID_HOST_MISSING');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('error');
      expect(issue?.entity).toBe(99);
    });

    it('flags a VOIDS_SLAB referencing a missing host slab', () => {
      const elements: AnyBimElement[] = [elem(1, 'OPENING')];
      const relationships: BimRelationship[] = [voidsSlab(10, 42, 1)];
      const report = checkReferentialIntegrity({ elements, relationships });
      const issue = report.issues.find((i) => i.code === 'VOID_HOST_MISSING');
      expect(issue).toBeDefined();
      expect(issue?.entity).toBe(42);
    });

    it('flags a VOIDS rel referencing a missing opening', () => {
      const elements: AnyBimElement[] = [elem(1, 'WALL')];
      // Opening 88 does not exist as an element.
      const relationships: BimRelationship[] = [voidsWall(10, 1, 88)];
      const report = checkReferentialIntegrity({ elements, relationships });
      const issue = report.issues.find((i) => i.code === 'VOID_OPENING_MISSING');
      expect(issue).toBeDefined();
      expect(issue?.entity).toBe(88);
    });

    it('flags a FILLS_OPENING referencing a missing opening', () => {
      const elements: AnyBimElement[] = [elem(1, 'DOOR')];
      const relationships: BimRelationship[] = [fillsOpening(10, 77, 1)];
      const report = checkReferentialIntegrity({ elements, relationships });
      const issue = report.issues.find((i) => i.code === 'FILL_OPENING_MISSING');
      expect(issue).toBeDefined();
      expect(issue?.entity).toBe(77);
    });

    it('flags a FILLS_OPENING referencing a missing filler', () => {
      const elements: AnyBimElement[] = [elem(1, 'OPENING')];
      const relationships: BimRelationship[] = [fillsOpening(10, 1, 66)];
      const report = checkReferentialIntegrity({ elements, relationships });
      const issue = report.issues.find((i) => i.code === 'FILL_FILLER_MISSING');
      expect(issue).toBeDefined();
      expect(issue?.entity).toBe(66);
    });
  });

  describe('orphaned openings', () => {
    it('warns about an OPENING referenced by no VOIDS rel', () => {
      const { elements, relationships } = cleanModel();
      // Drop the VOIDS_WALL rel so opening 7 is orphaned. Keep the fill so the
      // opening is still referenced by FILLS (must NOT be treated as void-orphan
      // suppression — orphan is specifically "no VOIDS rel").
      const broken = relationships.filter((r) => r.kind !== 'VOIDS_WALL');
      const report = checkReferentialIntegrity({ elements, relationships: broken });
      const warn = report.issues.find((i) => i.code === 'ORPHANED_OPENING');
      expect(warn).toBeDefined();
      expect(warn?.severity).toBe('warning');
      expect(warn?.entity).toBe(7);
    });
  });

  describe('accepts a BimModel-like accessor object', () => {
    it('reads via getAllElements / getAllRelationships', () => {
      const { elements, relationships } = cleanModel();
      const modelLike = {
        getAllElements: () => elements,
        getAllRelationships: () => relationships,
      };
      const report = checkReferentialIntegrity(modelLike);
      expect(report.issues).toEqual([]);
    });
  });

  describe('combined breakage', () => {
    it('accumulates multiple distinct issues', () => {
      const elements: AnyBimElement[] = [
        elem(1, 'STOREY'),
        elem(2, 'WALL'), // orphan: never contained
        elem(3, 'OPENING'), // orphan opening: no VOIDS rel
      ];
      const relationships: BimRelationship[] = [
        voidsWall(10, 99, 3), // missing host wall 99
      ];
      const report = checkReferentialIntegrity({ elements, relationships });
      const counts = countBySeverity(report);
      expect(counts.error).toBeGreaterThanOrEqual(2); // orphan wall + missing host
      expect(counts.warning).toBeGreaterThanOrEqual(0);
      expect(report.issues.some((i) => i.code === 'ELEMENT_NOT_CONTAINED')).toBe(true);
      expect(report.issues.some((i) => i.code === 'VOID_HOST_MISSING')).toBe(true);
    });
  });
});
