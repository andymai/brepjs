/**
 * Text rendering using opentype.js.
 * Ported from replicad's text.ts.
 */

import type { Point2D } from '../2d/lib/index.js';
import type { Plane, PlaneName, Point } from '../core/geometry.js';
import { bug } from '../core/errors.js';

import opentype from 'opentype.js';

// Forward declarations - these will be available at runtime through the barrel imports
// We use dynamic imports to avoid circular dependency issues
type BlueprintSketcherType = {
  new (): {
    movePointerTo(p: Point2D): unknown;
    lineTo(p: Point2D): unknown;
    cubicBezierCurveTo(p: Point2D, c1: Point2D, c2: Point2D): unknown;
    quadraticBezierCurveTo(p: Point2D, c: Point2D): unknown;
    close(): unknown;
    done(): unknown;
  };
};

let _BlueprintSketcher: BlueprintSketcherType | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lazy loaded reference
let _organiseBlueprints: ((...args: any[]) => any) | null = null;

export function _injectTextDeps(
  BlueprintSketcher: BlueprintSketcherType,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- function ref
  organiseBlueprints: (...args: any[]) => any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- class ref kept for future use
  _Sketches: any
): void {
  _BlueprintSketcher = BlueprintSketcher;
  _organiseBlueprints = organiseBlueprints;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- opentype Font type
const FONT_REGISTER: Record<string, any> = {};

export async function loadFont(
  fontPath: string | ArrayBuffer,
  fontFamily = 'default',
  force = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opentype Font type
): Promise<any> {
  if (!force && FONT_REGISTER[fontFamily]) {
    return FONT_REGISTER[fontFamily];
  }

  let fontData: ArrayBuffer;
  if (typeof fontPath === 'string') {
    const response = await fetch(fontPath);
    fontData = await response.arrayBuffer();
  } else {
    fontData = fontPath;
  }

  const font = opentype.parse(fontData);
  FONT_REGISTER[fontFamily] = font;
  if (!FONT_REGISTER['default']) FONT_REGISTER['default'] = font;

  return font;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- opentype Font type
export const getFont = (fontFamily = 'default'): any => {
  return FONT_REGISTER[fontFamily];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- opentype PathCommand type
const sketchFontCommands = function* (commands: any[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sketcher instance
  let sk: any = null;
  let lastPoint: Point2D | null = null;

  if (!_BlueprintSketcher) {
    bug('text', 'Text dependencies not injected. Call _injectTextDeps first.');
  }

  for (const command of commands) {
    if (command.type === 'Z') {
      if (sk) yield sk.close();
      sk = null;
      continue;
    }

    const p: Point2D = [-command.x, command.y];

    if (command.type === 'M') {
      if (sk) {
        yield sk.done();
      }
      sk = new _BlueprintSketcher();
      sk.movePointerTo(p);
      lastPoint = p;
      continue;
    }

    if (lastPoint && Math.abs(p[0] - lastPoint[0]) < 1e-9 && Math.abs(p[1] - lastPoint[1]) < 1e-9)
      continue;

    if (command.type === 'L') {
      sk?.lineTo(p);
    }

    if (command.type === 'C') {
      sk?.cubicBezierCurveTo(p, [-command.x1, command.y1], [-command.x2, command.y2]);
    }

    if (command.type === 'Q') {
      sk?.quadraticBezierCurveTo(p, [-command.x1, command.y1]);
    }

    lastPoint = p;
  }
};

export function textBlueprints(
  text: string,
  { startX = 0, startY = 0, fontSize = 16, fontFamily = 'default' } = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- font rendering returns dynamic blueprint structures
): any {
  let font = getFont(fontFamily);
  if (!font) {
    console.warn(`Font family "${fontFamily}" not found, please load it first, using the default`);
    font = getFont();
  }
  if (!_organiseBlueprints) {
    bug('text', 'Text dependencies not injected. Call _injectTextDeps first.');
  }
  const writtenText = font.getPath(text, -startX, -startY, fontSize);
  const blueprints = Array.from(sketchFontCommands(writtenText.commands));
  return _organiseBlueprints(blueprints).mirror([0, 0]);
}

export function sketchText(
  text: string,
  textConfig?: {
    startX?: number;
    startY?: number;
    fontSize?: number;
    fontFamily?: string;
  },
  planeConfig: {
    plane?: PlaneName | Plane;
    origin?: Point | number;
  } = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- returns Sketches type
): any {
  const textBp = textBlueprints(text, textConfig);
  return planeConfig.plane instanceof
    (Object.getPrototypeOf(planeConfig.plane)?.constructor || Object)
    ? textBp.sketchOnPlane(planeConfig.plane)
    : textBp.sketchOnPlane(planeConfig.plane, planeConfig.origin);
}
