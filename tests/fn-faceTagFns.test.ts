import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  translate,
  fuse,
  unwrap,
  isOk,
  tagFaces,
  findFacesByTag,
  getFaceTags,
  setTagMetadata,
  getTagMetadata,
  getFaces,
} from '../src/index.js';
import { hasFaceTags } from '../src/topology/metadata/faceTagFns.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

/** Helper: get first face of a shape with assertion. */
function firstFace(shape: Parameters<typeof getFaces>[0]) {
  const faces = getFaces(shape);
  expect(faces.length).toBeGreaterThan(0);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked above
  return faces[0]!;
}

describe('face tagging', () => {
  it('tags faces with an array selector and finds them by tag', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const firstTwo = faces.slice(0, 2);

    const tagged = tagFaces(b, firstTwo, 'selected');
    const found = findFacesByTag(tagged, 'selected');
    expect(found.length).toBe(2);
  });

  it('tags faces with a predicate selector', () => {
    const b = box(10, 10, 10);
    const allFaces = getFaces(b);

    // Tag all faces using a predicate that always returns true
    const tagged = tagFaces(b, () => true, 'all');
    const found = findFacesByTag(tagged, 'all');
    expect(found.length).toBe(allFaces.length);
  });

  it('findFacesByTag returns correct faces', () => {
    const b = box(10, 10, 10);
    tagFaces(b, [firstFace(b)], 'one');
    const found = findFacesByTag(b, 'one');
    expect(found.length).toBe(1);
  });

  it('findFacesByTag returns empty array for unknown tag', () => {
    const b = box(10, 10, 10);
    const found = findFacesByTag(b, 'nonexistent');
    expect(found).toEqual([]);
  });

  it('getFaceTags returns all tags on a shape', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    expect(faces.length).toBeGreaterThan(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked above
    tagFaces(b, [faces[0]!], 'top');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked above
    tagFaces(b, [faces[1]!], 'bottom');

    const tags = getFaceTags(b);
    expect(tags.has('top')).toBe(true);
    expect(tags.has('bottom')).toBe(true);
    expect(tags.get('top')?.length).toBe(1);
    expect(tags.get('bottom')?.length).toBe(1);
  });

  it('tags survive through fuse', () => {
    const b1 = box(10, 10, 10);
    tagFaces(b1, [firstFace(b1)], 'kept');

    const b2 = box(5, 5, 5);
    const result = fuse(b1, b2);
    expect(isOk(result)).toBe(true);
    const fused = unwrap(result);

    const found = findFacesByTag(fused, 'kept');
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it('tags survive through translate', () => {
    const b = box(10, 10, 10);
    tagFaces(b, [firstFace(b)], 'moved');

    const moved = translate(b, [50, 0, 0]);
    const found = findFacesByTag(moved, 'moved');
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it('hasFaceTags returns false for fresh shapes', () => {
    const b = box(10, 10, 10);
    expect(hasFaceTags(b)).toBe(false);
  });

  it('hasFaceTags returns true after tagging', () => {
    const b = box(10, 10, 10);
    tagFaces(b, [firstFace(b)], 'test');
    expect(hasFaceTags(b)).toBe(true);
  });

  it('stores and retrieves tag metadata', () => {
    const b = box(10, 10, 10);
    tagFaces(b, [firstFace(b)], 'top');

    setTagMetadata(b, 'top', { color: 'red', priority: 1 });
    const meta = getTagMetadata(b, 'top');
    expect(meta).toEqual({ color: 'red', priority: 1 });
  });

  it('returns undefined for unknown tag metadata', () => {
    const b = box(10, 10, 10);
    expect(getTagMetadata(b, 'nonexistent')).toBeUndefined();
  });

  it('tag metadata propagates through fuse', () => {
    const b1 = box(10, 10, 10);
    tagFaces(b1, [firstFace(b1)], 'top');
    setTagMetadata(b1, 'top', { material: 'steel', thickness: 2 });

    const b2 = box(5, 5, 5);
    const fused = unwrap(fuse(b1, b2));

    const meta = getTagMetadata(fused, 'top');
    expect(meta).toEqual({ material: 'steel', thickness: 2 });
  });
});
