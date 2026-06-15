import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import initWasm, * as voxelWasm from 'brepjs-voxel-wasm';
import { initVoxel } from '@/voxel/index.js';
import {
  sdfSphere,
  sdfBox,
  sdfCone,
  sdfRoundedBox,
  sdfCylinder,
  sdfCapsule,
  sdfTorus,
  sdfPlane,
  sdfSweep,
  sdfLattice,
  sdfStrutLattice,
  sdfFieldAxialRamp,
  sdfFieldRadialRamp,
  sdfFieldFromSdf,
  sdfFieldConst,
  sdfFieldClamp,
} from '@/index.js';
import type { SdfHandle } from '@/index.js';
import { unwrap, isErr } from '@/core/result.js';
import { initOC } from './setup.js';

beforeAll(async () => {
  const wasmPath = resolve(__dirname, '../packages/brepjs-voxel-wasm/pkg/index_bg.wasm');
  await initWasm({ module_or_path: readFileSync(wasmPath) });
  initVoxel(voxelWasm);
  await initOC();
}, 30000);

function bboxOf(vertices: Float32Array): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const v = vertices[i + axis] as number;
      if (v < (min[axis] as number)) min[axis] = v;
      if (v > (max[axis] as number)) max[axis] = v;
    }
  }
  return { min, max };
}

describe('implicit SDF builder (field-first authoring against the real wasm engine)', () => {
  it('rasterizes a sphere to a non-empty mesh with a sane bounding box', () => {
    using s = unwrap(sdfSphere(1.5));
    using field = unwrap(s.rasterize({ resolution: 28, padding: 2 }));
    const result = field.contour();
    expect(result.vertices.length).toBeGreaterThan(0);
    expect(result.triangles.length).toBeGreaterThan(0);
    expect(result.triangles.length % 3).toBe(0);

    const { min, max } = bboxOf(result.vertices);
    for (let axis = 0; axis < 3; axis++) {
      const halfExtent = ((max[axis] as number) - (min[axis] as number)) / 2;
      expect(halfExtent).toBeCloseTo(1.5, 0);
    }
  });

  it('composes a CSG difference (box minus sphere) into a non-empty solid', () => {
    using outer = unwrap(sdfBox(1, 1, 1));
    using hole = unwrap(sdfSphere(0.6));
    using cut = outer.difference(hole);
    using field = unwrap(cut.rasterize({ resolution: 32, padding: 2 }));
    const mesh = field.contour();
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.triangles.length).toBeGreaterThan(0);
  });

  it('offsets a rasterized field outward (grows the contoured bbox)', () => {
    using base = unwrap(sdfSphere(1));
    using grown = base.offset(0.4);
    using field = unwrap(grown.rasterize({ resolution: 28, padding: 3 }));
    const mesh = field.contour();
    const { min, max } = bboxOf(mesh.vertices);
    const halfExtent = ((max[0] as number) - (min[0] as number)) / 2;
    expect(halfExtent).toBeGreaterThan(1.2);
  });

  it('reports an error for an over-large grid rather than throwing', () => {
    using s = unwrap(sdfSphere(1));
    const res = s.rasterize({ resolution: 2000, padding: 2 });
    expect(isErr(res)).toBe(true);
  });

  it('rejects a degenerate sweep spine as a Result error rather than throwing', () => {
    using profile = unwrap(sdfSphere(0.3));
    // Fewer than two stations.
    expect(isErr(sdfSweep([[0, 0, 0]], profile))).toBe(true);
    // A non-finite coordinate.
    expect(
      isErr(
        sdfSweep(
          [
            [0, 0, 0],
            [0, 0, Number.NaN],
          ],
          profile
        )
      )
    ).toBe(true);
    // All stations coincident → zero-length spine.
    expect(
      isErr(
        sdfSweep(
          [
            [1, 1, 1],
            [1, 1, 1],
          ],
          profile
        )
      )
    ).toBe(true);
  });

  it('rejects an inverted clamp range as a Result error rather than trapping in eval', () => {
    using inner = unwrap(sdfFieldConst(0.5));
    // min > max: a construction-time error, not a wasm trap on the first voxel.
    expect(isErr(sdfFieldClamp(inner, 0.3, 0.0))).toBe(true);
    // NaN bound is rejected by the same !(min <= max) guard.
    expect(isErr(sdfFieldClamp(inner, Number.NaN, 1.0))).toBe(true);
    expect(isErr(sdfFieldClamp(inner, 0.0, Number.NaN))).toBe(true);
    // A well-ordered range still builds.
    expect(isErr(sdfFieldClamp(inner, 0.0, 1.0))).toBe(false);
    // min == max is a valid (degenerate) clamp.
    expect(isErr(sdfFieldClamp(inner, 0.5, 0.5))).toBe(false);
  });

  it('rasterizes a conformal strut lattice (construct → clip → rasterize → contour)', () => {
    using radius = unwrap(sdfFieldConst(0.18));
    using struts = unwrap(sdfStrutLattice(0.8, radius));
    using region = unwrap(sdfBox(1.2, 1.2, 1.2));
    using clipped = struts.intersection(region);
    using field = unwrap(clipped.rasterize({ resolution: 48, padding: 2 }));
    const mesh = field.contour();
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.triangles.length).toBeGreaterThan(0);
  });

  it('rejects an unknown lattice kind as a Result error', () => {
    using period = unwrap(sdfFieldConst(1));
    using thickness = unwrap(sdfFieldConst(0.3));
    // An untyped caller passing a bad kind must error, not silently build a gyroid.
    expect(isErr(sdfLattice('hexgrid' as 'gyroid', period, thickness))).toBe(true);
  });

  it('builds and rasterizes chamber v1 (graded wall + swept channels + conformal gyroid jacket)', () => {
    using chamber = buildChamber();
    using field = unwrap(chamber.rasterize({ resolution: 48, padding: 3 }));
    const mesh = field.contour();

    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.triangles.length).toBeGreaterThan(0);
    expect(mesh.triangles.length % 3).toBe(0);

    // A sane chamber bbox: the cone body spans ~[-2,2] radially and ~[-2,2] axially;
    // the gyroid jacket band pushes the radial extent a little past the bare cone.
    const { min, max } = bboxOf(mesh.vertices);
    for (let axis = 0; axis < 3; axis++) {
      const extent = (max[axis] as number) - (min[axis] as number);
      expect(extent).toBeGreaterThan(1);
      expect(extent).toBeLessThan(12);
    }
    // The conformal jacket sits outside the bare cone (base r = 2): the radial reach
    // must exceed 2, proving the lattice jacket is present in the contour.
    const radial = Math.max(
      max[0] as number,
      max[1] as number,
      -(min[0] as number),
      -(min[1] as number)
    );
    expect(radial).toBeGreaterThan(2.1);
  });
});

