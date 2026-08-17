/**
 * N-ary builders must decouple from their input arrays: mutating the array
 * after construction cannot change the node's children, which would desync
 * them from the pre-computed structuralHash. Pure tests, no kernel needed.
 */

import { describe, expect, it } from 'vitest';
import { box, sphere, fuseAll, cutAll, compound, loft, polygon, type IRNode } from '@/csg/index.js';

function rect() {
  return polygon([
    [0, 0, 0],
    [10, 0, 0],
    [10, 10, 0],
    [0, 10, 0],
  ]);
}

describe('n-ary builders copy their input arrays', () => {
  it('fuseAll', () => {
    const shapes = [box(1, 1, 1), box(2, 2, 2)];
    const node = fuseAll(shapes);
    shapes.push(sphere(3));
    shapes[0] = sphere(9);
    expect(node.shapes).toHaveLength(2);
    expect(node.structuralHash).toBe(fuseAll([box(1, 1, 1), box(2, 2, 2)]).structuralHash);
  });

  it('cutAll', () => {
    const tools = [box(1, 1, 1)];
    const node = cutAll(box(5, 5, 5), tools);
    tools.push(sphere(2));
    expect(node.tools).toHaveLength(1);
    expect(node.structuralHash).toBe(cutAll(box(5, 5, 5), [box(1, 1, 1)]).structuralHash);
  });

  it('compound', () => {
    const children: IRNode[] = [box(1, 1, 1), sphere(2)];
    const node = compound(children);
    children.length = 0;
    expect(node.children).toHaveLength(2);
    expect(node.structuralHash).toBe(compound([box(1, 1, 1), sphere(2)]).structuralHash);
  });

  it('loft', () => {
    const sections = [rect(), rect()];
    const node = loft(sections);
    sections.push(rect());
    expect(node.sections).toHaveLength(2);
    expect(node.structuralHash).toBe(loft([rect(), rect()]).structuralHash);
  });
});
