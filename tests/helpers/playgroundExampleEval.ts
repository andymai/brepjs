/**
 * Headless evaluator for playground example source.
 *
 * Playground examples are self-contained ES modules: they import from
 * 'brepjs/quick' (and optionally `color` from 'brepjs/playground') and end in
 * `export default <shape | shape[]>`. The browser worker runs them by
 * rewriting the bare specifiers to a live module and importing a Blob URL.
 * Node can't do that, so here we strip the TypeScript, rewrite the imports to
 * injected bindings, turn `export default` into `return`, and execute the body
 * — then mesh whatever it produced against the real OCCT kernel.
 *
 * Execution uses the Function-constructor-via-prototype pattern established by
 * scripts/extract-doc-tests.ts: example source is the same sandboxed-snippet
 * trust level as the doc-snippet harness, run only in tests, never in
 * production. This is the single validation path shared by the permanent
 * regression test (tests/playgroundExamples.test.ts) and the
 * scad-to-playground workflow's validate stage, so "passes here" means
 * "renders in the playground".
 */
import { transform } from 'sucrase';
import * as brepjs from '@/index.js';

// Mirrors scripts/extract-doc-tests.ts — a synchronous body suffices since the
// playground eval surface (and `mesh`) is synchronous.
const BodyFunction = Object.getPrototypeOf(function () {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => unknown;

const PLAYGROUND_COLOR_TAG = '__brepjsPlaygroundColor';

interface ColoredShape {
  [PLAYGROUND_COLOR_TAG]: string;
  shape: unknown;
}

function isColoredShape(v: unknown): v is ColoredShape {
  return typeof v === 'object' && v !== null && PLAYGROUND_COLOR_TAG in v;
}

// Playground-local helper (not part of published brepjs): tags a shape with a
// CSS color the eval pipeline lifts onto the mesh. Mirrors the worker's shim.
const playgroundModule = {
  color: (shape: unknown, value: unknown): ColoredShape => ({
    [PLAYGROUND_COLOR_TAG]: String(value),
    shape,
  }),
};

/**
 * Rewrite an example's ESM source into a function body that returns its
 * default export. Import specifiers are bound to the injected namespaces.
 */
function transpileExample(code: string): string {
  const js = transform(code, {
    transforms: ['typescript'],
    disableESTransforms: true,
  }).code;

  return js
    .replace(/import\s+\{([^}]*)\}\s+from\s+(['"])brepjs\/playground\2;?/g, 'const {$1} = __pg;')
    .replace(
      /import\s+\{([^}]*)\}\s+from\s+(['"])brepjs(?:\/quick)?\2;?/g,
      'const {$1} = __brepjs;'
    )
    .replace(/export\s+default\s+/g, 'return ');
}

/** Normalize an exported item into a raw brepjs shape handle. */
function unwrapResultShape(shape: unknown): unknown {
  const inner = isColoredShape(shape) ? shape.shape : shape;
  if (inner && typeof inner === 'object' && '__wrapped' in inner) {
    return (inner as { val: unknown }).val;
  }
  if (inner && typeof inner === 'object' && 'wrapped' in inner) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel cast over WASM handle
    return (brepjs as any).castShape(inner.wrapped);
  }
  return inner;
}

/** Run an example's source and return the exported shape(s) as an array. */
export function runExample(code: string): unknown[] {
  const body = transpileExample(code);
  const fn = new BodyFunction('__brepjs', '__pg', body);
  const exported = fn(brepjs, playgroundModule);
  if (exported === null || exported === undefined) return [];
  return Array.isArray(exported) ? exported : [exported];
}

export interface MeshCheck {
  shapeCount: number;
  /** Total triangle-vertex floats across all meshed shapes. */
  totalVertices: number;
}

/**
 * Run an example and mesh every shape it returns. Throws if it exports
 * nothing or if any shape produces an empty mesh — the two failure modes a
 * blank playground viewer would show.
 */
export function evalAndMeshExample(code: string): MeshCheck {
  const shapes = runExample(code);
  if (shapes.length === 0) {
    throw new Error('example exported no shapes (default export was null/undefined)');
  }
  let totalVertices = 0;
  for (let i = 0; i < shapes.length; i++) {
    const shape = unwrapResultShape(shapes[i]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- brepjs barrel over WASM handles
    const mesh = (brepjs as any).mesh(shape) as { vertices: { length: number } };
    if (mesh.vertices.length === 0) {
      throw new Error(`shape[${i}] produced an empty mesh`);
    }
    totalVertices += mesh.vertices.length;
  }
  return { shapeCount: shapes.length, totalVertices };
}
