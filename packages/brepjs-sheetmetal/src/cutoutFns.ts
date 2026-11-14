import {
  type Result,
  type Vec3,
  type Solid,
  type Edge,
  ok,
  err,
  validationError,
  line,
  wireLoop,
  face,
  extrude,
  cut,
  cutAll,
  cylinder,
  threePointArc,
  DisposalScope,
  getSolids,
  isValid,
  isPlanarWire,
  vecAdd,
  vecScale,
} from 'brepjs';
import type { CutoutSpec, CutoutFeature, SheetMetalPart } from './types.js';
import { normalizeSolid } from './internal.js';
import { worldFrames, type FlatFrame } from './authorFns.js';
import { layoutTree, type Frame2, type TreeLayout } from './unfoldFns.js';
import { featureTree, ROOT_FLAT_ID } from './featureTreeFns.js';

const EPS = 1e-6;
/** A hair of over-cut so the tool pokes through both faces cleanly. */
const HAIR = 0.05;
/**
 * Polyline segments approximating a circular boundary (hole / obround end cap) in
 * the developed loop. The 3D cut tool keeps the true circle and arcs.
 */
const CIRCLE_SEGMENTS = 48;

type Pt2 = [number, number];

/**
 * Punch a cutout (hole / slot / polygon) through a named flat region's thickness.
 * The 2D profile is built in the region's LOCAL frame, then placed onto the correct
 * folded face via the region's world {@link FlatFrame} (origin/u/v/n) and extruded
 * through the sheet, so a feature authored at local `(x, y)` lands on the matching
 * face whether the region is the base or a folded flange. The same local profile is
 * mapped through the region's developed {@link Frame2} and recorded as a
 * {@link CutoutFeature}, so {@link unfold} emits the matching loop in the flat
 * pattern and {@link fold} can replay it. Guards a valid, single-bodied solid.
 *
 * Each call is one boolean cut on a solid that the cut before it made larger. For
 * a pattern of cutouts, {@link addCutouts} makes one cut for all of them.
 */
export function addCutout(part: SheetMetalPart, spec: CutoutSpec): Result<SheetMetalPart> {
  return punch(part, [spec], 'addCutout');
}

/**
 * Punch many cutouts in one boolean cut. The result is the same part that a chain
 * of {@link addCutout} calls gives, with the features recorded in `specs` order,
 * but the cost does not grow with the square of the count. A spec that fails
 * validation fails the whole call, and no cutout is made.
 */
export function addCutouts(part: SheetMetalPart, specs: readonly CutoutSpec[]): Result<SheetMetalPart> {
  return punch(part, specs, 'addCutouts');
}

function punch(part: SheetMetalPart, specs: readonly CutoutSpec[], label: string): Result<SheetMetalPart> {
  if (part.solid === undefined) {
    return err(validationError('NO_SOLID', `${label}: part has no folded solid to cut`));
  }
  if (specs.length === 0) return ok(part);

  // Walk the feature tree once and thread it into the world-frame and
  // developed-frame lookups of every cutout.
  const treeResult = featureTree(part);
  if (!treeResult.ok) return treeResult;
  const tree = treeResult.value;
  const framesResult = worldFrames(part, tree);
  if (!framesResult.ok) return framesResult;
  const layout = layoutTree(part, tree, part.baseLength, part.width);
  if (!layout.ok) return layout;

  using scope = new DisposalScope();
  const tools: Solid[] = [];
  const features: CutoutFeature[] = [];
  for (const spec of specs) {
    const regionId = resolveRegionId(spec.region);
    const worldFrame = framesResult.value.get(regionId);
    if (worldFrame === undefined) {
      return err(validationError('UNKNOWN_REGION', `${label}: region '${spec.region}' not found`));
    }

    const localResult = localLoop(spec);
    if (!localResult.ok) return localResult;
    const local = localResult.value;

    const oob = checkInBounds(local, regionExtent(part, regionId, worldFrame));
    if (oob !== undefined) {
      return err(validationError('CUTOUT_OUT_OF_BOUNDS', oob));
    }

    const dev = developedFrame(layout.value, regionId);
    if (!dev.ok) return dev;

    const toolResult = buildTool(spec, local, worldFrame, part.thickness, scope);
    if (!toolResult.ok) return toolResult;
    tools.push(scope.register(toolResult.value));

    const loop = local.map((p) => mapToFrame2(p, dev.value));
    features.push({ spec, region: regionId, loop, area: polygonArea(loop) });
  }

  const [only] = tools;
  const cutResult =
    tools.length === 1 && only !== undefined ? cut(part.solid, only) : cutAll(part.solid, tools);
  if (!cutResult.ok) return cutResult;
  const solid = normalizeSolid(cutResult.value);
  if (!isValid(solid) || getSolids(solid).length > 1) {
    const [first] = specs;
    const what =
      specs.length === 1 && first !== undefined
        ? `${first.kind} on region '${first.region}' severs`
        : `the ${specs.length} cutouts sever`;
    return err(
      validationError('CUTOUT_SEVERED_SOLID', `${label}: ${what} the part into multiple bodies`)
    );
  }

  return ok({ ...part, solid, cutouts: [...(part.cutouts ?? []), ...features] });
}

