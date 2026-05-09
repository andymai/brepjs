import { type Result, ok, err } from '@/core/result.js';
import { validationError, BrepErrorCode } from '@/core/errors.js';
import { getFont } from './fontRegistry.js';

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
