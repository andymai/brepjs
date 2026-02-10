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
  box,
  cylinder,
  sphere,
  rotate,
  fuse,
  cut,
  shell,
  intersect,
  fuseAll,
  cutAll,
  sketchRoundedRectangle,
  sketchCircle,
  faceFinder,
  shape,
  drawProjection,
  unwrap,
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

function buildGameDie(): string {
  const size = 20, dotR = 2, s = 5;
  const half = size / 2;

  let die = shape(box(size, size, size, { centered: true })).fillet(3).val;

  const dots = [];
  dots.push(sphere(dotR, { at: [0, 0, half] }));
  for (const x of [-s, s]) {
    for (const y of [-s, 0, s]) {
      dots.push(sphere(dotR, { at: [x, y, -half] }));
    }
  }
  dots.push(sphere(dotR, { at: [half, -s, s] }));
  dots.push(sphere(dotR, { at: [half, s, -s] }));
  dots.push(sphere(dotR, { at: [-half, 0, 0] }));
  for (const [y, z] of [[-s, -s], [s, -s], [-s, s], [s, s]] as [number, number][]) {
    dots.push(sphere(dotR, { at: [-half, y, z] }));
  }
  for (const [x, z] of [[-s, -s], [0, 0], [s, s]] as [number, number][]) {
    dots.push(sphere(dotR, { at: [x, half, z] }));
  }
  for (const [x, z] of [[-s, -s], [s, -s], [-s, s], [s, s]] as [number, number][]) {
    dots.push(sphere(dotR, { at: [x, -half, z] }));
  }

  const result = unwrap(cutAll(die, dots));
  const proj = drawProjection(result, 'front');
  const paths = flatPaths(proj.visible.toSVGPaths());
  return styledSVG(proj.visible.toSVGViewBox(3), paths);
}

function buildSpurGear(): string {
  const teeth = 16, pitchR = 25, addendum = 4;
  const toothW = 4.5, thick = 10, boreR = 8;

  let gear = cylinder(pitchR, thick);
  const toothShapes = [];
  for (let i = 0; i < teeth; i++) {
    toothShapes.push(rotate(
      box(addendum * 2, toothW, thick, { at: [pitchR + addendum, 0, thick / 2] }),
      (360 / teeth) * i
    ));
  }
  gear = unwrap(fuseAll([gear, ...toothShapes]));
  gear = unwrap(cut(gear, cylinder(boreR, thick + 4, { at: [0, 0, -2] })));

  const proj = drawProjection(gear, 'top');
  const paths = flatPaths(proj.visible.toSVGPaths());
  return styledSVG(proj.visible.toSVGViewBox(3), paths);
}

function buildPenCup(): string {
  let cup = sketchRoundedRectangle(50, 35, 8).extrude(80);
  const topFaces = faceFinder().parallelTo('Z').atDistance(80, [0, 0, 0]).findAll(cup);
  cup = unwrap(shell(cup, topFaces, 2));
  const result = shape(cup).fillet(0.8).val;
  const proj = drawProjection(result, 'front');
  const paths = flatPaths(proj.visible.toSVGPaths());
  return styledSVG(proj.visible.toSVGViewBox(3), paths);
}

function buildLoftedVase(): string {
  const profile: [number, number][] = [[0, 25], [30, 38], [55, 30], [80, 22], [90, 28]];
  const base = sketchCircle(profile[0][1], { plane: 'XY', origin: [0, 0, profile[0][0]] });
  const sections = profile.slice(1).map(([z, r]) => sketchCircle(r, { plane: 'XY', origin: [0, 0, z] }));
  let vase = base.loftWith(sections);
  const topFaces = faceFinder().parallelTo('Z').atDistance(90, [0, 0, 0]).findAll(vase);
  vase = unwrap(shell(vase, topFaces, 2));
  const proj = drawProjection(vase, 'front');
  const paths = flatPaths(proj.visible.toSVGPaths());
  return styledSVG(proj.visible.toSVGViewBox(3), paths);
}

function buildCompartmentTray(): string {
  const w = 120, d = 80, h = 30, t = 2.5, r = 6;
  const cols = 3, rows = 2;

  let tray = sketchRoundedRectangle(w, d, r).extrude(h);
  const topFaces = faceFinder().parallelTo('Z').atDistance(h, [0, 0, 0]).findAll(tray);
  tray = unwrap(shell(tray, topFaces, t));

  const innerW = w - t * 2, innerD = d - t * 2;
  const innerR = Math.max(r - t, 0.5);
  const divH = h - t, divZ = t + divH / 2;
  const dividers = [];
  for (let i = 1; i < cols; i++) {
    dividers.push(box(t, innerD, divH, { at: [-innerW / 2 + (innerW / cols) * i, 0, divZ] }));
  }
  for (let j = 1; j < rows; j++) {
    dividers.push(box(innerW, t, divH, { at: [0, -innerD / 2 + (innerD / rows) * j, divZ] }));
  }

  if (dividers.length > 0) {
    const innerBound = sketchRoundedRectangle(innerW, innerD, innerR).extrude(h);
    let clipped = unwrap(fuseAll(dividers));
    clipped = unwrap(intersect(clipped, innerBound));
    tray = unwrap(fuse(tray, clipped));
  }

  const holes = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      holes.push(cylinder(1.5, t + 2, { at: [-innerW / 2 + innerW / (2 * cols) + i * (innerW / cols), -innerD / 2 + innerD / (2 * rows) + j * (innerD / rows), -1] }));
    }
  }
  tray = unwrap(cutAll(tray, holes));

  const proj = drawProjection(tray, 'top');
  const paths = flatPaths(proj.visible.toSVGPaths());
  return styledSVG(proj.visible.toSVGViewBox(3), paths);
}

// ── Main ────────────────────────────────────────────────────────────────

mkdirSync(OUT_DIR, { recursive: true });

const previews: [string, () => string][] = [
  ['game-die.svg', buildGameDie],
  ['spur-gear.svg', buildSpurGear],
  ['pen-cup.svg', buildPenCup],
  ['lofted-vase.svg', buildLoftedVase],
  ['compartment-tray.svg', buildCompartmentTray],
];

for (const [filename, builder] of previews) {
  const svg = builder();
  const outPath = join(OUT_DIR, filename);
  writeFileSync(outPath, svg);
  console.log(`Generated ${outPath} (${svg.length} bytes)`);
}

console.log(`\nDone — ${previews.length} preview images in ${OUT_DIR}`);
