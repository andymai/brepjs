import { HERO_CODE } from './constants.js';

export interface Example {
  id: string;
  title: string;
  description: string;
  category: string;
  code: string;
}

export const examples: Example[] = [
  {
    id: 'simple-box',
    title: 'Simple Box',
    description: 'A basic box primitive — the simplest possible shape.',
    category: 'Primitives',
    code: `// A simple 40×30×20 box
return box(40, 30, 20);`,
  },
  {
    id: 'filleted-box',
    title: 'Filleted Box',
    description: 'Round all edges of a box with a fillet radius.',
    category: 'Operations',
    code: `// Create a box and fillet all edges
return shape(box(40, 30, 20)).fillet(3).val;`,
  },
  {
    id: 'boolean-subtraction',
    title: 'Boolean Subtraction',
    description: 'Cut a cylinder from a box to create a hole.',
    category: 'Booleans',
    code: `// Box with a cylindrical hole
const hole = cylinder(10, 30, { at: [20, 20, -5] });
return shape(box(40, 40, 20)).cut(hole).val;`,
  },
  {
    id: 'chamfered-box',
    title: 'Chamfered Box',
    description: 'Apply chamfers to all edges of a box — compare with the filleted box.',
    category: 'Operations',
    code: `// Chamfer every edge of a box
return shape(box(40, 30, 20)).chamfer(3).val;`,
  },
  {
    id: 'extruded-l-shape',
    title: 'Extruded L-Shape',
    description: 'Sketch a 2D L-profile and extrude it into a solid.',
    category: 'Sketching',
    code: `// Draw an L-shaped profile and extrude
const sketch = new Sketcher()
  .lineTo([40, 0])
  .lineTo([40, 10])
  .lineTo([15, 10])
  .lineTo([15, 40])
  .lineTo([0, 40])
  .close();

return shape(sketch.face()).extrude(15).val;`,
  },
  {
    id: 'revolved-profile',
    title: 'Revolved Profile',
    description: 'Revolve a 2D profile around the Z axis to make a vase.',
    category: 'Sketching',
    code: `// Revolve a profile to create a vase shape
// Sketch in XZ plane so X = radius, Z = height
const plane = createPlane([0, 0, 0], [1, 0, 0], [0, -1, 0]);
const sketch = new Sketcher(plane)
  .lineTo([15, 0])
  .lineTo([20, 20])
  .lineTo([15, 35])
  .lineTo([23, 60])
  .lineTo([0, 60])
  .close();

return shape(sketch.face()).revolve().val;`,
  },
  {
    id: 'sphere-with-holes',
    title: 'Sphere with Holes',
    description: 'Subtract cylinders from a sphere along three axes.',
    category: 'Booleans',
    code: `// Sphere with holes along X, Y, and Z axes
const hole = cylinder(8, 60, { at: [0, 0, -30] });

return shape(sphere(25))
  .cut(hole)                                         // Z-axis
  .cut(rotate(hole, 90, { axis: [0, 1, 0] }))       // X-axis
  .cut(rotate(hole, 90, { axis: [1, 0, 0] }))       // Y-axis
  .val;`,
  },
  {
    id: 'spiral-staircase',
    title: 'Spiral Staircase',
    description: 'A parametric spiral staircase with treads and posts.',
    category: 'Advanced',
    code: HERO_CODE,
  },
];

export function findExample(id: string): Example | undefined {
  return examples.find((e) => e.id === id);
}

/** IDs of examples to highlight on the landing page (visually diverse set). */
export const featuredExampleIds: string[] = [
  'filleted-box',
  'boolean-subtraction',
  'chamfered-box',
  'extruded-l-shape',
  'revolved-profile',
  'spiral-staircase',
];
