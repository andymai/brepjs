/**
 * Hello World — Your First Shape
 *
 * The simplest possible brepjs program: create a box, measure it, export it.
 * Start here if you're new to brepjs.
 */

import { makeBox, measureVolume, exportSTEP, unwrap } from 'brepjs';

// Create a box: two corners define the shape
const box = makeBox([0, 0, 0], [30, 20, 10]);

// Measure it
console.log('Box volume:', measureVolume(box).toFixed(1), 'mm³');
console.log('Expected:  ', (30 * 20 * 10).toFixed(1), 'mm³');

// Export to STEP (industry-standard CAD format)
const stepBlob = unwrap(exportSTEP(box));
console.log('STEP file:', stepBlob.size, 'bytes');
