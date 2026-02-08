import { HERO_CODE } from './constants.js';

export interface Example {
  id: string;
  title: string;
  description: string;
  category: 'organic' | 'architectural' | 'practical' | 'gaming';
  code: string;
  cameraPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
  autoRotateSpeed?: number;
}

export const examples: Example[] = [
  {
    id: 'spiral-staircase',
    title: 'Spiral Staircase',
    description: 'Parametric spiral staircase with treads and railing posts.',
    category: 'architectural',
    code: HERO_CODE,
    cameraPosition: [200, 180, 150],
    cameraTarget: [0, 0, 150],
  },
];

export function findExample(id: string): Example | undefined {
  return examples.find((e) => e.id === id);
}

/** All examples are now displayed in the gallery. */
export const galleryExamples = examples;
