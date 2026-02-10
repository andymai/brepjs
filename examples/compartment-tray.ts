/**
 * Compartment Tray — Advanced
 *
 * A storage tray with dividers and drain holes, inspired by gridfinity bins.
 * Demonstrates the full gridfinity pattern: extrude → shell → batch fuse
 * dividers (fuseAll) → clip to inner boundary (intersect) → batch cut
 * holes (cutAll).
 *
 * Concepts: sketchRoundedRectangle, shell, fuseAll, cutAll, intersect,
 *           box, cylinder, faceFinder, fuse, unwrap
 */

import './_setup.js';
import {
  box,
  cylinder,
  sketchRoundedRectangle,
  shell,
  fuse,
  fuseAll,
  cutAll,
  intersect,
  faceFinder,
  unwrap,
  measureVolume,
} from 'brepjs';

// ─── Parameters (mm) ─────────────────────────────────────────────

const w = 120; // outer width
const d = 80; // outer depth
const h = 30; // height
const t = 2.5; // wall thickness
const r = 6; // corner radius
const cols = 3; // compartment columns
const rows = 2; // compartment rows
const drainR = 1.5; // drain hole radius

// ─── Build ───────────────────────────────────────────────────────

// 1. Outer shell: rounded rectangle → extrude → hollow
let tray = sketchRoundedRectangle(w, d, r).extrude(h);
const topFaces = faceFinder().parallelTo('Z').atDistance(h, [0, 0, 0]).findAll(tray);
tray = unwrap(shell(tray, topFaces, t));

// 2. Compartment dividers.
//    Build oversized walls, fuse them together, then clip to the rounded
//    inner boundary using intersect — same pattern the gridfinity generator
//    uses to prevent features from protruding through curved walls.
const innerW = w - t * 2;
const innerD = d - t * 2;
const innerR = Math.max(r - t, 0.5);
const divH = h - t; // from floor level to top
const divZ = t + divH / 2; // center Z
const dividers = [];

for (let i = 1; i < cols; i++) {
  const x = -innerW / 2 + (innerW / cols) * i;
  dividers.push(box(t, innerD, divH, { at: [x, 0, divZ] }));
}

for (let j = 1; j < rows; j++) {
  const y = -innerD / 2 + (innerD / rows) * j;
  dividers.push(box(innerW, t, divH, { at: [0, y, divZ] }));
}

// Clip dividers to the inner rounded-rectangle boundary
if (dividers.length > 0) {
  const innerBound = sketchRoundedRectangle(innerW, innerD, innerR).extrude(h);
  let clippedDividers = unwrap(fuseAll(dividers));
  clippedDividers = unwrap(intersect(clippedDividers, innerBound));
  tray = unwrap(fuse(tray, clippedDividers));
}

// 3. Drain holes (batch cut).
//    One hole per compartment, cut through the floor in a single cutAll.
const holes = [];

for (let i = 0; i < cols; i++) {
  for (let j = 0; j < rows; j++) {
    const cx = -innerW / 2 + innerW / (2 * cols) + i * (innerW / cols);
    const cy = -innerD / 2 + innerD / (2 * rows) + j * (innerD / rows);
    holes.push(cylinder(drainR, t + 2, { at: [cx, cy, -1] }));
  }
}

tray = unwrap(cutAll(tray, holes));

// ─── Report ──────────────────────────────────────────────────────

console.log('Compartment tray');
console.log('  Outer:', `${w} × ${d} × ${h} mm`);
console.log('  Grid:', `${cols} × ${rows} compartments`);
console.log('  Volume:', measureVolume(tray).toFixed(1), 'mm³');
