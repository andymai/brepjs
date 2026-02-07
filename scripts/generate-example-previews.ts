/**
 * Generates styled SVG preview images for the README gallery.
 *
 * Initializes WASM, builds 5 representative shapes, projects them to 2D,
 * and writes styled SVG files to docs/images/examples/.
 *
 * Usage: npx tsx scripts/generate-example-previews.ts
 *   or:  npm run docs:generate-previews
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initFromOC } from 'brepjs';

const ROOT = join(import.meta.dirname, '..');
const OUT_DIR = join(ROOT, 'docs', 'images', 'examples');

// ── WASM init (same pattern as examples/_setup.ts) ──────────────────────

const { default: initOpenCascade } = await import('brepjs-opencascade');
const oc = await initOpenCascade({
  locateFile: (fileName: string) => {
    if (fileName.endsWith('.wasm')) {
      return new URL(
        '../packages/brepjs-opencascade/src/brepjs_single.wasm',
        import.meta.url
      ).pathname;
    }
    return fileName;
  },
});
initFromOC(oc);

// Now that WASM is ready, import shape-building APIs
const {
  makeBox,
  makeCylinder,
  fuseShape,
  cutShape,
  cutAll,
  shellShape,
  filletShape,
  translateShape,
  rotateShape,
  drawProjection,
  drawRectangle,
  drawCircle,
  drawingCut,
  faceFinder,
  edgeFinder,
  unwrap,
  isOk,
} = await import('brepjs');

// ── SVG styling ─────────────────────────────────────────────────────────

const BG_COLOR = '#1a1a2e';
const STROKE_COLOR = '#4dabf7';
const STROKE_WIDTH = '0.8%';

function styledSVG(viewBox: string, pathDs: string[]): string {
  const paths = pathDs
    .map((d) => `    <path d="${d}" />`)
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="200" height="200">
  <rect width="100%" height="100%" fill="${BG_COLOR}" />
  <g fill="none" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" vector-effect="non-scaling-stroke">
${paths}
  </g>
</svg>
`;
}

/**
 * Extract flat path strings from Drawing.toSVGPaths(),
 * which may return string[] or string[][] depending on the blueprint type.
 */
function flatPaths(raw: string[] | string[][]): string[] {
  const result: string[] = [];
  for (const item of raw) {
    if (Array.isArray(item)) {
      result.push(...item);
    } else {
      result.push(item);
    }
  }
  return result;
}

// ── Shape builders ──────────────────────────────────────────────────────

function buildHelloWorld(): string {
  const box = makeBox([0, 0, 0], [30, 20, 10]);
  const proj = drawProjection(box, 'front');
  const paths = flatPaths(proj.visible.toSVGPaths());
  const viewBox = proj.visible.toSVGViewBox(3);
  return styledSVG(viewBox, paths);
}

function buildBooleanOps(): string {
  const box = makeBox([0, 0, 0], [30, 20, 15]);
  const cylinder = translateShape(makeCylinder(6, 20), [15, 10, -2]);
  const withHole = unwrap(cutShape(box, cylinder));
  const proj = drawProjection(withHole, 'top');
  const paths = flatPaths(proj.visible.toSVGPaths());
  const viewBox = proj.visible.toSVGViewBox(3);
  return styledSVG(viewBox, paths);
}

function buildBracket(): string {
  const basePlate = makeBox([0, 0, 0], [100, 60, 10]);
  const holeRadius = 4;
  const holeHeight = 15;
  const holeInset = 15;

  const holes = [
    translateShape(makeCylinder(holeRadius, holeHeight), [holeInset, holeInset, -2]),
    translateShape(makeCylinder(holeRadius, holeHeight), [100 - holeInset, holeInset, -2]),
    translateShape(makeCylinder(holeRadius, holeHeight), [holeInset, 60 - holeInset, -2]),
    translateShape(makeCylinder(holeRadius, holeHeight), [100 - holeInset, 60 - holeInset, -2]),
  ];

  const slotLength = 60;
  const slotWidth = 20;
  const slotX = (100 - slotLength) / 2;
  const slotY = (60 - slotWidth) / 2;
  const slot = makeBox([slotX, slotY, -2], [slotX + slotLength, slotY + slotWidth, 15]);

  const bracket = unwrap(cutAll(basePlate, [...holes, slot]));
  const proj = drawProjection(bracket, 'top');
  const paths = flatPaths(proj.visible.toSVGPaths());
  const viewBox = proj.visible.toSVGViewBox(3);
  return styledSVG(viewBox, paths);
}