describe('implicit SDF primitives and scalar fields (analytic builders)', () => {
  it.each([
    ['roundedBox', () => sdfRoundedBox(1, 1, 1, 0.2)],
    ['cylinder', () => sdfCylinder(0.8, 2)],
    ['capsule', () => sdfCapsule([0, 0, -1], [0, 0, 1], 0.4)],
    ['torus', () => sdfTorus(1.2, 0.3)],
  ])('rasterizes %s into a non-empty contour', (_name, make) => {
    using s = unwrap(make());
    using field = unwrap(s.rasterize({ resolution: 24, padding: 2 }));
    const mesh = field.contour();
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.triangles.length % 3).toBe(0);
  });

  it('clips an unbounded plane half-space via explicit rasterizeIn bounds', () => {
    using half = unwrap(sdfPlane([0, 0, 1], 0));
    using region = unwrap(sdfBox(1, 1, 1));
    // The plane is unbounded; intersect with a finite box so it frames a grid.
    using clipped = half.intersection(region);
    using field = unwrap(
      clipped.rasterizeIn(
        { min: [-1.5, -1.5, -1.5], max: [1.5, 1.5, 1.5] },
        { resolution: 24, padding: 2 }
      )
    );
    const mesh = field.contour();
    expect(mesh.vertices.length).toBeGreaterThan(0);
  });

  it('rejects degenerate rasterizeIn bounds as a Result error', () => {
    using s = unwrap(sdfSphere(1));
    // max <= min on an axis.
    expect(isErr(s.rasterizeIn({ min: [0, 0, 0], max: [1, 1, 0] }))).toBe(true);
    // A non-finite bound.
    expect(isErr(s.rasterizeIn({ min: [0, 0, 0], max: [1, 1, Number.NaN] }))).toBe(true);
  });

  it('grades a shell thickness with a radial-ramp field', () => {
    using cyl = unwrap(sdfCylinder(1, 2));
    using thickness = unwrap(sdfFieldRadialRamp([0, 0, 0], 2, 0, 1, 0.1, 0.3));
    using walled = cyl.shellField(thickness);
    using field = unwrap(walled.rasterize({ resolution: 28, padding: 2 }));
    const mesh = field.contour();
    expect(mesh.vertices.length).toBeGreaterThan(0);
  });

  it('drives an offset from another SDF via fieldFromSdf (clamped)', () => {
    using base = unwrap(sdfSphere(1));
    using driver = unwrap(sdfBox(2, 2, 2));
    using raw = unwrap(sdfFieldFromSdf(driver, 0.2, 0.1));
    // fieldFromSdf is unbounded; clamp before driving a bounds-affecting op.
    using bounded = unwrap(sdfFieldClamp(raw, -0.5, 0.5));
    using grown = base.offsetField(bounded);
    using field = unwrap(grown.rasterize({ resolution: 24, padding: 3 }));
    const mesh = field.contour();
    expect(mesh.vertices.length).toBeGreaterThan(0);
  });
});

