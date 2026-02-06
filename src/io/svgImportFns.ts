/**
 * SVG import — parses SVG path data into brepjs Blueprints.
 *
 * Supports: M, L, H, V, C, S, Q, T, A, Z (absolute and relative).
 * Y-axis is flipped to match brepjs coordinate system (SVG Y is down).
 */

import type { Point2D } from '../2d/lib/definitions.js';
import type { Curve2D } from '../2d/lib/Curve2D.js';
import {
  make2dSegmentCurve,
  make2dBezierCurve,
  make2dThreePointArc,
} from '../2d/lib/makeCurves.js';
import Blueprint from '../2d/blueprints/Blueprint.js';
import { type Result, ok, err } from '../core/result.js';
import { ioError } from '../core/errors.js';

// ---------------------------------------------------------------------------
// SVG path tokenizer
// ---------------------------------------------------------------------------

interface PathToken {
  command: string;
  args: number[];
}

function tokenizeSVGPath(d: string): PathToken[] {
  const tokens: PathToken[] = [];
  // Match command letter followed by optional numbers
  const re =
    /([MmLlHhVvCcSsQqTtAaZz])\s*((?:[^MmLlHhVvCcSsQqTtAaZz]*?)(?=\s*[MmLlHhVvCcSsQqTtAaZz]|$))/g;
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
// SVG path to curves
// ---------------------------------------------------------------------------

function flipY(p: Point2D): Point2D {
  return [p[0], -p[1]];
}

/**
 * Parse SVG path data string into an array of Curve2D.
 */
function parseSVGPathToCurves(d: string): Curve2D[] {
  const tokens = tokenizeSVGPath(d);
  const curves: Curve2D[] = [];

  let cx = 0;
  let cy = 0; // current point
  let sx = 0;
  let sy = 0; // subpath start
  let lastCpx = 0;
  let lastCpy = 0; // last control point for S/T
  let lastCmd = '';

  for (const { command, args } of tokens) {
    const isRelative = command === command.toLowerCase();
    const cmd = command.toUpperCase();

    switch (cmd) {
      case 'M': {
        // Move to
        let i = 0;
        while (i < args.length) {
          const x = (isRelative ? cx : 0) + (args[i] ?? 0);
          const y = (isRelative ? cy : 0) + (args[i + 1] ?? 0);
          if (i === 0) {
            sx = x;
            sy = y;
          } else {
            // Implicit L after first pair
            const from = flipY([cx, cy]);
            const to = flipY([x, y]);
            curves.push(make2dSegmentCurve(from, to));
          }
          cx = x;
          cy = y;
          i += 2;
        }
        break;
      }

      case 'L': {
        let i = 0;
        while (i < args.length) {
          const x = (isRelative ? cx : 0) + (args[i] ?? 0);
          const y = (isRelative ? cy : 0) + (args[i + 1] ?? 0);
          const from = flipY([cx, cy]);
          const to = flipY([x, y]);
          curves.push(make2dSegmentCurve(from, to));
          cx = x;
          cy = y;
          i += 2;
        }
        break;
      }

      case 'H': {
        for (const arg of args) {
          const x = isRelative ? cx + arg : arg;
          const from = flipY([cx, cy]);
          const to = flipY([x, cy]);
          curves.push(make2dSegmentCurve(from, to));
          cx = x;
        }
        break;
      }

      case 'V': {
        for (const arg of args) {
          const y = isRelative ? cy + arg : arg;
          const from = flipY([cx, cy]);
          const to = flipY([cx, y]);
          curves.push(make2dSegmentCurve(from, to));
          cy = y;
        }
        break;
      }

      case 'C': {
        // Cubic bezier
        let i = 0;
        while (i + 5 < args.length) {
          const ox = isRelative ? cx : 0;
          const oy = isRelative ? cy : 0;
          const cp1x = ox + (args[i] ?? 0);
          const cp1y = oy + (args[i + 1] ?? 0);
          const cp2x = ox + (args[i + 2] ?? 0);
          const cp2y = oy + (args[i + 3] ?? 0);
          const x = ox + (args[i + 4] ?? 0);
          const y = oy + (args[i + 5] ?? 0);

          curves.push(
            make2dBezierCurve(
              flipY([cx, cy]),
              [flipY([cp1x, cp1y]), flipY([cp2x, cp2y])],
              flipY([x, y])
            )
          );

          lastCpx = cp2x;
          lastCpy = cp2y;
          cx = x;
          cy = y;
          i += 6;
        }
        break;
      }

      case 'S': {
        // Smooth cubic bezier
        let i = 0;
        while (i + 3 < args.length) {
          const ox = isRelative ? cx : 0;
          const oy = isRelative ? cy : 0;
          // Reflect last control point
          const cp1x = lastCmd === 'C' || lastCmd === 'S' ? 2 * cx - lastCpx : cx;
          const cp1y = lastCmd === 'C' || lastCmd === 'S' ? 2 * cy - lastCpy : cy;
          const cp2x = ox + (args[i] ?? 0);
          const cp2y = oy + (args[i + 1] ?? 0);
          const x = ox + (args[i + 2] ?? 0);
          const y = oy + (args[i + 3] ?? 0);

          curves.push(
            make2dBezierCurve(
              flipY([cx, cy]),
              [flipY([cp1x, cp1y]), flipY([cp2x, cp2y])],
              flipY([x, y])
            )
          );

          lastCpx = cp2x;
          lastCpy = cp2y;
          cx = x;
          cy = y;
          lastCmd = 'S';
          i += 4;
        }
        break;
      }

      case 'Q': {
        // Quadratic bezier
        let i = 0;
        while (i + 3 < args.length) {
          const ox = isRelative ? cx : 0;
          const oy = isRelative ? cy : 0;
          const cpx = ox + (args[i] ?? 0);
          const cpy = oy + (args[i + 1] ?? 0);
          const x = ox + (args[i + 2] ?? 0);
          const y = oy + (args[i + 3] ?? 0);

          curves.push(make2dBezierCurve(flipY([cx, cy]), [flipY([cpx, cpy])], flipY([x, y])));

          lastCpx = cpx;
          lastCpy = cpy;
          cx = x;
          cy = y;
          i += 4;
        }
        break;
      }

      case 'T': {
        // Smooth quadratic bezier
        let i = 0;
        while (i + 1 < args.length) {
          const ox = isRelative ? cx : 0;
          const oy = isRelative ? cy : 0;
          const cpx = lastCmd === 'Q' || lastCmd === 'T' ? 2 * cx - lastCpx : cx;
          const cpy = lastCmd === 'Q' || lastCmd === 'T' ? 2 * cy - lastCpy : cy;
          const x = ox + (args[i] ?? 0);
          const y = oy + (args[i + 1] ?? 0);

          curves.push(make2dBezierCurve(flipY([cx, cy]), [flipY([cpx, cpy])], flipY([x, y])));

          lastCpx = cpx;
          lastCpy = cpy;
          cx = x;
          cy = y;
          lastCmd = 'T';
          i += 2;
        }
        break;
      }

      case 'A': {
        // Elliptical arc — approximate with three-point arc
        let i = 0;
        while (i + 6 < args.length) {
          const ox = isRelative ? cx : 0;
          const oy = isRelative ? cy : 0;
          const rx = Math.abs(args[i] ?? 0);
          const ry = Math.abs(args[i + 1] ?? 0);
          // args[i+2] is rotation, args[i+3] is large-arc, args[i+4] is sweep
          const largeArc = (args[i + 3] ?? 0) !== 0;
          const sweepFlag = (args[i + 4] ?? 0) !== 0;
          const x = ox + (args[i + 5] ?? 0);
          const y = oy + (args[i + 6] ?? 0);

          if (rx === 0 || ry === 0) {
            // Degenerate arc → line
            curves.push(make2dSegmentCurve(flipY([cx, cy]), flipY([x, y])));
          } else {
            // Use midpoint arc approximation via three-point arc
            const midParam = 0.5;
            const midX = cx + midParam * (x - cx);
            const midY = cy + midParam * (y - cy);

            // Compute perpendicular offset for arc bulge
            const dx = x - cx;
            const dy = y - cy;
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
              curves.push(
                make2dThreePointArc(flipY([cx, cy]), flipY([arcMidX, arcMidY]), flipY([x, y]))
              );
            } catch {
              // Fallback to line if arc construction fails
              curves.push(make2dSegmentCurve(flipY([cx, cy]), flipY([x, y])));
            }
          }

          cx = x;
          cy = y;
          i += 7;
        }
        break;
      }

      case 'Z': {
        // Close path
        if (cx !== sx || cy !== sy) {
          curves.push(make2dSegmentCurve(flipY([cx, cy]), flipY([sx, sy])));
        }
        cx = sx;
        cy = sy;
        break;
      }
    }

    if (cmd !== 'S' && cmd !== 'T') {
      lastCmd = cmd;
    }
  }

  return curves;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SVGImportOptions {
  /** Whether to flip the Y axis (default: true, since SVG Y is down). */
  flipY?: boolean;
}

/**
 * Import a single SVG path data string (`d` attribute) as a Blueprint.
 *
 * @param pathD - The SVG path data string (e.g., "M 0 0 L 10 0 L 10 10 Z").
 * @returns A Blueprint representing the path.
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
 * Uses regex extraction — no DOM parser dependency.
 *
 * @param svgString - Complete SVG XML string.
 * @returns An array of Blueprints, one per `<path>` element.
 */
export function importSVG(svgString: string): Result<Blueprint[]> {
  try {
    // Extract path d attributes using regex
    const pathRe = /<path[^>]+d\s*=\s*"([^"]*)"/gi;
    const blueprints: Blueprint[] = [];
    let match: RegExpExecArray | null;

    while ((match = pathRe.exec(svgString)) !== null) {
      const d = match[1];
      if (!d) continue;
      const result = importSVGPathD(d);
      if (result.ok) {
        blueprints.push(result.value);
      }
    }

    // Also try single-quoted attributes
    const pathReSingle = /<path[^>]+d\s*=\s*'([^']*)'/gi;
    while ((match = pathReSingle.exec(svgString)) !== null) {
      const d = match[1];
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
