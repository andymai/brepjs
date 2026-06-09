//! Profile-along-spine sweep (brepjs-implicit Phase 2a, Spike-A locked approach).
//!
//! A [`SweptCurve`] precomputes a rotation-minimizing frame (RMF) at every spine
//! station ONCE — never per eval. Frames are built by Wang's double-reflection
//! method: the tangents come from spine finite differences, an initial normal is
//! seeded perpendicular to the first tangent, then each successive normal is
//! propagated by reflecting the previous frame across two bisecting planes. This
//! transports the frame with minimal torsion and — unlike a raw Frenet frame —
//! does NOT flip 180° at an inflection point.
//!
//! [`SweptCurve::local_coords`] maps a world point to `(u, v, axial_overrun)` in
//! the nearest station's frame: `u`/`v` are the in-plane profile coordinates and
//! `axial_overrun` is how far the point projects past an open end cap (0 for a
//! closed spine or an interior projection). The profile is then evaluated at
//! `[u, v, 0]` and the overrun is folded in for end caps by the [`super::expr`]
//! `Sweep` node.

#[inline]
fn sub(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

#[inline]
fn add(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

#[inline]
fn scale(a: [f64; 3], s: f64) -> [f64; 3] {
    [a[0] * s, a[1] * s, a[2] * s]
}

#[inline]
fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

#[inline]
fn cross(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

#[inline]
fn norm(v: [f64; 3]) -> f64 {
    dot(v, v).sqrt()
}

/// Normalize a vector; returns `fallback` for a (near-)zero input so a degenerate
/// segment can't produce NaNs in the frame walk.
#[inline]
fn normalize_or(v: [f64; 3], fallback: [f64; 3]) -> [f64; 3] {
    let l = norm(v);
    if l <= 1e-12 {
        fallback
    } else {
        [v[0] / l, v[1] / l, v[2] / l]
    }
}

/// Rotate `v` about unit axis `k` by `angle` (Rodrigues' formula).
fn rotate_about(v: [f64; 3], k: [f64; 3], angle: f64) -> [f64; 3] {
    let (s, c) = angle.sin_cos();
    let kv = cross(k, v);
    let kd = dot(k, v) * (1.0 - c);
    [
        v[0] * c + kv[0] * s + k[0] * kd,
        v[1] * c + kv[1] * s + k[1] * kd,
        v[2] * c + kv[2] * s + k[2] * kd,
    ]
}

/// Any unit vector perpendicular to `t` (assumed unit). Picks the axis least
/// aligned with `t` to avoid a near-parallel cross product.
fn perp_to(t: [f64; 3]) -> [f64; 3] {
    let axis = if t[0].abs() <= t[1].abs() && t[0].abs() <= t[2].abs() {
        [1.0, 0.0, 0.0]
    } else if t[1].abs() <= t[2].abs() {
        [0.0, 1.0, 0.0]
    } else {
        [0.0, 0.0, 1.0]
    };
    normalize_or(cross(t, axis), [0.0, 1.0, 0.0])
}

/// A rotation-minimizing frame at one spine station: an orthonormal triad where
/// `tangent` follows the spine and `(normal, binormal)` span the profile plane.
#[derive(Clone, Copy, Debug)]
pub struct Frame {
    pub tangent: [f64; 3],
    pub normal: [f64; 3],
    pub binormal: [f64; 3],
}

/// A spine with precomputed RMF frames. Built ONCE; the per-eval cost is an O(n)
/// nearest-segment scan, not a frame rebuild.
#[derive(Clone, Debug)]
pub struct SweptCurve {
    points: Vec<[f64; 3]>,
    frames: Vec<Frame>,
    closed: bool,
}

impl SweptCurve {
    /// Precompute tangents, RMF normals (Wang double reflection), and binormals
    /// for every station. `closed` wraps the tangent estimate at the endpoints.
    pub fn new(spine: &[[f64; 3]], closed: bool) -> SweptCurve {
        let n = spine.len();
        let points: Vec<[f64; 3]> = spine.to_vec();
        let tangents = Self::tangents(&points, closed);

        let mut frames: Vec<Frame> = Vec::with_capacity(n);
        if n == 0 {
            return SweptCurve {
                points,
                frames,
                closed,
            };
        }

        // Seed: an arbitrary normal perpendicular to the first tangent.
        let t0 = tangents[0];
        let mut normal = perp_to(t0);
        frames.push(Frame {
            tangent: t0,
            normal,
            binormal: normalize_or(cross(t0, normal), [0.0, 0.0, 1.0]),
        });

        // Double-reflection RMF (Wang et al. 2008): reflect the previous frame
        // across the plane bisecting the two positions, then across the plane
        // bisecting the two tangents, giving the minimally-rotated next normal.
        for i in 1..n {
            let prev_t = tangents[i - 1];
            let next_t = tangents[i];
            let prev_p = points[i - 1];
            let next_p = points[i];

            let v1 = sub(next_p, prev_p);
            let c1 = dot(v1, v1);
            let (r_l, t_l) = if c1 > 1e-18 {
                let f = 2.0 / c1;
                let r = sub(normal, scale(v1, f * dot(v1, normal)));
                let t = sub(prev_t, scale(v1, f * dot(v1, prev_t)));
                (r, t)
            } else {
                (normal, prev_t)
            };

            let v2 = sub(next_t, t_l);
            let c2 = dot(v2, v2);
            let next_normal = if c2 > 1e-18 {
                let f = 2.0 / c2;
                sub(r_l, scale(v2, f * dot(v2, r_l)))
            } else {
                r_l
            };

            // Re-orthogonalize against the actual tangent to fight drift.
            normal = normalize_or(
                sub(next_normal, scale(next_t, dot(next_normal, next_t))),
                perp_to(next_t),
            );
            let binormal = normalize_or(cross(next_t, normal), [0.0, 0.0, 1.0]);
            frames.push(Frame {
                tangent: next_t,
                normal,
                binormal,
            });
        }

        // Closure correction: transporting an RMF once around a closed spine
        // generally returns to the seed with a residual twist (holonomy). Without
        // correction the wrap segment (station n-1 → 0) carries that whole defect as
        // a visible seam. Measure the residual angle and spread it linearly across
        // the stations so the frame closes seamlessly.
        if closed && n >= 3 {
            let wrapped = Self::transport(
                frames[n - 1].normal,
                points[n - 1],
                points[0],
                tangents[n - 1],
                tangents[0],
            );
            let seed = frames[0].normal;
            let theta = dot(cross(wrapped, seed), tangents[0])
                .atan2(dot(wrapped, seed).clamp(-1.0, 1.0));
            // Spread the residual twist over the n-1 explicit inter-station intervals
            // so station n-1 absorbs the full theta — the wrap segment then carries
            // zero, closing the seam exactly. Dividing by n would leave theta/n on the
            // wrap (a visible kink on flat, few-station loops).
            for (i, frame) in frames.iter_mut().enumerate() {
                let ang = theta * (i as f64) / ((n - 1) as f64);
                let t = frame.tangent;
                let rotated = rotate_about(frame.normal, t, ang);
                frame.normal =
                    normalize_or(sub(rotated, scale(t, dot(rotated, t))), frame.normal);
                frame.binormal = normalize_or(cross(t, frame.normal), frame.binormal);
            }
        }

        SweptCurve {
            points,
            frames,
            closed,
        }
    }

    /// One Wang double-reflection transport step: carry `normal` from the station at
    /// `prev_p`/`prev_t` to the one at `next_p`/`next_t`, re-orthogonalized.
    fn transport(
        normal: [f64; 3],
        prev_p: [f64; 3],
        next_p: [f64; 3],
        prev_t: [f64; 3],
        next_t: [f64; 3],
    ) -> [f64; 3] {
        let v1 = sub(next_p, prev_p);
        let c1 = dot(v1, v1);
        let (r_l, t_l) = if c1 > 1e-18 {
            let f = 2.0 / c1;
            (
                sub(normal, scale(v1, f * dot(v1, normal))),
                sub(prev_t, scale(v1, f * dot(v1, prev_t))),
            )
        } else {
            (normal, prev_t)
        };
        let v2 = sub(next_t, t_l);
        let c2 = dot(v2, v2);
        let next_normal = if c2 > 1e-18 {
            let f = 2.0 / c2;
            sub(r_l, scale(v2, f * dot(v2, r_l)))
        } else {
            r_l
        };
        normalize_or(
            sub(next_normal, scale(next_t, dot(next_normal, next_t))),
            perp_to(next_t),
        )
    }

    /// Number of spine stations.
    pub fn len(&self) -> usize {
        self.points.len()
    }

    pub fn is_empty(&self) -> bool {
        self.points.is_empty()
    }

    pub fn closed(&self) -> bool {
        self.closed
    }

    pub fn points(&self) -> &[[f64; 3]] {
        &self.points
    }

    pub fn frames(&self) -> &[Frame] {
        &self.frames
    }

    /// Per-station tangents from central finite differences, normalized. Endpoints
    /// use a one-sided difference (open) or wrap (closed). A degenerate segment
    /// falls back to the neighbouring tangent / +Z so no NaN enters the frame walk.
    fn tangents(points: &[[f64; 3]], closed: bool) -> Vec<[f64; 3]> {
        let n = points.len();
        let mut t = vec![[0.0, 0.0, 1.0]; n];
        if n == 0 {
            return t;
        }
        if n == 1 {
            return t;
        }
        for i in 0..n {
            let dir = if closed {
                let prev = points[(i + n - 1) % n];
                let next = points[(i + 1) % n];
                sub(next, prev)
            } else if i == 0 {
                sub(points[1], points[0])
            } else if i == n - 1 {
                sub(points[n - 1], points[n - 2])
            } else {
                sub(points[i + 1], points[i - 1])
            };
            let fallback = if i > 0 { t[i - 1] } else { [0.0, 0.0, 1.0] };
            t[i] = normalize_or(dir, fallback);
        }
        t
    }

    /// Map a world point to profile-plane coords in the nearest station's frame.
    ///
    /// Scans every spine segment for the nearest point `c`, interpolates the frame
    /// between the segment endpoints, and returns:
    /// - `u = dot(p - c, normal)`, `v = dot(p - c, binormal)` — the in-plane coords
    ///   the profile is sampled at;
    /// - `axial_overrun` — how far `p` projects beyond an OPEN end cap along the end
    ///   tangent (0 for a closed spine, or when the nearest point is interior).
    pub fn local_coords(&self, p: [f64; 3]) -> (f64, f64, f64) {
        let n = self.points.len();
        if n == 0 {
            return (0.0, 0.0, 0.0);
        }
        if n == 1 {
            let f = self.frames[0];
            let d = sub(p, self.points[0]);
            return (dot(d, f.normal), dot(d, f.binormal), 0.0);
        }

        let seg_count = if self.closed { n } else { n - 1 };
        let mut best_d2 = f64::INFINITY;
        let mut best_c = self.points[0];
        let mut best_normal = self.frames[0].normal;
        let mut best_binormal = self.frames[0].binormal;
        // Signed overrun past an open end: < 0 before the start cap, > 0 past the
        // end cap, 0 in the interior. Tracked only for the nearest segment.
        let mut best_overrun = 0.0;

        for s in 0..seg_count {
            let i0 = s;
            let i1 = (s + 1) % n;
            let a = self.points[i0];
            let b = self.points[i1];
            let ab = sub(b, a);
            let len2 = dot(ab, ab);
            let raw_t = if len2 > 1e-18 {
                dot(sub(p, a), ab) / len2
            } else {
                0.0
            };
            let t = raw_t.clamp(0.0, 1.0);
            let c = add(a, scale(ab, t));
            let d2 = {
                let d = sub(p, c);
                dot(d, d)
            };
            if d2 < best_d2 {
                best_d2 = d2;
                best_c = c;
                let f0 = self.frames[i0];
                let f1 = self.frames[i1];
                best_normal = normalize_or(
                    add(scale(f0.normal, 1.0 - t), scale(f1.normal, t)),
                    f0.normal,
                );
                best_binormal = normalize_or(
                    add(scale(f0.binormal, 1.0 - t), scale(f1.binormal, t)),
                    f0.binormal,
                );

                best_overrun = if self.closed {
                    0.0
                } else if s == 0 && raw_t < 0.0 {
                    // Before the start cap: overrun along -tangent_0.
                    let seg_len = len2.sqrt();
                    raw_t * seg_len
                } else if s == seg_count - 1 && raw_t > 1.0 {
                    // Past the end cap: overrun along +tangent_last.
                    let seg_len = len2.sqrt();
                    (raw_t - 1.0) * seg_len
                } else {
                    0.0
                };
            }
        }

        let d = sub(p, best_c);
        let u = dot(d, best_normal);
        let v = dot(d, best_binormal);
        (u, v, best_overrun.abs())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    fn straight_spine() -> Vec<[f64; 3]> {
        (0..=10).map(|i| [0.0, 0.0, i as f64 * 0.5]).collect()
    }

    #[test]
    fn frames_are_orthonormal() {
        let curve = SweptCurve::new(&straight_spine(), false);
        for f in curve.frames() {
            assert!((norm(f.tangent) - 1.0).abs() < 1e-9, "tangent unit");
            assert!((norm(f.normal) - 1.0).abs() < 1e-9, "normal unit");
            assert!((norm(f.binormal) - 1.0).abs() < 1e-9, "binormal unit");
            assert!(dot(f.tangent, f.normal).abs() < 1e-9, "t·n = 0");
            assert!(dot(f.tangent, f.binormal).abs() < 1e-9, "t·b = 0");
            assert!(dot(f.normal, f.binormal).abs() < 1e-9, "n·b = 0");
        }
    }

    /// RMF NO-FLIP: along an S-curve / helix the normal must vary CONTINUOUSLY —
    /// adjacent-frame normals never jump more than 90° (a raw Frenet frame flips
    /// 180° at the inflection between the two helix arcs).
    #[test]
    fn rmf_no_flip_on_s_curve() {
        // An S-curve in the XY plane: two opposing arcs meeting at an inflection.
        let mut spine = Vec::new();
        for i in 0..=40 {
            let s = i as f64 / 40.0;
            let x = s * 4.0;
            let y = (2.0 * PI * s).sin();
            spine.push([x, y, 0.0]);
        }
        let curve = SweptCurve::new(&spine, false);
        let frames = curve.frames();
        for w in frames.windows(2) {
            let c = dot(w[0].normal, w[1].normal);
            assert!(
                c > 0.0,
                "adjacent normals must not flip >90° (cos = {c}) — RMF inflection guard"
            );
        }
    }

    #[test]
    fn rmf_no_flip_on_helix() {
        let mut spine = Vec::new();
        for i in 0..=60 {
            let s = i as f64 / 60.0;
            let a = 4.0 * PI * s;
            spine.push([a.cos(), a.sin(), s * 3.0]);
        }
        let curve = SweptCurve::new(&spine, false);
        for w in curve.frames().windows(2) {
            assert!(
                dot(w[0].normal, w[1].normal) > 0.0,
                "helix RMF normal must not flip between stations"
            );
        }
    }

    #[test]
    fn local_coords_recovers_in_plane_offset_on_straight_spine() {
        let curve = SweptCurve::new(&straight_spine(), false);
        // A point offset purely in +x at mid-height: u or v should encode that
        // radius (0.5), with the axial component absorbed by the nearest point.
        let (u, v, overrun) = curve.local_coords([0.5, 0.0, 2.5]);
        let r = (u * u + v * v).sqrt();
        assert!((r - 0.5).abs() < 1e-9, "in-plane radius recovered: {r}");
        assert!(overrun.abs() < 1e-9, "interior point has no overrun");
    }

    #[test]
    fn local_coords_reports_axial_overrun_past_open_end() {
        let curve = SweptCurve::new(&straight_spine(), false);
        // Spine ends at z = 5; a point at z = 6 projects 1.0 past the end cap.
        let (_, _, overrun) = curve.local_coords([0.0, 0.0, 6.0]);
        assert!((overrun - 1.0).abs() < 1e-6, "overrun past end cap: {overrun}");
    }
}
