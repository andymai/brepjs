import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  cylinder,
  castShape,
  createAssemblyNode,
  addChild,
  removeChild,
  updateNode,
  findNode,
  walkAssembly,
  countNodes,
  collectShapes,
} from '../src/index.js';
import type { Shape3D } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function makeBoxShape(): Shape3D {
  return castShape(box(10, 10, 10).wrapped) as Shape3D;
}

function makeCylShape(): Shape3D {
  return castShape(cylinder(5, 20).wrapped) as Shape3D;
}

describe('createAssemblyNode', () => {
  it('creates a node with just a name', () => {
    const node = createAssemblyNode('root');
    expect(node.name).toBe('root');
    expect(node.children).toHaveLength(0);
    expect(node.shape).toBeUndefined();
  });

  it('creates a node with a shape', () => {
    const shape = makeBoxShape();
    const node = createAssemblyNode('part', { shape });
    expect(node.shape).toBe(shape);
  });

  it('creates a node with transform and metadata', () => {
    const node = createAssemblyNode('part', {
      translate: [10, 20, 30],
      rotate: { angle: 45, axis: [0, 0, 1] },
      metadata: { material: 'steel' },
    });
    expect(node.translate).toEqual([10, 20, 30]);
    expect(node.rotate).toEqual({ angle: 45, axis: [0, 0, 1] });
    expect(node.metadata).toEqual({ material: 'steel' });
  });
});

describe('addChild / removeChild', () => {
  it('adds a child to a node', () => {
    const root = createAssemblyNode('root');
    const child = createAssemblyNode('child');
    const updated = addChild(root, child);
    expect(updated.children).toHaveLength(1);
    expect(updated.children[0]?.name).toBe('child');
    // Original is unchanged
    expect(root.children).toHaveLength(0);
  });

  it('removes a child by name', () => {
    const root = addChild(
      addChild(createAssemblyNode('root'), createAssemblyNode('a')),
      createAssemblyNode('b')
    );
    const updated = removeChild(root, 'a');
    expect(updated.children).toHaveLength(1);
    expect(updated.children[0]?.name).toBe('b');
  });

  it('returns same node if child not found', () => {
    const root = createAssemblyNode('root');
    const updated = removeChild(root, 'nonexistent');
    expect(updated).toBe(root);
  });
});

describe('updateNode', () => {
  it('updates translate', () => {
    const node = createAssemblyNode('part');
    const updated = updateNode(node, { translate: [1, 2, 3] });
    expect(updated.translate).toEqual([1, 2, 3]);
    expect(updated.name).toBe('part');
  });

  it('updates metadata', () => {
    const node = createAssemblyNode('part');
    const updated = updateNode(node, { metadata: { weight: 5 } });
    expect(updated.metadata).toEqual({ weight: 5 });
  });
});

describe('findNode', () => {
  it('finds root by name', () => {
    const root = createAssemblyNode('root');
    expect(findNode(root, 'root')).toBe(root);
  });

  it('finds nested child', () => {
    const grandchild = createAssemblyNode('gc');
    const child = addChild(createAssemblyNode('child'), grandchild);
    const root = addChild(createAssemblyNode('root'), child);
    const found = findNode(root, 'gc');
    expect(found?.name).toBe('gc');
  });

  it('returns undefined when not found', () => {
    const root = createAssemblyNode('root');
    expect(findNode(root, 'missing')).toBeUndefined();
  });
});

describe('walkAssembly', () => {
  it('visits all nodes in order', () => {
    const root = addChild(
      addChild(createAssemblyNode('root'), createAssemblyNode('a')),
      createAssemblyNode('b')
    );
    const names: string[] = [];
    walkAssembly(root, (node) => names.push(node.name));
    expect(names).toEqual(['root', 'a', 'b']);
  });

  it('reports correct depth', () => {
    const grandchild = createAssemblyNode('gc');
    const child = addChild(createAssemblyNode('child'), grandchild);
    const root = addChild(createAssemblyNode('root'), child);
    const depths: number[] = [];
    walkAssembly(root, (_, d) => depths.push(d));
    expect(depths).toEqual([0, 1, 2]);
  });
});

describe('countNodes', () => {
  it('counts single node', () => {
    expect(countNodes(createAssemblyNode('root'))).toBe(1);
  });

  it('counts nested tree', () => {
    const root = addChild(
      addChild(createAssemblyNode('root'), createAssemblyNode('a')),
      addChild(createAssemblyNode('b'), createAssemblyNode('c'))
    );
    expect(countNodes(root)).toBe(4);
  });
});

describe('collectShapes', () => {
  it('collects shapes from tree', () => {
    const boxShape = makeBoxShape();
    const cylShape = makeCylShape();
    const root = addChild(
      addChild(createAssemblyNode('root'), createAssemblyNode('box', { shape: boxShape })),
      createAssemblyNode('cyl', { shape: cylShape })
    );
    const shapes = collectShapes(root);
    expect(shapes).toHaveLength(2);
    expect(shapes[0]).toBe(boxShape);
    expect(shapes[1]).toBe(cylShape);
  });

  it('skips nodes without shapes', () => {
    const root = addChild(createAssemblyNode('root'), createAssemblyNode('empty'));
    expect(collectShapes(root)).toHaveLength(0);
  });
});
