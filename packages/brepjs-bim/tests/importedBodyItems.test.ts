import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getBounds, measureVolume } from 'brepjs';
import { initKernel } from '../../../tests/setup.js';
import { bodyFixture } from './helpers/importedBodyFixture.js';
import { fromIfc, setFromIfcTestHooksForTesting } from '../src/import/fromIfc.js';
import { setGeometryReadTestHooksForTesting } from '../src/import/geometryRead.js';
import { disposeImportedModel } from '../src/import/importedModel.js';
import { SpfReader } from '../src/import/spfReader.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);

afterEach(() => {
  setGeometryReadTestHooksForTesting(null);
  setFromIfcTestHooksForTesting(null);
});

describe('imported Body completeness and ownership', () => {
  it('measures occupied imported material once when retained items overlap', async () => {
    const imported = await fromIfc(await bodyFixture({ extrudedCubes: 2, overlappingCubes: true }));
    if (!imported.ok) throw new Error(imported.error.message);
    try {
      const wall = imported.value.elements.find((element) => element.category === 'WALL');
      expect(wall?.geometry.solids).toHaveLength(2);
      expect(wall?.geometry.volumeMm3).toBeCloseTo(1_000_000, 2);
      expect(wall?.geometry.bounds?.xMin).toBeCloseTo(1_000, 2);
      expect(wall?.geometry.bounds?.xMax).toBeCloseTo(1_100, 2);
      expect(wall?.geometry.solids.every((solid) => !solid.disposed)).toBe(true);
    } finally {
      disposeImportedModel(imported.value);
    }
  });

  it('keeps .solid as a borrowed alias for a COMPLETE one-solid Body', async () => {
    const imported = await fromIfc(await bodyFixture({ polygonalCubes: 1 }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    try {
      const wall = imported.value.elements.find((element) => element.category === 'WALL');
      expect(wall?.geometry.completeness).toBe('COMPLETE');
      expect(wall?.geometry.solids).toHaveLength(1);
      expect(wall?.geometry.solid).toBe(wall?.geometry.solids[0]);
      expect((wall?.geometry.volumeMm3 ?? 0) / 1_000_000).toBeCloseTo(1, 5);
    } finally {
      disposeImportedModel(imported.value);
    }
  });

  it('owns every item in a COMPLETE multi-item World-placed Body', async () => {
    const imported = await fromIfc(await bodyFixture({ polygonalCubes: 2 }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const disposals: number[] = [];
    try {
      const wall = imported.value.elements.find((element) => element.category === 'WALL');
      expect(wall?.geometry.completeness).toBe('COMPLETE');
      expect(wall?.geometry.solids).toHaveLength(2);
      expect(wall?.geometry.solid).toBeNull();
      const bounds = wall?.geometry.solids.map(getBounds) ?? [];
      expect(bounds[0]?.xMin).toBeCloseTo(1_000, 2);
      expect(bounds[0]?.yMin).toBeCloseTo(2_000, 2);
      expect(bounds[0]?.zMin).toBeCloseTo(3_000, 2);
      expect(bounds[1]?.xMin).toBeCloseTo(1_200, 2);
      expect((wall?.geometry.volumeMm3 ?? 0) / 1_125_000).toBeCloseTo(1, 5);
      expect(wall?.geometry.bounds?.xMin).toBeCloseTo(1_000, 2);
      expect(wall?.geometry.bounds?.xMax).toBeCloseTo(1_250, 2);
      expect(wall?.geometry.bounds?.yMin).toBeCloseTo(2_000, 2);
      expect(wall?.geometry.bounds?.yMax).toBeCloseTo(2_100, 2);
      expect(wall?.geometry.bounds?.zMin).toBeCloseTo(3_000, 2);
      expect(wall?.geometry.bounds?.zMax).toBeCloseTo(3_100, 2);

      disposals.push(...(wall?.geometry.solids.map(() => 0) ?? []));
      wall?.geometry.solids.forEach((solid, index) => {
        solid.onDispose(() => {
          disposals[index] = (disposals[index] ?? 0) + 1;
        });
      });
    } finally {
      disposeImportedModel(imported.value);
    }
    expect(disposals).toEqual([1, 1]);
  });

  it('cuts openings from every solid in a COMPLETE multi-item Body', async () => {
    const imported = await fromIfc(await bodyFixture({ extrudedCubes: 2, withOpening: true }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    try {
      const wall = imported.value.elements.find((element) => element.category === 'WALL');
      expect(wall?.geometry.fidelity).toBe('PARAMETRIC');
      expect(wall?.geometry.completeness).toBe('COMPLETE');
      expect(wall?.geometry.solids).toHaveLength(2);
      expect(wall?.geometry.solid).toBeNull();
      const volumes =
        wall?.geometry.solids.map((solid) => {
          const volume = measureVolume(solid);
          if (!volume.ok) throw new Error(volume.error.message);
          return volume.value;
        }) ?? [];
      expect(volumes[0]).toBeCloseTo(750_000, 2);
      expect(volumes[1]).toBeCloseTo(62_500, 2);
      expect(wall?.geometry.volumeMm3).toBeCloseTo(812_500, 2);
    } finally {
      disposeImportedModel(imported.value);
    }
  });

  it('combines every lossy mesh item into the raw mesh aggregate', async () => {
    const imported = await fromIfc(await bodyFixture({ openTriangles: 2 }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    try {
      const wall = imported.value.elements.find((element) => element.category === 'WALL');
      expect(wall?.geometry.fidelity).toBe('TESSELLATED_LOSSY');
      expect(wall?.geometry.meshVertices).toHaveLength(18);
      expect(wall?.geometry.meshIndices).toEqual(new Uint32Array([0, 1, 2, 3, 4, 5]));
    } finally {
      disposeImportedModel(imported.value);
    }
  });

  it('reports the least faithful item for a mixed PARTIAL Body', async () => {
    const imported = await fromIfc(await bodyFixture({ extrudedCubes: 1, openTriangles: 1 }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    try {
      const wall = imported.value.elements.find((element) => element.category === 'WALL');
      expect(wall?.geometry.fidelity).toBe('TESSELLATED_LOSSY');
      expect(wall?.geometry.completeness).toBe('PARTIAL');
      expect(wall?.geometry.solids).toHaveLength(1);
      expect(wall?.geometry.meshVertices).toHaveLength(9);
    } finally {
      disposeImportedModel(imported.value);
    }
  });

  it('imports multiple polygonal Body items with one product mesh stream', async () => {
    const streamMeshes = vi.spyOn(SpfReader.prototype, 'streamMeshes');
    const imported = await fromIfc(await bodyFixture({ polygonalCubes: 2 }));
    try {
      expect(imported.ok).toBe(true);
      if (!imported.ok) return;
      const wall = imported.value.elements.find((element) => element.category === 'WALL');
      expect(wall?.geometry.completeness).toBe('COMPLETE');
      expect(wall?.geometry.solids).toHaveLength(2);
      expect(wall?.geometry.solid).toBeNull();
      expect((wall?.geometry.volumeMm3 ?? 0) / 1_125_000).toBeCloseTo(1, 5);
      expect(wall?.geometry.bounds?.xMin).toBeCloseTo(1_000, 2);
      expect(wall?.geometry.bounds?.xMax).toBeCloseTo(1_250, 2);
      expect(streamMeshes).toHaveBeenCalledTimes(1);
    } finally {
      if (imported.ok) disposeImportedModel(imported.value);
      streamMeshes.mockRestore();
    }
  });

  it('retains supported siblings and item diagnostics for a PARTIAL Body', async () => {
    const imported = await fromIfc(await bodyFixture({ polygonalCubes: 1, unsupportedItems: 1 }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    try {
      const wall = imported.value.elements.find((element) => element.category === 'WALL');
      expect(wall?.geometry.completeness).toBe('PARTIAL');
      expect(wall?.geometry.solids).toHaveLength(1);
      expect(wall?.geometry.solid).toBeNull();
      expect(wall?.geometry.bounds).toBeNull();
      expect(wall?.geometry.volumeMm3).toBeNull();
      const codes = imported.value.diagnostics.issues.map((diagnostic) => diagnostic.code);
      expect(codes).toContain('UNSUPPORTED_REPRESENTATION_ITEM');
      expect(codes).toContain('PARTIAL_BODY_RECONSTRUCTION');
    } finally {
      disposeImportedModel(imported.value);
    }
  });

  it('distinguishes an existing Body whose items all fail as NONE', async () => {
    const imported = await fromIfc(await bodyFixture({ unsupportedItems: 1 }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    try {
      const wall = imported.value.elements.find((element) => element.category === 'WALL');
      expect(wall?.geometry.completeness).toBe('NONE');
      expect(wall?.geometry.solids).toEqual([]);
      expect(wall?.geometry.solid).toBeNull();
      expect(wall?.geometry.bounds).toBeNull();
      expect(wall?.geometry.volumeMm3).toBeNull();
      expect(imported.value.diagnostics.issues.map((diagnostic) => diagnostic.code)).toContain(
        'BODY_RECONSTRUCTION_NONE'
      );
    } finally {
      disposeImportedModel(imported.value);
    }
  });

  it('disposes a later item intermediate while retaining an earlier sibling', async () => {
    const disposals = [0, 0];
    let itemIndex = 0;
    setGeometryReadTestHooksForTesting({
      afterItemSolid: (_expressId, solid) => {
        const current = itemIndex++;
        solid.onDispose(() => {
          disposals[current] = (disposals[current] ?? 0) + 1;
        });
        if (current === 1) throw new Error('injected later item failure');
      },
    });

    const imported = await fromIfc(await bodyFixture({ polygonalCubes: 2 }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    try {
      const wall = imported.value.elements.find((element) => element.category === 'WALL');
      expect(wall?.geometry.completeness).toBe('PARTIAL');
      expect(wall?.geometry.solids).toHaveLength(1);
      expect(disposals).toEqual([0, 1]);
    } finally {
      disposeImportedModel(imported.value);
    }
    expect(disposals).toEqual([1, 1]);
  });

  it('disposes reconstructed geometry when later element metadata throws', async () => {
    let disposals = 0;
    setFromIfcTestHooksForTesting({
      afterGeometry: (_expressId, geometry) => {
        geometry.solids[0]?.onDispose(() => disposals++);
        throw new Error('injected metadata failure');
      },
    });

    const imported = await fromIfc(await bodyFixture({ polygonalCubes: 1 }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.value.elements).toHaveLength(0);
    expect(disposals).toBe(1);
  });

  it('disposes accumulated element geometry on a fatal model-level failure', async () => {
    let disposals = 0;
    setFromIfcTestHooksForTesting({
      afterElement: (element) => {
        element.geometry.solids[0]?.onDispose(() => disposals++);
        throw new Error('injected model failure');
      },
    });

    const imported = await fromIfc(await bodyFixture({ polygonalCubes: 1 }));
    expect(imported.ok).toBe(false);
    expect(disposals).toBe(1);
  });
});
