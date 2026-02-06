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
  makeSphere,
  castShape,
  fuseShapes,
  cloneShape,
  rotateShape,
  translateShape,
  meshShape,
  meshShapeEdges,
  toBufferGeometryData,
  toLineGeometryData,
  unwrap,
  isOk,
  makeHelix,
  makeCircle,
  assembleWire,
  genericSweep,
} = await import('brepjs');

setOC(oc);

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
const bottomLanding = castShape(makeCylinder(landingRadius, stepThickness).wrapped);

// Central column — from ground to top step surface
const colHeight = stepCount * stepRise + stepThickness;
let shape = castShape(makeCylinder(columnRadius, colHeight).wrapped);
shape = unwrap(fuseShapes(shape, bottomLanding));

// Wind steps + railing posts around the column
for (let i = 0; i < stepCount; i++) {
  const z = stepRise * (i + 1);

  // Step inner edge at x=0 so it fully penetrates the column
  const step = castShape(
    makeBox(
      [0, -stepDepth / 2, 0],
      [columnRadius + stepWidth, stepDepth / 2, stepThickness]
    ).wrapped
  );

  // Railing post at outer edge of each step
  const post = castShape(
    makeCylinder(postRadius, railHeight)
      .translate([railRadius, 0, stepThickness]).wrapped
  );

  const piece = unwrap(fuseShapes(step, post));
  const lifted = translateShape(piece, [0, 0, z]);
  const rotated = rotateShape(lifted, rotationPerStep * i, [0, 0, 0], [0, 0, 1]);
  shape = unwrap(fuseShapes(shape, rotated));
}

// Handrail: sweep a circle profile along a helical path
// Post tops: first at z = rise + thickness + railHeight, last 15 steps higher
// Pitch = rise per full 360°. 16 steps × 22.5° = 360°, so pitch = 16 × rise = 288
// But we only span from step 0 to step 15 (15 gaps), so height = 15 × rise = 270
const firstPostTop = stepRise + stepThickness + railHeight;
const helixPitch = stepCount * stepRise;
const helixHeight = (stepCount - 1) * stepRise;
const railProfileEdge = makeCircle(2, [railRadius, 0, firstPostTop], [0, 1, 0]);
const railProfile = unwrap(assembleWire([railProfileEdge]));
const helixSpine = makeHelix(helixPitch, helixHeight, railRadius, [0, 0, firstPostTop]);

const handrailResult = genericSweep(railProfile, helixSpine, { frenet: true });
if (isOk(handrailResult)) {
  shape = unwrap(fuseShapes(shape, castShape((handrailResult.value as any).wrapped)));
} else {
  console.warn('Handrail sweep failed, skipping:', handrailResult.error);
}

// Ball endcaps on handrail ends
const ball = castShape(makeSphere(4).wrapped);
const end1 = translateShape(ball, [railRadius, 0, firstPostTop]);
shape = unwrap(fuseShapes(shape, end1));

const lastPostTop = firstPostTop + stepRise * (stepCount - 1);
const end2 = rotateShape(
  translateShape(cloneShape(ball), [railRadius, 0, lastPostTop]),
  rotationPerStep * (stepCount - 1), [0, 0, 0], [0, 0, 1]
);
shape = unwrap(fuseShapes(shape, end2));

// Mesh it
const shapeMesh = meshShape(shape, { tolerance: 2, angularTolerance: 1.5 });
const edgeMesh = meshShapeEdges(shape, { tolerance: 2, angularTolerance: 1.5 });

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