/** Punch a circular hole of `diameter` centred at region-local `(x, y)`. */
export function addHole(
  part: SheetMetalPart,
  region: string,
  x: number,
  y: number,
  diameter: number
): Result<SheetMetalPart> {
  return addCutout(part, { kind: 'hole', region, x, y, diameter });
}

/** Punch a slot centred at `(x, y)`: `length` along the slot axis by `width` across. */
export function addSlot(
  part: SheetMetalPart,
  region: string,
  opts: { x: number; y: number; length: number; width: number; angleDeg?: number; round?: boolean }
): Result<SheetMetalPart> {
  return addCutout(part, { kind: 'slot', region, ...opts });
}

/** Punch an arbitrary polygon cutout from its region-local `points` (≥ 3). */
export function addPolygonCutout(
  part: SheetMetalPart,
  region: string,
  points: [number, number][]
): Result<SheetMetalPart> {
  return addCutout(part, { kind: 'polygon', region, points });
}

/** `'base'` is an alias for the base region; everything else passes through. */
export function resolveRegionId(region: string): string {
  return region === 'base' || region === 'face-0' ? ROOT_FLAT_ID : region;
}

/**
 * Resolve a region's world {@link FlatFrame} and developed {@link Frame2} in one
 * shared feature-tree walk — the lookup tabs/forms need to place geometry on the
 * correct folded face and emit the matching developed-plane loops. Mirrors the
 * frame resolution {@link addCutout} performs inline.
 */
export function regionFrames(
  part: SheetMetalPart,
  region: string
): Result<{ regionId: string; world: FlatFrame; dev: Frame2 }> {
  const regionId = resolveRegionId(region);
  const treeResult = featureTree(part);
  if (!treeResult.ok) return treeResult;
  const tree = treeResult.value;
  const framesResult = worldFrames(part, tree);
  if (!framesResult.ok) return framesResult;
  const world = framesResult.value.get(regionId);
  if (world === undefined) {
    return err(validationError('UNKNOWN_REGION', `region '${region}' not found`));
  }
  const layout = layoutTree(part, tree, part.baseLength, part.width);
  if (!layout.ok) return layout;
  const dev = developedFrame(layout.value, regionId);
  if (!dev.ok) return dev;
  return ok({ regionId, world, dev: dev.value });
}

/** Developed-plane (u, v) extent of a region: base dims, or a flange frame's lengths. */
export function regionDevExtent(part: SheetMetalPart, regionId: string, world: FlatFrame): Extent {
  return regionExtent(part, regionId, world);
}

