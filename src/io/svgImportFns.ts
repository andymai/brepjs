/**
 * SVG import — parses SVG path data into brepjs Blueprints.
 *
 * Supports: M, L, H, V, C, S, Q, T, A, Z (absolute and relative).
 * Y-axis is flipped to match brepjs coordinate system (SVG Y is down).
 *
 * ADR-0006: SVG tokenization, path command parsing, and coordinate-system
 * adaptation (Y-flip) stay in TypeScript — this is structured text processing
 * and format-specific logic, not geometric computation.
 */

import type { Point2D } from '@/2d/lib/definitions.js';
import type { Curve2D } from '@/2d/lib/curve2D.js';
import { make2dSegmentCurve, make2dBezierCurve, make2dThreePointArc } from '@/2d/lib/makeCurves.js';
import Blueprint from '@/2d/blueprints/blueprint.js';
import { type Result, ok, err } from '@/core/result.js';
import { ioError } from '@/core/errors.js';

// ---------------------------------------------------------------------------
// SVG path tokenizer
// ---------------------------------------------------------------------------

interface PathToken {
  command: string;
  args: number[];
}

function tokenizeSVGPath(d: string): PathToken[] {
  const tokens: PathToken[] = [];
  // Match command letter followed by everything up to the next command letter
  const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(d)) !== null) {
    const command = match[1] ?? '';
    const argStr = (match[2] ?? '').trim();
    const args: number[] = [];

    if (argStr) {
      // Parse numbers, handling negative signs and decimals
      const numRe = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
      let numMatch: RegExpExecArray | null;
      while ((numMatch = numRe.exec(argStr)) !== null) {
        args.push(parseFloat(numMatch[0]));
      }
    }

    tokens.push({ command, args });
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// SVG path to curves — cursor state & command handlers
// ---------------------------------------------------------------------------

function flipY(p: Point2D): Point2D {
  return [p[0], -p[1]];
}

/** Mutable cursor state threaded through SVG path command handlers. */
interface PathCursor {
  cx: number;
  cy: number;
  sx: number; // subpath start
  sy: number;
  prevControlX: number;
  prevControlY: number;
  lastCmd: string;
}

function handleMoveTo(
  args: number[],
  cursor: PathCursor,
  isRelative: boolean,
  curves: Curve2D[]
): void {
  let i = 0;
  while (i < args.length) {
    const x = (isRelative ? cursor.cx : 0) + (args[i] ?? 0);
    const y = (isRelative ? cursor.cy : 0) + (args[i + 1] ?? 0);
    if (i === 0) {
      cursor.sx = x;
      cursor.sy = y;
    } else {
      // Implicit L after first pair
      curves.push(make2dSegmentCurve(flipY([cursor.cx, cursor.cy]), flipY([x, y])));
    }
    cursor.cx = x;
    cursor.cy = y;
    i += 2;
  }
}

function handleLineTo(
  args: number[],
  cursor: PathCursor,
  isRelative: boolean,
  curves: Curve2D[]
): void {
  let i = 0;
  while (i < args.length) {
    const x = (isRelative ? cursor.cx : 0) + (args[i] ?? 0);
    const y = (isRelative ? cursor.cy : 0) + (args[i + 1] ?? 0);
    curves.push(make2dSegmentCurve(flipY([cursor.cx, cursor.cy]), flipY([x, y])));
    cursor.cx = x;
    cursor.cy = y;
    i += 2;
  }
}

function handleHorizontalLineTo(
  args: number[],
  cursor: PathCursor,
  isRelative: boolean,
  curves: Curve2D[]
): void {
  for (const arg of args) {
    const x = isRelative ? cursor.cx + arg : arg;
    curves.push(make2dSegmentCurve(flipY([cursor.cx, cursor.cy]), flipY([x, cursor.cy])));
    cursor.cx = x;
  }
}

function handleVerticalLineTo(
  args: number[],
  cursor: PathCursor,
  isRelative: boolean,
  curves: Curve2D[]
): void {
  for (const arg of args) {
    const y = isRelative ? cursor.cy + arg : arg;
    curves.push(make2dSegmentCurve(flipY([cursor.cx, cursor.cy]), flipY([cursor.cx, y])));
    cursor.cy = y;
  }
}

function handleCubicBezier(
  args: number[],
  cursor: PathCursor,
  isRelative: boolean,
  curves: Curve2D[]
): void {
  let i = 0;
  while (i + 5 < args.length) {
    const ox = isRelative ? cursor.cx : 0;
    const oy = isRelative ? cursor.cy : 0;
    const cp1x = ox + (args[i] ?? 0);
    const cp1y = oy + (args[i + 1] ?? 0);
    const cp2x = ox + (args[i + 2] ?? 0);
    const cp2y = oy + (args[i + 3] ?? 0);
    const x = ox + (args[i + 4] ?? 0);
    const y = oy + (args[i + 5] ?? 0);

    curves.push(
      make2dBezierCurve(
        flipY([cursor.cx, cursor.cy]),
        [flipY([cp1x, cp1y]), flipY([cp2x, cp2y])],
        flipY([x, y])
      )
    );

    cursor.prevControlX = cp2x;
    cursor.prevControlY = cp2y;
    cursor.cx = x;
    cursor.cy = y;
    i += 6;
  }
}

function handleSmoothCubicBezier(
  args: number[],
  cursor: PathCursor,
  isRelative: boolean,
  curves: Curve2D[]
): void {
  let i = 0;
  while (i + 3 < args.length) {
    const ox = isRelative ? cursor.cx : 0;
    const oy = isRelative ? cursor.cy : 0;
    // Reflect last control point
    const prev = cursor.lastCmd;
    const cp1x = prev === 'C' || prev === 'S' ? 2 * cursor.cx - cursor.prevControlX : cursor.cx;
    const cp1y = prev === 'C' || prev === 'S' ? 2 * cursor.cy - cursor.prevControlY : cursor.cy;
    const cp2x = ox + (args[i] ?? 0);
    const cp2y = oy + (args[i + 1] ?? 0);
    const x = ox + (args[i + 2] ?? 0);
    const y = oy + (args[i + 3] ?? 0);

    curves.push(
      make2dBezierCurve(
        flipY([cursor.cx, cursor.cy]),
        [flipY([cp1x, cp1y]), flipY([cp2x, cp2y])],
        flipY([x, y])
      )
    );

    cursor.prevControlX = cp2x;
    cursor.prevControlY = cp2y;
    cursor.cx = x;
    cursor.cy = y;
    cursor.lastCmd = 'S';
    i += 4;
  }
}

function handleQuadraticBezier(
  args: number[],
  cursor: PathCursor,
  isRelative: boolean,
  curves: Curve2D[]
): void {
  let i = 0;
  while (i + 3 < args.length) {
    const ox = isRelative ? cursor.cx : 0;
    const oy = isRelative ? cursor.cy : 0;
    const cpx = ox + (args[i] ?? 0);
    const cpy = oy + (args[i + 1] ?? 0);
    const x = ox + (args[i + 2] ?? 0);
    const y = oy + (args[i + 3] ?? 0);

    curves.push(
      make2dBezierCurve(flipY([cursor.cx, cursor.cy]), [flipY([cpx, cpy])], flipY([x, y]))
    );

    cursor.prevControlX = cpx;
    cursor.prevControlY = cpy;
    cursor.cx = x;
    cursor.cy = y;
    i += 4;
  }
}

function handleSmoothQuadraticBezier(
  args: number[],
  cursor: PathCursor,
  isRelative: boolean,
  curves: Curve2D[]
): void {
  let i = 0;
  while (i + 1 < args.length) {
    const ox = isRelative ? cursor.cx : 0;
    const oy = isRelative ? cursor.cy : 0;
    const prev = cursor.lastCmd;
    const cpx = prev === 'Q' || prev === 'T' ? 2 * cursor.cx - cursor.prevControlX : cursor.cx;
    const cpy = prev === 'Q' || prev === 'T' ? 2 * cursor.cy - cursor.prevControlY : cursor.cy;
    const x = ox + (args[i] ?? 0);
    const y = oy + (args[i + 1] ?? 0);

    curves.push(
      make2dBezierCurve(flipY([cursor.cx, cursor.cy]), [flipY([cpx, cpy])], flipY([x, y]))
    );

    cursor.prevControlX = cpx;
    cursor.prevControlY = cpy;
    cursor.cx = x;
    cursor.cy = y;
    cursor.lastCmd = 'T';
    i += 2;
  }
}

// ---------------------------------------------------------------------------
// Arc command helpers
// ---------------------------------------------------------------------------

/** Create two semi-arcs for a full-circle arc (coincident endpoints). */
function createFullCircleArcs(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  sweepFlag: boolean
): Curve2D[] {
  const r = Math.max(rx, ry);
  const s = sweepFlag ? 1 : -1;
  // Center is r above/below start; opposite point is r further
  const oppositeY = cy + 2 * s * r;
  // Semi-arc midpoints sit at 90° offsets from the circle center
  const semi1Mid: [number, number] = [cx - s * r, cy + s * r];
  const semi2Mid: [number, number] = [cx + s * r, cy + s * r];

  try {
    return [
      make2dThreePointArc(flipY([cx, cy]), flipY(semi1Mid), flipY([cx, oppositeY])),
      make2dThreePointArc(flipY([cx, oppositeY]), flipY(semi2Mid), flipY([cx, cy])),
    ];
  } catch {
    // If arc construction fails, skip (degenerate circle)
    return [];
  }
}

/** Create a standard (non-full-circle) three-point arc approximation. */
function createStandardArc(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  rx: number,
  ry: number,
  largeArc: boolean,
  sweepFlag: boolean
): Curve2D[] {
  const midParam = 0.5;
  const midX = fromX + midParam * (toX - fromX);
  const midY = fromY + midParam * (toY - fromY);

  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const r = Math.max(rx, ry);
  const halfChord = dist / 2;
  const sagitta = halfChord < r ? r - Math.sqrt(r * r - halfChord * halfChord) : r;

  const sign = (largeArc !== sweepFlag ? 1 : -1) * (sweepFlag ? 1 : -1);
  const nx = -dy / dist;
  const ny = dx / dist;
  const arcMidX = midX + sign * sagitta * nx;
  const arcMidY = midY + sign * sagitta * ny;

  try {
    return [
      make2dThreePointArc(flipY([fromX, fromY]), flipY([arcMidX, arcMidY]), flipY([toX, toY])),
    ];
  } catch {
    // Fallback to line if arc construction fails
    return [make2dSegmentCurve(flipY([fromX, fromY]), flipY([toX, toY]))];
  }
}

function handleArc(
  args: number[],
  cursor: PathCursor,
  isRelative: boolean,
  curves: Curve2D[]
): void {
  let i = 0;
  while (i + 6 < args.length) {
    const ox = isRelative ? cursor.cx : 0;
    const oy = isRelative ? cursor.cy : 0;
    const rx = Math.abs(args[i] ?? 0);
    const ry = Math.abs(args[i + 1] ?? 0);
    // args[i+2] is rotation, args[i+3] is large-arc, args[i+4] is sweep
    const largeArc = (args[i + 3] ?? 0) !== 0;
    const sweepFlag = (args[i + 4] ?? 0) !== 0;
    const x = ox + (args[i + 5] ?? 0);
    const y = oy + (args[i + 6] ?? 0);

    if (rx === 0 || ry === 0) {
      // Degenerate arc -> line
      curves.push(make2dSegmentCurve(flipY([cursor.cx, cursor.cy]), flipY([x, y])));
    } else {
      const dx = x - cursor.cx;
      const dy = y - cursor.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 1e-10) {
        // Coincident endpoints (full-circle arc)
        curves.push(...createFullCircleArcs(cursor.cx, cursor.cy, rx, ry, sweepFlag));
      } else {
        curves.push(...createStandardArc(cursor.cx, cursor.cy, x, y, rx, ry, largeArc, sweepFlag));
      }
    }

    cursor.cx = x;
    cursor.cy = y;
    i += 7;
  }
}