const CHANNEL_TUBE_R = 0.3;

/**
 * Chamber v1 (mirrors the rust `chamber_v1_expr` fixture): the v0.5 chamber — a
 * capped cone shelled into a graded-wall hollow body, unioned with four SWEPT
 * cooling channels — smooth-unioned with a CONFORMAL GRADED GYROID JACKET (a
 * graded-thickness gyroid lattice clipped to a conical band hugging the outer
 * wall). Intermediate handles are disposed eagerly; the returned handle owns the
 * final tree and is disposed by the caller.
 */
function buildChamber(): SdfHandle {
  using cone = unwrap(sdfCone(2.0, 4.0));
  // Field-modulated wall: thicker toward the hot throat (cone apex at z = +2). The
  // AxialRamp grades the shell half-width 0.2 → 0.35 from base to throat.
  using wallThickness = unwrap(sdfFieldAxialRamp(2, -2.0, 2.0, 0.2, 0.35));
  using body = cone.shellField(wallThickness);
  let acc: SdfHandle = body.translate(0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const phase = (i * Math.PI) / 2;
    using profile = unwrap(sdfSphere(CHANNEL_TUBE_R));
    using channel = unwrap(sdfSweep(channelSpine(phase), profile));
    const next = acc.union(channel);
    acc[Symbol.dispose]();
    acc = next;
  }
  // Conformal graded gyroid jacket: a gyroid lattice with thickness ramped 0.45 →
  // 0.65 (thicker toward the throat, like the wall), clipped to a conical band
  // around the outer wall (cone offset out 0.35, shelled to a 0.7-wide band). The
  // `intersection` is the conformal clip that bounds the periodic lattice.
  using period = unwrap(sdfFieldConst(1.0));
  using jacketThickness = unwrap(sdfFieldAxialRamp(2, -2.0, 2.0, 0.45, 0.65));
  using lattice = unwrap(sdfLattice('gyroid', period, jacketThickness));
  using bandCone = unwrap(sdfCone(2.0, 4.0));
  using bandOffset = bandCone.offset(0.35);
  using band = bandOffset.shell(0.7);
  using jacket = lattice.intersection(band);
  const chamber = acc.smoothUnion(jacket, 0.15);
  acc[Symbol.dispose]();
  return chamber;
}

/** A helical channel spine riding just proud of the outer cone wall. */
function channelSpine(phase: number): [number, number, number][] {
  const steps = 16;
  const spine: [number, number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const z = -2.6 + 5.2 * s;
    const wall = Math.min(Math.max(2.0 * (1.0 - (z + 2.0) / 4.0), 0.0), 2.0);
    const radius = wall + CHANNEL_TUBE_R * 0.5;
    const a = phase + s * (Math.PI / 4);
    spine.push([radius * Math.cos(a), radius * Math.sin(a), z]);
  }
  return spine;
}
