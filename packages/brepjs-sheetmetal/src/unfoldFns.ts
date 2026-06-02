import {
  type Result,
  type Wire,
  type Edge,
  ok,
  err,
  validationError,
  line,
  wireLoop,
} from 'brepjs';
import type {
  SheetMetalPart,
  UnfoldResult,
  FlatPattern,
  BendReport,
  SheetMetalWarning,
  CornerMiter,
} from './types.js';
import { featureTree, type FeatureTree, type FlatNode } from './featureTreeFns.js';
import { developedLength } from './allowanceFns.js';
import { classifyRunDir, type RunDir } from './internal.js';

type Pt2 = [number, number];

/**
 * Tree-driven analytic unfold of a straight-bend part into its flat pattern.
 *
 * Each flange develops perpendicularly off its own bend line, in the direction
 * fixed by the recorded bend axis: an 'east' flange (|axisDir.y|>0.5) unfolds in
 * +X off the x=baseLength edge; a 'north' flange (|axisDir.x|>0.5) unfolds in +Y
 * off the y=width edge. The base occupies x∈[0,baseLength], y∈[0,width]; each
 * flange adds a strip of its developed bend length (neutral-axis arc) plus its
 * flat length past the bend. The developed outline is the rectilinear union of
 * the base and the present flange regions — a rectangle for ≤1 flange, an
 * L-hexagon when both an east and a north flange are present. A recorded corner
 * miter replaces the shared reflex corner with a 45° chamfer so the two upright
 * flanges clear each other by the miter gap once folded. Bend lines and the
 * outline are emitted as native brepjs wires; warnings ride inside the Ok payload.
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

  const layoutResult = layoutRun(part, tree, baseLength, width);
  if (!layoutResult.ok) return layoutResult;
  const layout = layoutResult.value;

  for (const flange of layout.flanges) {
    if (part.thickness > 0 && flange.rule.innerRadius < part.thickness) {
      warnings.push({
        code: 'MIN_RADIUS',
        message: `bend '${flange.id}' inner radius ${flange.rule.innerRadius} < thickness ${part.thickness}`,
        featureId: flange.id,
      });
    }
  }

  const outlineResult = buildOutline(layout, part.miters ?? []);
  if (!outlineResult.ok) return outlineResult;

  const bendLines = layout.flanges.map((flange) => ({
    line: bendLineEdge(flange, layout.baseLength, layout.width),
    angleDeg: flange.angleDeg,
    direction: flange.direction,
  }));

  const pattern: FlatPattern = {
    outline: outlineResult.value,
    bendLines,
    developedArea: layout.developedArea,
  };

  const report = buildReport(layout);

  return ok({ pattern, report, warnings });
}

interface FlangeLayout {
  id: string;
  dir: RunDir;
  /** Developed (neutral-axis) bend length laid down as a flat strip. */
  dev: number;
  /** Flat length past the bend. */
  length: number;
  /** Extent along the bend axis. */
  span: number;
  angleDeg: number;
  direction: 'up' | 'down';
  rule: { innerRadius: number; kFactor: number; allowance?: number | undefined };
}

interface RunLayout {
  baseLength: number;
  width: number;
  /** Total developed extent along +X (base plus the east flange, if present). */
  maxX: number;
  /** Total developed extent along +Y (base plus the north flange, if present). */
  maxY: number;
  developedArea: number;
  flanges: FlangeLayout[];
  east?: FlangeLayout | undefined;
  north?: FlangeLayout | undefined;
}

function flangeSpanOf(node: FlatNode, fallback: number): number {
  if (node.flange === undefined) return fallback;
  return node.flange.span;
}

function flangeLengthOf(node: FlatNode): number {
  if (node.flange === undefined) return 0;
  return node.flange.length;
}

