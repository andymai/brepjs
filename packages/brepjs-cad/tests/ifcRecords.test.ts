import { describe, it, expect } from 'vitest';
import { ifcNodes, ifcRecords, type ImportedModelLike } from '@/session/buildIfc.js';
import type { BrepNs } from '@/verify/brepjsRuntime.js';
import { newGeometryFailures } from '@/session/diff.js';
import type { BuildDiagnostic } from '@/session/records.js';

const BOUNDS = { xMin: 0, xMax: 1, yMin: 0, yMax: 1, zMin: 0, zMax: 1 };

function element(
  expressId: number,
  guid: string,
  geometry: Partial<ImportedModelLike['elements'][number]['geometry']>
) {
  return {
    expressId,
    guid,
    name: guid,
    category: 'WALL',
    spatialStructureExpressId: 1,
    geometry: {
      fidelity: 'PARAMETRIC',
      completeness: 'COMPLETE',
      bounds: BOUNDS,
      volumeMm3: 1,
      ...geometry,
    },
    psets: [],
    material: null,
    classification: null,
    voidedBy: [],
  };
}

function model(bodyFailed: boolean): ImportedModelLike {
  return {
    schema: 'IFC4',
    spatialTree: {
      expressId: 1,
      guid: 'storey',
      name: 'Ground',
      category: 'STOREY',
      children: [],
      containedElements: [10, 11, 12],
    },
    elements: [
      element(10, 'ok', {}),
      element(
        11,
        'broken',
        bodyFailed ? { fidelity: 'NONE', completeness: 'NONE', bounds: null, volumeMm3: null } : {}
      ),
      element(12, 'bodiless', {
        fidelity: 'NONE',
        completeness: 'NONE',
        bounds: null,
        volumeMm3: null,
      }),
    ],
    diagnostics: {
      issues: bodyFailed
        ? [
            {
              code: 'BODY_RECONSTRUCTION_NONE',
              severity: 'warning',
              message: 'The Product has 1 Body item(s), but none reconstructed as solids',
              entity: 11,
            },
          ]
        : [],
    },
  };
}

describe('IFC session records', () => {
  it('marks a Body that failed to reconstruct, and not an element without one', () => {
    const diagnostics: BuildDiagnostic[] = [];
    const { elements } = ifcRecords(model(true), diagnostics);
    const byId = new Map(elements.map((e) => [e.id, e]));
    expect(byId.get('broken')?.geometryError).toMatch(/none reconstructed/);
    expect(byId.get('bodiless')?.geometryError).toBeUndefined();
    expect(byId.get('ok')).toMatchObject({
      completeness: 'COMPLETE',
      storey: { id: 'storey', name: 'Ground' },
    });
    expect(diagnostics.map((d) => d.id)).toEqual(['broken']);
  });

  it('lets the rebuild guard catch an IFC body that newly fails', () => {
    const before = ifcRecords(model(false), []).elements;
    const after = ifcRecords(model(true), []).elements;
    expect(newGeometryFailures(before, after).map((r) => r.id)).toEqual(['broken']);
  });
});

describe('IFC session meshes', () => {
  it('draws raw Body triangles next to the solids of the same element', () => {
    const tri = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const fakeBrep = {
      mesh: () => ({
        vertices: tri,
        normals: new Float32Array(9),
        triangles: new Uint32Array([0, 1, 2]),
      }),
      meshEdges: () => ({ lines: new Float32Array(0) }),
    } as unknown as BrepNs;
    const m = model(false);
    const mixed = {
      ...m,
      elements: [
        {
          ...element(10, 'mixed', {
            solids: [{}],
            meshVertices: new Float32Array([5, 5, 5, 6, 5, 5, 5, 6, 5]),
            meshIndices: new Uint32Array([0, 1, 2]),
          }),
        },
      ],
    };
    const node = ifcNodes(fakeBrep, mixed, new Map([[10, 'mixed']])).get('mixed');
    if (!node?.mesh.ok) throw new Error('no mesh for the mixed element');
    expect(node.mesh.value.vertices).toHaveLength(18);
    expect(Array.from(node.mesh.value.triangles)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
