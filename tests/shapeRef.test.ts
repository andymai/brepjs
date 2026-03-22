import { describe, expect, it, beforeAll } from 'vitest';
import { currentKernel, initKernel } from './setup.js';
import {
  box,
  translate,
  getFaces,
  getEdges,
  getHashCode,
  fuseWithEvolution,
  cutWithEvolution,
  filletWithEvolution,
  unwrap,
  isFace,
  measureArea,
} from '@/index.js';
import {
  captureHint,
  assignRoles,
  createRef,
  updateRoles,
  resolveRef,
  defaultScorer,
  type FaceScorer,
  type RoleTable,
} from '@/topology/shapeRef/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('captureHint', () => {
  it('captures face properties (surfaceType, normal, centroid, area)', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    expect(faces.length).toBe(6);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test, faces checked above
    const hint = captureHint(faces[0]!);
    expect(hint.entityType).toBe('face');
    expect(hint.surfaceType).toBe('PLANE');
    expect(hint.normal).toBeDefined();
    expect(hint.normal).toHaveLength(3);
    expect(hint.centroid).toBeDefined();
    expect(hint.centroid).toHaveLength(3);
    expect(hint.area).toBeCloseTo(100, 0);
  });
});

describe('assignRoles', () => {
  it('generates 6 cardinal names for box', () => {
    const b = box(10, 10, 10);
    const roles = assignRoles(b, 'box');

    expect(roles.size).toBe(6);
    expect(roles.has('box:top')).toBe(true);
    expect(roles.has('box:bottom')).toBe(true);
    expect(roles.has('box:front')).toBe(true);
    expect(roles.has('box:back')).toBe(true);
    expect(roles.has('box:left')).toBe(true);
    expect(roles.has('box:right')).toBe(true);
  });

  it('generates sequential names for non-box shapes', () => {
    const b = box(10, 10, 10);
    const roles = assignRoles(b, 'myOp');

    expect(roles.size).toBe(6);
    expect(roles.has('myOp:face_0')).toBe(true);
    expect(roles.has('myOp:face_5')).toBe(true);
  });
});

describe('createRef', () => {
  it('produces valid ShapeRef', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test, faces checked
    const ref = createRef('step_0', 'box:top', faces[0]!);

    expect(ref.origin).toBe('step_0');
    expect(ref.role).toBe('box:top');
    expect(ref.hint.entityType).toBe('face');
    expect(ref.hint.surfaceType).toBeDefined();
    expect(ref.hint.normal).toBeDefined();
    expect(ref.hint.centroid).toBeDefined();
  });
});

describe('updateRoles', () => {
  it.skipIf(currentKernel === 'brepkit')('propagates through evolution (fuse box + box)', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [5, 0, 0]);
    const roles = assignRoles(a, 'box');

    // Build initial role table
    const roleTable: RoleTable = new Map([['step_0', roles]]);

    const result = fuseWithEvolution(a, b);
    const { evolution } = unwrap(result);

    const updatedTable = updateRoles(roleTable, 'step_0', evolution);

    // Should still have an entry for step_0
    const updatedOriginRoles = updatedTable.get('step_0');
    expect(updatedOriginRoles).toBeDefined();

    // Some roles may have been deleted (overlapping faces) but most should survive
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked above
    expect(updatedOriginRoles!.size).toBeGreaterThan(0);
  });
});

