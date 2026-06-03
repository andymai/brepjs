import {
  type Result,
  type Wire,
  type Edge,
  ok,
  err,
  validationError,
  line,
  wire,
  wireLoop,
} from 'brepjs';
import type {
  SheetMetalPart,
  UnfoldResult,
  FlatPattern,
  BendReport,
  SheetMetalWarning,
  CornerMiter,
  FlatSide,
} from './types.js';
import { featureTree, type FeatureTree, ROOT_FLAT_ID } from './featureTreeFns.js';
import { developedLength } from './allowanceFns.js';
import { sideFromAxisDir } from './internal.js';

type Pt2 = [number, number];

/**
 * Tree-driven analytic unfold of an arbitrary straight-bend part into its flat
 * pattern. Walks the feature tree in BFS order placing every flat in the flat
 * plane: the base occupies `[0,baseLength]×[0,width]`; each child flange lays a
 * developed-bend strip (width = neutral-axis arc length) along the parent edge it
 * folds from — respecting its offset/span along that edge — then its own flat past
 * the strip, perpendicular to the edge and pointing outward. The developed outline
 * is the rectilinear union of the base and every placed flat/strip rectangle,
 * emitted as a single closed brepjs wire. A recorded corner miter replaces the
 * shared reflex corner of two perpendicular base flanges with a 45° chamfer.
 * Closed profiles produce a SEAM_CUT warning (the cycle-closing bend is left
 * unfolded). Warnings ride inside the Ok payload.
 */
export function unfold(part: SheetMetalPart): Result<UnfoldResult> {
  const treeResult = featureTree(part);
  if (!treeResult.ok) return treeResult;
  const tree = treeResult.value;

  const baseLength = part.baseLength;
  if (!Number.isFinite(baseLength) || baseLength <= 0) {
    return err(validationError('INVALID_BASE_LENGTH', `part baseLength must be positive, got ${baseLength}`));
  }
  const width = part.width;
  if (!Number.isFinite(width) || width <= 0) {
    return err(validationError('INVALID_WIDTH', `part width must be positive, got ${width}`));
  }

  const warnings: SheetMetalWarning[] = [...tree.warnings];

  const layoutResult = layoutTree(part, tree, baseLength, width, (warning) => warnings.push(warning));
  if (!layoutResult.ok) return layoutResult;
  const layout = layoutResult.value;

  for (const placed of layout.flats) {
    if (placed.kind !== 'flange') continue;
    if (part.thickness > 0 && placed.rule.innerRadius < part.thickness) {
      warnings.push({
        code: 'MIN_RADIUS',
        message: `bend '${placed.id}' inner radius ${placed.rule.innerRadius} < thickness ${part.thickness}`,
        featureId: placed.id,
      });
    }
  }

  // Contour-flange developed strips lay out straight along their base edge; compute
  // them first so their rectangles join the outline union below.
  const contourResult = buildContourDevelopments(part);
  if (!contourResult.ok) return contourResult;

  // Hems and jogs lay their multi-bend developed strips out straight along their
  // region edge (the base or a flange), exactly like a contour flange.
  const hemJogResult = buildHemJogDevelopments(part, layout);
  if (!hemJogResult.ok) return hemJogResult;

  const rects: Rect[] = [];
  for (const placed of layout.flats) rects.push(placed.rect);
  for (const strip of layout.strips) rects.push(strip);
  for (const strip of contourResult.value.strips) rects.push(strip);
  for (const strip of hemJogResult.value.strips) rects.push(strip);

  // Tabs are additive protrusions: their developed rectangles join the outer-outline
  // union and add to the developed area.
  const tabRects: Rect[] = (part.tabs ?? []).map((t) => ({ x0: t.rect[0], y0: t.rect[1], x1: t.rect[2], y1: t.rect[3] }));
  for (const r of tabRects) rects.push(r);

  const notches: Rect[] = (part.reliefs ?? []).flatMap((relief) =>
    relief.notches.map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 }))
  );
  // The L-miter chamfer special-case can't express tabs either; once any tab is
  // recorded, fall through to the rectilinear-union path (which absorbs tab rects).
  // The 3D corner-miter cut still stands; only the developed chamfer is omitted.
  const miters = tabRects.length > 0 ? [] : part.miters ?? [];
  if (tabRects.length > 0 && (part.miters ?? []).length > 0) {
    warnings.push({
      code: 'MITER_NOT_DEVELOPED',
      message: 'developed outline omits the corner-miter chamfer because a tab is present; the 3D miter cut is unaffected',
    });
  }
  const outlineResult = buildOutline(rects, layout, miters, notches);
  if (!outlineResult.ok) return outlineResult;
  layout.developedArea -= removedNotchArea(rects, notches);
  for (const t of part.tabs ?? []) layout.developedArea += t.area;

  const holesResult = buildHoles(part);
  if (!holesResult.ok) return holesResult;
  for (const c of part.cutouts ?? []) layout.developedArea -= c.area;

  const formsResult = buildForms(part);
  if (!formsResult.ok) return formsResult;

  const loftedResult = buildLoftedDevelopments(part);
  if (!loftedResult.ok) return loftedResult;
  for (const lf of part.loftedFlanges ?? []) {
    layout.developedArea += lf.developedArea;
    if (lf.approximate) {
      warnings.push({
        code: 'DEVELOPMENT_APPROXIMATE',
        message: `lofted flange '${lf.id}' transition is not developable; its triangulated flat development is an approximation`,
        featureId: lf.id,
      });
    }
  }

  for (const cf of part.contourFlanges ?? []) {
    layout.developedArea += cf.developedLength * cf.span;
  }

  for (const h of part.hems ?? []) {
    layout.developedArea += h.developedLength * h.span;
  }
  for (const j of part.jogs ?? []) {
    layout.developedArea += j.developedLength * j.span;
  }

  const bendLines = layout.flats
    .filter((p): p is PlacedFlange => p.kind === 'flange')
    .map((p) => ({
      id: p.id,
      line: bendLineEdge(p),
      angleDeg: p.angleDeg,
      direction: p.direction,
      // The child frame's v axis is the develop-out direction; into-parent is its
      // negation. Correct for chained flanges too (it is local to the placement).
      inward: [-p.frame.v[0], -p.frame.v[1]] as [number, number],
    }))
    .concat(contourResult.value.bendLines)
    .concat(hemJogResult.value.bendLines);

  const pattern: FlatPattern = {
    outline: outlineResult.value,
    bendLines,
    holes: holesResult.value,
    formCuts: formsResult.value.cuts,
    formMarkers: formsResult.value.markers,
    formHinges: formsResult.value.hinges,
    loftedDevelopments: loftedResult.value,
    developedArea: layout.developedArea,
  };

  const report = reportFromLayout(layout);

  return ok({ pattern, report, warnings });
}

