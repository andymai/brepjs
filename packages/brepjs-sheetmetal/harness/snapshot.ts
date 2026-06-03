/**
 * Standalone snapshot harness (plan §11-A).
 *
 * Imports `brepjs-sheetmetal` directly, builds the headline L-bracket with a
 * mitered corner, and renders the folded 3D part next to its developed flat
 * pattern as a single side-by-side SVG. It also writes the folded solid as STEP.
 *
 * This harness does NOT depend on the playground. The folded view is an
 * isometric edge-wireframe projection (no GPU/headless browser required), which
 * keeps the harness a plain `tsx` script that runs anywhere the WASM kernel does.
 *
 * Run:  npm run snapshot   (writes to ./harness/out/)
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { meshEdges, getEdges, curveStartPoint, curveEndPoint, exportSTEP, isErr, initFromOC } from 'brepjs';
import type { Solid, Vec3 } from 'brepjs';
import { author, miterCorner, unfold } from '../src/api.js';
import type { AuthorSpec } from '../src/authorFns.js';
import type { BendRule, FlatPattern, SheetMetalPart } from '../src/types.js';

/**
 * Boot the OCCT-WASM kernel directly from `brepjs-opencascade` (the same recipe
 * the repo test harness uses), so the snapshot script is a self-contained `tsx`
 * entry point with no `@/`-aliased imports.
 */
