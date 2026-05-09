import { type Result, ok, err } from '@/core/result.js';
import { ioError, BrepErrorCode } from '@/core/errors.js';

import opentype from 'opentype.js';
import type { OpenTypeFont } from '@/kernel/occt/wasmTypes/externals.js';

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