/** A placed flat rectangle in the developed (flat-pattern) plane. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 2D frame of a placed flat: occupies [0,uLen]×[0,vLen] in (u,v) from `origin`. */
export interface Frame2 {
  origin: Pt2;
  u: Pt2;
  v: Pt2;
  uLen: number;
  vLen: number;
}

export interface PlacedBase {
  kind: 'base';
  id: string;
  rect: Rect;
  frame: Frame2;
}

export interface PlacedFlange {
  kind: 'flange';
  id: string;
  rect: Rect;
  frame: Frame2;
  /** Strip rectangle laid along the parent edge (developed bend). */
  strip: Rect;
  /** Bend line endpoints (along the parent edge, over the flange span). */
  bendA: Pt2;
  bendB: Pt2;
  dev: number;
  length: number;
  span: number;
  angleDeg: number;
  direction: 'up' | 'down';
  rule: { innerRadius: number; kFactor: number; allowance?: number | undefined };
  /** True when this flange folds directly off the base and spans its full edge. */
  baseFull: boolean;
  side: FlatSide;
}

export type Placed = PlacedBase | PlacedFlange;

export interface TreeLayout {
  baseLength: number;
  width: number;
  developedArea: number;
  flats: Placed[];
  strips: Rect[];
}

export function layoutTree(
  part: SheetMetalPart,
  tree: FeatureTree,
  baseLength: number,
  width: number,
  onWarning?: (warning: SheetMetalWarning) => void
): Result<TreeLayout> {
  const frames = new Map<string, Frame2>();
  frames.set(ROOT_FLAT_ID, {
    origin: [0, 0],
    u: [1, 0],
    v: [0, 1],
    uLen: baseLength,
    vLen: width,
  });

  const flats: Placed[] = [
    {
      kind: 'base',
      id: ROOT_FLAT_ID,
      frame: frames.get(ROOT_FLAT_ID) as Frame2,
      rect: rectOf(frames.get(ROOT_FLAT_ID) as Frame2),
    },
  ];
  const strips: Rect[] = [];
  let developedArea = baseLength * width;

  for (const treeBend of tree.bends) {
    const childNode = tree.nodes.get(treeBend.child);
    if (childNode === undefined || childNode.flange === undefined) {
      return err(
        validationError('UNKNOWN_FLAT', `child flat '${treeBend.child}' has no flange feature`)
      );
    }
    const flange = childNode.flange;
    const parentFrame = frames.get(treeBend.parent);
    if (parentFrame === undefined) {
      return err(
        validationError('UNKNOWN_FLAT', `parent flat '${treeBend.parent}' missing from layout`)
      );
    }

    const devResult = developedLength(treeBend.bend.angleDeg, part.thickness, treeBend.bend.rule, onWarning);
    if (!devResult.ok) return devResult;
    const dev = devResult.value;

    // Authored parts always record `baseEdge.side`; hand-built fixtures may encode
    // the develop direction only via the bend axis, so fall back to that.
    const side: FlatSide = flange.baseEdge.side ?? sideFromAxisDir(treeBend.bend.axisDir) ?? 'xmax';
    const offset = flange.offset ?? flange.baseEdge.offset ?? 0;
    const span = flange.span;
    const length = flange.length;

    const placed = placeChild(flange.id, parentFrame, side, offset, span, dev, length, {
      angleDeg: treeBend.bend.angleDeg,
      direction: treeBend.bend.direction,
      rule: treeBend.bend.rule,
      baseFull: treeBend.parent === ROOT_FLAT_ID && offset <= 1e-6 && span >= edgeLength(parentFrame, side) - 1e-6,
      side,
    });
    frames.set(flange.id, placed.frame);
    flats.push(placed);
    strips.push(placed.strip);
    developedArea += (dev + length) * span;
  }

  return ok({ baseLength, width, developedArea, flats, strips });
}

