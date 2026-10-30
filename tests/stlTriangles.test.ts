import { describe, expect, it } from 'vitest';
import { stlTrianglePositions } from '@/io/stlTriangles.js';

type V3 = [number, number, number];

const TRIANGLES: Array<[V3, V3, V3]> = [
  [
    [0, 0, 0],
    [0, 10, 0],
    [10, 0, 0],
  ],
  [
    [0, 0, 0],
    [10, 0, 0],
    [0, 0, 10],
  ],
  [
    [0, 0, 0],
    [0, 0, 10],
    [0, 10, 0],
  ],
  [
    [10, 0, 0],
    [0, 10, 0],
    [0, 0, 10.25],
  ],
];

function textStl(triangles: Array<[V3, V3, V3]>): ArrayBuffer {
  const lines = ['solid tetra'];
  for (const triangle of triangles) {
    lines.push('  facet normal 0 0 0', '    outer loop');
    for (const [x, y, z] of triangle) lines.push(`      vertex ${x} ${y} ${z}`);
    lines.push('    endloop', '  endfacet');
  }
  lines.push('endsolid tetra', '');
  return new TextEncoder().encode(lines.join('\n')).buffer;
}

function binaryStl(triangles: Array<[V3, V3, V3]>, count = triangles.length): ArrayBuffer {
  const buffer = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(buffer);
  // A byte above '~' in the first 134 marks the file as binary, as OCCT reads it.
  view.setUint8(0, 0xff);
  view.setUint32(80, count, true);
  triangles.forEach((triangle, t) => {
    triangle.forEach((vertex, k) => {
      vertex.forEach((value, axis) => {
        view.setFloat32(84 + t * 50 + 12 + k * 12 + axis * 4, value, true);
      });
    });
  });
  return buffer;
}

describe('stlTrianglePositions', () => {
  it('reads the same corners from a text and a binary file', () => {
    const expected = Float64Array.from(TRIANGLES.flat(2));
    expect(stlTrianglePositions(textStl(TRIANGLES))).toEqual(expected);
    expect(stlTrianglePositions(binaryStl(TRIANGLES))).toEqual(expected);
  });

  it('reads every block of a text file with several solids', () => {
    const [first, ...rest] = TRIANGLES;
    if (first === undefined) return;
    const text =
      new TextDecoder().decode(textStl([first])) + new TextDecoder().decode(textStl(rest));
    const positions = stlTrianglePositions(new TextEncoder().encode(text).buffer);
    expect(positions).toEqual(Float64Array.from(TRIANGLES.flat(2)));
  });

  it('reads a binary file whose first 134 bytes are all printable as text, as OCCT does', () => {
    const buffer = binaryStl(TRIANGLES);
    new DataView(buffer).setUint8(0, 0x73);
    expect(stlTrianglePositions(buffer)).toEqual(new Float64Array(0));
  });

  it('returns null for a binary file shorter than its facet count', () => {
    expect(stlTrianglePositions(binaryStl(TRIANGLES, TRIANGLES.length + 1))).toBeNull();
  });

  it('returns null when the text holds a partial triangle', () => {
    const text = new TextDecoder().decode(textStl(TRIANGLES)).replace(/^\s*vertex 10 0 0$/m, '');
    expect(stlTrianglePositions(new TextEncoder().encode(text).buffer)).toBeNull();
  });
});
