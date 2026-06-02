import { type Result, type Vec3, ok, err, validationError, getEdges, curveStartPoint, curveEndPoint } from 'brepjs';
import type { FlatPattern } from './types.js';

export interface DxfOptions {
  textHeight?: number | undefined;
}

const DEFAULT_TEXT_HEIGHT = 2.5;
const LAYER_OUTLINE = 'OUTLINE';
const LAYER_BEND_UP = 'BEND_UP';
const LAYER_BEND_DOWN = 'BEND_DOWN';

const COLOR_OUTLINE = 7;
const COLOR_BEND_UP = 1;
const COLOR_BEND_DOWN = 5;

type Pt2 = [number, number];

/**
 * Package-local DXF writer for sheet-metal flat patterns. The core public writer
 * (`blueprintToDXF`) is R12 LINE/POLYLINE-only with no MTEXT, layer color, or
 * INSUNITS, so it cannot carry the annotated multi-layer output required here.
 *
 * Emits an AC1015 (R2000) DXF: `INSUNITS=4` (mm), the outline polyline on layer
 * OUTLINE, each bend line on BEND_UP / BEND_DOWN, and an MTEXT angle/direction
 * annotation (e.g. "∠90° U") at each bend-line midpoint.
 */
export function flatPatternToDXF(pattern: FlatPattern, options: DxfOptions = {}): Result<string> {
  const textHeight = options.textHeight ?? DEFAULT_TEXT_HEIGHT;
  if (!Number.isFinite(textHeight) || textHeight <= 0) {
    return err(validationError('INVALID_TEXT_HEIGHT', `textHeight must be a finite, positive number, got ${textHeight}`));
  }

  const outlineResult = outlinePoints(pattern);
  if (!outlineResult.ok) return outlineResult;
  const outline = outlineResult.value;

  const w = new DxfWriter();
  writeHeader(w);
  writeTables(w);
  writeEntities(w, outline, pattern, textHeight);
  return ok(w.build());
}

class DxfWriter {
  private readonly lines: string[] = [];

  pair(code: number, value: string | number): void {
    this.lines.push(String(code));
    this.lines.push(typeof value === 'number' ? String(value) : value);
  }

  build(): string {
    this.pair(0, 'EOF');
    return this.lines.join('\n') + '\n';
  }
}

function writeHeader(w: DxfWriter): void {
  w.pair(0, 'SECTION');
  w.pair(2, 'HEADER');
  w.pair(9, '$ACADVER');
  w.pair(1, 'AC1015');
  w.pair(9, '$INSUNITS');
  w.pair(70, 4);
  w.pair(0, 'ENDSEC');
}

function writeTables(w: DxfWriter): void {
  w.pair(0, 'SECTION');
  w.pair(2, 'TABLES');
  w.pair(0, 'TABLE');
  w.pair(2, 'LAYER');
  w.pair(70, 4);
  writeLayer(w, LAYER_OUTLINE, COLOR_OUTLINE);
  writeLayer(w, LAYER_BEND_UP, COLOR_BEND_UP);
  writeLayer(w, LAYER_BEND_DOWN, COLOR_BEND_DOWN);
  w.pair(0, 'ENDTAB');
  w.pair(0, 'ENDSEC');
}

function writeLayer(w: DxfWriter, name: string, color: number): void {
  w.pair(0, 'LAYER');
  w.pair(2, name);
  w.pair(70, 0);
  w.pair(62, color);
  w.pair(6, 'CONTINUOUS');
}

function writeEntities(w: DxfWriter, outline: Pt2[], pattern: FlatPattern, textHeight: number): void {
  w.pair(0, 'SECTION');
  w.pair(2, 'ENTITIES');

  writePolyline(w, outline, LAYER_OUTLINE);

  for (const bend of pattern.bendLines) {
    const layer = bend.direction === 'down' ? LAYER_BEND_DOWN : LAYER_BEND_UP;
    const start = toPt2(curveStartPoint(bend.line));
    const end = toPt2(curveEndPoint(bend.line));
    writeLine(w, start, end, layer);
    const mid: Pt2 = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    const label = annotation(bend.angleDeg, bend.direction);
    writeMText(w, mid, label, layer, textHeight);
  }

  w.pair(0, 'ENDSEC');
}

function writePolyline(w: DxfWriter, points: Pt2[], layer: string): void {
  w.pair(0, 'LWPOLYLINE');
  w.pair(8, layer);
  w.pair(90, points.length);
  w.pair(70, 1);
  for (const [x, y] of points) {
    w.pair(10, x);
    w.pair(20, y);
  }
}

function writeLine(w: DxfWriter, start: Pt2, end: Pt2, layer: string): void {
  w.pair(0, 'LINE');
  w.pair(8, layer);
  w.pair(10, start[0]);
  w.pair(20, start[1]);
  w.pair(30, 0);
  w.pair(11, end[0]);
  w.pair(21, end[1]);
  w.pair(31, 0);
}

function writeMText(w: DxfWriter, at: Pt2, text: string, layer: string, height: number): void {
  w.pair(0, 'MTEXT');
  w.pair(8, layer);
  w.pair(10, at[0]);
  w.pair(20, at[1]);
  w.pair(30, 0);
  w.pair(40, height);
  w.pair(71, 5);
  w.pair(1, text);
}

function annotation(angleDeg: number, direction: 'up' | 'down'): string {
  const rounded = Math.round(angleDeg * 100) / 100;
  return `∠${rounded}° ${direction === 'down' ? 'D' : 'U'}`;
}

function outlinePoints(pattern: FlatPattern): Result<Pt2[]> {
  const edges = getEdges(pattern.outline);
  if (edges.length === 0) {
    return err(validationError('EMPTY_OUTLINE', 'flat pattern outline has no edges'));
  }
  const points: Pt2[] = [];
  for (const edge of edges) {
    points.push(toPt2(curveStartPoint(edge)));
  }
  return ok(points);
}

function toPt2(v: Vec3): Pt2 {
  return [v[0], v[1]];
}