function edgeLength(f: Frame2, side: FlatSide): number {
  return side === 'xmax' || side === 'xmin' ? f.vLen : f.uLen;
}

/**
 * Place a child flange off `parent`'s edge `side`. The strip (developed bend) is
 * laid from the edge outward by `dev`; the child flat follows for `length`. The
 * child's own 2D frame starts past the strip so grandchildren chain correctly.
 */
function placeChild(
  id: string,
  parent: Frame2,
  side: FlatSide,
  offset: number,
  span: number,
  dev: number,
  length: number,
  meta: {
    angleDeg: number;
    direction: 'up' | 'down';
    rule: { innerRadius: number; kFactor: number; allowance?: number | undefined };
    baseFull: boolean;
    side: FlatSide;
  }
): PlacedFlange {
  // Edge basis in 2D: `along` runs the edge (bend axis), `out` points outward.
  const { along, out, edgeOrigin } = edgeBasis2(parent, side);

  const base = add2(edgeOrigin, scale2(along, offset));
  const bendA = base;
  const bendB = add2(base, scale2(along, span));

  const stripFar = add2(base, scale2(out, dev));

  const strip = rectFromCorners(base, add2(bendB, scale2(out, dev)));
  const flatRect = rectFromCorners(stripFar, add2(add2(stripFar, scale2(along, span)), scale2(out, length)));

  const childFrame: Frame2 = {
    origin: stripFar,
    u: along,
    v: out,
    uLen: span,
    vLen: length,
  };

  return {
    kind: 'flange',
    id,
    frame: childFrame,
    rect: flatRect,
    strip,
    bendA,
    bendB,
    dev,
    length,
    span,
    angleDeg: meta.angleDeg,
    direction: meta.direction,
    rule: meta.rule,
    baseFull: meta.baseFull,
    side: meta.side,
  };
}

