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
import { meshEdges, getEdges, curveStartPoint, curveEndPoint, exportSTEP, measureVolume, isErr, initFromOC } from 'brepjs';
import type { Solid, Vec3 } from 'brepjs';
import { author, miterCorner, unfold, fold } from '../src/api.js';
import { addBendRelief, cornerRelief } from '../src/reliefFns.js';
import { addCutout } from '../src/cutoutFns.js';
import { addTab, tabAndSlot, type SlotPlacement } from '../src/tabFns.js';
import { addForm } from '../src/formFns.js';
import { authorContourFlange } from '../src/contourFlangeFns.js';
import { authorLoftedFlange } from '../src/loftedFlangeFns.js';
import { partToFlatInput } from '../src/foldFns.js';
import type { AuthorSpec } from '../src/authorFns.js';
import type {
  BendRule,
  ContourFlangeSpec,
  CutoutSpec,
  FlatPattern,
  FormSpec,
  LoftedFlangeSpec,
  SheetMetalPart,
  TabSpec,
} from '../src/types.js';

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
  /** Optional bend relief on a partial flange (slot at each mid-edge bend-line end). */
  bendRelief?: { flange: string };
  /** Optional corner relief notch between two adjacent flanges. */
  cornerRelief?: { a: string; b: string };
  /** Optional cutouts (holes / slots / polygons) punched after authoring. */
  cutouts?: CutoutSpec[];
  /** Optional tabs (additive protrusions) fused after authoring. */
  tabs?: TabSpec[];
  /** Optional tab-and-slot joints (a tab + a matching mating slot). */
  tabSlots?: { tab: TabSpec; slot: SlotPlacement }[];
  /** Optional form features (louvers / embosses) formed after authoring. */
  forms?: FormSpec[];
  /** Optional contour flanges (open line/arc profile swept along a base edge). */
  contourFlanges?: ContourFlangeSpec[];
  /** Optional lofted / ruled transition flanges between two open profiles. */
  loftedFlanges?: LoftedFlangeSpec[];
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
  {
    name: 'bend-relief',
    spec: {
      thickness: T,
      base: { length: 60, width: 40 },
      // A partial flange centred on the ymax edge: both bend-line ends sit mid-edge
      // and would tear the parent without a relief slot.
      flanges: [{ id: 'tab', length: 16, angleDeg: 90, rule, side: 'ymax', offset: 18, width: 24 }],
    },
    bendRelief: { flange: 'tab' },
  },
  {
    name: 'corner-relief',
    spec: {
      thickness: T,
      base: { length: 44, width: 44 },
      flanges: [
        { id: 'fx', length: 16, angleDeg: 90, rule, side: 'xmax' },
        { id: 'fy', length: 16, angleDeg: 90, rule, side: 'ymax' },
      ],
    },
    cornerRelief: { a: 'fx', b: 'fy' },
  },
  {
    name: 'cutout-panel',
    spec: {
      thickness: T,
      base: { length: 60, width: 40 },
      flanges: [{ id: 'lip', length: 18, angleDeg: 90, rule, side: 'ymax' }],
    },
    cutouts: [
      // Four mounting holes near the base corners.
      { kind: 'hole', region: 'base', x: 10, y: 10, diameter: 5 },
      { kind: 'hole', region: 'base', x: 50, y: 10, diameter: 5 },
      { kind: 'hole', region: 'base', x: 10, y: 30, diameter: 5 },
      { kind: 'hole', region: 'base', x: 50, y: 30, diameter: 5 },
      // A central obround slot on the base.
      { kind: 'slot', region: 'base', x: 30, y: 20, length: 20, width: 6, round: true },
      // A vent hole on the folded lip.
      { kind: 'hole', region: 'lip', x: 30, y: 9, diameter: 8 },
    ],
  },
  {
    name: 'tab-and-slot-box',
    spec: {
      thickness: T,
      base: { length: 60, width: 60 },
      flanges: [
        { id: 'wx', length: 20, angleDeg: 90, rule, side: 'xmax' },
        { id: 'wy', length: 20, angleDeg: 90, rule, side: 'ymax' },
      ],
    },
    // Self-locating box corners: a tab on one wall inserts into a slot on the next.
    tabSlots: [
      {
        tab: { region: 'wx', side: 'xmax', offset: 6, width: 10, length: 4 },
        slot: { region: 'wy', x: 10, y: 10, clearance: 0.2 },
      },
    ],
  },
  {
    name: 'louvered-panel',
    spec: {
      thickness: T,
      base: { length: 80, width: 50 },
      flanges: [{ id: 'lip', length: 14, angleDeg: 90, rule, side: 'ymax' }],
    },
    forms: [
      { kind: 'louver', region: 'base', x: 25, y: 20, length: 30, width: 8, height: 4 },
      { kind: 'louver', region: 'base', x: 25, y: 35, length: 30, width: 8, height: 4 },
      { kind: 'emboss', region: 'base', x: 60, y: 20, diameter: 10, height: 2, form: 'emboss' },
      { kind: 'emboss', region: 'base', x: 60, y: 35, diameter: 10, height: 0.5, form: 'dimple' },
    ],
  },
  {
    name: 'contour-flange',
    spec: {
      thickness: T,
      base: { length: 60, width: 30 },
      flanges: [],
    },
    // A return / top-hat cross-section swept along the +X edge.
    contourFlanges: [
      {
        id: 'hat',
        side: 'xmax',
        rule,
        profile: [
          { kind: 'line', length: 10 },
          { kind: 'arc', radius: R, angleDeg: 90, direction: 'up' },
          { kind: 'line', length: 14 },
          { kind: 'arc', radius: R, angleDeg: 90, direction: 'up' },
          { kind: 'line', length: 10 },
        ],
      },
    ],
  },
  {
    name: 'lofted-chute',
    spec: {
      thickness: T,
      base: { length: 60, width: 40 },
      flanges: [],
    },
    // A tapered chute: a wide bottom edge transitioning up to a narrower top edge
    // (a developable truncated-wedge ruled transition).
    loftedFlanges: [
      {
        id: 'chute',
        profileA: [
          [10, 40],
          [50, 40],
        ],
        profileB: [
          [22, 40],
          [38, 40],
        ],
        height: 24,
        thickness: T,
      },
    ],
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
  if (demo.bendRelief !== undefined) {
    const relieved = addBendRelief(part, demo.bendRelief.flange);
    if (isErr(relieved)) throw new Error(`bendRelief '${demo.name}' failed: ${relieved.error.message}`);
    part = relieved.value;
  }
  if (demo.cornerRelief !== undefined) {
    const relieved = cornerRelief(part, demo.cornerRelief.a, demo.cornerRelief.b);
    if (isErr(relieved)) throw new Error(`cornerRelief '${demo.name}' failed: ${relieved.error.message}`);
    part = relieved.value;
  }
  for (const spec of demo.cutouts ?? []) {
    const cutResult = addCutout(part, spec);
    if (isErr(cutResult)) throw new Error(`cutout '${demo.name}' failed: ${cutResult.error.message}`);
    part = cutResult.value;
  }
  for (const spec of demo.tabs ?? []) {
    const tabResult = addTab(part, spec);
    if (isErr(tabResult)) throw new Error(`tab '${demo.name}' failed: ${tabResult.error.message}`);
    part = tabResult.value;
  }
  for (const ts of demo.tabSlots ?? []) {
    const tsResult = tabAndSlot(part, ts.tab, ts.slot);
    if (isErr(tsResult)) throw new Error(`tabAndSlot '${demo.name}' failed: ${tsResult.error.message}`);
    part = tsResult.value;
  }
  for (const spec of demo.forms ?? []) {
    const formResult = addForm(part, spec);
    if (isErr(formResult)) throw new Error(`form '${demo.name}' failed: ${formResult.error.message}`);
    part = formResult.value;
  }
  for (const spec of demo.contourFlanges ?? []) {
    const cfResult = authorContourFlange(part, spec);
    if (isErr(cfResult)) throw new Error(`contourFlange '${demo.name}' failed: ${cfResult.error.message}`);
    part = cfResult.value;
  }
  for (const spec of demo.loftedFlanges ?? []) {
    const lfResult = authorLoftedFlange(part, spec);
    if (isErr(lfResult)) throw new Error(`loftedFlange '${demo.name}' failed: ${lfResult.error.message}`);
    part = lfResult.value;
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

  // Fold round-trip: re-derive a FlatInput from the part and fold it back up,
  // demonstrating unfold→fold reproduces the part's volume (the PR2 oracle).
  // Mitered AND relief'd parts are intentionally skipped (a notched/chamfered outline
  // is not a plain rectangle, so patternToFlatInput cannot re-parse it); a failure on
  // a plain demo is a real round-trip regression, so it must surface as such.
  // Tabs, cutouts and forms ride the recorded-feature path (partToFlatInput carries
  // their region-local specs), so a tab'd/formed part still round-trips even though a
  // tab protrudes the outline — the parser recovers the base/flange rectangles from
  // the bend lines and unprotruded edges.
  const skipRoundTrip =
    demo.miter !== undefined ||
    part.reliefs !== undefined ||
    part.contourFlanges !== undefined ||
    part.loftedFlanges !== undefined;
  let roundTrip = '(fold round-trip skipped: mitered/relief’d/contour/lofted part)';
  if (!skipRoundTrip) {
    roundTrip = foldRoundTrip(part);
  }

  return [
    `  [${demo.name}]`,
    `    folded + flat SVG : ${svgPath}`,
    `    folded STEP       : ${stepPath}`,
    `    bend lines        : ${pattern.bendLines.length}`,
    `    cutouts           : ${pattern.holes.length}`,
    `    developed area    : ${pattern.developedArea.toFixed(2)} mm²`,
    `    fold round-trip   : ${roundTrip}`,
    `    warnings          : ${unfolded.value.warnings.length}`,
  ];
}

/**
 * Round-trip a non-mitered part through `partToFlatInput → fold` and report the
 * volume delta. Any Err or missing solid is a genuine round-trip regression, so it
 * is reported as FAILED with the reason — never silently as "skipped".
 */
function foldRoundTrip(part: SheetMetalPart): string {
  if (part.solid === undefined) return '(fold round-trip FAILED: part has no solid)';
  const flatInput = partToFlatInput(part);
  if (isErr(flatInput)) return `(fold round-trip FAILED: ${flatInput.error.message})`;
  const refolded = fold(flatInput.value);
  if (isErr(refolded)) return `(fold round-trip FAILED: ${refolded.error.message})`;
  if (refolded.value.solid === undefined) return '(fold round-trip FAILED: refolded part has no solid)';
  const vA = measureVolume(part.solid);
  const vB = measureVolume(refolded.value.solid);
  if (isErr(vA) || isErr(vB)) return '(fold round-trip FAILED: volume not measurable)';
  return `Δvol ${Math.abs(vA.value - vB.value).toExponential(2)} mm³`;
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
  const holeSegs: Seg2[] = pattern.holes.flatMap((w) =>
    getEdges(w).map((e) => ({ a: to2(curveStartPoint(e)), b: to2(curveEndPoint(e)) }))
  );
  const loftedSegs: Seg2[] = pattern.loftedDevelopments.flatMap((w) =>
    getEdges(w).map((e) => ({ a: to2(curveStartPoint(e)), b: to2(curveEndPoint(e)) }))
  );
  const formSegs: Seg2[] = [
    ...pattern.formCuts,
    ...pattern.formMarkers,
  ].flatMap((w) => getEdges(w).map((e) => ({ a: to2(curveStartPoint(e)), b: to2(curveEndPoint(e)) })));
  const hingeSegs: Seg2[] = pattern.formHinges.map((e) => ({
    a: to2(curveStartPoint(e)),
    b: to2(curveEndPoint(e)),
  }));

  const allPts = [...outlineSegs, ...bendSegs, ...holeSegs, ...loftedSegs, ...formSegs, ...hingeSegs].flatMap((s) => [s.a, s.b]);
  const body =
    outlineSegs
      .map((s) => `<line class="outline" x1="${fmt(s.a[0])}" y1="${fmt(s.a[1])}" x2="${fmt(s.b[0])}" y2="${fmt(s.b[1])}" />`)
      .join('\n') +
    '\n' +
    loftedSegs
      .map((s) => `<line class="outline" x1="${fmt(s.a[0])}" y1="${fmt(s.a[1])}" x2="${fmt(s.b[0])}" y2="${fmt(s.b[1])}" />`)
      .join('\n') +
    '\n' +
    bendSegs
      .map((s) => `<line class="bend" x1="${fmt(s.a[0])}" y1="${fmt(s.a[1])}" x2="${fmt(s.b[0])}" y2="${fmt(s.b[1])}" />`)
      .join('\n') +
    '\n' +
    holeSegs
      .map((s) => `<line class="hole" x1="${fmt(s.a[0])}" y1="${fmt(s.a[1])}" x2="${fmt(s.b[0])}" y2="${fmt(s.b[1])}" />`)
      .join('\n') +
    '\n' +
    formSegs
      .map((s) => `<line class="form" x1="${fmt(s.a[0])}" y1="${fmt(s.a[1])}" x2="${fmt(s.b[0])}" y2="${fmt(s.b[1])}" />`)
      .join('\n') +
    '\n' +
    hingeSegs
      .map((s) => `<line class="hinge" x1="${fmt(s.a[0])}" y1="${fmt(s.a[1])}" x2="${fmt(s.b[0])}" y2="${fmt(s.b[1])}" />`)
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
    `<style>.bend{stroke-dasharray:4 3}.hole{stroke:#2a9d4a}.form{stroke:#9d4aa0}.hinge{stroke:#9d4aa0;stroke-dasharray:2 2}</style>`,
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
