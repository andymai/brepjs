import type { Point2D } from '@/2d/lib/index.js';
import type Blueprints from '@/2d/blueprints/blueprints.js';
import { bug } from '@/core/errors.js';
import { organiseBlueprints } from '@/2d/blueprints/lib.js';
import { BlueprintSketcher } from '@/2d/blueprints/blueprintSketcher.js';
import { getFont } from './fontRegistry.js';
import type { OpenTypePathCommand } from '@/kernel/occt/wasmTypes/externals.js';

const sketchFontCommands = function* (commands: OpenTypePathCommand[]) {
  let sk: BlueprintSketcher | null = null;
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

/**
 * Convert a text string into 2D Blueprints using a loaded font.
 *
 * Each glyph outline is traced as a series of line/bezier curves, then
 * organised into a {@link Blueprints} collection (outer contours + holes).
 *
 * @param text - The string to render.
 * @returns A Blueprints instance representing the text outlines.
 *
 * @remarks Requires a font to be loaded via {@link loadFont} before use.
 */
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