/** Edge origin + along/out unit directions for one side of a 2D frame. */
export function edgeBasis2(f: Frame2, side: FlatSide): { along: Pt2; out: Pt2; edgeOrigin: Pt2 } {
  const uTop = add2(f.origin, scale2(f.u, f.uLen));
  const vTop = add2(f.origin, scale2(f.v, f.vLen));
  switch (side) {
    case 'xmax':
      return { along: f.v, out: f.u, edgeOrigin: uTop };
    case 'xmin':
      return { along: f.v, out: neg2(f.u), edgeOrigin: f.origin };
    case 'ymax':
      return { along: f.u, out: f.v, edgeOrigin: vTop };
    case 'ymin':
      return { along: f.u, out: neg2(f.v), edgeOrigin: f.origin };
    default:
      return side satisfies never;
  }
}

function bendLineEdge(p: PlacedFlange): Edge {
  return line([p.bendA[0], p.bendA[1], 0], [p.bendB[0], p.bendB[1], 0]);
}

/**
 * One closed developed-plane {@link Wire} per recorded cutout, traced from the
 * feature's already-mapped `loop` (which {@link addCutout} positioned via the
 * region's developed frame, so the loop sits at the cutout's matching flat-pattern
 * spot). Emitted as interior holes of the pattern; the outer outline is unchanged.
 */
function buildHoles(part: SheetMetalPart): Result<Wire[]> {
  const wires: Wire[] = [];
  for (const c of part.cutouts ?? []) {
    const loop = c.loop;
    if (loop.length < 3) {
      return err(validationError('CUTOUT_LOOP_TOO_SMALL', `cutout loop has ${loop.length} points, need ≥ 3`));
    }
    const edges: Edge[] = [];
    for (let i = 0; i < loop.length; i += 1) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      if (a === undefined || b === undefined) {
        return err(validationError('CUTOUT_LOOP_FAILED', 'failed to index cutout loop'));
      }
      edges.push(line([a[0], a[1], 0], [b[0], b[1], 0]));
    }
    const wire = wireLoop(edges);
    if (!wire.ok) return wire;
    wires.push(wire.value);
  }
  return ok(wires);
}

interface FormWires {
  cuts: Wire[];
  markers: Wire[];
  hinges: Edge[];
}

/**
 * Developed-plane wires for recorded form features: each louver U-cut and emboss
 * footprint as a closed {@link Wire}, plus each louver hinge as an {@link Edge}. The
 * loops were already mapped into developed coordinates when the form was recorded
 * (via the region's developed frame), so this just traces them. Forms are net-
 * material-neutral, so the outer outline and developed area are untouched.
 */
function buildForms(part: SheetMetalPart): Result<FormWires> {
  const cuts: Wire[] = [];
  const markers: Wire[] = [];
  const hinges: Edge[] = [];
  for (const form of part.forms ?? []) {
    for (const path of form.cuts) {
      const cutWire = openPathWire(path);
      if (!cutWire.ok) return cutWire;
      cuts.push(cutWire.value);
    }
    for (const loop of form.markers) {
      const markerWire = closedLoopWire(loop);
      if (!markerWire.ok) return markerWire;
      markers.push(markerWire.value);
    }
    if (form.hinge !== undefined) {
      const [a, b] = form.hinge;
      hinges.push(line([a[0], a[1], 0], [b[0], b[1], 0]));
    }
  }
  return ok({ cuts, markers, hinges });
}

/**
 * Closed developed-plane {@link Wire}s for recorded lofted/ruled transition flanges.
 * Each feature's triangulated `developedLoop` was already laid out flat when the
 * flange was authored, so this just traces it into a wire; the boundary is non-
 * rectilinear so it rides separately from the rectilinear-union outline.
 */
function buildLoftedDevelopments(part: SheetMetalPart): Result<Wire[]> {
  const wires: Wire[] = [];
  for (const lf of part.loftedFlanges ?? []) {
    const w = closedLoopWire(lf.developedLoop);
    if (!w.ok) return w;
    wires.push(w.value);
  }
  return ok(wires);
}

interface ContourDevelopments {
  /** Developed strip rectangles (one per contour flange) for the outline union. */
  strips: Rect[];
  /** Developed bend lines (one per arc segment) in the flat pattern. */
  bendLines: FlatPattern['bendLines'];
}

