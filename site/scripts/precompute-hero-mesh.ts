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
  initFromOC,
  box,
  cylinder,
  sphere,
  shape,
  clone,
  rotate,
  translate,
  mesh,
  meshEdges,
  toBufferGeometryData,
  toLineGeometryData,
  unwrap,
  helix,
  circle,
  wire,
} = await import('brepjs');

initFromOC(oc);

// Parametric spiral staircase (cm) — matches HERO_CODE in constants.ts
const stepCount = 16;
const stepRise = 18;          // 18 cm per step
const rotationPerStep = 22.5; // degrees
const stepWidth = 70;         // tread width from column
const stepDepth = 25;         // tread depth
const columnRadius = 12;      // column radius
const stepThickness = 4;
const railHeight = 90;        // railing height from tread
const railRadius = columnRadius + stepWidth - 4; // where posts sit
const postRadius = 1.5;

// Bottom landing — matches staircase footprint
const landingRadius = columnRadius + stepWidth;
const bottomLanding = cylinder(landingRadius, stepThickness);

// Central column — from ground to top step surface
const colHeight = stepCount * stepRise + stepThickness;
const column = cylinder(columnRadius, colHeight);
let staircase = shape(column).fuse(bottomLanding).val;

// Wind steps + railing posts around the column
for (let i = 0; i < stepCount; i++) {
  const z = stepRise * (i + 1);

  // Step inner edge at x=0 so it fully penetrates the column
  const step = translate(
    box(columnRadius + stepWidth, stepDepth, stepThickness),
    [0, -stepDepth / 2, 0]
  );

  // Railing post at outer edge of each step
  const post = translate(
    cylinder(postRadius, railHeight),
    [railRadius, 0, stepThickness]
  );

  const piece = shape(step).fuse(post).val;
  const lifted = translate(piece, [0, 0, z]);
  const rotated = rotate(lifted, rotationPerStep * i, { around: [0, 0, 0], axis: [0, 0, 1] });
  staircase = shape(staircase).fuse(rotated).val;
}

// Handrail: sweep a circle profile along a helical path
// Post tops: first at z = rise + thickness + railHeight, last 15 steps higher
// Pitch = rise per full 360°. 16 steps × 22.5° = 360°, so pitch = 16 × rise = 288
// But we only span from step 0 to step 15 (15 gaps), so height = 15 × rise = 270
const firstPostTop = stepRise + stepThickness + railHeight;
const helixPitch = stepCount * stepRise;
const helixHeight = (stepCount - 1) * stepRise;
const railProfileEdge = circle(2, { at: [railRadius, 0, firstPostTop], normal: [0, 1, 0] });
const railProfile = unwrap(wire([railProfileEdge]));
const helixSpine = helix(helixPitch, helixHeight, railRadius, { at: [0, 0, firstPostTop] });

try {
  const handrail = shape(railProfile).sweep(helixSpine, { frenet: true }).val;
  staircase = shape(staircase).fuse(handrail).val;
} catch (error) {
  console.warn('Handrail sweep failed, skipping:', error);
}

// Ball endcaps on handrail ends
const ball = sphere(4);
const end1 = translate(ball, [railRadius, 0, firstPostTop]);
staircase = shape(staircase).fuse(end1).val;

const lastPostTop = firstPostTop + stepRise * (stepCount - 1);
const end2 = rotate(
  translate(clone(ball), [railRadius, 0, lastPostTop]),
  rotationPerStep * (stepCount - 1), { around: [0, 0, 0], axis: [0, 0, 1] }
);
staircase = shape(staircase).fuse(end2).val;

// Mesh it
const shapeMesh = mesh(staircase, { tolerance: 2, angularTolerance: 1.5 });
const edgeMesh = meshEdges(staircase, { tolerance: 2, angularTolerance: 1.5 });

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
