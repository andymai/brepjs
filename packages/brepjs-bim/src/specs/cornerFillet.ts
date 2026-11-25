type Pt = readonly [number, number];

// Each fillet is an inscribed polyline of this many chords. For a 90° corner
// every vertex is on the true arc, a chord is at most 0.5 % of r from it, and
// the faceted quarter disc has 0.64 % less area than the true one.
const FILLET_SEGMENTS = 8;
// A near-collinear (≈0) or near-straight (≈π) corner has no finite fillet:
// tan(α/2), sin(α/2) or the bisector would produce NaN. Keep the sharp vertex.
const FILLET_MIN_ANGLE = 1e-3;

// Points of the arc of radius `r` that rounds the corner at `v`, from the
// tangent point on the edge to `prev` to the tangent point on the edge to `next`.
export function filletArc(prev: Pt, v: Pt, next: Pt, r: number): Array<[number, number]> {
  const aLen = Math.hypot(prev[0] - v[0], prev[1] - v[1]);
  const bLen = Math.hypot(next[0] - v[0], next[1] - v[1]);
  const a: [number, number] = [(prev[0] - v[0]) / aLen, (prev[1] - v[1]) / aLen];
  const b: [number, number] = [(next[0] - v[0]) / bLen, (next[1] - v[1]) / bLen];
  const alpha = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
  if (alpha < FILLET_MIN_ANGLE || alpha > Math.PI - FILLET_MIN_ANGLE) {
    return [[v[0], v[1]]];
  }
  const setback = r / Math.tan(alpha / 2);
  const center = r / Math.sin(alpha / 2);
  const bisLen = Math.hypot(a[0] + b[0], a[1] + b[1]);
  const bis: [number, number] = [(a[0] + b[0]) / bisLen, (a[1] + b[1]) / bisLen];
  const cx = v[0] + bis[0] * center;
  const cy = v[1] + bis[1] * center;
  const p1: [number, number] = [v[0] + a[0] * setback, v[1] + a[1] * setback];
  const p2: [number, number] = [v[0] + b[0] * setback, v[1] + b[1] * setback];
  const a1 = Math.atan2(p1[1] - cy, p1[0] - cx);
  const a2 = Math.atan2(p2[1] - cy, p2[0] - cx);
  // The minor arc (|Δ| ≤ π) is the one that bulges toward the corner.
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

// Rounds the vertices of a closed loop that `radii` lists by index. A radius
// that is missing or not positive keeps the sharp vertex.
export function roundCorners(
  loop: ReadonlyArray<Pt>,
  radii: ReadonlyMap<number, number>
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < loop.length; i++) {
    const cur = loop[i];
    const prev = loop[(i - 1 + loop.length) % loop.length];
    const next = loop[(i + 1) % loop.length];
    if (cur === undefined || prev === undefined || next === undefined) continue;
    const r = radii.get(i) ?? 0;
    if (r > 0) out.push(...filletArc(prev, cur, next, r));
    else out.push([cur[0], cur[1]]);
  }
  return out;
}
