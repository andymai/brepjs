import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel, currentKernel } from './setup.js';
import {
  draw,
  drawCircle,
  drawRectangle,
  drawRoundedRectangle,
  describe as describeSolid,
  isValid,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

interface Topology {
  faces: number;
  edges: number;
  verts: number;
  valid: boolean;
}

function topology(shape: unknown): Topology {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- brepjs returns Shape3D-shaped object
  const s = shape as any;
  const d = describeSolid(s);
  return {
    faces: d.faceCount,
    edges: d.edgeCount,
    verts: d.vertexCount,
    valid: isValid(s),
  };
}

const PLANES = ['XY', 'XZ', 'YZ'] as const;

// Regression: extrudes of arc-containing 2D drawings on non-XY planes used to
// emit doubled edge/vertex topology and invalid solids under occt-wasm because
// `liftCurve2dToPlane`'s trimmed-circle branch routed through `makeCircleArc`
// (center+normal+angles), which interpreted angles in OCCT's plane-local frame
// rather than the brepjs lift frame. Endpoints diverged from adjacent line
// endpoints, defeating MakeWire's vertex merging. The fix is to always build
// arcs via `makeArcEdge` with three explicitly lifted points so endpoints are
// bit-identical to the adjacent line endpoints. The plane-invariance assertion
// below is what catches a regression.

describe('sketchOnPlane is plane-invariant for arc-containing drawings', () => {
  it('drawRoundedRectangle produces identical topology on XY/XZ/YZ', () => {
    const tops = PLANES.map((p) =>
      topology(drawRoundedRectangle(30, 12.4, 1.2).sketchOnPlane(p).extrude(3.4))
    );
    for (const t of tops) expect(t.valid).toBe(true);
    // Plane-invariance: every plane should produce the same topology counts.
    expect(new Set(tops.map((t) => t.faces)).size).toBe(1);
    expect(new Set(tops.map((t) => t.edges)).size).toBe(1);
    expect(new Set(tops.map((t) => t.verts)).size).toBe(1);
    // Sanity: edges == 1.5x verts for a closed prism (2 rims + 1 vertical per rim
    // vert). This is a B-rep identity; the manifold mesh kernel fragments smooth
    // rims into per-facet edges (plane-invariant but not the clean B-rep count),
    // so the ratio only holds on B-rep kernels.
    const [ref] = tops;
    if (!ref) throw new Error('PLANES must yield at least one topology');
    if (currentKernel !== 'manifold') expect(ref.edges).toBe(ref.verts * 1.5);
  });

  it('drawCircle produces identical topology on XY/XZ/YZ', () => {
    const tops = PLANES.map((p) => topology(drawCircle(5).sketchOnPlane(p).extrude(10)));
    for (const t of tops) expect(t.valid).toBe(true);
    expect(new Set(tops.map((t) => t.faces)).size).toBe(1);
    expect(new Set(tops.map((t) => t.edges)).size).toBe(1);
    expect(new Set(tops.map((t) => t.verts)).size).toBe(1);
  });

  it('drawRectangle (no arcs) produces identical topology on XY/XZ/YZ', () => {
    const tops = PLANES.map((p) => topology(drawRectangle(10, 10).sketchOnPlane(p).extrude(5)));
    for (const t of tops) {
      expect(t.valid).toBe(true);
      expect(t.faces).toBe(6);
      expect(t.edges).toBe(12);
      expect(t.verts).toBe(8);
    }
  });

  it('scoop profile (sagittaArc + lines) is plane-invariant', () => {
    const cutWidth = 30,
      userCutHeight = 8,
      overshoot = 4.4;
    const totalHeight = userCutHeight + overshoot;
    const hw = cutWidth / 2;
    const sagitta = Math.min(hw, userCutHeight);
    const topY = totalHeight / 2;
    const arcCenterY = topY - overshoot;
    const buildScoop = () =>
      draw([-hw, topY])
        .lineTo([hw, topY])
        .lineTo([hw, arcCenterY])
        .sagittaArc(-cutWidth, 0, sagitta)
        .close();
    const tops = PLANES.map((p) => topology(buildScoop().sketchOnPlane(p).extrude(3.4)));
    for (const t of tops) expect(t.valid).toBe(true);
    expect(new Set(tops.map((t) => t.faces)).size).toBe(1);
    expect(new Set(tops.map((t) => t.edges)).size).toBe(1);
    expect(new Set(tops.map((t) => t.verts)).size).toBe(1);
  });

  it('funnel profile (lines + customCorner arcs) is plane-invariant', () => {
    const cutWidth = 30,
      userCutHeight = 8,
      overshoot = 4.4;
    const totalHeight = userCutHeight + overshoot;
    const cornerR = 1.2;
    const topHW = cutWidth / 2;
    const bottomHW = (cutWidth * 0.6) / 2;
    const topY = totalHeight / 2;
    const bottomY = -totalHeight / 2;
    const buildFunnel = () =>
      draw([-topHW, topY])
        .lineTo([topHW, topY])
        .lineTo([bottomHW, bottomY])
        .customCorner(cornerR)
        .lineTo([-bottomHW, bottomY])
        .customCorner(cornerR)
        .close();
    const tops = PLANES.map((p) => topology(buildFunnel().sketchOnPlane(p).extrude(3.4)));
    for (const t of tops) expect(t.valid).toBe(true);
    expect(new Set(tops.map((t) => t.faces)).size).toBe(1);
    expect(new Set(tops.map((t) => t.edges)).size).toBe(1);
    expect(new Set(tops.map((t) => t.verts)).size).toBe(1);
  });
});
