import { type Result, type Vec3, type Wire, ok, err, validationError, getEdges, curveStartPoint, curveEndPoint } from 'brepjs';
import type { FlatPattern } from './types.js';

export interface DxfOptions {
  textHeight?: number | undefined;
}

const DEFAULT_TEXT_HEIGHT = 2.5;
const LAYER_OUTLINE = 'OUTLINE';
const LAYER_BEND_UP = 'BEND_UP';
const LAYER_BEND_DOWN = 'BEND_DOWN';
const LAYER_CUTOUT = 'CUTOUT';

const COLOR_OUTLINE = 7;
const COLOR_BEND_UP = 1;
const COLOR_BEND_DOWN = 5;
const COLOR_CUTOUT = 3;

type Pt2 = [number, number];

/**
 * Package-local DXF writer for sheet-metal flat patterns. The core public writer
 * (`blueprintToDXF`) is R12 LINE/POLYLINE-only with no MTEXT, layer color, or
 * INSUNITS, so it cannot carry the annotated multi-layer output required here.
 *
 * Emits a strict AC1015 (R2000) DXF: `INSUNITS=4` (mm), the outline polyline on
 * layer OUTLINE, each bend line on BEND_UP / BEND_DOWN, and an MTEXT
 * angle/direction annotation (e.g. "∠90° U") at each bend-line midpoint. Every
 * table record and entity carries a unique handle and the AcDb subclass markers
 * R13+ readers (AutoCAD AUDIT, ODA/Teigha) require to parse the file cleanly.
 */
export function flatPatternToDXF(pattern: FlatPattern, options: DxfOptions = {}): Result<string> {
  const textHeight = options.textHeight ?? DEFAULT_TEXT_HEIGHT;
  if (!Number.isFinite(textHeight) || textHeight <= 0) {
    return err(validationError('INVALID_TEXT_HEIGHT', `textHeight must be a finite, positive number, got ${textHeight}`));
  }

  const outlineResult = outlinePoints(pattern);
  if (!outlineResult.ok) return outlineResult;
  const outline = outlineResult.value;

  // Tables + entities consume handles; the header's $HANDSEED must exceed them,
  // so build the body first and seed the header from the next free handle.
  const body = new DxfWriter();
  writeTables(body);
  writeEntities(body, outline, pattern, textHeight);

  const head = new DxfWriter();
  writeHeader(head, body.seedHex());

  return ok([head.text(), body.text(), '0', 'EOF'].join('\n') + '\n');
}

class DxfWriter {
  private readonly lines: string[] = [];
  private nextHandle = 0xa0;

  pair(code: number, value: string | number): void {
    this.lines.push(String(code));
    this.lines.push(typeof value === 'number' ? String(value) : value);
  }

  /** Emit a unique entity/record handle (group code 5). */
  handle(): void {
    this.pair(5, this.nextHandle.toString(16).toUpperCase());
    this.nextHandle += 1;
  }

  /** Next free handle (hex) — written as the header `$HANDSEED`. */
  seedHex(): string {
    return this.nextHandle.toString(16).toUpperCase();
  }

  text(): string {
    return this.lines.join('\n');
  }
}

function writeHeader(w: DxfWriter, handseed: string): void {
  w.pair(0, 'SECTION');
  w.pair(2, 'HEADER');
  w.pair(9, '$ACADVER');
  w.pair(1, 'AC1015');
  w.pair(9, '$INSUNITS');
  w.pair(70, 4);
  w.pair(9, '$HANDSEED');
  w.pair(5, handseed);
  w.pair(0, 'ENDSEC');
}

function writeTables(w: DxfWriter): void {
  w.pair(0, 'SECTION');
  w.pair(2, 'TABLES');
  w.pair(0, 'TABLE');
  w.pair(2, 'LAYER');
  w.handle();
  w.pair(100, 'AcDbSymbolTable');
  w.pair(70, 4);
  writeLayer(w, LAYER_OUTLINE, COLOR_OUTLINE);
  writeLayer(w, LAYER_BEND_UP, COLOR_BEND_UP);
  writeLayer(w, LAYER_BEND_DOWN, COLOR_BEND_DOWN);
  writeLayer(w, LAYER_CUTOUT, COLOR_CUTOUT);
  w.pair(0, 'ENDTAB');
  w.pair(0, 'ENDSEC');
}

function writeLayer(w: DxfWriter, name: string, color: number): void {
  w.pair(0, 'LAYER');
  w.handle();
  w.pair(100, 'AcDbSymbolTableRecord');
  w.pair(100, 'AcDbLayerTableRecord');
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

  for (const hole of pattern.holes) {
    writePolyline(w, loopPoints(hole), LAYER_CUTOUT);
  }

  w.pair(0, 'ENDSEC');
}

function writePolyline(w: DxfWriter, points: Pt2[], layer: string): void {
  w.pair(0, 'LWPOLYLINE');
  w.handle();
  w.pair(100, 'AcDbEntity');
  w.pair(8, layer);
  w.pair(100, 'AcDbPolyline');
  w.pair(90, points.length);
  w.pair(70, 1);
  for (const [x, y] of points) {
    w.pair(10, x);
    w.pair(20, y);
  }
}

function writeLine(w: DxfWriter, start: Pt2, end: Pt2, layer: string): void {
  w.pair(0, 'LINE');
  w.handle();
  w.pair(100, 'AcDbEntity');
  w.pair(8, layer);
  w.pair(100, 'AcDbLine');
  w.pair(10, start[0]);
  w.pair(20, start[1]);
  w.pair(30, 0);
  w.pair(11, end[0]);
  w.pair(21, end[1]);
  w.pair(31, 0);
}

function writeMText(w: DxfWriter, at: Pt2, text: string, layer: string, height: number): void {
  w.pair(0, 'MTEXT');
  w.handle();
  w.pair(100, 'AcDbEntity');
  w.pair(8, layer);
  w.pair(100, 'AcDbMText');
  w.pair(10, at[0]);
  w.pair(20, at[1]);
  w.pair(30, 0);
  w.pair(40, height);
  w.pair(41, height * 10);
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

/** Ordered vertices of a closed cutout wire (one per edge start point). */
function loopPoints(wire: Wire): Pt2[] {
  return getEdges(wire).map((e) => toPt2(curveStartPoint(e)));
}

function toPt2(v: Vec3): Pt2 {
  return [v[0], v[1]];
}