function build2dProfile(): string {
  const outer = drawRectangle(50, 30);
  const hole1 = drawCircle(4).translate([12, 15]);
  const hole2 = drawCircle(4).translate([38, 15]);
  const profile = drawingCut(drawingCut(outer, hole1), hole2);
  const paths = flatPaths(profile.toSVGPaths());
  const viewBox = profile.toSVGViewBox(3);
  return styledSVG(viewBox, paths);
}

function buildPipeFitting(): string {
  const tubeRadius = 15;
  const length = 80;
  const flangeRadius = 25;
  const flangeThickness = 5;
  const wallThickness = 2;
  const boltCount = 4;
  const boltRadius = 2.5;
  const boltCircleRadius = 20;

  const tube = makeCylinder(tubeRadius, length);
  const bottomFlange = makeCylinder(flangeRadius, flangeThickness);
  const topFlange = makeCylinder(flangeRadius, flangeThickness, [0, 0, length - flangeThickness]);
  const body = unwrap(fuseShape(unwrap(fuseShape(tube, bottomFlange)), topFlange));

  const topFaces = faceFinder().parallelTo('Z').atDistance(length, [0, 0, 0]).findAll(body);
  const hollowed = unwrap(shellShape(body, topFaces, wallThickness));

  const transitionEdges = edgeFinder()
    .ofCurveType('CIRCLE')
    .ofLength(2 * Math.PI * tubeRadius, 0.1)
    .findAll(hollowed);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Shape3D type
  let result: any = hollowed;
  if (transitionEdges.length > 0) {
    const filletResult = filletShape(hollowed, transitionEdges, 2);
    if (isOk(filletResult)) {
      result = filletResult.value;
    }
  }

  for (let i = 0; i < boltCount; i++) {
    const angle = (360 / boltCount) * i;
    const hole = rotateShape(
      makeCylinder(boltRadius, flangeThickness + 4, [boltCircleRadius, 0, -2]),
      angle,
      [0, 0, 0],
      [0, 0, 1]
    );
    result = unwrap(cutShape(result, hole));
  }

  for (let i = 0; i < boltCount; i++) {
    const angle = (360 / boltCount) * i;
    const hole = rotateShape(
      makeCylinder(boltRadius, flangeThickness + 4, [boltCircleRadius, 0, length - flangeThickness - 2]),
      angle,
      [0, 0, 0],
      [0, 0, 1]
    );
    result = unwrap(cutShape(result, hole));
  }

  const proj = drawProjection(result, 'front');
  const paths = flatPaths(proj.visible.toSVGPaths());
  const viewBox = proj.visible.toSVGViewBox(3);
  return styledSVG(viewBox, paths);
}

// ── Main ────────────────────────────────────────────────────────────────

mkdirSync(OUT_DIR, { recursive: true });

const previews: [string, () => string][] = [
  ['hello-world.svg', buildHelloWorld],
  ['boolean-ops.svg', buildBooleanOps],
  ['bracket.svg', buildBracket],
  ['2d-profile.svg', build2dProfile],
  ['pipe-fitting.svg', buildPipeFitting],
];

for (const [filename, builder] of previews) {
  const svg = builder();
  const outPath = join(OUT_DIR, filename);
  writeFileSync(outPath, svg);
  console.log(`Generated ${outPath} (${svg.length} bytes)`);
}

console.log(`\nDone — ${previews.length} preview images in ${OUT_DIR}`);
