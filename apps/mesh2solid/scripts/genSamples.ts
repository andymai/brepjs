/**
 * Writes the sample meshes the page offers (`public/samples/`).
 *
 * The parts come from the conversion tests of brepjs-mesh2solid, so each
 * sample is a mesh the package is known to convert. Run from the repo root:
 *
 *   npm run samples --workspace=apps/mesh2solid
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'brepjs/quick';
import {
  CAD_CORPUS,
  ORGANIC_CORPUS,
  SCAN_CORPUS,
  scanLike,
  stlOf,
} from '../../../packages/brepjs-mesh2solid/tests/corpus.js';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/samples');

function named<T extends { readonly name: string }>(list: readonly T[], name: string): T {
  const found = list.find((c) => c.name === name);
  if (found === undefined) throw new Error(`no corpus part named "${name}"`);
  return found;
}

/** Binary STL triangles as shared vertices and indices. */
function weld(stl: Uint8Array): { positions: number[]; triangles: number[] } {
  const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
  const count = view.getUint32(80, true);
  const ids = new Map<string, number>();
  const positions: number[] = [];
  const triangles: number[] = [];
  for (let t = 0; t < count; t++) {
    for (let k = 0; k < 3; k++) {
      const at = 84 + 50 * t + 12 + 12 * k;
      const p = [
        view.getFloat32(at, true),
        view.getFloat32(at + 4, true),
        view.getFloat32(at + 8, true),
      ];
      const key = p.join(',');
      let id = ids.get(key);
      if (id === undefined) {
        id = positions.length / 3;
        ids.set(key, id);
        positions.push(...p);
      }
      triangles.push(id);
    }
  }
  return { positions, triangles };
}

/** A binary PLY, the format most scanners write. */
function ply(mesh: { positions: number[]; triangles: number[] }): Uint8Array {
  const vertices = mesh.positions.length / 3;
  const faces = mesh.triangles.length / 3;
  const header = new TextEncoder().encode(
    [
      'ply',
      'format binary_little_endian 1.0',
      'comment simulated 3D scan, made by brepjs-mesh2solid',
      `element vertex ${vertices}`,
      'property float x',
      'property float y',
      'property float z',
      `element face ${faces}`,
      'property list uchar int vertex_indices',
      'end_header',
      '',
    ].join('\n')
  );
  const body = new DataView(new ArrayBuffer(12 * vertices + 13 * faces));
  mesh.positions.forEach((v, i) => body.setFloat32(4 * i, v, true));
  for (let f = 0; f < faces; f++) {
    const at = 12 * vertices + 13 * f;
    body.setUint8(at, 3);
    for (let k = 0; k < 3; k++) body.setInt32(at + 1 + 4 * k, mesh.triangles[3 * f + k] ?? 0, true);
  }
  const bytes = new Uint8Array(header.length + body.byteLength);
  bytes.set(header);
  bytes.set(new Uint8Array(body.buffer), header.length);
  return bytes;
}

function obj(mesh: { positions: Float64Array; triangles: Uint32Array }): string {
  const lines = ['# organic test body, made by brepjs-mesh2solid'];
  for (let i = 0; i < mesh.positions.length; i += 3)
    lines.push(
      `v ${[0, 1, 2].map((k) => Number((mesh.positions[i + k] ?? 0).toFixed(5))).join(' ')}`
    );
  for (let i = 0; i < mesh.triangles.length; i += 3)
    lines.push(`f ${[0, 1, 2].map((k) => (mesh.triangles[i + k] ?? 0) + 1).join(' ')}`);
  return `${lines.join('\n')}\n`;
}

mkdirSync(out, { recursive: true });

using bracket = named(CAD_CORPUS, 'L-bracket with two holes').build();
writeFileSync(resolve(out, 'bracket.stl'), await stlOf(bracket));

using knob = named(SCAN_CORPUS, 'lobed knob').build();
const scan = scanLike(knob, { targetTriangles: 3000, sigma: 0.02, seed: 7 });
writeFileSync(resolve(out, 'knob-scan.ply'), ply(weld(scan)));

writeFileSync(resolve(out, 'blob.obj'), obj(named(ORGANIC_CORPUS, 'blob').mesh(0)));
