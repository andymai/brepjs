/**
 * Mesh import benchmarks on occt-wasm: STL, OBJ, and 3MF of closed, multi-body,
 * hollow, and open sphere meshes, timed from blob to sewn shape. Then checks
 * that each STL import matches the orientation-repairing path (sewAndSolidify
 * plus ShapeFix) in type, validity, volume, and topology.
 *
 * Run: npx vitest run benchmarks/mesh-import.bench.test.ts --config vitest.bench.config.ts --disableConsoleIntercept
 * MESH_BENCH_RUNS sets the timed runs per case (default 3).
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel } from '../tests/setup.js';
import { getKernel } from '../src/kernel/index.js';
import {
  exportThreeMF,
  getFaces,
  getShells,
  getSolids,
  importOBJ,
  importSTL,
  importThreeMF,
  measureVolume,
  unwrap,
} from '../src/index.js';
import type { Shape3D, ShapeMesh } from '../src/index.js';

type V3 = [number, number, number];
type Tri = [V3, V3, V3];

/** A UV sphere with 2 * slices * (stacks - 1) triangles, wound outward unless `inward`. */
function sphere(
  r: number,
  slices: number,
  stacks: number,
  at: V3 = [0, 0, 0],
  inward = false
): Tri[] {
  const p = (i: number, j: number): V3 => {
    const theta = (Math.PI * i) / stacks;
    const phi = (2 * Math.PI * j) / slices;
    return [
      Math.fround(at[0] + r * Math.sin(theta) * Math.cos(phi)),
      Math.fround(at[1] + r * Math.sin(theta) * Math.sin(phi)),
      Math.fround(at[2] + r * Math.cos(theta)),
    ];
  };
  const north: V3 = [Math.fround(at[0]), Math.fround(at[1]), Math.fround(at[2] + r)];
  const south: V3 = [Math.fround(at[0]), Math.fround(at[1]), Math.fround(at[2] - r)];
  const tris: Tri[] = [];
  for (let j = 0; j < slices; j++) {
    const j1 = (j + 1) % slices;
    tris.push([north, p(1, j), p(1, j1)]);
    for (let i = 1; i < stacks - 1; i++) {
      tris.push([p(i, j), p(i + 1, j), p(i + 1, j1)]);
      tris.push([p(i, j), p(i + 1, j1), p(i, j1)]);
    }
    tris.push([south, p(stacks - 1, j1), p(stacks - 1, j)]);
  }
  return inward ? tris.map(([a, b, c]) => [a, c, b]) : tris;
}

function binarySTL(tris: Tri[]): Blob {
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const view = new DataView(buf);
  view.setUint32(80, tris.length, true);
  let o = 84;
  for (const tri of tris) {
    o += 12;
    for (const v of tri) {
      view.setFloat32(o, v[0], true);
      view.setFloat32(o + 4, v[1], true);
      view.setFloat32(o + 8, v[2], true);
      o += 12;
    }
    o += 2;
  }
  return new Blob([buf]);
}

function indexed(tris: Tri[]): { vertices: V3[]; faces: number[][] } {
  const index = new Map<string, number>();
  const vertices: V3[] = [];
  const faces = tris.map((tri) =>
    tri.map((v) => {
      const key = v.join(' ');
      let id = index.get(key);
      if (id === undefined) {
        id = vertices.length;
        index.set(key, id);
        vertices.push(v);
      }
      return id;
    })
  );
  return { vertices, faces };
}

function obj(tris: Tri[]): Blob {
  const { vertices, faces } = indexed(tris);
  const lines = [
    ...vertices.map((v) => `v ${v.join(' ')}`),
    ...faces.map((f) => `f ${f.map((i) => i + 1).join(' ')}`),
  ];
  return new Blob([lines.join('\n')]);
}

function threeMF(tris: Tri[]): Blob {
  const { vertices, faces } = indexed(tris);
  const mesh: ShapeMesh = {
    vertices: Float32Array.from(vertices.flat()),
    triangles: Uint32Array.from(faces.flat()),
    normals: new Float32Array(0),
    uvs: new Float32Array(0),
    faceGroups: [],
  };
  return new Blob([exportThreeMF(mesh)]);
}

const MESHES: Record<string, Tri[]> = {
  'closed 10k': sphere(10, 100, 51),
  'closed 50k': sphere(10, 250, 101),
  'multi-body 4x2.5k': [0, 30, 60, 90].flatMap((x) => sphere(10, 50, 26, [x, 0, 0])),
  'hollow 5k+5k': [...sphere(20, 50, 51), ...sphere(10, 50, 51, [0, 0, 0], true)],
  'open 10k': sphere(10, 100, 51).slice(1),
};

const RUNS = Number(process.env['MESH_BENCH_RUNS'] ?? 3);

function summary(shape: Shape3D) {
  const kernel = getKernel();
  const type = kernel.shapeType(shape.wrapped);
  return {
    type,
    valid: kernel.isValid(shape.wrapped),
    volume: type === 'shell' ? 0 : unwrap(measureVolume(shape)),
    solids: getSolids(shape).length,
    shells: getShells(shape).length,
    faces: getFaces(shape).length,
  };
}

async function timeImport(label: string, load: () => Promise<Shape3D>): Promise<void> {
  const ms: number[] = [];
  let result = '';
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    using shape = await load();
    ms.push(Math.round(performance.now() - start));
    if (i === 0) result = JSON.stringify(summary(shape));
  }
  const median = [...ms].sort((a, b) => a - b)[Math.floor(ms.length / 2)];
  console.log(`${label}: median ${median} ms [${ms.join(', ')}] ${result}`);
}

beforeAll(async () => {
  await initKernel();
  expect(getKernel().kernelId).toBe('occt-wasm');
}, 30000);

describe('mesh import timings (occt-wasm)', () => {
  for (const [name, tris] of Object.entries(MESHES)) {
    it(`STL ${name}`, async () => {
      const blob = binarySTL(tris);
      await timeImport(`STL ${name}`, async () => unwrap(await importSTL(blob)) as Shape3D);
    });
    it(`OBJ ${name}`, async () => {
      const blob = obj(tris);
      await timeImport(`OBJ ${name}`, async () => unwrap(await importOBJ(blob)) as Shape3D);
    });
    it(`3MF ${name}`, async () => {
      const blob = threeMF(tris);
      await timeImport(`3MF ${name}`, async () => unwrap(await importThreeMF(blob)) as Shape3D);
    });
  }
});

describe('STL import matches the repairing path', () => {
  for (const [name, tris] of Object.entries(MESHES)) {
    it(name, async () => {
      const { sewFacesIntoSolids } = await import('../src/io/ioUtils.js');
      const { castResultShape } = await import('../src/core/shapeTypes.js');
      const blob = binarySTL(tris);
      using fast = unwrap(await importSTL(blob)) as Shape3D;
      const start = performance.now();
      using facets = castResultShape(getKernel().importSTL(await blob.arrayBuffer()));
      const faces = getFaces(facets).map((face) => face.wrapped);
      using repaired = sewFacesIntoSolids(faces, 1e-6) as Shape3D;
      const repairMs = Math.round(performance.now() - start);
      const got = summary(fast);
      const want = summary(repaired);
      console.log(`${name}: repairing path ${repairMs} ms ${JSON.stringify(want)}`);
      expect(got.valid).toBe(true);
      expect(got.volume).toBeCloseTo(want.volume, 6);
      expect({ ...got, volume: 0 }).toEqual({ ...want, volume: 0 });
    });
  }
});
