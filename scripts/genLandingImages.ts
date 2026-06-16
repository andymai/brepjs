/**
 * Bake real kernel meshes for the landing page's secondary section visuals:
 *  - a rounded box meshed two ways (exact/smooth vs coarse/faceted) for the
 *    "Exact, not triangles" comparison
 *  - the Gridfinity bin, for the "CAD an agent can prove" multi-view snapshots
 *
 * Writes mesh data + the bin's real measurements to tmp/landing-render-data.json;
 * renderLandingImages.cjs then renders them to apps/docs/public/images/landing/*.png.
 *
 * Run:  npm run docs:gen-images   (then the puppeteer render step)
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerKernel } from '@/kernel/index.js';
import { OcctWasmAdapter } from '@/kernel/occtWasm/occtWasmAdapter.js';
import {
  cylinder,
  fillet,
  edgeFinder,
  drawRoundedRectangle,
  cut,
  fuse,
  unwrap,
  mesh,
  meshEdges,
  measureVolume,
  measureArea,
  getBounds,
  getFaces,
  getEdges,
  getVertices,
  toBufferGeometryData,
  toLineGeometryData,
  type Shape3D,
} from '@/index.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'tmp', 'landing-render-data.json');

function b64(arr: Float32Array | Uint32Array): string {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fluent sketch API
function meshData(s: Shape3D, opts: any, withEdges = true) {
  const m = toBufferGeometryData(mesh(s, opts));
  const out: Record<string, string> = {
    position: b64(m.position),
    normal: b64(m.normal),
    index: b64(m.index),
  };
  if (withEdges) out.edges = b64(toLineGeometryData(meshEdges(s, opts)).position);
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fluent sketch API
function r(inset: number, z: number): any {
  return drawRoundedRectangle(41.5 - 2 * inset, 41.5 - 2 * inset, 3.75 - inset).sketchOnPlane(
    'XY',
    z
  );
}

async function main(): Promise<void> {
  const { OcctKernel } = await import('occt-wasm');
  const k = await OcctKernel.init();
  registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(k));

  // ── Cylinder for exact-vs-faceted (circle vs polygon is the clearest
  //    tessellation tell). OCCT stores the triangulation on the shape, so mesh
  //    two *separate* instances to get genuinely different densities.
  const turnedPart = (): Shape3D => {
    const blank = cylinder(24, 30);
    return unwrap(fillet(blank, edgeFinder().findAll(blank), 3));
  };
  const exact = meshData(turnedPart(), { tolerance: 0.02, angularTolerance: 0.08 }, true);
  const faceted = meshData(turnedPart(), { tolerance: 6, angularTolerance: 1.4 }, false);

  // ── Gridfinity bin (matches the hero) for the verify snapshots ─────
  const foot = r(0, 0).loftWith([r(2.15, -2.4), r(2.95, -5)], { ruled: true }) as Shape3D;
  const body = unwrap(
    fuse(foot, unwrap(cut(r(0, 0).extrude(21) as Shape3D, r(1.2, 1).extrude(21) as Shape3D)))
  );
  const lipOuter = r(0, 21 - 2.6).loftWith([r(0, 21 + 4.4)], { ruled: true }) as Shape3D;
  const lipInner = r(1.2, 21 - 2.6).loftWith(
    [r(2.6, 21 - 1.2), r(2.6, 21), r(1.9, 21 + 0.7), r(1.9, 21 + 2.5), r(0.05, 21 + 4.4)],
    { ruled: true }
  ) as Shape3D;
  const bin = unwrap(fuse(body, unwrap(cut(lipOuter, lipInner))));
  const binMesh = meshData(bin, { tolerance: 0.1, angularTolerance: 0.35 }, true);

  const b = getBounds(bin);
  const round = (n: number): number => Math.round(n * 10) / 10;
  const measurements = {
    volume: round(unwrap(measureVolume(bin))),
    area: round(unwrap(measureArea(bin))),
    bounds: [round(b.xMax - b.xMin), round(b.yMax - b.yMin), round(b.zMax - b.zMin)],
    faces: getFaces(bin).length,
    edges: getEdges(bin).length,
    vertices: getVertices(bin).length,
  };

  writeFileSync(OUT, JSON.stringify({ exact, faceted, bin: binMesh, measurements }));
  console.log(`wrote ${OUT}`);
  console.log('bin measurements', JSON.stringify(measurements));
}

main().catch((e) => {
  console.error('genLandingImages failed', e);
  process.exit(1);
});