/** Closed local-plane loop (CCW, no closing-point duplicate) for a cutout spec. */
function localLoop(spec: CutoutSpec): Result<Pt2[]> {
  switch (spec.kind) {
    case 'hole': {
      if (!Number.isFinite(spec.diameter) || spec.diameter <= 0) {
        return err(validationError('INVALID_CUTOUT', `hole diameter must be positive, got ${spec.diameter}`));
      }
      return ok(circlePts([spec.x, spec.y], spec.diameter / 2));
    }
    case 'slot': {
      if (!Number.isFinite(spec.length) || spec.length <= 0 || !Number.isFinite(spec.width) || spec.width <= 0) {
        return err(validationError('INVALID_CUTOUT', `slot length/width must be positive`));
      }
      if (spec.round && spec.width > spec.length + EPS) {
        return err(validationError('INVALID_CUTOUT', `obround slot width must not exceed its length`));
      }
      return ok(slotPts(spec.x, spec.y, spec.length, spec.width, spec.angleDeg ?? 0, spec.round ?? false));
    }
    case 'polygon': {
      if (spec.points.length < 3) {
        return err(validationError('INVALID_CUTOUT', `polygon cutout needs ≥ 3 points, got ${spec.points.length}`));
      }
      return ok(spec.points.map((p) => [p[0], p[1]] as Pt2));
    }
    default:
      return spec satisfies never;
  }
}

function circlePts(center: Pt2, r: number): Pt2[] {
  const pts: Pt2[] = [];
  for (let i = 0; i < CIRCLE_SEGMENTS; i += 1) {
    const a = (2 * Math.PI * i) / CIRCLE_SEGMENTS;
    pts.push([center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)]);
  }
  return pts;
}

/**
 * Slot loop centred at `(cx, cy)`: a `length × width` rectangle (square ends), or an
 * obround (semicircular ends, radius `width/2`) when `round`. Built axis-aligned
 * (length along local +x) then rotated by `angleDeg` about the centre.
 */
function slotPts(cx: number, cy: number, length: number, width: number, angleDeg: number, round: boolean): Pt2[] {
  const hw = width / 2;
  const pts: Pt2[] = [];
  if (!round) {
    const hl = length / 2;
    pts.push([-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]);
  } else {
    const straight = length / 2 - hw;
    const half = Math.max(CIRCLE_SEGMENTS / 2, 2);
    // Right semicircle (from bottom to top), then left semicircle.
    for (let i = 0; i <= half; i += 1) {
      const a = -Math.PI / 2 + (Math.PI * i) / half;
      pts.push([straight + hw * Math.cos(a), hw * Math.sin(a)]);
    }
    for (let i = 0; i <= half; i += 1) {
      const a = Math.PI / 2 + (Math.PI * i) / half;
      pts.push([-straight + hw * Math.cos(a), hw * Math.sin(a)]);
    }
  }
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}

/** Local-frame extent the cutout must fit within. */
export interface Extent {
  uMax: number;
  vMax: number;
}

function regionExtent(part: SheetMetalPart, regionId: string, worldFrame: FlatFrame): Extent {
  if (regionId === ROOT_FLAT_ID) return { uMax: part.baseLength, vMax: part.width };
  // A flange frame's uLen = span (along the bend axis), vLen = flat length.
  return { uMax: worldFrame.uLen, vMax: worldFrame.vLen };
}

/** First out-of-bounds message, or undefined if the whole loop lies inside the region. */
function checkInBounds(local: Pt2[], ext: Extent): string | undefined {
  for (const [x, y] of local) {
    if (x < -EPS || x > ext.uMax + EPS || y < -EPS || y > ext.vMax + EPS) {
      return `cutout point (${x.toFixed(3)}, ${y.toFixed(3)}) lies outside region extent [0,${ext.uMax}]×[0,${ext.vMax}]`;
    }
  }
  return undefined;
}

