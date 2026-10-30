import { describe, expect, it } from 'vitest';
import { analyzeMesh, meshBodyOutline } from '@/io/meshTopology.js';

type V3 = [number, number, number];
type Triangle = [V3, V3, V3];

/** A right tetrahedron with legs `size` at `at`, wound outward unless `inward`. */
function tetrahedron(size: number, at: V3 = [0, 0, 0], inward = false): Triangle[] {
  const [x, y, z] = at;
  const o: V3 = [x, y, z];
  const a: V3 = [x + size, y, z];
  const b: V3 = [x, y + size, z];
  const c: V3 = [x, y, z + size];
  const outward: Triangle[] = [
    [o, b, a],
    [o, a, c],
    [o, c, b],
    [a, b, c],
  ];
  return inward ? outward.map(([p, q, r]) => [p, r, q]) : outward;
}

function positions(triangles: Triangle[]): Float64Array {
  return Float64Array.from(triangles.flat(2));
}

describe('analyzeMesh', () => {
  it('reads an outward closed mesh as one closed body with positive volume', () => {
    const mesh = analyzeMesh(positions(tetrahedron(10)));
    expect(mesh).not.toBeNull();
    if (mesh === null) return;
    expect(mesh.vertexCount).toBe(4);
    expect(mesh.edgeCount).toBe(6);
    expect(mesh.bodies).toHaveLength(1);
    const [body] = mesh.bodies;
    expect(body?.closed).toBe(true);
    expect(body?.triangles).toEqual([0, 1, 2, 3]);
    expect(body?.vertexCount).toBe(4);
    expect(body?.edgeCount).toBe(6);
    expect(body?.volume).toBeCloseTo(1000 / 6, 9);
  });

  it('gives an inward closed mesh a negative volume', () => {
    const mesh = analyzeMesh(positions(tetrahedron(10, [0, 0, 0], true)));
    expect(mesh?.bodies[0]?.volume).toBeCloseTo(-1000 / 6, 9);
  });

  it('keeps its precision far from the origin', () => {
    const mesh = analyzeMesh(positions(tetrahedron(10, [1e6, -2e6, 3e6])));
    expect(mesh?.bodies[0]?.volume).toBeCloseTo(1000 / 6, 6);
  });

  it('reads a mesh with unshared edges as an open body', () => {
    const square: Triangle[] = [
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
      [
        [0, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ],
    ];
    const mesh = analyzeMesh(positions(square));
    expect(mesh?.bodies).toHaveLength(1);
    const [body] = mesh?.bodies ?? [];
    expect(body?.closed).toBe(false);
    expect(body?.volume).toBe(0);
    expect(body?.vertexCount).toBe(4);
    expect(body?.edgeCount).toBe(5);
  });

  it('splits triangles that share no edge into separate bodies', () => {
    const triangles = [
      ...tetrahedron(10),
      ...tetrahedron(10, [50, 0, 0], true),
      [
        [0, 0, 50],
        [1, 0, 50],
        [1, 1, 50],
      ] as Triangle,
    ];
    const mesh = analyzeMesh(positions(triangles));
    expect(mesh?.vertexCount).toBe(11);
    expect(mesh?.edgeCount).toBe(15);
    const bodies = mesh?.bodies ?? [];
    expect(bodies.map((body) => body.triangles)).toEqual([[0, 1, 2, 3], [4, 5, 6, 7], [8]]);
    expect(bodies.map((body) => body.closed)).toEqual([true, true, false]);
    expect(bodies[0]?.volume).toBeCloseTo(1000 / 6, 9);
    expect(bodies[1]?.volume).toBeCloseTo(-1000 / 6, 9);
    expect(bodies[2]?.edgeCount).toBe(3);
  });

  it('counts a vertex shared by two bodies once overall and once in each body', () => {
    const mesh = analyzeMesh(positions([...tetrahedron(10), ...tetrahedron(10, [10, 0, 0])]));
    expect(mesh?.bodies).toHaveLength(2);
    expect(mesh?.vertexCount).toBe(7);
    expect(mesh?.bodies.map((body) => body.vertexCount)).toEqual([4, 4]);
  });

  it('welds -0 and 0 into one vertex', () => {
    const triangles = tetrahedron(10);
    const first = triangles[0];
    if (first) first[0] = [-0, 0, -0];
    expect(analyzeMesh(positions(triangles))?.vertexCount).toBe(4);
  });

  it('rejects an edge shared by three triangles', () => {
    const fin: Triangle = [
      [0, 0, 0],
      [10, 0, 0],
      [5, -5, 5],
    ];
    expect(analyzeMesh(positions([...tetrahedron(10), fin]))).toBeNull();
  });

  it('rejects two triangles running their shared edge the same way', () => {
    const triangles = tetrahedron(10);
    const [last] = triangles.splice(3, 1);
    if (last) triangles.push([last[0], last[2], last[1]]);
    expect(analyzeMesh(positions(triangles))).toBeNull();
  });

  it('rejects a triangle with a repeated vertex or no area', () => {
    const repeated: Triangle = [
      [0, 0, 0],
      [0, 0, 0],
      [1, 0, 0],
    ];
    const collinear: Triangle = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ];
    expect(analyzeMesh(positions([repeated]))).toBeNull();
    expect(analyzeMesh(positions([collinear]))).toBeNull();
  });

  it('rejects a closed body that encloses no volume', () => {
    const a: V3 = [0, 0, 0];
    const b: V3 = [1, 0, 0];
    const c: V3 = [0, 1, 0];
    expect(
      analyzeMesh(
        positions([
          [a, b, c],
          [a, c, b],
        ])
      )
    ).toBeNull();
  });

  it('rejects non-finite coordinates, a partial triangle, and an empty mesh', () => {
    const triangles = tetrahedron(10);
    const first = triangles[0];
    if (first) first[1] = [NaN, 0, 0];
    expect(analyzeMesh(positions(triangles))).toBeNull();
    expect(analyzeMesh([0, 0, 0, 1, 0, 0, 0, 1])).toBeNull();
    expect(analyzeMesh([])).toBeNull();
  });
});

describe('meshBodyOutline', () => {
  it('describes a body by its own triangles, bounds, and facing', () => {
    const mesh = analyzeMesh(
      positions([...tetrahedron(10), ...tetrahedron(4, [20, 30, 40], true)])
    );
    const body = mesh?.bodies[1];
    expect(mesh).not.toBeNull();
    expect(body).toBeDefined();
    if (mesh === null || body === undefined) return;
    const outline = meshBodyOutline(mesh, body);
    expect(outline.box()).toEqual({ min: [20, 30, 40], max: [24, 34, 44] });
    expect(outline.facesInward()).toBe(true);
    const { vertices, triangles } = outline.mesh();
    expect(triangles).toHaveLength(12);
    for (const v of Array.from(triangles)) {
      expect(vertices[v * 3] ?? NaN).toBeGreaterThanOrEqual(20);
    }
    expect(meshBodyOutline(mesh, mesh.bodies[0] ?? body).facesInward()).toBe(false);
  });
});