/**
 * Lay each recorded contour flange's developed strip out STRAIGHT along its base
 * edge: a rectangle `span` wide along the edge by `developedLength` out from it,
 * returned for the outer-outline union. One bend line per arc segment is placed at
 * that segment's cumulative developed offset out from the base edge — the EXACT
 * arc-length sum, so the strip length equals Σ segment developed lengths with no
 * error.
 */
function buildContourDevelopments(part: SheetMetalPart): Result<ContourDevelopments> {
  const strips: Rect[] = [];
  const bendLines: FlatPattern['bendLines'] = [];
  const baseFrame: Frame2 = {
    origin: [0, 0],
    u: [1, 0],
    v: [0, 1],
    uLen: part.baseLength,
    vLen: part.width,
  };

  for (const cf of part.contourFlanges ?? []) {
    const { along, out, edgeOrigin } = edgeBasis2(baseFrame, cf.side);
    const base = add2(edgeOrigin, scale2(along, cf.offset));
    strips.push(
      rectFromCorners(base, add2(add2(base, scale2(along, cf.span)), scale2(out, cf.developedLength)))
    );

    let cumulative = 0;
    for (const seg of cf.segments) {
      if (seg.kind === 'arc') {
        const a = add2(base, scale2(out, cumulative));
        const b = add2(a, scale2(along, cf.span));
        bendLines.push({
          id: seg.bendId ?? cf.id,
          line: line([a[0], a[1], 0], [b[0], b[1], 0]),
          angleDeg: seg.angleDeg ?? 0,
          direction: seg.direction ?? 'up',
          inward: [-out[0], -out[1]] as [number, number],
        });
      }
      cumulative += seg.dev;
    }
  }
  return ok({ strips, bendLines });
}

interface HemJogDevelopments {
  /** Developed strip rectangles (one per hem/jog) for the outline union. */
  strips: Rect[];
  /** Developed bend lines (one per curl/step sub-bend) in the flat pattern. */
  bendLines: FlatPattern['bendLines'];
}

/**
 * Lay each recorded hem and jog developed strip out STRAIGHT along its region edge
 * (the base or a flange), mirroring {@link buildContourDevelopments}. The region's
 * developed-plane {@link Frame2} comes from the tree layout (so a hem on a flange
 * lands on that flange's developed face). Each sub-bend (a hem curl arc or a jog
 * step arc) gets a bend line at its EXACT cumulative developed offset out from the
 * edge — Σ segment developed lengths, so the strip length is exact.
 */
function buildHemJogDevelopments(part: SheetMetalPart, layout: TreeLayout): Result<HemJogDevelopments> {
  const strips: Rect[] = [];
  const bendLines: FlatPattern['bendLines'] = [];

  const frameFor = (region: string): Frame2 | undefined => {
    const id = region === 'base' || region === 'face-0' ? ROOT_FLAT_ID : region;
    for (const p of layout.flats) {
      if (p.id === id) return p.frame;
    }
    return undefined;
  };

  interface Strip {
    region: string;
    side: FlatSide;
    offset: number;
    span: number;
    developedLength: number;
    segments: {
      kind: 'line' | 'arc';
      dev: number;
      angleDeg?: number | undefined;
      direction?: 'up' | 'down' | undefined;
      bendId?: string | undefined;
    }[];
  }
  const allStrips: Strip[] = [
    ...(part.hems ?? []).map((h) => ({
      region: h.region,
      side: h.side,
      offset: h.offset,
      span: h.span,
      developedLength: h.developedLength,
      segments: h.segments,
    })),
    ...(part.jogs ?? []).map((j) => ({
      region: j.region,
      side: j.side,
      offset: j.offset,
      span: j.span,
      developedLength: j.developedLength,
      segments: j.segments,
    })),
  ];

  for (const s of allStrips) {
    const regionFrame = frameFor(s.region);
    if (regionFrame === undefined) {
      return err(validationError('UNKNOWN_HEMJOG_REGION', `hem/jog region '${s.region}' missing from layout`));
    }
    const { along, out, edgeOrigin } = edgeBasis2(regionFrame, s.side);
    const base = add2(edgeOrigin, scale2(along, s.offset));
    strips.push(rectFromCorners(base, add2(add2(base, scale2(along, s.span)), scale2(out, s.developedLength))));

    let cumulative = 0;
    for (const seg of s.segments) {
      if (seg.kind === 'arc') {
        const a = add2(base, scale2(out, cumulative));
        const b = add2(a, scale2(along, s.span));
        bendLines.push({
          id: seg.bendId ?? s.region,
          line: line([a[0], a[1], 0], [b[0], b[1], 0]),
          angleDeg: seg.angleDeg ?? 0,
          direction: seg.direction ?? 'up',
          inward: [-out[0], -out[1]] as [number, number],
        });
      }
      cumulative += seg.dev;
    }
  }
  return ok({ strips, bendLines });
}