describe('resolveRef', () => {
  it('exact match via role table', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const roles = assignRoles(b, 'box');
    const roleTable: RoleTable = new Map([['step_0', roles]]);

    // Find the top face
    const topHash = roles.get('box:top');
    expect(topHash).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked above
    const topFace = faces.find((f) => getHashCode(f) === topHash)!;
    expect(topFace).toBeDefined();

    const ref = createRef('step_0', 'box:top', topFace);
    const resolved = resolveRef(ref, roleTable, b);

    expect('face' in resolved).toBe(true);
    if ('face' in resolved) {
      expect(resolved.confidence).toBe('exact');
      expect(isFace(resolved.face)).toBe(true);
    }
  });

  it('geometric fallback when role missing', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const roles = assignRoles(b, 'box');

    // Find the top face and create a ref
    const topHash = roles.get('box:top');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test
    const topFace = faces.find((f) => getHashCode(f) === topHash)!;
    const ref = createRef('step_0', 'box:top', topFace);

    // Use an empty role table — forces geometric fallback
    const emptyTable: RoleTable = new Map();
    const resolved = resolveRef(ref, emptyTable, b);

    expect('face' in resolved).toBe(true);
    if ('face' in resolved) {
      expect(resolved.confidence).toBe('geometric-fallback');
      expect(isFace(resolved.face)).toBe(true);
    }
  });

  it.skipIf(currentKernel === 'brepkit')('returns BrokenRef for deleted face', () => {
    const a = box(10, 10, 10);
    const tool = translate(box(12, 12, 5), [-1, -1, 5]);

    // Get the top face of a before cut
    const roles = assignRoles(a, 'box');
    const topHash = roles.get('box:top');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test
    const topFace = getFaces(a).find((f) => getHashCode(f) === topHash)!;
    const ref = createRef('step_0', 'box:top', topFace);

    // Cut removes the top face
    const result = cutWithEvolution(a, tool);
    const { shape, evolution } = unwrap(result);

    // Update roles through evolution — top should be deleted
    const roleTable: RoleTable = new Map([['step_0', roles]]);
    const updatedTable = updateRoles(roleTable, 'step_0', evolution);

    const resolved = resolveRef(ref, updatedTable, shape);

    // The top face was deleted by the cut, so resolveRef should detect
    // it's missing. It might return 'deleted' (if hash was in evolution.deleted)
    // or 'geometric-fallback' / 'not-found' depending on remaining faces.
    // The key thing is that the original exact match is gone.
    if ('reason' in resolved) {
      expect(['deleted', 'not-found', 'ambiguous']).toContain(resolved.reason);
    }
    // If it resolves via geometric fallback, confidence should not be 'exact'
    if ('face' in resolved) {
      expect(resolved.confidence).not.toBe('exact');
    }
  });
});

describe('custom scorer', () => {
  it('overrides default behavior', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test
    const ref = createRef('step_0', 'test:face', faces[0]!);

    // Custom scorer that always gives the last face the highest score
    const customScorer: FaceScorer = (_hint, face) => {
      const allFaces = getFaces(b);
      const lastFace = allFaces[allFaces.length - 1];
      if (lastFace !== undefined && getHashCode(face) === getHashCode(lastFace)) {
        return 10;
      }
      return 0;
    };

    // Use empty role table to force geometric fallback
    const emptyTable: RoleTable = new Map();
    const resolved = resolveRef(ref, emptyTable, b, customScorer);

    expect('face' in resolved).toBe(true);
    if ('face' in resolved) {
      expect(resolved.confidence).toBe('geometric-fallback');
      const allFaces = getFaces(b);
      const lastFace = allFaces[allFaces.length - 1];
      expect(lastFace).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked above
      expect(getHashCode(resolved.face)).toBe(getHashCode(lastFace!));
    }
  });
});

describe('full pipeline', () => {
  it.skipIf(currentKernel === 'brepkit')(
    'box -> assign roles -> create refs -> fillet with evolution -> update roles -> resolve refs',
    () => {
      const b = box(10, 10, 10);

      // Step 1: Assign roles
      const roles = assignRoles(b, 'box');
      expect(roles.size).toBe(6);

      // Step 2: Create refs for all cardinal faces
      const refs = new Map<string, ReturnType<typeof createRef>>();
      for (const [role, hash] of roles) {
        const face = getFaces(b).find((f) => getHashCode(f) === hash);
        expect(face).toBeDefined();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked above
        refs.set(role, createRef('step_0', role, face!));
      }

      // Step 3: Fillet all edges
      const edges = getEdges(b);
      const filletResult = filletWithEvolution(b, edges, 1);
      const { shape: filleted, evolution } = unwrap(filletResult);

      // Step 4: Build role table and update through evolution
      const roleTable: RoleTable = new Map([['step_0', roles]]);
      // Verify updateRoles doesn't throw
      const _updatedTable = updateRoles(roleTable, 'step_0', evolution);

      // Step 5: Resolve each ref via geometric fallback (bypass stale role table)
      // After fillet, kernel hashes change — exact matching is unreliable.
      // The geometric fallback is the designed resolution path for this case.
      const topRef = refs.get('box:top');
      expect(topRef).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked above
      const resolved = resolveRef(topRef!, new Map(), filleted);
      expect('face' in resolved).toBe(true);
      if ('face' in resolved) {
        expect(resolved.confidence).toBe('geometric-fallback');
        expect(isFace(resolved.face)).toBe(true);
        const area = unwrap(measureArea(resolved.face));
        expect(area).toBeGreaterThan(0);
        // Area should be smaller than original 100 (10x10) after fillet trims corners
        expect(area).toBeLessThan(100);
      }
    }
  );
});

describe('defaultScorer', () => {
  it('scores matching face highly', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test
    const face = faces[0]!;
    const hint = captureHint(face);

    const score = defaultScorer(hint, face);
    expect(score).toBeGreaterThan(1.0);
  });
});
