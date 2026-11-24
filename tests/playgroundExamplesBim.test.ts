import { it, expect } from 'vitest';
import { getKernel } from '@/kernel/index.js';
import { initKernel } from './setup.js';
import { examplesOfFile } from './helpers/playgroundExampleCategories.js';
import { runExample } from './helpers/playgroundExampleEval.js';
import { describeExamplesOfFile } from './helpers/playgroundExampleSuite.js';

describeExamplesOfFile(import.meta.filename);

it('draws the detailed door and window frames inside their wall openings', async () => {
  await initKernel();
  const example = examplesOfFile(import.meta.filename).find(
    (item) => item.id === 'bim-wall-openings'
  );
  if (!example) throw new Error('Missing wall-openings example');
  const scene = await runExample(example.code);
  try {
    const frames = scene.filter(
      (item) =>
        item &&
        typeof item === 'object' &&
        '__brepjsPlaygroundColor' in item &&
        item.__brepjsPlaygroundColor === '#f5f2ea'
    );
    expect(frames).toHaveLength(1);
    const frame = frames[0];
    if (
      !frame ||
      typeof frame !== 'object' ||
      !('shape' in frame) ||
      !frame.shape ||
      typeof frame.shape !== 'object' ||
      !('wrapped' in frame.shape)
    )
      throw new Error('Missing frame compound');
    const { min, max } = getKernel().boundingBox(frame.shape.wrapped);
    // The detailed frame group starts at the first jamb. A second, opening-local
    // filler panel would extend behind the wall and below the floor.
    expect(min[1]).toBeCloseTo(550, 2);
    expect(max[1]).toBeCloseTo(3950, 2);
    expect(min[0]).toBeGreaterThan(-200);
    expect(max[0]).toBeLessThan(300);
  } finally {
    for (const group of scene) {
      if (
        group &&
        typeof group === 'object' &&
        'shape' in group &&
        group.shape &&
        typeof group.shape === 'object' &&
        'delete' in group.shape &&
        typeof group.shape.delete === 'function'
      )
        group.shape.delete();
    }
  }
}, 60_000);
