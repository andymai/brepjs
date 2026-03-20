/** Minimal opentype.js Font interface covering brepjs usage. */
export interface OpenTypeFont {
  getPath(
    text: string,
    x: number,
    y: number,
    fontSize: number
  ): { commands: OpenTypePathCommand[] };
  getAdvanceWidth(text: string, fontSize: number): number;
  unitsPerEm: number;
  ascender: number;
  descender: number;
  tables?: { os2?: { sTypoLineGap?: number } };
}

export type OpenTypePathCommand =
  | { type: 'M'; x: number; y: number }
  | { type: 'L'; x: number; y: number }
  | { type: 'C'; x: number; y: number; x1: number; y1: number; x2: number; y2: number }
  | { type: 'Q'; x: number; y: number; x1: number; y1: number }
  | { type: 'Z' };
