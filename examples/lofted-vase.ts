/**
 * Lofted Vase — Advanced
 *
 * A vase shaped by lofting through circular cross-sections at different
 * heights, then shelled to create thin walls. This mirrors the gridfinity
 * socket technique (multi-section loft) applied to an organic form.
 *
 * Concepts: sketchCircle, loftWith, shell, faceFinder, unwrap
 */

import './_setup.js';
import { sketchCircle, shell, faceFinder, unwrap, measureVolume } from 'brepjs';

// ─── Parameters (mm) ─────────────────────────────────────────────

// Each section: [z-height, radius]
const profile: [number, number][] = [
  [0, 25], // base
  [30, 38], // belly
  [55, 30], // waist
  [80, 22], // neck
  [90, 28], // rim flare
];
const wallT = 2; // wall thickness

// ─── Build ───────────────────────────────────────────────────────

// Create circular cross-sections at each height
const base = sketchCircle(profile[0][1], { plane: 'XY', origin: [0, 0, profile[0][0]] });
const sections = profile.slice(1).map(([z, r]) => sketchCircle(r, { plane: 'XY', origin: [0, 0, z] }));

// Loft through all sections to create a solid of revolution
let vase = base.loftWith(sections);

// Shell: remove the top face and hollow to wall thickness
const topHeight = profile[profile.length - 1][0];
const topFaces = faceFinder().parallelTo('Z').atDistance(topHeight, [0, 0, 0]).findAll(vase);
vase = unwrap(shell(vase, topFaces, wallT));

// ─── Report ──────────────────────────────────────────────────────

console.log('Lofted vase');
console.log('  Height:', topHeight, 'mm');
console.log('  Sections:', profile.length);
console.log('  Volume:', measureVolume(vase).toFixed(1), 'mm³');