async function initOCCT(): Promise<void> {
  const mod = (await import('brepjs-opencascade/src/brepjs_single.js')) as {
    default: (opts: { locateFile: (f: string) => string }) => Promise<unknown>;
  };
  const wasmUrl = new URL(
    '../../brepjs-opencascade/src/brepjs_single.wasm',
    import.meta.url
  );
  const oc = await mod.default({
    locateFile: (fileName: string) => (fileName.endsWith('.wasm') ? fileURLToPath(wasmUrl) : fileName),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Emscripten instance has no shared type here
  initFromOC(oc as any);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, 'out');

const T = 1;
const R = 2;
const rule: BendRule = { innerRadius: R, kFactor: 0.44 };

const PANEL_W = 480;
const PANEL_H = 480;
const PAD = 28;

interface Demo {
  name: string;
  spec: AuthorSpec;
  /** Optional auto-miter applied to the authored part before unfolding. */
  miter?: { a: string; b: string; gap: number };
}

const DEMOS: Demo[] = [
  {
    name: 'bracket',
    spec: {
      thickness: T,
      base: { length: 40, width: 40 },
      flanges: [
        { id: 'fx', length: 18, angleDeg: 90, rule, side: 'xmax' },
        { id: 'fy', length: 18, angleDeg: 90, rule, side: 'ymax' },
      ],
    },
    miter: { a: 'fx', b: 'fy', gap: 1 },
  },
  {
    name: 'u-channel',
    spec: {
      thickness: T,
      base: { length: 60, width: 30 },
      flanges: [
        { id: 'left', length: 18, angleDeg: 90, rule, side: 'xmin' },
        { id: 'right', length: 18, angleDeg: 90, rule, side: 'xmax' },
      ],
    },
  },
  {
    name: 'tray',
    spec: {
      thickness: T,
      base: { length: 50, width: 40 },
      flanges: [
        { id: 'xn', length: 14, angleDeg: 90, rule, side: 'xmin' },
        { id: 'xp', length: 14, angleDeg: 90, rule, side: 'xmax' },
        { id: 'yn', length: 14, angleDeg: 90, rule, side: 'ymin' },
        { id: 'yp', length: 14, angleDeg: 90, rule, side: 'ymax' },
      ],
    },
  },
];

async function main(): Promise<void> {
  await initOCCT();
  await mkdir(OUT_DIR, { recursive: true });

  const lines = ['brepjs-sheetmetal snapshot harness'];
  for (const demo of DEMOS) {
    lines.push(...(await renderDemo(demo)));
  }
  lines.push('');
  process.stdout.write(lines.join('\n'));
}

async function renderDemo(demo: Demo): Promise<string[]> {
  const authored = author(demo.spec);
  if (isErr(authored)) throw new Error(`author '${demo.name}' failed: ${authored.error.message}`);

  let part: SheetMetalPart = authored.value;
  if (demo.miter !== undefined) {
    const mitered = miterCorner(part, demo.miter.a, demo.miter.b, demo.miter.gap);
    if (isErr(mitered)) throw new Error(`miterCorner '${demo.name}' failed: ${mitered.error.message}`);
    part = mitered.value;
  }
  if (part.solid === undefined) throw new Error(`'${demo.name}' has no solid`);

  const unfolded = unfold(part);
  if (isErr(unfolded)) throw new Error(`unfold '${demo.name}' failed: ${unfolded.error.message}`);
  const pattern = unfolded.value.pattern;

  const svg = composeSideBySide(renderFoldedSvg(part.solid), renderFlatSvg(pattern));
  const svgPath = resolve(OUT_DIR, `${demo.name}.svg`);
  await writeFile(svgPath, svg, 'utf8');

  const step = exportSTEP(part.solid);
  let stepPath = '(STEP export skipped)';
  if (!isErr(step)) {
    stepPath = resolve(OUT_DIR, `${demo.name}.step`);
    await writeFile(stepPath, Buffer.from(await step.value.arrayBuffer()));
  }

  return [
    `  [${demo.name}]`,
    `    folded + flat SVG : ${svgPath}`,
    `    folded STEP       : ${stepPath}`,
    `    bend lines        : ${pattern.bendLines.length}`,
    `    developed area    : ${pattern.developedArea.toFixed(2)} mm²`,
    `    warnings          : ${unfolded.value.warnings.length}`,
  ];
}

interface Seg2 {
  a: [number, number];
  b: [number, number];
}

/** Isometric (dimetric) projection of a 3D point to 2D screen coordinates. */
function project(p: Vec3): [number, number] {
  const a = Math.PI / 6; // 30°
  const x = (p[0] - p[1]) * Math.cos(a);
  const y = (p[0] + p[1]) * Math.sin(a) - p[2];
  return [x, y];
}

function renderFoldedSvg(solid: Solid): string {
  const edges = meshEdges(solid, { tolerance: 1e-2, angularTolerance: 0.2 });
  const segs: Seg2[] = [];
  const v = edges.lines;
  for (let i = 0; i + 5 < v.length; i += 6) {
    const a = project([v[i] ?? 0, v[i + 1] ?? 0, v[i + 2] ?? 0]);
    const b = project([v[i + 3] ?? 0, v[i + 4] ?? 0, v[i + 5] ?? 0]);
    segs.push({ a, b });
  }
  const lines = segs.map(
    (s) => `<line x1="${fmt(s.a[0])}" y1="${fmt(s.a[1])}" x2="${fmt(s.b[0])}" y2="${fmt(s.b[1])}" />`
  );
  return fitPanel(lines.join('\n'), bounds(segs.flatMap((s) => [s.a, s.b])), 'Folded (isometric)', '#1d6fb8');
}

function renderFlatSvg(pattern: FlatPattern): string {
  const outlineSegs = wireSegments(pattern);
  const bendSegs: Seg2[] = pattern.bendLines.map((bl) => ({
    a: to2(curveStartPoint(bl.line)),
    b: to2(curveEndPoint(bl.line)),
  }));

  const allPts = [...outlineSegs, ...bendSegs].flatMap((s) => [s.a, s.b]);
  const body =
    outlineSegs
      .map((s) => `<line class="outline" x1="${fmt(s.a[0])}" y1="${fmt(s.a[1])}" x2="${fmt(s.b[0])}" y2="${fmt(s.b[1])}" />`)
      .join('\n') +
    '\n' +
    bendSegs
      .map((s) => `<line class="bend" x1="${fmt(s.a[0])}" y1="${fmt(s.a[1])}" x2="${fmt(s.b[0])}" y2="${fmt(s.b[1])}" />`)
      .join('\n');

  return fitPanel(body, bounds(allPts), 'Flat pattern', '#b8431d', true);
}

function wireSegments(pattern: FlatPattern): Seg2[] {
  const edges = getEdges(pattern.outline);
  return edges.map((e) => ({ a: to2(curveStartPoint(e)), b: to2(curveEndPoint(e)) }));
}

function to2(v: Vec3): [number, number] {
  return [v[0], v[1]];
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function bounds(pts: [number, number][]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

/**
 * Wrap projected geometry in a fixed-size panel: scale/translate the content to
 * fit within the drawable area, draw a frame and title. `flipY` keeps the flat
 * pattern's +Y pointing up (SVG's Y axis grows downward).
 */
function fitPanel(body: string, box: Box, title: string, stroke: string, flipY = false): string {
  const w = Math.max(box.maxX - box.minX, 1e-6);
  const h = Math.max(box.maxY - box.minY, 1e-6);
  const scale = Math.min((PANEL_W - 2 * PAD) / w, (PANEL_H - 2 * PAD) / h);
  const offX = PAD - box.minX * scale + ((PANEL_W - 2 * PAD) - w * scale) / 2;
  const sy = flipY ? -scale : scale;
  const offY = flipY
    ? PANEL_H - PAD + box.minY * scale - ((PANEL_H - 2 * PAD) - h * scale) / 2
    : PAD - box.minY * scale + ((PANEL_H - 2 * PAD) - h * scale) / 2;

  return [
    `<g>`,
    `<rect x="0.5" y="0.5" width="${PANEL_W - 1}" height="${PANEL_H - 1}" fill="#fafafa" stroke="#ccc" />`,
    `<text x="${PAD}" y="20" font-family="sans-serif" font-size="13" fill="#333">${title}</text>`,
    `<g transform="translate(${fmt(offX)} ${fmt(offY)}) scale(${fmt(scale)} ${fmt(sy)})" stroke="${stroke}" stroke-width="${fmt(0.6 / scale)}" fill="none" stroke-linecap="round">`,
    body,
    `</g>`,
    `</g>`,
  ].join('\n');
}

function composeSideBySide(left: string, right: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PANEL_W * 2}" height="${PANEL_H}" viewBox="0 0 ${PANEL_W * 2} ${PANEL_H}">`,
    `<style>.bend{stroke-dasharray:4 3}</style>`,
    `<g>${left}</g>`,
    `<g transform="translate(${PANEL_W} 0)">${right}</g>`,
    `</svg>`,
    '',
  ].join('\n');
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(3) : '0';
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exitCode = 1;
});
