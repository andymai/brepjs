/**
 * Pre-bake the landing hero's "code-as-CAD" build sequence: a real 1×1
 * Gridfinity bin (brepjs grew out of the Gridfinity Layout Tool). Builds it
 * bottom-up — socket foot → hollow body → stacking lip — running the actual
 * kernel (occt-wasm) and baking each step's face mesh + exact B-Rep edge lines
 * to apps/docs/public/hero-frames.json. No WASM ships to the browser.
 *
 * Lip profile mirrors the layout tool's buildTopShapeLoft (LIP_* constants):
 * outer tube minus a stepped inner frustum, so the ledge overhangs inward and
 * the rim tapers to the outer edge at the peak.
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
  meshEdges,
  measureVolume,
  toBufferGeometryData,
  toLineGeometryData,
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
const WALL = 1.2;
const H = 3 * 7; // 21

// The runnable program shown in the panel + carried by "Open in Playground".
const PROGRAM = `import { drawRoundedRectangle, cut, fuse, unwrap } from 'brepjs/quick';

const [W, WALL, H] = [42 - 0.5, 1.2, 3 * 7]; // 1×1 bin, 3 units tall
const r = (inset, z) => drawRoundedRectangle(W - 2*inset, W - 2*inset, 3.75 - inset).sketchOnPlane('XY', z);

// Gridfinity socket foot — clicks into a baseplate
const foot = r(0, 0).loftWith([r(2.15, -2.4), r(2.95, -5)], { ruled: true });

// hollow body — walls + floor
const body = unwrap(fuse(foot, unwrap(cut(r(0, 0).extrude(H), r(WALL, 1).extrude(H)))));

// stacking lip — so bins nest when stacked
const lipOuter = r(0, H-2.6).loftWith([r(0, H+4.4)], { ruled: true });
const lipInner = r(1.2, H-2.6).loftWith([r(2.6, H-1.2), r(2.6, H), r(1.9, H+0.7), r(1.9, H+2.5), r(0.05, H+4.4)], { ruled: true });
const lip = unwrap(cut(lipOuter, lipInner));

export default unwrap(fuse(body, lip));`;

const MESH_OPTS = { tolerance: 0.1, angularTolerance: 0.35 } as const;

function b64(arr: Float32Array | Uint32Array): string {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
}
function vol(s: Shape3D): number {
  return Math.round(unwrap(measureVolume(s)) * 10) / 10;
}
function frame(label: string, s: Shape3D) {
  const m = toBufferGeometryData(mesh(s, MESH_OPTS));
  const e = toLineGeometryData(meshEdges(s, MESH_OPTS));
  return {
    label,
    vol: vol(s),
    tris: m.index.length / 3,
    position: b64(m.position),
    normal: b64(m.normal),
    index: b64(m.index),
    edges: b64(e.position),
  };
}

// rounded-rect section: inset from the footprint, at height z (mirrors `r` above)
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fluent sketch API
function r(inset: number, z: number): any {
  return drawRoundedRectangle(W - 2 * inset, W - 2 * inset, 3.75 - inset).sketchOnPlane('XY', z);
}

async function main(): Promise<void> {
  const { OcctKernel } = await import('occt-wasm');
  const k = await OcctKernel.init();
  registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(k));

  const foot = r(0, 0).loftWith([r(2.15, -2.4), r(2.95, -5)], { ruled: true }) as Shape3D;

  const block = r(0, 0).extrude(H) as Shape3D;
  const bore = r(WALL, 1).extrude(H) as Shape3D;
  const body = unwrap(fuse(foot, unwrap(cut(block, bore))));

  const lipOuter = r(0, H - 2.6).loftWith([r(0, H + 4.4)], { ruled: true }) as Shape3D;
  const lipInner = r(1.2, H - 2.6).loftWith(
    [r(2.6, H - 1.2), r(2.6, H), r(1.9, H + 0.7), r(1.9, H + 2.5), r(0.05, H + 4.4)],
    { ruled: true }
  ) as Shape3D;
  const lip = unwrap(cut(lipOuter, lipInner));
  const bin = unwrap(fuse(body, lip));

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
