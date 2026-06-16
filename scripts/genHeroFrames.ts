/**
 * Pre-bake the landing hero's "code-as-CAD" build sequence: a real Gridfinity
 * bin (brepjs grew out of the Gridfinity Layout Tool). Runs the actual kernel
 * (occt-wasm) over the build step by step and writes each step's *face* mesh
 * (position/normal/index) to apps/docs/public/hero-frames.json. The landing hero
 * plays these back in sync with the code panel and derives white B-Rep edges
 * client-side via three's EdgesGeometry — genuine kernel output, no WASM shipped.
 *
 * Re-run when the demo program changes:  npx tsx scripts/genHeroFrames.ts
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerKernel } from '@/kernel/index.js';
import { OcctWasmAdapter } from '@/kernel/occtWasm/occtWasmAdapter.js';
import {
  drawRoundedRectangle,
  cut,
  fuse,
  translate,
  unwrap,
  mesh,
  measureVolume,
  toBufferGeometryData,
  type Shape3D,
} from '@/index.js';

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'apps',
  'docs',
  'public',
  'hero-frames.json'
);

// Standard Gridfinity (matches the Gridfinity Layout Tool defaults).
const GRID = 42;
const HU = 7;
const CLR = 0.5;
const WALL = 1.2;
const FLOOR = 1;
const R = 3.75;
const W = 1 * GRID - CLR; // 41.5 — 1 unit wide
const D = 2 * GRID - CLR; // 83.5 — 2 units deep
const H = 3 * HU; // 21 — 3 units tall

// The runnable program shown in the panel + carried by "Open in Playground".
const PROGRAM = `import { drawRoundedRectangle, cut, fuse, translate, unwrap } from 'brepjs/quick';

const cell = 42 - 0.5; // one Gridfinity unit, less clearance
const [w, d, h] = [cell, 2 * 42 - 0.5, 3 * 7];

const block = drawRoundedRectangle(w, d, 3.75).sketchOnPlane('XY', 0).extrude(h);
const inner = drawRoundedRectangle(w - 2.4, d - 2.4, 2).sketchOnPlane('XY', 1).extrude(h);
const bin = unwrap(cut(block, inner)); // hollow: walls + floor

// Gridfinity foot — a tapered loft per cell, fused underneath
const foot = (y) =>
  translate(
    drawRoundedRectangle(cell, cell, 3.75)
      .sketchOnPlane('XY', 0)
      .loftWith(
        [
          drawRoundedRectangle(cell - 4.3, cell - 4.3, 1.6).sketchOnPlane('XY', -2.4),
          drawRoundedRectangle(cell - 5.9, cell - 5.9, 0.8).sketchOnPlane('XY', -5),
        ],
        { ruled: true }
      ),
    [0, y, 0]
  );
const base = unwrap(fuse(foot(21), foot(-21)));

export default unwrap(fuse(bin, base));`;

function b64(arr: Float32Array | Uint32Array): string {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
}
function vol(s: Shape3D): number {
  return Math.round(unwrap(measureVolume(s)) * 10) / 10;
}
function frame(label: string, s: Shape3D) {
  const m = toBufferGeometryData(mesh(s));
  return {
    label,
    vol: vol(s),
    tris: m.index.length / 3,
    position: b64(m.position),
    normal: b64(m.normal),
    index: b64(m.index),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fluent sketch API
function foot(y: number): Shape3D {
  const top = (drawRoundedRectangle(GRID - CLR, GRID - CLR, R) as any).sketchOnPlane('XY', 0);
  const mid = (drawRoundedRectangle(GRID - CLR - 4.3, GRID - CLR - 4.3, 1.6) as any).sketchOnPlane(
    'XY',
    -2.4
  );
  const bot = (drawRoundedRectangle(GRID - CLR - 5.9, GRID - CLR - 5.9, 0.8) as any).sketchOnPlane(
    'XY',
    -5
  );
  const loft = top.loftWith([mid, bot], { ruled: true }) as Shape3D;
  return translate(loft, [0, y, 0]) as Shape3D;
}

async function main(): Promise<void> {
  const { OcctKernel } = await import('occt-wasm');
  const k = await OcctKernel.init();
  registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(k));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fluent sketch API
  const block = (drawRoundedRectangle(W, D, R) as any).sketchOnPlane('XY', 0).extrude(H) as Shape3D;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fluent sketch API
  const inner = (drawRoundedRectangle(W - 2.4, D - 2.4, 2) as any)
    .sketchOnPlane('XY', FLOOR)
    .extrude(H) as Shape3D;
  const hollow = unwrap(cut(block, inner));

  const base = unwrap(fuse(foot(GRID / 2), foot(-GRID / 2)));
  const bin = unwrap(fuse(hollow, base));

  const frames = [frame('block', block), frame('hollow', hollow), frame('bin', bin)];

  // Frame the camera to the finished bin.
  const pos = toBufferGeometryData(mesh(bin)).position;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = pos[i + a] as number;
      if (v < (lo[a] as number)) lo[a] = v;
      if (v > (hi[a] as number)) hi[a] = v;
    }
  }

  const out = { program: PROGRAM, bounds: { lo, hi }, frames };
  writeFileSync(OUT, JSON.stringify(out));
  const kb = (JSON.stringify(out).length / 1024).toFixed(0);
  console.log(`wrote ${OUT} (${kb} KB) — ${frames.map((f) => `${f.label}:${f.tris}t`).join(' ')}`);
}

main().catch((e) => {
  console.error('genHeroFrames failed', e);
  process.exit(1);
});
