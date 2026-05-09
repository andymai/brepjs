import type { Point2D } from '@/2d/lib/index.js';
import type { Plane, PlaneName } from '@/core/planeTypes.js';
import type { PointInput } from '@/core/types.js';
import type Blueprints from '@/2d/blueprints/blueprints.js';
import { bug, BrepErrorCode } from '@/core/errors.js';
import { type Result, ok, err } from '@/core/result.js';
import { ioError, validationError } from '@/core/errors.js';
import { organiseBlueprints } from '@/2d/blueprints/lib.js';
import { BlueprintSketcher } from '@/sketching/sketcher2d.js';
import CompoundSketch from '@/sketching/compoundSketch.js';
import Sketches from '@/sketching/sketches.js';
import { wrapSketchData } from '@/sketching/sketchFns.js';

import opentype from 'opentype.js';
import type { OpenTypeFont, OpenTypePathCommand } from '@/kernel/occt/wasmTypes/externals.js';

const FONT_REGISTER: Record<string, OpenTypeFont> = {};

/**
 * Load and register an OpenType/TrueType font for use with text drawing functions.
 *
 * The font is fetched (if a URL string) or parsed (if an ArrayBuffer) and
 * stored in an internal registry keyed by `fontFamily`. The first font loaded
 * is also registered as `'default'`.
 *
 * @param fontPath - URL string or raw ArrayBuffer of the font file.
 * @param fontFamily - Registry key for later retrieval (defaults to `'default'`).
 * @param force - If true, overwrite a previously loaded font with the same key.
 * @returns The parsed opentype.js Font object.
 */
export async function loadFont(
  fontPath: string | ArrayBuffer,
  fontFamily = 'default',
  force = false
): Promise<Result<OpenTypeFont>> {
  if (!force && FONT_REGISTER[fontFamily]) {
    return ok(FONT_REGISTER[fontFamily]);
  }

  let fontData: ArrayBuffer;
  if (typeof fontPath === 'string') {
    let response: Response;
    try {
      response = await fetch(fontPath);
    } catch (e) {
      return err(
        ioError(
          BrepErrorCode.FONT_FETCH_FAILED,
          `Failed to fetch font from ${fontPath}: ${e instanceof Error ? e.message : String(e)}`,
          e
        )
      );
    }
    if (!response.ok) {
      return err(
        ioError(
          BrepErrorCode.FONT_FETCH_FAILED,
          `Failed to fetch font from ${fontPath}: HTTP ${response.status} ${response.statusText}`
        )
      );
    }
    fontData = await response.arrayBuffer();
  } else {
    fontData = fontPath;
  }

  let font;
  try {
    font = opentype.parse(fontData);
  } catch (e) {
    return err(
      ioError(
        BrepErrorCode.FONT_PARSE_FAILED,
        `Failed to parse font data: ${e instanceof Error ? e.message : String(e)}`,
        e
      )
    );
  }
  // Assert at library boundary — opentype.js Font is structurally compatible
  const typedFont = font as OpenTypeFont;
  FONT_REGISTER[fontFamily] = typedFont;
  if (!FONT_REGISTER['default']) FONT_REGISTER['default'] = typedFont;

  return ok(typedFont);
}

/**
 * Retrieve a previously loaded font by family name.
 *
 * @param fontFamily - Registry key (defaults to `'default'`).
 * @returns The opentype.js Font object, or `undefined` if not loaded.
 */
export const getFont = (fontFamily = 'default'): OpenTypeFont | undefined => {
  return FONT_REGISTER[fontFamily];
};

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

/**
 * Render text as 3D sketch outlines on a plane.
 *
 * Combines {@link textBlueprints} with `sketchOnPlane` to produce a
 * {@link Sketches} collection that can be extruded, revolved, etc.
 *
 * @param text - The string to render.
 * @param textConfig - Font size, family, and start position.
 * @param planeConfig - Plane name / origin to sketch on (defaults to XY at origin).
 * @returns A {@link Sketches} collection of the text outlines.
 *
 * @example
 * ```ts
 * await loadFont("/fonts/Roboto.ttf");
 * const textSketches = sketchText("Hello", { fontSize: 24 });
 * const solid = textSketches.extrude(2);
 * ```
 */
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
    origin?: PointInput | number;
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

// ---------------------------------------------------------------------------
// Text & font metrics
// ---------------------------------------------------------------------------

export interface TextMetricsResult {
  /** Total advance width of the text string. */
  width: number;
  /** Height from descender to ascender. */
  height: number;
  /** Distance from baseline to top of tallest glyph (positive). */
  ascender: number;
  /** Distance from baseline to bottom of lowest glyph (negative). */
  descender: number;
}

export interface FontMetricsResult {
  /** Ascender in font units scaled to fontSize. */
  ascender: number;
  /** Descender in font units scaled to fontSize (negative). */
  descender: number;
  /** Units per em of the font. */
  unitsPerEm: number;
  /** Total line height (ascender - descender + line gap). */
  lineHeight: number;
}

/**
 * Measure the dimensions of a text string without generating geometry.
 *
 * Requires a font to be loaded via {@link loadFont} first.
 */
export function textMetrics(
  text: string,
  options?: { fontSize?: number; fontFamily?: string }
): Result<TextMetricsResult> {
  const fontSize = options?.fontSize ?? 1;
  const font = getFont(options?.fontFamily);
  if (!font) {
    return err(
      validationError(
        BrepErrorCode.NO_FONT_LOADED,
        'No font loaded. Call loadFont() first.',
        undefined,
        undefined,
        'Load a font with loadFont() before calling textMetrics()'
      )
    );
  }

  const width = font.getAdvanceWidth(text, fontSize);

  const scale = fontSize / font.unitsPerEm;

  const ascender = font.ascender * scale;

  const descender = font.descender * scale;

  return ok({ width, height: ascender - descender, ascender, descender });
}

/**
 * Retrieve font-level metrics without referencing specific text.
 *
 * Requires a font to be loaded via {@link loadFont} first.
 */
export function fontMetrics(options?: {
  fontSize?: number;
  fontFamily?: string;
}): Result<FontMetricsResult> {
  const fontSize = options?.fontSize ?? 1;
  const font = getFont(options?.fontFamily);
  if (!font) {
    return err(
      validationError(
        BrepErrorCode.NO_FONT_LOADED,
        'No font loaded. Call loadFont() first.',
        undefined,
        undefined,
        'Load a font with loadFont() before calling fontMetrics()'
      )
    );
  }

  const scale = fontSize / font.unitsPerEm;

  const ascender = font.ascender * scale;

  const descender = font.descender * scale;
  const lineGap = (font.tables?.os2?.sTypoLineGap ?? 0) * scale;

  return ok({
    ascender,
    descender,

    unitsPerEm: font.unitsPerEm,
    lineHeight: ascender - descender + lineGap,
  });
}