function handleClosePath(cursor: PathCursor, curves: Curve2D[]): void {
  if (Math.abs(cursor.cx - cursor.sx) > 1e-10 || Math.abs(cursor.cy - cursor.sy) > 1e-10) {
    curves.push(make2dSegmentCurve(flipY([cursor.cx, cursor.cy]), flipY([cursor.sx, cursor.sy])));
  }
  cursor.cx = cursor.sx;
  cursor.cy = cursor.sy;
}

// ---------------------------------------------------------------------------
// SVG path to curves — dispatcher
// ---------------------------------------------------------------------------

/**
 * Parse SVG path data string into an array of Curve2D.
 */
function parseSVGPathToCurves(d: string): Curve2D[] {
  const tokens = tokenizeSVGPath(d);
  const curves: Curve2D[] = [];
  const cursor: PathCursor = {
    cx: 0,
    cy: 0,
    sx: 0,
    sy: 0,
    prevControlX: 0,
    prevControlY: 0,
    lastCmd: '',
  };

  for (const { command, args } of tokens) {
    const isRelative = command === command.toLowerCase();
    const cmd = command.toUpperCase();

    switch (cmd) {
      case 'M':
        handleMoveTo(args, cursor, isRelative, curves);
        break;
      case 'L':
        handleLineTo(args, cursor, isRelative, curves);
        break;
      case 'H':
        handleHorizontalLineTo(args, cursor, isRelative, curves);
        break;
      case 'V':
        handleVerticalLineTo(args, cursor, isRelative, curves);
        break;
      case 'C':
        handleCubicBezier(args, cursor, isRelative, curves);
        break;
      case 'S':
        handleSmoothCubicBezier(args, cursor, isRelative, curves);
        break;
      case 'Q':
        handleQuadraticBezier(args, cursor, isRelative, curves);
        break;
      case 'T':
        handleSmoothQuadraticBezier(args, cursor, isRelative, curves);
        break;
      case 'A':
        handleArc(args, cursor, isRelative, curves);
        break;
      case 'Z':
        handleClosePath(cursor, curves);
        break;
    }

    if (cmd !== 'S' && cmd !== 'T') {
      cursor.lastCmd = cmd;
    }
  }

  return curves;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Options controlling SVG import behavior. */
export interface SVGImportOptions {
  /** Whether to flip the Y axis (default: true, since SVG Y is down). */
  flipY?: boolean;
}

/**
 * Import a single SVG path data string (`d` attribute) as a Blueprint.
 *
 * Supports all SVG path commands: M, L, H, V, C, S, Q, T, A, Z
 * (both absolute and relative). The Y axis is flipped to match
 * brepjs coordinates (Y up).
 *
 * @param pathD - The SVG path data string (e.g., `"M 0 0 L 10 0 L 10 10 Z"`).
 * @returns A `Result` wrapping the Blueprint, or an error if parsing fails.
 *
 * @example
 * ```ts
 * const bp = unwrap(importSVGPathD('M 0 0 L 10 0 L 10 10 Z'));
 * ```
 *
 * @see {@link importSVG} to extract all `<path>` elements from a full SVG string.
 */
export function importSVGPathD(pathD: string): Result<Blueprint> {
  try {
    const curves = parseSVGPathToCurves(pathD);
    if (curves.length === 0) {
      return err(ioError('SVG_EMPTY_PATH', 'SVG path produced no curves'));
    }
    return ok(new Blueprint(curves));
  } catch (e) {
    return err(
      ioError(
        'SVG_PARSE_FAILED',
        `Failed to parse SVG path: ${e instanceof Error ? e.message : String(e)}`
      )
    );
  }
}

/**
 * Import all `<path>` elements from an SVG string as Blueprints.
 *
 * Uses regex extraction (no DOM parser dependency) to find `<path d="...">`.
 * Each path becomes a separate Blueprint with its curves.
 *
 * @remarks Paths that fail to parse are silently skipped. Only the
 * successfully parsed paths appear in the result. If no paths are found
 * at all, an error `Result` is returned.
 *
 * @param svgString - Complete SVG XML string.
 * @returns A `Result` wrapping an array of Blueprints (one per `<path>` element).
 *
 * @example
 * ```ts
 * const blueprints = unwrap(importSVG(svgFileContents));
 * blueprints.forEach(bp => console.log(bp.curves.length));
 * ```
 *
 * @see {@link importSVGPathD} to import a single path `d` attribute directly.
 */
export function importSVG(svgString: string): Result<Blueprint[]> {
  try {
    // indexOf-based tag extraction — O(n) guaranteed, no regex backtracking risk.
    const dAttrRe = /\bd\s*=\s*(?:"([^"]*)"|'([^']*)')/;
    const blueprints: Blueprint[] = [];
    const lower = svgString.toLowerCase();
    let pos = 0;

    while (pos < lower.length) {
      const tagStart = lower.indexOf('<path ', pos);
      if (tagStart === -1) break;
      const tagEnd = svgString.indexOf('>', tagStart);
      if (tagEnd === -1) break;

      const tag = svgString.slice(tagStart, tagEnd + 1);
      pos = tagEnd + 1;

      const attrMatch = dAttrRe.exec(tag);
      const d = attrMatch?.[1] ?? attrMatch?.[2];
      if (!d) continue;
      const result = importSVGPathD(d);
      if (result.ok) {
        blueprints.push(result.value);
      }
    }

    if (blueprints.length === 0) {
      return err(ioError('SVG_NO_PATHS', 'No <path> elements found in SVG'));
    }

    return ok(blueprints);
  } catch (e) {
    return err(
      ioError(
        'SVG_IMPORT_FAILED',
        `Failed to import SVG: ${e instanceof Error ? e.message : String(e)}`
      )
    );
  }
}
