/**
 * Shape-attached colors — assign RGBA colors to whole shapes or individual
 * faces, persisting through boolean operations and modifiers via propagation.
 *
 * Follows the same WeakMap + HashCode pattern as faceTagFns.ts.
 */

import type { ShapeEvolution } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import type { AnyShape, Face } from '../core/shapeTypes.js';
import { HASH_CODE_MAX } from '../core/constants.js';

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

/** O(1) check whether a shape has any color metadata (shape or face level). */
export function hasColorMetadata(shape: AnyShape): boolean {
  return shapeColorStore.has(shape.wrapped) || faceColorStore.has(shape.wrapped);
}

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
    map.set(getKernel().hashCode(face.wrapped, HASH_CODE_MAX), parsed);
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
  return map.get(getKernel().hashCode(face.wrapped, HASH_CODE_MAX));
}

/**
 * Propagate colors from input shapes to a result shape using a
 * kernel-provided ShapeEvolution record (no direct kernel op access needed).
 */
export function propagateColorsFromEvolution(
  evolution: ShapeEvolution,
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

    for (const [hash, color] of inputFaceMap) {
      if (evolution.deleted.has(hash)) continue;

      const modifiedHashes = evolution.modified.get(hash);
      if (modifiedHashes && modifiedHashes.length > 0) {
        for (const modHash of modifiedHashes) {
          resultFaceMap.set(modHash, color);
        }
      } else {
        // Face survived unmodified
        resultFaceMap.set(hash, color);
      }
    }
  }
}
