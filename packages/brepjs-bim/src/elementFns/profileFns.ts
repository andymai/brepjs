import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { Profile } from '../specs/profile.js';
import { isExtendedProfile } from '../specs/profile.js';
import { extendedProfileArea } from '../specs/profilesExtended.js';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';

// Analytical cross-section area of a profile (mm²). Extended profiles delegate
// to extendedProfileArea (closed-form per kind); core profiles use the formulas
// below.
export function profileCrossSectionArea(profile: Profile): number {
  if (isExtendedProfile(profile)) {
    return extendedProfileArea(profile);
  }
  switch (profile.kind) {
    case 'RECTANGULAR':
      return profile.width * profile.height;
    case 'CIRCULAR':
      return Math.PI * profile.radius * profile.radius;
    case 'I_BEAM': {
      const flangeArea = 2 * profile.overallWidth * profile.flangeThickness;
      const webHeight = profile.overallDepth - 2 * profile.flangeThickness;
      const webArea = webHeight * profile.webThickness;
      // Each of the four root fillets fills a corner notch: the r×r square corner
      // minus the quarter disc it sweeps out, i.e. r²(1 - π/4) of added material.
      const r = profile.filletRadius ?? 0;
      const filletArea = 4 * r * r * (1 - Math.PI / 4);
      return flangeArea + webArea + filletArea;
    }
  }
}

// Arc points (minor sweep) rounding the corner at `v` between its neighbours
// `prev`/`next` with radius `r`. Returns the tessellated fillet from the tangent
// point on the incoming edge to the tangent point on the outgoing edge; the
// caller drops the original sharp vertex. Used for I-beam root fillets (always
// 90°). A near-collinear (≈0) or near-straight (≈π) corner has no well-defined
// finite fillet — `tan(α/2)`/`sin(α/2)` or the bisector would blow up to NaN —
// so those degenerate cases fall back to the original sharp vertex.
const FILLET_SEGMENTS = 8;
const FILLET_MIN_ANGLE = 1e-3; // radians; below this (or above π − this) skip the fillet
function filletArc(
  prev: readonly [number, number],
  v: readonly [number, number],
  next: readonly [number, number],
  r: number
): Array<[number, number]> {
  const aLen = Math.hypot(prev[0] - v[0], prev[1] - v[1]);
  const bLen = Math.hypot(next[0] - v[0], next[1] - v[1]);
  const a: [number, number] = [(prev[0] - v[0]) / aLen, (prev[1] - v[1]) / aLen];
  const b: [number, number] = [(next[0] - v[0]) / bLen, (next[1] - v[1]) / bLen];
  const alpha = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
  if (alpha < FILLET_MIN_ANGLE || alpha > Math.PI - FILLET_MIN_ANGLE) {
    return [[v[0], v[1]]];
  }
  const setback = r / Math.tan(alpha / 2); // distance from v to each tangent point
  const center = r / Math.sin(alpha / 2); // distance from v to the arc centre
  const bisLen = Math.hypot(a[0] + b[0], a[1] + b[1]);
  const bis: [number, number] = [(a[0] + b[0]) / bisLen, (a[1] + b[1]) / bisLen];
  const cx = v[0] + bis[0] * center;
  const cy = v[1] + bis[1] * center;
  const p1: [number, number] = [v[0] + a[0] * setback, v[1] + a[1] * setback];
  const p2: [number, number] = [v[0] + b[0] * setback, v[1] + b[1] * setback];
  const a1 = Math.atan2(p1[1] - cy, p1[0] - cx);
  const a2 = Math.atan2(p2[1] - cy, p2[0] - cx);
  // Normalise to the minor arc (|Δ| ≤ π), which always bulges toward the corner.
  let delta = a2 - a1;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= FILLET_SEGMENTS; i++) {
    const ang = a1 + (delta * i) / FILLET_SEGMENTS;
    out.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
  }
  return out;
}

// Returns 3D polygon vertices (z = 0) approximating the profile outline.
// Used as the source polygon for brepjs polygon() + extrude().
// Polygon is centered on the local origin.
//
// Circular profiles are tessellated to N segments (N = 32 default — visually
// circular while staying lightweight for boolean tools).
export function profileToPolygon(
  profile: Profile,
  circleSegments = 32
): Result<Array<[number, number, number]>, BimError> {
  if (isExtendedProfile(profile)) {
    // Extended profiles (including hollow sections with inner voids) cannot be
    // represented as a single outer polygon. Solid builders for extended
    // profiles must use extendedProfileToFace() + extrude() instead.
    return err(
      specError(
        'EXTENDED_PROFILE_NO_POLYGON',
        `profileToPolygon: extended profile kind '${profile.kind}' has no single-polygon outline; use extendedProfileToFace()`
      )
    );
  }
  switch (profile.kind) {
    case 'RECTANGULAR': {
      const halfW = profile.width / 2;
      const halfH = profile.height / 2;
      const pts: Array<[number, number, number]> = [
        [-halfW, -halfH, 0],
        [halfW, -halfH, 0],
        [halfW, halfH, 0],
        [-halfW, halfH, 0],
      ];
      return ok(pts);
    }
    case 'CIRCULAR': {
      if (circleSegments < 3) {
        return err(
          specError(
            'PROFILE_CIRCLE_SEGMENTS',
            `profileToPolygon: circleSegments must be >= 3, got ${circleSegments}`
          )
        );
      }
      const pts: Array<[number, number, number]> = [];
      for (let i = 0; i < circleSegments; i++) {
        const theta = (2 * Math.PI * i) / circleSegments;
        pts.push([profile.radius * Math.cos(theta), profile.radius * Math.sin(theta), 0]);
      }
      return ok(pts);
    }
    case 'I_BEAM': {
      const halfW = profile.overallWidth / 2;
      const halfD = profile.overallDepth / 2;
      const halfWeb = profile.webThickness / 2;
      const flangeInnerY = halfD - profile.flangeThickness;
      // Outline vertices traced clockwise from the bottom-left flange corner.
      // The four web-to-flange junctions (indices 3, 4, 9, 10) are the concave
      // root corners; with a fillet radius they become tessellated arcs.
      const v: Array<[number, number]> = [
        [-halfW, -halfD],
        [halfW, -halfD],
        [halfW, -flangeInnerY],
        [halfWeb, -flangeInnerY],
        [halfWeb, flangeInnerY],
        [halfW, flangeInnerY],
        [halfW, halfD],
        [-halfW, halfD],
        [-halfW, flangeInnerY],
        [-halfWeb, flangeInnerY],
        [-halfWeb, -flangeInnerY],
        [-halfW, -flangeInnerY],
      ];
      const r = profile.filletRadius ?? 0;
      const rootCorners = new Set([3, 4, 9, 10]);
      const pts: Array<[number, number, number]> = [];
      for (let i = 0; i < v.length; i++) {
        const cur = v[i];
        if (cur === undefined) continue;
        if (r > 0 && rootCorners.has(i)) {
          const prev = v[(i - 1 + v.length) % v.length];
          const next = v[(i + 1) % v.length];
          if (prev !== undefined && next !== undefined) {
            for (const [ax, ay] of filletArc(prev, cur, next, r)) {
              pts.push([ax, ay, 0]);
            }
            continue;
          }
        }
        pts.push([cur[0], cur[1], 0]);
      }
      return ok(pts);
    }
  }
}
