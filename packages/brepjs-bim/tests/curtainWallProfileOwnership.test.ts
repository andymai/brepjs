import { afterEach, beforeAll, expect, it, vi, type MockInstance } from 'vitest';
import * as brepjs from 'brepjs';
import { BimModel } from '../src/model/bimModel.js';
import type { CurtainWallSpec } from '../src/specs/curtainWallSpec.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { nativeShapeCount } from './helpers/nativeArena.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);
afterEach(() => vi.restoreAllMocks());

const CURTAIN: CurtainWallSpec = {
  width: 30,
  height: 40,
  columns: 3,
  rows: 4,
  panelThickness: 0.1,
  mullionWidth: 1,
  mullionDepth: 1,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Glass',
};

it('releases each curtain profile before creating the next component', () => {
  const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
  const polygon = brepjs.polygon;
  const profiles: brepjs.Face[] = [];
  const releases: MockInstance<() => void>[] = [];
  const liveBeforeNext: number[] = [];
  vi.spyOn(brepjs, 'polygon').mockImplementation((...args) => {
    liveBeforeNext.push(profiles.filter((profile) => !profile.disposed).length);
    const result = polygon(...args);
    if (result.ok) {
      profiles.push(result.value);
      releases.push(vi.spyOn(result.value, Symbol.dispose));
    }
    return result;
  });
  {
    using model = new BimModel();
    brepjs.unwrap(model.init({ name: 'Curtain profile lifetime' }));
    const localId = brepjs.unwrap(model.addCurtainWall(CURTAIN));
    const element = model.getElement(localId);
    if (element?.category !== 'CURTAIN_WALL') throw new Error('Expected curtain wall');
    const components = [...element.geometry.panels, ...element.geometry.mullions];
    expect(element.geometry.panels).toHaveLength(12);
    expect(element.geometry.mullions).toHaveLength(9);
    expect(profiles).toHaveLength(components.length);
    expect(liveBeforeNext).toEqual(components.map(() => 0));
    releases.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
    for (const component of components) {
      expect(brepjs.unwrap(brepjs.measureVolume(component.solid))).toBeGreaterThan(0);
    }
    if (baseline !== null) expect(nativeShapeCount()).toBe(baseline + components.length);
  }
  if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
});

it.each(['before', 'after'] as const)(
  'stops after a later profile release fails %s native cleanup and never retries it',
  (timing) => {
    const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    const model = new BimModel();
    brepjs.unwrap(model.init({ name: 'Curtain profile failure' }));
    const initialElements = model.getAllElements();
    const initialRelationships = model.getAllRelationships();
    const polygon = brepjs.polygon;
    const extrude = brepjs.extrude;
    const releases: MockInstance<() => void>[] = [];
    const outputReleases: MockInstance<() => void>[] = [];
    const cause = new Error(`Second profile release ${timing}`);
    let fixtureRelease: (() => void) | undefined;
    vi.spyOn(brepjs, 'polygon').mockImplementation((...args) => {
      const result = polygon(...args);
      if (result.ok) {
        const release = result.value[Symbol.dispose].bind(result.value);
        const attempt = vi.spyOn(result.value, Symbol.dispose);
        if (releases.length === 1) {
          fixtureRelease = release;
          attempt.mockImplementation(() => {
            if (timing === 'after') release();
            throw cause;
          });
        }
        releases.push(attempt);
      }
      return result;
    });
    vi.spyOn(brepjs, 'extrude').mockImplementation((...args) => {
      const result = extrude(...args);
      if (result.ok) outputReleases.push(vi.spyOn(result.value, Symbol.dispose));
      return result;
    });
    try {
      expect(model.addCurtainWall(CURTAIN)).toMatchObject({
        ok: false,
        error: {
          code: 'CURTAIN_WALL_CLEANUP_FAILED',
          metadata: {
            cleanup: {
              kind: 'FAILED',
              diagnostics: [{ operation: 'curtainWallToGrid', itemIndex: 1, cause }],
            },
          },
        },
      });
      expect(model.getGeometryCleanupDiagnostics()).toMatchObject([
        { operation: 'curtainWallToGrid', itemIndex: 1, cause },
      ]);
      expect(model.getAllElements()).toEqual(initialElements);
      expect(model.getAllRelationships()).toEqual(initialRelationships);
      expect(model.getCurtainWalls()).toEqual([]);
      model[Symbol.dispose]();
      model[Symbol.dispose]();
      expect(releases).toHaveLength(2);
      expect(outputReleases).toHaveLength(2);
      [...releases, ...outputReleases].forEach((release) =>
        expect(release).toHaveBeenCalledTimes(1)
      );
      if (baseline !== null)
        expect(nativeShapeCount()).toBe(baseline + (timing === 'before' ? 1 : 0));
    } finally {
      model[Symbol.dispose]();
      // The fixture knows whether release occurred; production must never retry it.
      if (timing === 'before') fixtureRelease?.();
    }
    if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
  }
);
