import { Children, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import InfiniteGrid from '@/InfiniteGrid.js';

vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<typeof import('react')>();
  return {
    ...original,
    useEffect: vi.fn(),
    useRef: vi.fn(() => ({ current: null })),
  };
});

describe('InfiniteGrid', () => {
  it('draws the brepjs XY ground plane just below z=0', () => {
    const grid = InfiniteGrid({}) as ReactElement<{
      rotation: [number, number, number];
      position: [number, number, number];
      children: ReactElement[];
    }>;
    const material = Children.toArray(grid.props.children)[1] as ReactElement<{
      vertexShader: string;
    }>;

    expect(grid.props.rotation).toEqual([0, 0, 0]);
    expect(grid.props.position).toEqual([0, 0, -0.01]);
    expect(material.props.vertexShader).toContain('vWorldPos = worldPos.xy;');
  });
});
