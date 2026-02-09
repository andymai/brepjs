/**
 * Tool Holder (Screwdriver Stand)
 *
 * Functional requirements:
 * - INTO: Screwdriver handles insert into hollow sleeves
 * - Multiple tool sizes
 * - Stable base
 *
 * Manufacturing: 3D printing
 */

import initOpenCascade from 'opencascade.js';
import { initFromOC, box, cylinder, shape, exportSTL } from 'brepjs';

function createToolHolder() {
  // Base
  const base = box(150, 50, 10);
  
  let holder = shape(base).val;
  
  // Create hollow sleeves for tools
  const toolSizes = [8, 10, 12, 14, 16]; // Diameters
  
  for (let i = 0; i < toolSizes.length; i++) {
    const x = 20 + i * 25;
    const outerRadius = toolSizes[i] / 2 + 2; // 2mm wall thickness
    const innerRadius = toolSizes[i] / 2;
    
    // Outer cylinder (raised boss)
    const outer = cylinder(outerRadius, 40, { at: [x, 25, 10] });
    holder = shape(holder).fuse(outer).val;
    
    // Inner cylinder (hollow for tool)
    const inner = cylinder(innerRadius, 42, { at: [x, 25, 9] });
    holder = shape(holder).cut(inner).val;
  }

  return holder;
}

async function main() {
  const oc = await initOpenCascade();
  initFromOC(oc);

  const model = createToolHolder();
  await exportSTL(model, 'examples/output/tool-holder.stl');
  console.log('✓ Tool holder generated (hollow sleeves for insertion)');
}

main().catch(console.error);
