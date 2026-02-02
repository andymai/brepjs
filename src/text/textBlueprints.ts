import type { Point2D } from '../2d/lib/index.js';
import type { Plane, PlaneName, Point } from '../core/geometry.js';
import type Blueprints from '../2d/blueprints/Blueprints.js';
import { bug } from '../core/errors.js';
import type { SketchData } from '../2d/blueprints/lib.js';
import { organiseBlueprints } from '../2d/blueprints/lib.js';
import { BlueprintSketcher } from '../sketching/Sketcher2d.js';
import Sketch from '../sketching/Sketch.js';
import CompoundSketch from '../sketching/CompoundSketch.js';
import Sketches from '../sketching/Sketches.js';

import opentype from 'opentype.js';

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
      sk = new BlueprintSketcher();
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
): Blueprints {
  let font = getFont(fontFamily);
  if (!font) font = getFont();
  if (!font) {
    bug('text', 'No fonts loaded. Call loadFont() before using text functions.');
  }
  const writtenText = font.getPath(text, -startX, -startY, fontSize);
  const blueprints = Array.from(sketchFontCommands(writtenText.commands));
  return organiseBlueprints(blueprints).mirror([0, 0]);
}

function wrapSketchData(data: SketchData): Sketch {
  const opts: { defaultOrigin?: Point; defaultDirection?: Point } = {};
  if (data.defaultOrigin) opts.defaultOrigin = data.defaultOrigin;
  if (data.defaultDirection) opts.defaultDirection = data.defaultDirection;
  const sketch = new Sketch(data.wire, opts);
  if (data.baseFace) sketch.baseFace = data.baseFace;
  return sketch;
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
): Sketches {
  const textBp = textBlueprints(text, textConfig);
  const results =
    typeof planeConfig.plane === 'string' || planeConfig.plane === undefined
      ? textBp.sketchOnPlane(planeConfig.plane, planeConfig.origin)
      : textBp.sketchOnPlane(planeConfig.plane);
  return new Sketches(
    results.map((item) =>
      Array.isArray(item) ? new CompoundSketch(item.map(wrapSketchData)) : wrapSketchData(item)
    )
  );
}
