/**
 * Precompute the hero mesh JSON for the landing page.
 * Run with: npx tsx scripts/precompute-hero-mesh.ts
 */
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const opencascade = (await import('brepjs-opencascade')).default;

const oc = await opencascade();

const {
  setOC,
  makeBox,
  makeCylinder,
  castShape,
  cutShape,
  filletShape,
  meshShape,
  meshShapeEdges,
  toBufferGeometryData,
  toLineGeometryData,
  unwrap,
  isOk,
} = await import('brepjs');

setOC(oc);

// Create the hero shape: box with a cylindrical hole, optionally filleted
const box = castShape(makeBox([0, 0, 0], [30, 30, 30]).wrapped);
const hole = castShape(makeCylinder(8, 40).translate([15, 15, -5]).wrapped);
const cut = unwrap(cutShape(box, hole));

// Try fillet with small radius; fall back to unfilleted if OCCT fillet fails
const filletResult = filletShape(cut, undefined, 1.5);
const shape = isOk(filletResult) ? filletResult.value : cut;

// Mesh it
const shapeMesh = meshShape(shape, { tolerance: 0.1, angularTolerance: 0.5 });
const edgeMesh = meshShapeEdges(shape, { tolerance: 0.1, angularTolerance: 0.5 });

const bufferData = toBufferGeometryData(shapeMesh);
const lineData = toLineGeometryData(edgeMesh);

const output = {
  position: Array.from(bufferData.position),
  normal: Array.from(bufferData.normal),
  index: Array.from(bufferData.index),
  edges: Array.from(lineData.position),
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '../public/hero-mesh.json');
writeFileSync(outPath, JSON.stringify(output));

const sizeKB = (JSON.stringify(output).length / 1024).toFixed(1);
console.log(`Wrote hero-mesh.json (${sizeKB} KB)`);

process.exit(0);
