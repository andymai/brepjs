/**
 * Cable Organizer with Snap-Fit
 *
 * Functional requirements:
 * - THROUGH: Multiple cable channels
 * - ONTO: Mounts to desk edge with clip
 *
 * Manufacturing: 3D printing
 */

import initOpenCascade from 'opencascade.js';
import { initFromOC, box, cylinder, shape, exportSTL } from 'brepjs';

function createCableOrganizer() {
  // Simplified implementation
  const body = box(100, 30, 20);
  
  // Cable channels
  let organizer = shape(body).val;
  
  for (let i = 0; i < 5; i++) {
    const channel = cylinder(5, 22, {
      at: [20 + i * 15, 15, -1],
    });
    organizer = shape(organizer).cut(channel).val;
  }

  return organizer;
}

async function main() {
  const oc = await initOpenCascade();
  initFromOC(oc);

  const model = createCableOrganizer();
  await exportSTL(model, 'examples/output/cable-organizer.stl');
  console.log('✓ Cable organizer generated');
}

main().catch(console.error);