/** Trace a closed developed-plane loop (≥ 3 points) into a brepjs {@link Wire}. */
function closedLoopWire(loop: Pt2[]): Result<Wire> {
  if (loop.length < 3) {
    return err(validationError('FORM_LOOP_TOO_SMALL', `form loop has ${loop.length} points, need ≥ 3`));
  }
  const edges: Edge[] = [];
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    if (a === undefined || b === undefined) {
      return err(validationError('FORM_LOOP_FAILED', 'failed to index form loop'));
    }
    edges.push(line([a[0], a[1], 0], [b[0], b[1], 0]));
  }
  return wireLoop(edges);
}

/** Trace an OPEN developed-plane path (≥ 2 points) into a brepjs {@link Wire}. */
function openPathWire(path: Pt2[]): Result<Wire> {
  if (path.length < 2) {
    return err(validationError('FORM_PATH_TOO_SHORT', `form cut path has ${path.length} points, need ≥ 2`));
  }
  const edges: Edge[] = [];
  for (let i = 0; i + 1 < path.length; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    if (a === undefined || b === undefined) {
      return err(validationError('FORM_LOOP_FAILED', 'failed to index form cut path'));
    }
    edges.push(line([a[0], a[1], 0], [b[0], b[1], 0]));
  }
  return wire(edges);
}

function rectOf(f: Frame2): Rect {
  const c0 = f.origin;
  const c1 = add2(add2(f.origin, scale2(f.u, f.uLen)), scale2(f.v, f.vLen));
  return rectFromCorners(c0, c1);
}

function rectFromCorners(a: Pt2, b: Pt2): Rect {
  return {
    x0: Math.min(a[0], b[0]),
    y0: Math.min(a[1], b[1]),
    x1: Math.max(a[0], b[0]),
    y1: Math.max(a[1], b[1]),
  };
}

function add2(a: Pt2, b: Pt2): Pt2 {
  return [a[0] + b[0], a[1] + b[1]];
}
function scale2(a: Pt2, s: number): Pt2 {
  return [a[0] * s, a[1] * s];
}
function neg2(a: Pt2): Pt2 {
  return [-a[0], -a[1]];
}

/**
 * Outline of the developed pattern. For the simple two-perpendicular-flange L
 * (base + an east + a north flange) a recorded corner miter chamfers the reflex
 * vertex; otherwise the outline is the rectilinear union of all placed rectangles
 * emitted as one closed loop. Holes are not possible for the supported shapes
 * (every arm attaches to the simply-connected base or a chain thereof).
 */
function buildOutline(
  rects: Rect[],
  layout: TreeLayout,
  miters: CornerMiter[],
  notches: Rect[]
): Result<Wire> {
  // The lShapedMiter chamfer special-case can't express a notch, so once any relief
  // is recorded fall through to the rectilinear-union path (which subtracts notches).
  const miterCorners = notches.length > 0 ? undefined : lShapedMiter(layout, miters);
  const corners = miterCorners ?? rectilinearUnion(rects, notches);
  if (corners.length < 3) {
    return err(validationError('OUTLINE_BUILD_FAILED', 'developed outline has fewer than 3 vertices'));
  }
  const edges: Edge[] = [];
  for (let i = 0; i < corners.length; i += 1) {
    const from = corners[i];
    const to = corners[(i + 1) % corners.length];
    if (from === undefined || to === undefined) {
      return err(validationError('OUTLINE_BUILD_FAILED', 'failed to index outline corners'));
    }
    edges.push(line([from[0], from[1], 0], [to[0], to[1], 0]));
  }
  return wireLoop(edges);
}