function layoutRun(
  part: SheetMetalPart,
  tree: FeatureTree,
  baseLength: number,
  width: number
): Result<RunLayout> {
  const flanges: FlangeLayout[] = [];
  let east: FlangeLayout | undefined;
  let north: FlangeLayout | undefined;

  let developedArea = baseLength * width;

  for (const treeBend of tree.bends) {
    const dir = classifyRunDir(treeBend.bend.axisDir);
    if (dir === undefined) {
      return err(
        validationError('UNRESOLVED_RUN_DIR', `bend '${treeBend.bend.id}' axisDir is not axis-aligned`)
      );
    }

    const devResult = developedLength(treeBend.bend.angleDeg, part.thickness, treeBend.bend.rule);
    if (!devResult.ok) return devResult;
    const dev = devResult.value;

    const childNode = tree.nodes.get(treeBend.child);
    if (childNode === undefined) {
      return err(
        validationError('UNKNOWN_FLAT', `child flat '${treeBend.child}' missing from tree nodes`)
      );
    }
    const span = flangeSpanOf(childNode, dir === 'east' ? width : baseLength);
    const length = flangeLengthOf(childNode);

    const flange: FlangeLayout = {
      id: treeBend.bend.id,
      dir,
      dev,
      length,
      span,
      angleDeg: treeBend.bend.angleDeg,
      direction: treeBend.bend.direction,
      rule: treeBend.bend.rule,
    };
    flanges.push(flange);
    developedArea += (dev + length) * span;

    if (dir === 'east') east = flange;
    else north = flange;
  }

  const maxX = baseLength + (east !== undefined ? east.dev + east.length : 0);
  const maxY = width + (north !== undefined ? north.dev + north.length : 0);

  return ok({
    baseLength,
    width,
    maxX,
    maxY,
    developedArea,
    flanges,
    east,
    north,
  });
}

function bendLineEdge(flange: FlangeLayout, baseLength: number, width: number): Edge {
  if (flange.dir === 'east') {
    // bend line runs along Y at x=baseLength, spanning the base width.
    return line([baseLength, 0, 0], [baseLength, width, 0]);
  }
  // bend line runs along X at y=width, spanning the base length.
  return line([0, width, 0], [baseLength, width, 0]);
}

function buildOutline(layout: RunLayout, miters: CornerMiter[]): Result<Wire> {
  const corners = outlineCorners(layout, miters);
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
 * CCW rectilinear polygon of the developed outline. With only an east or only a
 * north flange (or neither) the union is the [maxX]×[maxY] rectangle. With both,
 * it is the L-hexagon whose reentrant corner sits at (baseLength, width); a
 * recorded east↔north miter replaces that reflex vertex with a 45° chamfer
 * offset outward by the gap so the diagonal clearance equals the miter gap.
 */
function outlineCorners(layout: RunLayout, miters: CornerMiter[]): Pt2[] {
  const { baseLength, width, maxX, maxY, east, north } = layout;

  if (east === undefined || north === undefined) {
    return [
      [0, 0],
      [maxX, 0],
      [maxX, maxY],
      [0, maxY],
    ];
  }

  // L-hexagon: the reflex corner is at (baseLength, width).
  const reflex: Pt2 = [baseLength, width];
  const gap = miterGapFor(miters, east.id, north.id);

  // A zero (or negative) gap removes no clearance, so the chamfer would collapse
  // both vertices onto the reflex corner — a degenerate zero-length edge that
  // wireLoop rejects. Treat it as the plain L-hexagon (no notch).
  if (gap === undefined || gap <= 0) {
    return [
      [0, 0],
      [maxX, 0],
      [maxX, width],
      reflex,
      [baseLength, maxY],
      [0, maxY],
    ];
  }

  // Replace the reflex vertex with a 45° chamfer pulled outward by `gap`: the two
  // flanges fold up about x=baseLength and y=width, so offsetting the chamfer by
  // gap along +X and +Y leaves a gap-wide clearance between their upright edges.
  const c1: Pt2 = [baseLength + gap, width];
  const c2: Pt2 = [baseLength, width + gap];
  return [
    [0, 0],
    [maxX, 0],
    [maxX, width],
    c1,
    c2,
    [baseLength, maxY],
    [0, maxY],
  ];
}

function miterGapFor(miters: CornerMiter[], eastId: string, northId: string): number | undefined {
  for (const m of miters) {
    if ((m.flangeA === eastId && m.flangeB === northId) || (m.flangeA === northId && m.flangeB === eastId)) {
      return m.gap;
    }
  }
  return undefined;
}

function buildReport(layout: RunLayout): BendReport {
  const bends = layout.flanges.map((flange) => ({
    id: flange.id,
    angleDeg: flange.angleDeg,
    radius: flange.rule.innerRadius,
    allowance: flange.dev,
    flatLength: flange.length,
    direction: flange.direction,
  }));
  return { bends, totalFlatSize: [layout.maxX, layout.maxY] };
}
