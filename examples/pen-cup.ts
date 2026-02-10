/**
 * Pen Cup — Intermediate
 *
 * A container with rounded corners, hollowed out using the shell operation.
 * Mirrors the gridfinity bin pattern: extrude → shell → fillet.
 *
 * Concepts: sketchRoundedRectangle, extrude, shell, faceFinder, fillet, unwrap
 */

import './_setup.js';
import {
  sketchRoundedRectangle,
  shell,
  fillet,
  shape,
  faceFinder,
  unwrap,
  measureVolume,
} from 'brepjs';

// ─── Parameters (mm) ─────────────────────────────────────────────

const w = 50; // outer width
const d = 35; // outer depth
const h = 80; // height
const wallT = 2; // wall thickness
const r = 8; // corner radius

// ─── Build ───────────────────────────────────────────────────────

// Create a rounded rectangle sketch on XY and extrude upward
let cup = sketchRoundedRectangle(w, d, r).extrude(h);

// Shell: find the top face, remove it, and hollow to wall thickness.
// This is the same pattern used in gridfinity bins — faceFinder locates
// the face to remove, then shell creates uniform-thickness walls.
const topFaces = faceFinder().parallelTo('Z').atDistance(h, [0, 0, 0]).findAll(cup);
cup = unwrap(shell(cup, topFaces, wallT));

// Fillet all edges for a smooth rim and base
const result = shape(cup).fillet(0.8).val;

// ─── Report ──────────────────────────────────────────────────────

console.log('Pen cup');
console.log('  Outer:', `${w} × ${d} × ${h} mm`);
console.log('  Wall thickness:', wallT, 'mm');
console.log('  Volume:', measureVolume(result).toFixed(1), 'mm³');
