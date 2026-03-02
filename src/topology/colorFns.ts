/**
 * Shape-attached colors — assign RGBA colors to whole shapes or individual
 * faces, persisting through boolean operations and modifiers via propagation.
 *
 * Follows the same WeakMap + HashCode pattern as faceTagFns.ts.
 */

import type { AnyShape, Face } from '../core/shapeTypes.js';
import { HASH_CODE_MAX } from '../core/constants.js';
import { getFaces, iterOcList } from './shapeFns.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** RGBA color as 0-1 floats. */
export type Color = [number, number, number, number];

/** Accepted color inputs: hex string, RGB tuple, or RGBA tuple. */
export type ColorInput = string | [number, number, number] | [number, number, number, number];

// ---------------------------------------------------------------------------
// Internal storage
// ---------------------------------------------------------------------------

// Whole-shape color, keyed on shape.wrapped identity
const shapeColorStore = new WeakMap<object, Color>();

// Per-face colors: shape.wrapped → face hash → color
const faceColorStore = new WeakMap<object, Map<number, Color>>();

function getFaceColorMap(shape: AnyShape): Map<number, Color> {
  let map = faceColorStore.get(shape.wrapped);
  if (!map) {
    map = new Map();
    faceColorStore.set(shape.wrapped, map);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Color parsing
// ---------------------------------------------------------------------------

function parseColor(input: ColorInput): Color {
  if (typeof input === 'string') {
    let hex = input.startsWith('#') ? input.slice(1) : input;
    if (hex.length === 3) {
      hex =
        hex.charAt(0) +
        hex.charAt(0) +
        hex.charAt(1) +
        hex.charAt(1) +
        hex.charAt(2) +
        hex.charAt(2);
    }
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return [r, g, b, 1];
  }
  if (input.length === 3) {
    return [input[0], input[1], input[2], 1];
  }
  return [input[0], input[1], input[2], input[3]];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Set a whole-shape color (stored externally via WeakMap).
 * Returns the same shape reference.
 */
export function colorShape<T extends AnyShape>(shape: T, color: ColorInput): T {
  shapeColorStore.set(shape.wrapped, parseColor(color));
  return shape;
}

/**
 * Set per-face colors on a shape.
 * Returns the same shape reference.
 */
export function colorFaces<T extends AnyShape>(shape: T, faces: Face[], color: ColorInput): T {
  const parsed = parseColor(color);
  const map = getFaceColorMap(shape);
  for (const face of faces) {
    map.set(face.wrapped.HashCode(HASH_CODE_MAX), parsed);
  }
  return shape;
}

/**
 * Get the whole-shape color, or undefined if none set.
 */
export function getShapeColor(shape: AnyShape): Color | undefined {
  return shapeColorStore.get(shape.wrapped);
}

/**
 * Get the color of a specific face, or undefined if none set.
 */
export function getFaceColor(shape: AnyShape, face: Face): Color | undefined {
  const map = faceColorStore.get(shape.wrapped);
  if (!map) return undefined;
  return map.get(face.wrapped.HashCode(HASH_CODE_MAX));
}

/**
 * Propagate colors from input shapes to a result shape.
 *
 * Call after any operation that creates a new shape from existing shapes
 * (booleans, fillets, chamfers, etc.) to preserve colors.
 *
 * Uses OCCT's Modified()/Generated() to track which input faces
 * became which result faces.
 */
export function propagateColors(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT WASM type gaps
  op: { Modified(s: any): any; Generated(s: any): any; IsDeleted?(s: any): boolean },
  inputs: readonly AnyShape[],
  result: AnyShape
): void {
  // Propagate whole-shape colors: first input with a color wins
  for (const input of inputs) {
    const c = shapeColorStore.get(input.wrapped);
    if (c) {
      shapeColorStore.set(result.wrapped, c);
      break;
    }
  }

  // Propagate per-face colors
  const resultFaceMap = getFaceColorMap(result);

  for (const input of inputs) {
    const inputFaceMap = faceColorStore.get(input.wrapped);
    if (!inputFaceMap || inputFaceMap.size === 0) continue;

    for (const face of getFaces(input)) {
      const hash = face.wrapped.HashCode(HASH_CODE_MAX);
      const color = inputFaceMap.get(hash);
      if (!color) continue;

      if (op.IsDeleted?.(face.wrapped)) continue;

      const modifiedList = op.Modified(face.wrapped);
      const modSize = modifiedList.Size?.() ?? 0;
      if (modSize > 0) {
        iterOcList(modifiedList, (modFace) => {
          resultFaceMap.set(modFace.HashCode(HASH_CODE_MAX), color);
        });
      } else {
        // Face survived unmodified
        resultFaceMap.set(hash, color);
      }
    }
  }
}
