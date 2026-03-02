import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  fuse,
  fillet,
  tagFaces,
  findFacesByTag,
  getFaceTags,
  setTagMetadata,
  getTagMetadata,
  isOk,
  isErr,
  unwrap,
  getFaces,
  faceFinder,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('face tagging', () => {
  it('tags faces and retrieves them by tag', () => {
    const b = box(10, 10, 10);
    const topFaces = faceFinder().inDirection([0, 0, 1]).findAll(b);
    expect(topFaces.length).toBeGreaterThanOrEqual(1);

    const tagged = tagFaces(b, topFaces, 'top');
    const found = findFacesByTag(tagged, 'top');
    expect(found.length).toBe(topFaces.length);
  });

  it('returns all tags on a shape', () => {
    const b = box(10, 10, 10);
    const topFaces = faceFinder().inDirection([0, 0, 1]).findAll(b);
    const bottomFaces = faceFinder().inDirection([0, 0, -1]).findAll(b);

    let tagged = tagFaces(b, topFaces, 'top');
    tagged = tagFaces(tagged, bottomFaces, 'bottom');

    const tags = getFaceTags(tagged);
    expect(tags.has('top')).toBe(true);
    expect(tags.has('bottom')).toBe(true);
    expect(tags.get('top')?.length).toBe(topFaces.length);
  });

  it('tags persist through boolean fuse', () => {
    const b1 = box(10, 10, 10);
    const topFaces = faceFinder().inDirection([0, 0, 1]).findAll(b1);
    const tagged = tagFaces(b1, topFaces, 'top');

    const b2 = box(5, 5, 5);
    const fuseResult = fuse(tagged, b2);
    expect(isOk(fuseResult)).toBe(true);
    const fused = unwrap(fuseResult);

    const found = findFacesByTag(fused, 'top');
    // Top face should still exist (may be modified but tagged)
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it('tags persist through fillet', () => {
    const b = box(10, 10, 10);
    const bottomFaces = faceFinder().inDirection([0, 0, -1]).findAll(b);
    const tagged = tagFaces(b, bottomFaces, 'bottom');

    const filletResult = fillet(tagged, 0.5);
    expect(isErr(filletResult)).toBe(false);
    const filleted = unwrap(filletResult);
    const found = findFacesByTag(filleted, 'bottom');
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for unknown tag', () => {
    const b = box(10, 10, 10);
    const found = findFacesByTag(b, 'nonexistent');
    expect(found).toEqual([]);
  });

  it('stores and retrieves tag metadata', () => {
    const b = box(10, 10, 10);
    const topFaces = faceFinder().inDirection([0, 0, 1]).findAll(b);
    const tagged = tagFaces(b, topFaces, 'top');

    setTagMetadata(tagged, 'top', { color: 'red', priority: 1 });
    const meta = getTagMetadata(tagged, 'top');
    expect(meta).toEqual({ color: 'red', priority: 1 });
  });

  it('returns undefined for unknown tag metadata', () => {
    const b = box(10, 10, 10);
    expect(getTagMetadata(b, 'nope')).toBeUndefined();
  });

  it('tag metadata propagates through boolean fuse', () => {
    const b1 = box(10, 10, 10);
    const topFaces = faceFinder().inDirection([0, 0, 1]).findAll(b1);
    const tagged = tagFaces(b1, topFaces, 'top');
    setTagMetadata(tagged, 'top', { material: 'steel', thickness: 2 });

    const b2 = box(5, 5, 5);
    const fused = unwrap(fuse(tagged, b2));

    const meta = getTagMetadata(fused, 'top');
    expect(meta).toEqual({ material: 'steel', thickness: 2 });
  });

  it('supports callback selector', () => {
    const b = box(10, 10, 10);
    const allFaces = getFaces(b);

    const tagged = tagFaces(b, () => true, 'all');

    const found = findFacesByTag(tagged, 'all');
    expect(found.length).toBe(allFaces.length);
  });
});