/**
 * Build the 3D cut tool on the region's bottom surface, a hair below it
 * (`origin + x·u + y·v − HAIR·n`), through the sheet by `thickness + 2·HAIR` along
 * +n. Using the world frame's `u`/`v`/`n` is what lands the cut on the correct
 * folded face. A hole is a true cylinder and an obround slot has true arcs, so a
 * round cutout adds one or two curved faces to the solid, not one planar face for
 * each segment of its developed loop. Intermediate shapes go to `scope`.
 */
function buildTool(
  spec: CutoutSpec,
  local: Pt2[],
  f: FlatFrame,
  thickness: number,
  scope: DisposalScope
): Result<Solid> {
  const base = vecAdd(f.origin, vecScale(f.n, -HAIR));
  const toWorld = ([x, y]: Pt2): Vec3 => vecAdd(vecAdd(base, vecScale(f.u, x)), vecScale(f.v, y));
  const depth = thickness + 2 * HAIR;

  if (spec.kind === 'hole') {
    return ok(cylinder(spec.diameter / 2, depth, { at: toWorld([spec.x, spec.y]), axis: f.n }));
  }

  const edges =
    spec.kind === 'slot' && spec.round === true
      ? obroundEdges(spec, toWorld)
      : polylineEdges(local, toWorld);
  for (const e of edges) scope.register(e);
  const wire = wireLoop(edges);
  if (!wire.ok) return wire;
  scope.register(wire.value);
  if (!isPlanarWire(wire.value)) {
    return err(validationError('CUTOUT_TOOL_FAILED', 'cutout profile wire is not planar'));
  }
  const profile = face(wire.value);
  if (!profile.ok) return profile;
  scope.register(profile.value);
  return extrude(profile.value, [f.n[0] * depth, f.n[1] * depth, f.n[2] * depth]);
}

function polylineEdges(local: Pt2[], toWorld: (p: Pt2) => Vec3): Edge[] {
  const pts = local.map(toWorld);
  return pts.map((a, i) => line(a, pts[(i + 1) % pts.length] ?? a));
}

/**
 * Edges of an obround slot: two straight sides joined by two semicircles of radius
 * `width/2`. A slot as wide as it is long has no straight side, so it is two
 * semicircles (a circle).
 */
function obroundEdges(
  spec: Extract<CutoutSpec, { kind: 'slot' }>,
  toWorld: (p: Pt2) => Vec3
): Edge[] {
  const hw = spec.width / 2;
  const straight = Math.max(spec.length / 2 - hw, 0);
  const rad = ((spec.angleDeg ?? 0) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const at = (x: number, y: number): Vec3 => toWorld([spec.x + x * c - y * s, spec.y + x * s + y * c]);

  const rightBottom = at(straight, -hw);
  const rightTop = at(straight, hw);
  const leftTop = at(-straight, hw);
  const leftBottom = at(-straight, -hw);
  const edges: Edge[] = [threePointArc(rightBottom, at(straight + hw, 0), rightTop)];
  if (straight > EPS) edges.push(line(rightTop, leftTop));
  edges.push(threePointArc(leftTop, at(-straight - hw, 0), leftBottom));
  if (straight > EPS) edges.push(line(leftBottom, rightBottom));
  return edges;
}

/** Developed-plane {@link Frame2} of a region (base or flange) in the unfold layout. */
function developedFrame(layout: TreeLayout, regionId: string): Result<Frame2> {
  const placed = layout.flats.find((p) => p.id === regionId);
  if (placed === undefined) {
    return err(validationError('UNKNOWN_REGION', `developedFrame: region '${regionId}' missing from layout`));
  }
  return ok(placed.frame);
}

/** Map a region-local `(x, y)` into developed-plane coordinates via its {@link Frame2}. */
export function mapToFrame2(p: Pt2, f: Frame2): Pt2 {
  return [
    f.origin[0] + f.u[0] * p[0] + f.v[0] * p[1],
    f.origin[1] + f.u[1] * p[0] + f.v[1] * p[1],
  ];
}

/** Shoelace area (always positive) of a closed loop. */
function polygonArea(loop: Pt2[]): number {
  let sum = 0;
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    if (a === undefined || b === undefined) continue;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}
