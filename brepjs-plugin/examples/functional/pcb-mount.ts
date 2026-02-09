/**
 * PCB Mount with Standoffs
 *
 * Functional requirements:
 * - ONTO: PCB sits on raised standoffs
 * - Precise M3 mounting holes
 * - Standard PCB dimensions (100×80mm)
 *
 * Manufacturing: CNC or 3D printing
 */

import initOpenCascade from 'opencascade.js';
import { initFromOC, box, cylinder, shape, exportSTL } from 'brepjs';

function createPCBMount() {
  // Base plate
  const base = box(120, 100, 3);
  
  let mount = shape(base).val;
  
  // Add 4 standoffs at PCB corners
  const standoffPositions = [
    [10, 10],
    [110, 10],
    [10, 90],
    [110, 90],
  ];
  
  for (const [x, y] of standoffPositions) {
    const standoff = cylinder(4, 5, { at: [x, y, 3] });
    mount = shape(mount).fuse(standoff).val;
    
    // M3 mounting hole through standoff
    const hole = cylinder(1.6, 10, { at: [x, y, 0] });
    mount = shape(mount).cut(hole).val;
  }

  return mount;
}

async function main() {
  const oc = await initOpenCascade();
  initFromOC(oc);

  const model = createPCBMount();
  await exportSTL(model, 'examples/output/pcb-mount.stl');
  console.log('✓ PCB mount generated');
}

main().catch(console.error);