/**
 * Special-case the classic L: a base with exactly one east (+X) and one north
 * (+Y) full-span flange and a recorded miter between them. Returns the chamfered
 * hexagon; `undefined` if this isn't that shape (fall back to the union outline).
 */
function lShapedMiter(layout: TreeLayout, miters: CornerMiter[]): Pt2[] | undefined {
  const flanges = layout.flats.filter((p): p is PlacedFlange => p.kind === 'flange');
  if (flanges.length !== 2) return undefined;
  const east = flanges.find((f) => f.baseFull && f.side === 'xmax');
  const north = flanges.find((f) => f.baseFull && f.side === 'ymax');
  if (east === undefined || north === undefined) return undefined;

  const baseLength = layout.baseLength;
  const width = layout.width;
  const maxX = baseLength + east.dev + east.length;
  const maxY = width + north.dev + north.length;
  const gap = miterGapFor(miters, east.id, north.id);

  if (gap === undefined || gap <= 0) {
    return [
      [0, 0],
      [maxX, 0],
      [maxX, width],
      [baseLength, width],
      [baseLength, maxY],
      [0, maxY],
    ];
  }
  return [
    [0, 0],
    [maxX, 0],
    [maxX, width],
    [baseLength + gap, width],
    [baseLength, width + gap],
    [baseLength, maxY],
    [0, maxY],
  ];
}

function miterGapFor(miters: CornerMiter[], aId: string, bId: string): number | undefined {
  for (const m of miters) {
    if ((m.flangeA === aId && m.flangeB === bId) || (m.flangeA === bId && m.flangeB === aId)) {
      return m.gap;
    }
  }
  return undefined;
}

/**
 * Outline loop of the union of axis-aligned rectangles, assuming the union is a
 * single simply-connected rectilinear region (true for every shape this package
 * authors: arms attached to a connected base). Built by a vertical-line sweep
 * tracking the covered y-spans, then tracing the boundary contour. The sweep emits
 * a CCW loop of corner points with no collinear duplicates.
 */
function rectilinearUnion(rects: Rect[], notches: Rect[] = []): Pt2[] {
  const cuts = [...rects.flatMap((r) => [r.x0, r.x1]), ...notches.flatMap((r) => [r.x0, r.x1])];
  const cutsY = [...rects.flatMap((r) => [r.y0, r.y1]), ...notches.flatMap((r) => [r.y0, r.y1])];
  const xs = uniqueSorted(cuts);
  const ys = uniqueSorted(cutsY);
  if (xs.length < 2 || ys.length < 2) return [];

  // Cell-occupancy grid: a cell is filled if its centre lies in the rectangle union
  // and in no notch (notches subtract material; they sit on the boundary so the
  // result stays simply-connected).
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const filled = new Set<number>();
  for (let i = 0; i < nx; i += 1) {
    const cx = ((xs[i] as number) + (xs[i + 1] as number)) / 2;
    for (let j = 0; j < ny; j += 1) {
      const cy = ((ys[j] as number) + (ys[j + 1] as number)) / 2;
      const inRect = rects.some((r) => cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1);
      const inNotch = notches.some((r) => cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1);
      if (inRect && !inNotch) filled.add(i * ny + j);
    }
  }

  // Collect boundary unit-edges (segments between adjacent grid nodes that border
  // a filled and an unfilled cell), oriented CCW (filled cell on the left).
  const segs: { a: Pt2; b: Pt2 }[] = [];
  const isFilled = (i: number, j: number): boolean =>
    i >= 0 && i < nx && j >= 0 && j < ny && filled.has(i * ny + j);

  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < ny; j += 1) {
      if (!isFilled(i, j)) continue;
      const x0 = xs[i] as number;
      const x1 = xs[i + 1] as number;
      const y0 = ys[j] as number;
      const y1 = ys[j + 1] as number;
      // Bottom edge: boundary if cell below is empty. CCW → left-to-right.
      if (!isFilled(i, j - 1)) segs.push({ a: [x0, y0], b: [x1, y0] });
      // Top edge: boundary if cell above empty. CCW → right-to-left.
      if (!isFilled(i, j + 1)) segs.push({ a: [x1, y1], b: [x0, y1] });
      // Left edge: boundary if cell left empty. CCW → top-to-bottom.
      if (!isFilled(i - 1, j)) segs.push({ a: [x0, y1], b: [x0, y0] });
      // Right edge: boundary if cell right empty. CCW → bottom-to-top.
      if (!isFilled(i + 1, j)) segs.push({ a: [x1, y0], b: [x1, y1] });
    }
  }

  return traceLoop(segs);
}

