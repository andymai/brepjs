/**
 * Spur Gear — Intermediate
 *
 * A spur gear with teeth around the perimeter and a center bore.
 * Demonstrates circular patterning with rotate and batch fusion (fuseAll).
 *
 * Concepts: cylinder, box, rotate, fuseAll, cut, unwrap
 */

import './_setup.js';
import { cylinder, box, rotate, fuseAll, cut, unwrap, measureVolume } from 'brepjs';

// ─── Parameters (mm) ─────────────────────────────────────────────

const teeth = 16; // number of teeth
const pitchR = 25; // pitch circle radius
const addendum = 4; // tooth height above pitch circle
const toothW = 4.5; // tooth width (tangential)
const thick = 10; // gear thickness (axial)
const boreR = 8; // center bore radius

// ─── Build ───────────────────────────────────────────────────────

// Gear blank
let gear = cylinder(pitchR, thick);

// Build teeth around the perimeter.
// Each tooth is a box positioned at the pitch circle, then rotated
// to its angular position. fuseAll combines them in one batch operation.
const toothShapes = [];
for (let i = 0; i < teeth; i++) {
  const angle = (360 / teeth) * i;
  const tooth = rotate(
    box(addendum * 2, toothW, thick, { at: [pitchR + addendum, 0, thick / 2] }),
    angle
  );
  toothShapes.push(tooth);
}
gear = unwrap(fuseAll([gear, ...toothShapes]));

// Center bore
gear = unwrap(cut(gear, cylinder(boreR, thick + 4, { at: [0, 0, -2] })));

// ─── Report ──────────────────────────────────────────────────────

console.log('Spur gear');
console.log('  Teeth:', teeth, '| Pitch radius:', pitchR, 'mm');
console.log('  Volume:', measureVolume(gear).toFixed(1), 'mm³');
