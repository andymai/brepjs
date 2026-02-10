/**
 * Game Die — Beginner
 *
 * A six-sided die: rounded cube with spherical dot indentations on each face.
 * Demonstrates primitives, filleting, and batch boolean cuts (cutAll).
 *
 * Concepts: box, sphere, fillet, cutAll, shape() builder, unwrap
 */

import './_setup.js';
import { box, sphere, cutAll, shape, unwrap, measureVolume } from 'brepjs';

// ─── Parameters (mm) ─────────────────────────────────────────────

const size = 20; // cube edge length
const dotR = 2; // dot sphere radius
const s = 5; // dot spacing from center

// ─── Build ───────────────────────────────────────────────────────

// Rounded cube base
const half = size / 2;
let die = shape(box(size, size, size, { centered: true })).fillet(3).val;

// Collect all dot spheres — one batch cutAll is faster than 21 individual cuts.
// Standard die layout: opposite faces sum to 7.
const dots = [];

// Face 1 (+Z top): center
dots.push(sphere(dotR, { at: [0, 0, half] }));

// Face 6 (-Z bottom): 2 columns × 3 rows
for (const x of [-s, s]) {
  for (const y of [-s, 0, s]) {
    dots.push(sphere(dotR, { at: [x, y, -half] }));
  }
}

// Face 2 (+X): diagonal pair
dots.push(sphere(dotR, { at: [half, -s, s] }));
dots.push(sphere(dotR, { at: [half, s, -s] }));

// Face 5 (-X): center + 4 corners
dots.push(sphere(dotR, { at: [-half, 0, 0] }));
for (const [y, z] of [
  [-s, -s],
  [s, -s],
  [-s, s],
  [s, s],
] as [number, number][]) {
  dots.push(sphere(dotR, { at: [-half, y, z] }));
}

// Face 3 (+Y): diagonal triple
for (const [x, z] of [
  [-s, -s],
  [0, 0],
  [s, s],
] as [number, number][]) {
  dots.push(sphere(dotR, { at: [x, half, z] }));
}

// Face 4 (-Y): 4 corners
for (const [x, z] of [
  [-s, -s],
  [s, -s],
  [-s, s],
  [s, s],
] as [number, number][]) {
  dots.push(sphere(dotR, { at: [x, -half, z] }));
}

const result = unwrap(cutAll(die, dots));

// ─── Report ──────────────────────────────────────────────────────

console.log('Game die');
console.log('  Size:', size, 'mm');
console.log('  Dots:', dots.length);
console.log('  Volume:', measureVolume(result).toFixed(1), 'mm³');
