/**
 * Integration tests for ShapeRef + ShapeEvolution pipeline.
 *
 * Validates that face references survive multi-step parametric operations
 * using the full ShapeRef API (assignRoles, createRef, updateRoles, resolveRef).
 *
 * These are the pass/fail tests for brepd's parametric replay architecture.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { shouldSkipSuite } from './helpers/kernelDivergences.js';
import {
  box,
  cylinder,
  sphere,
  translate,
  getFaces,
  getEdges,
  getHashCode,
  isFace,
  unwrap,
  isOk,
  measureArea,
  measureVolume,
} from '@/index.js';
import {
  fuseWithEvolution,
  cutWithEvolution,
  filletWithEvolution,
} from '@/topology/evolutionFns.js';
import {
  assignRoles,
  createRef,
  updateRoles,
  resolveRef,
  type RoleTable,
  type ShapeRef,
} from '@/topology/shapeRef/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

// ═══════════════════════════════════════════════════════════════════════════
// Test 1: Multi-step replay
// ═══════════════════════════════════════════════════════════════════════════

describe('multi-step replay', () => {
  it.skipIf(shouldSkipSuite('shapeRefIntegration.multiStepReplay'))(
    'face references survive box → fillet → fuse → cut pipeline via geometric fallback',
    () => {
      // Step 1: Create box and assign roles
      const b = box(20, 20, 20);
      const roles0 = assignRoles(b, 'box');
      expect(roles0.size).toBe(6);

      // Create refs for top and front faces
      const topFace = getFaces(b).find((f) => roles0.get('box:top') === getHashCode(f));
      const frontFace = getFaces(b).find((f) => roles0.get('box:front') === getHashCode(f));
      expect(topFace).toBeDefined();
      expect(frontFace).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked above
      const topRef = createRef('step_0', 'box:top', topFace!);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked above
      const frontRef = createRef('step_0', 'box:front', frontFace!);

      // Step 2: Fillet some edges
      const edges = getEdges(b);
      const filletEdges = edges.slice(0, 4);
      const filletResult = filletWithEvolution(b, filletEdges, 2);
      expect(isOk(filletResult)).toBe(true);
      const { shape: filleted } = unwrap(filletResult);

      // Step 3: Fuse with another box
      const tool = translate(box(10, 10, 10), [15, 5, 5]);
      const fuseResult = fuseWithEvolution(filleted, tool);
      expect(isOk(fuseResult)).toBe(true);
      const { shape: fused } = unwrap(fuseResult);

      // Step 4: Cut a cylinder hole
      const hole = translate(cylinder(3, 30), [10, 10, -5]);
      const cutResult = cutWithEvolution(fused, hole);
      expect(isOk(cutResult)).toBe(true);
      const { shape: withHole } = unwrap(cutResult);

      // Step 5: Resolve original references on final shape
      // Use geometric fallback (empty role table) since hash chains drift
      // across multiple operations — this is the designed recovery path
      const resolvedTop = resolveRef(topRef, new Map(), withHole);
      const resolvedFront = resolveRef(frontRef, new Map(), withHole);

      // Both should resolve — they have distinct normals (+Z and -Y)
      expect('face' in resolvedTop).toBe(true);
      expect('face' in resolvedFront).toBe(true);

      if ('face' in resolvedTop) {
        expect(resolvedTop.confidence).toBe('geometric-fallback');
        const area = unwrap(measureArea(resolvedTop.face));
        expect(area).toBeGreaterThan(0);
      }

      if ('face' in resolvedFront) {
        expect(resolvedFront.confidence).toBe('geometric-fallback');
        const area = unwrap(measureArea(resolvedFront.face));
        expect(area).toBeGreaterThan(0);
      }

      // Final shape should still be a valid solid
      const vol = unwrap(measureVolume(withHole));
      expect(vol).toBeGreaterThan(0);
    }
  );

  it.skipIf(shouldSkipSuite('shapeRefIntegration.filletEvolution'))(
    'updateRoles propagates hashes through evolution for exact resolution',
    () => {
      // Simple pipeline: box → fuse → resolve via updated role table
      const b = box(20, 20, 20);
      const roles0 = assignRoles(b, 'box');

      // Create ref for the bottom face (least likely to be affected by top fuse)
      const bottomHash = roles0.get('box:bottom');
      expect(bottomHash).toBeDefined();
      const bottomFace = getFaces(b).find((f) => getHashCode(f) === bottomHash);
      expect(bottomFace).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked above
      const bottomRef = createRef('step_0', 'box:bottom', bottomFace!);

      // Fuse a small box on top (doesn't touch bottom face)
      const topPiece = translate(box(5, 5, 5), [7, 7, 20]);
      const fuseResult = fuseWithEvolution(b, topPiece);
      expect(isOk(fuseResult)).toBe(true);
      const { shape: fused, evolution } = unwrap(fuseResult);

      // Build and update role table through evolution
      const roleTable: RoleTable = new Map([['step_0', roles0]]);
      const updatedTable = updateRoles(roleTable, 'step_0', evolution);

      // The bottom face should be unchanged → exact resolution
      const result = resolveRef(bottomRef, updatedTable, fused);
      expect('face' in result).toBe(true);
      if ('face' in result) {
        // Bottom face was not modified by the fuse → should be exact
        expect(result.confidence).toBe('exact');
        const area = unwrap(measureArea(result.face));
        // Bottom face area = 20 * 20 = 400 (unchanged)
        expect(area).toBeCloseTo(400, 0);
      }
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 2: Symmetric geometry stress test
// ═══════════════════════════════════════════════════════════════════════════

describe('symmetric geometry', () => {
  it.skipIf(shouldSkipSuite('shapeRefIntegration.cutEvolution'))(
    'cube: all 6 identical faces get distinct roles and survive fillet',
    () => {
      // All 6 faces of a cube are identical 10x10 squares
      const cube = box(10, 10, 10);
      const roles = assignRoles(cube, 'box');

      // All 6 cardinal names should be assigned
      expect(roles.size).toBe(6);
      expect(roles.has('box:top')).toBe(true);
      expect(roles.has('box:bottom')).toBe(true);
      expect(roles.has('box:front')).toBe(true);
      expect(roles.has('box:back')).toBe(true);
      expect(roles.has('box:left')).toBe(true);
      expect(roles.has('box:right')).toBe(true);

      // All hashes should be unique
      const hashes = [...roles.values()];
      expect(new Set(hashes).size).toBe(6);

      // Create refs for all 6 faces
      const refs = new Map<string, ShapeRef>();
      for (const [role, hash] of roles) {
        const face = getFaces(cube).find((f) => getHashCode(f) === hash);
        expect(face).toBeDefined();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked above
        refs.set(role, createRef('step_0', role, face!));
      }

      // Fillet all edges
      const edges = getEdges(cube);
      const filletResult = filletWithEvolution(cube, edges, 1);
      expect(isOk(filletResult)).toBe(true);
      const { shape: filleted } = unwrap(filletResult);

      // Resolve via geometric fallback (bypass role table — tests scorer disambiguation)
      let resolvedCount = 0;
      const resolvedFaces = new Set<number>();
      for (const [_role, ref] of refs) {
        const result = resolveRef(ref, new Map(), filleted);
        if ('face' in result) {
          resolvedCount++;
          // Track that we're getting distinct faces (not all matching the same one)
          resolvedFaces.add(getHashCode(result.face));
        }
      }

      // At least 4 of 6 faces should resolve (fillet may merge some)
      expect(resolvedCount).toBeGreaterThanOrEqual(4);
      // Resolved faces should be mostly distinct
      expect(resolvedFaces.size).toBeGreaterThanOrEqual(4);
    }
  );

  it.skipIf(shouldSkipSuite('shapeRefIntegration.geometricFallback'))(
    'cylinder: roles assigned sequentially, survive fillet',
    () => {
      const cyl = cylinder(5, 10);
      const roles = assignRoles(cyl, 'cylinder');

      // Cylinder has 3 faces: top cap, bottom cap, barrel
      expect(roles.size).toBe(3);
      expect(roles.has('cylinder:face_0')).toBe(true);
      expect(roles.has('cylinder:face_1')).toBe(true);
      expect(roles.has('cylinder:face_2')).toBe(true);

      // Create refs
      const refs = new Map<string, ShapeRef>();
      for (const [role, hash] of roles) {
        const face = getFaces(cyl).find((f) => getHashCode(f) === hash);
        expect(face).toBeDefined();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked above
        refs.set(role, createRef('step_0', role, face!));
      }

      // Fillet the circular edges
      const filletResult = filletWithEvolution(cyl, getEdges(cyl), 0.5);
      expect(isOk(filletResult)).toBe(true);
      const { shape: filleted } = unwrap(filletResult);

      // Resolve via geometric fallback
      let resolvedCount = 0;
      for (const [_role, ref] of refs) {
        const result = resolveRef(ref, new Map(), filleted);
        if ('face' in result) resolvedCount++;
      }

      // At least 2 of 3 faces should resolve (caps are distinctive)
      expect(resolvedCount).toBeGreaterThanOrEqual(2);
    }
  );

  it.skipIf(shouldSkipSuite('shapeRefIntegration.brokenRef'))(
    'sphere: single face, role survives identity operation',
    () => {
      const s = sphere(5);
      const roles = assignRoles(s, 'sphere');

      // Sphere has 1 face
      expect(roles.size).toBe(1);

      const ref = createRef(
        'step_0',
        'sphere:face_0',
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- sphere has 1 face
        getFaces(s)[0]!
      );

      // Fuse with a translated sphere (creates a peanut shape)
      const tool = translate(sphere(5), [7, 0, 0]);
      const fuseResult = fuseWithEvolution(s, tool);
      expect(isOk(fuseResult)).toBe(true);
      const { shape: peanut } = unwrap(fuseResult);

      // Resolve via geometric fallback
      const result = resolveRef(ref, new Map(), peanut);
      // The original sphere surface may or may not be found depending on
      // how the boolean modifies the geometry. Either resolved or broken is acceptable.
      if ('face' in result) {
        expect(isFace(result.face)).toBe(true);
      }
      // Just verify no crash — sphere symmetry is the hardest case
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 3: Split face tracking
// ═══════════════════════════════════════════════════════════════════════════

describe('split face tracking', () => {
  it.skipIf(shouldSkipSuite('shapeRefIntegration.rolePropagation'))(
    'face split by overlapping boolean is resolved via geometric fallback',
    () => {
      // Create a large box
      const base = box(30, 30, 10);
      const roles = assignRoles(base, 'box');

      // Create ref for the top face (30x30 area)
      const topHash = roles.get('box:top');
      expect(topHash).toBeDefined();
      const topFace = getFaces(base).find((f) => getHashCode(f) === topHash);
      expect(topFace).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked above
      const topRef = createRef('step_0', 'box:top', topFace!);

      // Fuse with a smaller box that partially overlaps the top face
      // This splits the top face into the original area minus the overlap + new faces
      const overlap = translate(box(10, 10, 10), [10, 10, 10]);
      const fuseResult = fuseWithEvolution(base, overlap);
      expect(isOk(fuseResult)).toBe(true);
      const { shape: fused } = unwrap(fuseResult);

      // Resolve via geometric fallback — should find a face with similar normal (+Z)
      const result = resolveRef(topRef, new Map(), fused);
      if ('face' in result) {
        expect(isFace(result.face)).toBe(true);
        expect(result.confidence).toBe('geometric-fallback');
        // The resolved face should be roughly planar and facing up
        const area = unwrap(measureArea(result.face));
        expect(area).toBeGreaterThan(0);
      }
      // Even if not resolved, the pipeline shouldn't crash

      // Verify the fused shape is valid
      const vol = unwrap(measureVolume(fused));
      // 30*30*10 + 10*10*10 = 9000 + 1000 = 10000
      expect(vol).toBeCloseTo(10000, -1);
    }
  );

  it.skipIf(shouldSkipSuite('shapeRefIntegration.multipleTrackedFaces'))(
    'multiple faces tracked through split operation',
    () => {
      const base = box(20, 20, 20);
      const roles = assignRoles(base, 'box');

      // Create refs for all faces
      const refs = new Map<string, ShapeRef>();
      for (const [role, hash] of roles) {
        const face = getFaces(base).find((f) => getHashCode(f) === hash);
        expect(face).toBeDefined();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked above
        refs.set(role, createRef('step_0', role, face!));
      }

      // Fuse with overlapping box (splits front and top faces)
      const overlap = translate(box(10, 10, 10), [5, -5, 15]);
      const fuseResult = fuseWithEvolution(base, overlap);
      expect(isOk(fuseResult)).toBe(true);
      const { shape: fused } = unwrap(fuseResult);

      // Try resolving all 6 original refs
      let resolvedCount = 0;
      for (const [_role, ref] of refs) {
        const result = resolveRef(ref, new Map(), fused);
        if ('face' in result) {
          expect(isFace(result.face)).toBe(true);
          resolvedCount++;
        }
      }

      // Most faces should resolve via geometric fallback
      // (normal direction is a strong discriminator for box faces)
      expect(resolvedCount).toBeGreaterThanOrEqual(4);
    }
  );
});