/**
 * Area of material removed by the relief notches: the portion of each notch that
 * overlaps the rectangle union, summed over a shared cell grid so overlapping
 * notches (e.g. two corner reliefs meeting) are not double-counted.
 */
function removedNotchArea(rects: Rect[], notches: Rect[]): number {
  if (notches.length === 0) return 0;
  const xs = uniqueSorted([
    ...rects.flatMap((r) => [r.x0, r.x1]),
    ...notches.flatMap((r) => [r.x0, r.x1]),
  ]);
  const ys = uniqueSorted([
    ...rects.flatMap((r) => [r.y0, r.y1]),
    ...notches.flatMap((r) => [r.y0, r.y1]),
  ]);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i += 1) {
    const x0 = xs[i] as number;
    const x1 = xs[i + 1] as number;
    const cx = (x0 + x1) / 2;
    for (let j = 0; j + 1 < ys.length; j += 1) {
      const y0 = ys[j] as number;
      const y1 = ys[j + 1] as number;
      const cy = (y0 + y1) / 2;
      const inRect = rects.some((r) => cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1);
      const inNotch = notches.some((r) => cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1);
      if (inRect && inNotch) area += (x1 - x0) * (y1 - y0);
    }
  }
  return area;
}

/** Chain oriented boundary segments into a single loop, dropping collinear points. */
function traceLoop(segs: { a: Pt2; b: Pt2 }[]): Pt2[] {
  if (segs.length === 0) return [];
  const key = (p: Pt2): string => `${p[0]}|${p[1]}`;
  const from = new Map<string, Pt2>();
  for (const s of segs) from.set(key(s.a), s.b);

  const startSeg = segs[0] as { a: Pt2; b: Pt2 };
  const start = startSeg.a;
  const raw: Pt2[] = [start];
  let cur = startSeg.b;
  let guard = 0;
  const limit = segs.length + 4;
  while (key(cur) !== key(start) && guard < limit) {
    raw.push(cur);
    const next = from.get(key(cur));
    if (next === undefined) break;
    cur = next;
    guard += 1;
  }

  // Drop collinear interior points so consecutive edges aren't degenerate.
  const out: Pt2[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const prev = raw[(i - 1 + raw.length) % raw.length] as Pt2;
    const here = raw[i] as Pt2;
    const next = raw[(i + 1) % raw.length] as Pt2;
    const d1x = here[0] - prev[0];
    const d1y = here[1] - prev[1];
    const d2x = next[0] - here[0];
    const d2y = next[1] - here[1];
    if (Math.abs(d1x * d2y - d1y * d2x) > 1e-9) out.push(here);
  }
  return out;
}

function uniqueSorted(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    const last = out[out.length - 1];
    if (last === undefined || Math.abs(v - last) > 1e-9) out.push(v);
  }
  return out;
}

export function reportFromLayout(layout: TreeLayout): BendReport {
  const flanges = layout.flats.filter((p): p is PlacedFlange => p.kind === 'flange');
  const bends = flanges.map((f) => ({
    id: f.id,
    angleDeg: f.angleDeg,
    radius: f.rule.innerRadius,
    allowance: f.dev,
    flatLength: f.length,
    direction: f.direction,
  }));

  // totalFlatSize is the overall bounding-box span of the developed pattern, which
  // for parts whose flanges extend into negative coordinates (xmin/ymin sides) is
  // the max−min extent, not just the max.
  let minX = 0;
  let minY = 0;
  let maxX = layout.baseLength;
  let maxY = layout.width;
  for (const r of layout.flats.map((p) => p.rect).concat(layout.strips)) {
    if (r.x0 < minX) minX = r.x0;
    if (r.y0 < minY) minY = r.y0;
    if (r.x1 > maxX) maxX = r.x1;
    if (r.y1 > maxY) maxY = r.y1;
  }
  return { bends, totalFlatSize: [maxX - minX, maxY - minY] };
}
