/**
 * SVG F.6.5 endpoint parameterization for elliptical arcs: given the two
 * endpoints, an interior on-arc sample, and the ellipse frame (radii + x-axis
 * rotation), recover which of the candidate arcs the curve traces. Trimmed
 * curve bounds cannot decide this — occt-wasm reports them normalized to
 * [0, 1], not as angles — so the flags must come from geometry.
 */

type Pt = readonly [number, number];

function rotInto(p: Pt, phi: number): Pt {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return [c * p[0] + s * p[1], -s * p[0] + c * p[1]];
}

/**
 * Derive elliptical-arc flags from endpoints and an interior on-arc sample:
 * `largeArc` when the traced sweep exceeds half a revolution, `ccw` when the
 * arc runs counterclockwise from `from` to `to`. Returns null when the
 * endpoints coincide (a closed loop or degenerate arc; the caller decides how
 * to emit those).
 */
export function ellipseArcFlags(
  from: Pt,
  to: Pt,
  onArc: Pt,
  majorRadius: number,
  minorRadius: number,
  xAxisAngle: number
): { largeArc: boolean; ccw: boolean } | null {
  let a = majorRadius;
  let b = minorRadius;
  const f = rotInto(from, xAxisAngle);
  const l = rotInto(to, xAxisAngle);
  const m = rotInto(onArc, xAxisAngle);
  const hx = (f[0] - l[0]) / 2;
  const hy = (f[1] - l[1]) / 2;
  // F.6.6 correction: scale the radii up when the chord cannot fit them.
  const lam = (hx * hx) / (a * a) + (hy * hy) / (b * b);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    a *= s;
    b *= s;
  }
  const num = a * a * b * b - a * a * hy * hy - b * b * hx * hx;
  const den = a * a * hy * hy + b * b * hx * hx;
  if (den < 1e-12) return null;
  const coef = Math.sqrt(Math.max(0, num / den));
  const mx = (f[0] + l[0]) / 2;
  const my = (f[1] + l[1]) / 2;
  const candidates: readonly [Pt, Pt] = [
    [mx + (coef * a * hy) / b, my - (coef * b * hx) / a],
    [mx - (coef * a * hy) / b, my + (coef * b * hx) / a],
  ];
  // The interior sample lies on exactly one candidate ellipse (up to numeric
  // residual); that candidate is the true center.
  const residual = (c: Pt): number => {
    const dx = (m[0] - c[0]) / a;
    const dy = (m[1] - c[1]) / b;
    return Math.abs(dx * dx + dy * dy - 1);
  };
  const center = residual(candidates[0]) <= residual(candidates[1]) ? candidates[0] : candidates[1];
  const theta = (p: Pt): number => Math.atan2((p[1] - center[1]) / b, (p[0] - center[0]) / a);
  const tau = 2 * Math.PI;
  const tf = theta(f);
  const tm = (((theta(m) - tf) % tau) + tau) % tau;
  const tl = (((theta(l) - tf) % tau) + tau) % tau;
  const ccw = tm < tl;
  const sweep = ccw ? tl : tau - tl;
  return { largeArc: sweep > Math.PI, ccw };
}
