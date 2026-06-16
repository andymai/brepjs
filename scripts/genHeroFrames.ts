/**
 * Pre-bake the landing hero's "code-as-CAD" build sequence: a real 1×1
 * Gridfinity bin (brepjs grew out of the Gridfinity Layout Tool). Builds it
 * bottom-up — socket foot → hollow body → stacking lip — running the actual
 * kernel (occt-wasm) and baking each step's face mesh to
 * apps/docs/public/hero-frames.json. The hero plays it back and derives white
 * B-Rep edges client-side; no WASM ships to the browser.
 *
 * Re-run when the demo program changes:  npm run docs:gen-hero
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

// Standard Gridfinity (Gridfinity Layout Tool defaults). 1×1, 3 units tall.
const W = 42 - 0.5; // 41.5 — one unit, less clearance
const R = 3.75;
const WALL = 1.2;
const H = 3 * 7; // 21

// The runnable program shown in the panel + carried by "Open in Playground".
const PROGRAM = `import { drawRoundedRectangle, cut, fuse, unwrap } from 'brepjs/quick';

const [W, R, WALL, H] = [42 - 0.5, 3.75, 1.2, 3 * 7]; // 1×1 bin, 3 units tall

// 1 — Gridfinity socket foot (clicks into a baseplate)
const foot = drawRoundedRectangle(W, W, R).sketchOnPlane('XY', 0).loftWith([
  drawRoundedRectangle(W - 4.3, W - 4.3, 1.6).sketchOnPlane('XY', -2.4),
  drawRoundedRectangle(W - 5.9, W - 5.9, 0.8).sketchOnPlane('XY', -5),
], { ruled: true });

// 2 — hollow body on top: walls + floor
const block = drawRoundedRectangle(W, W, R).sketchOnPlane('XY', 0).extrude(H);
const bore  = drawRoundedRectangle(W - 2*WALL, W - 2*WALL, 2).sketchOnPlane('XY', 1).extrude(H);
const body  = unwrap(fuse(foot, unwrap(cut(block, bore))));

// 3 — stacking lip so bins nest when stacked
const cap   = drawRoundedRectangle(W, W, R).sketchOnPlane('XY', H).extrude(4.4);
const ledge = drawRoundedRectangle(W - 2*WALL, W - 2*WALL, 2).sketchOnPlane('XY', H).loftWith([
  drawRoundedRectangle(W - 0.8, W - 0.8, 3.4).sketchOnPlane('XY', H + 4.4),
], { ruled: true });
const lip   = unwrap(cut(cap, ledge));

export default unwrap(fuse(body, lip));`;

// Coarse mesh — the bin is ~40 mm and ~600 px on screen, so a generous
// deflection keeps the asset small with no visible faceting.
const MESH_OPTS = { tolerance: 0.1, angularTolerance: 0.35 } as const;

function b64(arr: Float32Array | Uint32Array): string {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
}
function vol(s: Shape3D): number {
  return Math.round(unwrap(measureVolume(s)) * 10) / 10;
}
function frame(label: string, s: Shape3D) {
  const m = toBufferGeometryData(mesh(s, MESH_OPTS));
  return {
    label,
    vol: vol(s),
    tris: m.index.length / 3,
    position: b64(m.position),
    normal: b64(m.normal),
    index: b64(m.index),
  };
}

function buildFoot(): Shape3D {
  return drawRoundedRectangle(W, W, R)
    .sketchOnPlane('XY', 0)
    .loftWith(
      [
        drawRoundedRectangle(W - 4.3, W - 4.3, 1.6).sketchOnPlane('XY', -2.4),
        drawRoundedRectangle(W - 5.9, W - 5.9, 0.8).sketchOnPlane('XY', -5),
      ],
      { ruled: true }
    );
}

function buildLip(): Shape3D {
  const cap = drawRoundedRectangle(W, W, R).sketchOnPlane('XY', H).extrude(4.4);
  const ledge = drawRoundedRectangle(W - 2 * WALL, W - 2 * WALL, 2)
    .sketchOnPlane('XY', H)
    .loftWith([drawRoundedRectangle(W - 0.8, W - 0.8, 3.4).sketchOnPlane('XY', H + 4.4)], {
      ruled: true,
    });
  return unwrap(cut(cap, ledge));
}

async function main(): Promise<void> {
  const { OcctKernel } = await import('occt-wasm');
  const k = await OcctKernel.init();
  registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(k));

  const foot = buildFoot();
  const block = drawRoundedRectangle(W, W, R).sketchOnPlane('XY', 0).extrude(H);
  const bore = drawRoundedRectangle(W - 2 * WALL, W - 2 * WALL, 2)
    .sketchOnPlane('XY', 1)
    .extrude(H);
  const hollow = unwrap(cut(block, bore));
  const body = unwrap(fuse(foot, hollow));
  const bin = unwrap(fuse(body, buildLip()));

  const frames = [frame('socket', foot), frame('body', body), frame('bin', bin)];

  // Frame the camera to the finished bin.
  const pos = toBufferGeometryData(mesh(bin, MESH_OPTS)).position;
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
