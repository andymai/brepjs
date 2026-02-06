import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  getFaces,
  getEdges,
  classifyPointOnFace,
  splitShape,
  translateShape,
  isOk,
  isErr,
  unwrap,
  castShape,
  sketchRectangle,
} from '../src/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- WASM availability check
let oc: any;

beforeAll(async () => {
  oc = await initOC();
}, 30000);

describe('classifyPointOnFace', () => {
  it('classifies a point inside a face as "in"', () => {
    if (!oc.BRepClass_FaceClassifier) return; // skip if not in WASM build
    const rect = sketchRectangle(10, 10);
    const face = getFaces(castShape(rect.face().wrapped))[0]!;
    const result = classifyPointOnFace(face, [0, 0, 0]);
    expect(result).toBe('in');
  });

  it('classifies a point outside a face as "out"', () => {
    if (!oc.BRepClass_FaceClassifier) return;
    const rect = sketchRectangle(10, 10);
    const face = getFaces(castShape(rect.face().wrapped))[0]!;
    const result = classifyPointOnFace(face, [100, 100, 0]);
    expect(result).toBe('out');
  });

  it('classifies a point on the boundary as "on"', () => {
    if (!oc.BRepClass_FaceClassifier) return;
    const rect = sketchRectangle(10, 10);
    const face = getFaces(castShape(rect.face().wrapped))[0]!;
    const result = classifyPointOnFace(face, [5, 0, 0]);
    expect(result).toBe('on');
  });

  it('throws when BRepClass_FaceClassifier is unavailable', () => {
    if (oc.BRepClass_FaceClassifier) return; // skip if available
    const rect = sketchRectangle(10, 10);
    const face = getFaces(castShape(rect.face().wrapped))[0]!;
    expect(() => classifyPointOnFace(face, [0, 0, 0])).toThrow(
      'BRepClass_FaceClassifier not available'
    );
  });
});

describe('splitShape', () => {
  it('returns the original shape when no tools provided', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = splitShape(box, []);
    expect(isOk(result)).toBe(true);
  });

  it('splits a box with a planar face', () => {
    if (!oc.BRepAlgoAPI_Splitter) return; // skip if not in WASM build
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const rect = sketchRectangle(100, 100);
    const face = rect.face();
    const tool = translateShape(face, [0, 0, 5]);

    const result = splitShape(box, [tool]);
    expect(isOk(result)).toBe(true);
    const edges = getEdges(unwrap(result));
    expect(edges.length).toBeGreaterThan(0);
  });

  it('returns error when BRepAlgoAPI_Splitter is unavailable', () => {
    if (oc.BRepAlgoAPI_Splitter) return; // skip if available
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const rect = sketchRectangle(10, 10);
    const tool = translateShape(rect.face(), [0, 0, 5]);
    const result = splitShape(box, [tool]);
    expect(isErr(result)).toBe(true);
  });
});
