//! Analytic SDF expression tree (ADR-0013 field-first path). An [`Expr`] composes
//! exact-distance primitives, CSG/smooth operators, and domain transforms into a
//! pure function `eval(p) -> signed distance`, plus a conservative analytic
//! [`Aabb`] so the rasterizer can size a grid without sampling.

use super::field::ScalarField;
use super::operators;
use super::primitives;
use super::sweep::SweptCurve;
use crate::tpms::{tpms_value_f64, LatticeType};

/// A conservative axis-aligned bounding box of an [`Expr`]'s zero set. "Conservative"
/// means it never crops the surface: every point where `eval == 0` lies inside (or
/// on) `[min, max]`, so a grid built from it captures the whole solid. Unbounded
/// primitives (a half-space [`Expr::Plane`]) report an effectively infinite box,
/// which the rasterizer must clip to explicit bounds.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Aabb {
    pub min: [f64; 3],
    pub max: [f64; 3],
}

/// Half the largest finite extent a bounds() box uses to stand in for "unbounded"
/// (a half-space or a far smooth blend). Large enough to dwarf any real fixture,
/// finite so grid sizing never sees a NaN/∞.
const HUGE: f64 = 1.0e9;

impl Aabb {
    pub fn new(min: [f64; 3], max: [f64; 3]) -> Self {
        Aabb { min, max }
    }

    /// A box centered at the origin with the given half-extents.
    pub fn centered(half: [f64; 3]) -> Self {
        Aabb {
            min: [-half[0], -half[1], -half[2]],
            max: [half[0], half[1], half[2]],
        }
    }

    /// The effectively-infinite box, for unbounded primitives.
    pub fn infinite() -> Self {
        Aabb {
            min: [-HUGE, -HUGE, -HUGE],
            max: [HUGE, HUGE, HUGE],
        }
    }

    /// Smallest box containing both (CSG union / smooth-union bound).
    pub fn union(self, other: Aabb) -> Aabb {
        Aabb {
            min: [
                self.min[0].min(other.min[0]),
                self.min[1].min(other.min[1]),
                self.min[2].min(other.min[2]),
            ],
            max: [
                self.max[0].max(other.max[0]),
                self.max[1].max(other.max[1]),
                self.max[2].max(other.max[2]),
            ],
        }
    }

    /// Overlap of two boxes (CSG intersection bound). An empty overlap collapses
    /// to a degenerate box; the rasterizer's padding still gives the contourer a
    /// valid neighbourhood.
    pub fn intersect(self, other: Aabb) -> Aabb {
        Aabb {
            min: [
                self.min[0].max(other.min[0]),
                self.min[1].max(other.min[1]),
                self.min[2].max(other.min[2]),
            ],
            max: [
                self.max[0].min(other.max[0]),
                self.max[1].min(other.max[1]),
                self.max[2].min(other.max[2]),
            ],
        }
    }

    /// Grow the box by `d` on every side (offset / round / shell reach).
    pub fn expand(self, d: f64) -> Aabb {
        Aabb {
            min: [self.min[0] - d, self.min[1] - d, self.min[2] - d],
            max: [self.max[0] + d, self.max[1] + d, self.max[2] + d],
        }
    }

    pub fn translate(self, t: [f64; 3]) -> Aabb {
        Aabb {
            min: [self.min[0] + t[0], self.min[1] + t[1], self.min[2] + t[2]],
            max: [self.max[0] + t[0], self.max[1] + t[1], self.max[2] + t[2]],
        }
    }

    pub fn scale(self, s: f64) -> Aabb {
        Aabb {
            min: [self.min[0] * s, self.min[1] * s, self.min[2] * s],
            max: [self.max[0] * s, self.max[1] * s, self.max[2] * s],
        }
    }

    /// Conservative bound of this box after an arbitrary rotation: rotate all eight
    /// corners and take their AABB. Used by [`Expr::Rotate`].
    pub fn rotate(self, axis: [f64; 3], angle: f64) -> Aabb {
        let mut lo = [f64::INFINITY; 3];
        let mut hi = [f64::NEG_INFINITY; 3];
        for &cx in &[self.min[0], self.max[0]] {
            for &cy in &[self.min[1], self.max[1]] {
                for &cz in &[self.min[2], self.max[2]] {
                    let r = rotate_point([cx, cy, cz], axis, angle);
                    for d in 0..3 {
                        lo[d] = lo[d].min(r[d]);
                        hi[d] = hi[d].max(r[d]);
                    }
                }
            }
        }
        Aabb { min: lo, max: hi }
    }
}

/// Normalize a vector; returns `[0,0,1]` for a (near-)zero input so a degenerate
/// axis can't produce NaNs.
fn normalize(v: [f64; 3]) -> [f64; 3] {
    let l = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    if l <= 1e-12 {
        [0.0, 0.0, 1.0]
    } else {
        [v[0] / l, v[1] / l, v[2] / l]
    }
}

/// Rotate `p` by `angle` radians about `axis` (Rodrigues' rotation formula).
fn rotate_point(p: [f64; 3], axis: [f64; 3], angle: f64) -> [f64; 3] {
    let k = normalize(axis);
    let (s, c) = angle.sin_cos();
    let dot = k[0] * p[0] + k[1] * p[1] + k[2] * p[2];
    // cross(k, p)
    let cross = [
        k[1] * p[2] - k[2] * p[1],
        k[2] * p[0] - k[0] * p[2],
        k[0] * p[1] - k[1] * p[0],
    ];
    [
        p[0] * c + cross[0] * s + k[0] * dot * (1.0 - c),
        p[1] * c + cross[1] * s + k[1] * dot * (1.0 - c),
        p[2] * c + cross[2] * s + k[2] * dot * (1.0 - c),
    ]
}

/// Expand `b` by a modulated parameter's range MAX. A non-finite max (an unclamped
/// [`ScalarField::FromSdf`]) means the surface can reach arbitrarily far, so the
/// conservative bound is [`Aabb::infinite`]. A non-positive max never shrinks the box.
fn expand_by_range_max(b: Aabb, range_max: f64) -> Aabb {
    if !range_max.is_finite() {
        return Aabb::infinite();
    }
    b.expand(range_max.max(0.0))
}

/// An SDF expression tree node. Primitives are leaves (exact distance, centered at
/// the origin unless noted), operators combine two children, domain nodes transform
/// the query point before evaluating their single child.
#[derive(Clone, Debug)]
pub enum Expr {
    // ── Primitives ──
    Sphere {
        r: f64,
    },
    Box {
        half: [f64; 3],
    },
    RoundBox {
        half: [f64; 3],
        r: f64,
    },
    Cylinder {
        r: f64,
        h: f64,
    },
    Cone {
        r: f64,
        h: f64,
    },
    Capsule {
        a: [f64; 3],
        b: [f64; 3],
        r: f64,
    },
    Torus {
        major: f64,
        minor: f64,
    },
    Plane {
        n: [f64; 3],
        h: f64,
    },

    // ── Binary operators ──
    Union(Box<Expr>, Box<Expr>),
    Intersection(Box<Expr>, Box<Expr>),
    Difference(Box<Expr>, Box<Expr>),
    SmoothUnion {
        a: Box<Expr>,
        b: Box<Expr>,
        k: f64,
    },
    SmoothIntersection {
        a: Box<Expr>,
        b: Box<Expr>,
        k: f64,
    },
    SmoothDifference {
        a: Box<Expr>,
        b: Box<Expr>,
        k: f64,
    },

    // ── Unary field operators ──
    Offset {
        e: Box<Expr>,
        d: f64,
    },
    Round {
        e: Box<Expr>,
        r: f64,
    },
    Shell {
        e: Box<Expr>,
        t: f64,
    },
    Onion {
        e: Box<Expr>,
        t: f64,
    },

    // ── Position-modulated field operators (brepjs-implicit Phase 2b) ──
    /// Offset by a per-position distance: `e.eval(p) − d.eval(p)`. A modulated
    /// offset/blend yields a Lipschitz field (`|∇| < 1`), not a true SDF — a
    /// DOWNSTREAM true-distance op must `reinit_sdf` first.
    OffsetField {
        e: Box<Expr>,
        d: ScalarField,
    },
    RoundField {
        e: Box<Expr>,
        r: ScalarField,
    },
    ShellField {
        e: Box<Expr>,
        t: ScalarField,
    },
    /// Smooth-union with a per-position blend width `k`. Lipschitz (see [`OffsetField`]).
    SmoothUnionField {
        a: Box<Expr>,
        b: Box<Expr>,
        k: ScalarField,
    },

    // ── Domain transforms ──
    Translate {
        e: Box<Expr>,
        t: [f64; 3],
    },
    Rotate {
        e: Box<Expr>,
        axis: [f64; 3],
        angle: f64,
    },
    Scale {
        e: Box<Expr>,
        s: f64,
    },

    // ── Profile-along-spine sweep (brepjs-implicit Phase 2a) ──
    /// A 2D `profile` (sampled in-plane at `[u, v, 0]`) swept along `curve`'s
    /// rotation-minimizing frames. The result is a PSEUDO-SDF (true distance only
    /// near the surface): the in-plane profile distance is exact, but the field
    /// drifts in the axial direction away from the wall. Open vs closed is carried
    /// by `curve` — a closed [`SweptCurve`] reports zero overrun, so no end caps.
    Sweep {
        curve: SweptCurve,
        profile: Box<Expr>,
    },

    // ── Lattices (brepjs-implicit Phase 2c) ──
    /// A graded/conformal TPMS lattice: `|f(p)| − ½·thickness(p)` where `f` is the
    /// chosen family's nodal trig field (negative = strut material). `period` and
    /// `thickness` are GRADED via [`ScalarField`]; a [`Const`](ScalarField::Const)
    /// period/thickness reproduces a uniform lattice. The field is Lipschitz and
    /// APPROXIMATE, not a true SDF (matching the mesh-first lattice path).
    ///
    /// The lattice is INFINITE/periodic, so [`bounds`](Expr::bounds) reports the
    /// infinite box — a raw `Lattice` must be clipped to a bounded region via
    /// `Intersection(Lattice, region)` (CONFORMAL use) before rasterize, which
    /// gives the rasterizer a finite grid.
    Lattice {
        kind: LatticeType,
        period: ScalarField,
        thickness: ScalarField,
    },
    /// A cubic beam/strut lattice: axis-aligned cylindrical struts running along the
    /// edges of a `period`-spaced cubic grid. `eval` is the distance from `p` to the
    /// nearest of the three axis-aligned strut families, minus `radius(p)` (negative
    /// = inside a strut). `radius` is GRADED via [`ScalarField`]. Periodic, so
    /// [`bounds`](Expr::bounds) is infinite — clip via `Intersection` like [`Lattice`].
    StrutLattice {
        period: f64,
        radius: ScalarField,
    },
}

impl Expr {
    /// Signed distance of this expression at world point `p` (negative inside).
    pub fn eval(&self, p: [f64; 3]) -> f64 {
        match self {
            Expr::Sphere { r } => primitives::sphere(p, *r),
            Expr::Box { half } => primitives::box_sdf(p, *half),
            Expr::RoundBox { half, r } => primitives::round_box(p, *half, *r),
            Expr::Cylinder { r, h } => primitives::cylinder(p, *r, *h),
            Expr::Cone { r, h } => primitives::cone(p, *r, *h),
            Expr::Capsule { a, b, r } => primitives::capsule(p, *a, *b, *r),
            Expr::Torus { major, minor } => primitives::torus(p, *major, *minor),
            Expr::Plane { n, h } => primitives::plane(p, normalize(*n), *h),

            Expr::Union(a, b) => operators::union(a.eval(p), b.eval(p)),
            Expr::Intersection(a, b) => operators::intersection(a.eval(p), b.eval(p)),
            Expr::Difference(a, b) => operators::difference(a.eval(p), b.eval(p)),
            Expr::SmoothUnion { a, b, k } => operators::smooth_union(a.eval(p), b.eval(p), *k),
            Expr::SmoothIntersection { a, b, k } => {
                operators::smooth_intersection(a.eval(p), b.eval(p), *k)
            }
            Expr::SmoothDifference { a, b, k } => {
                operators::smooth_difference(a.eval(p), b.eval(p), *k)
            }

            Expr::Offset { e, d } => operators::offset(e.eval(p), *d),
            Expr::Round { e, r } => operators::round(e.eval(p), *r),
            Expr::Shell { e, t } => operators::shell(e.eval(p), *t),
            Expr::Onion { e, t } => operators::onion(e.eval(p), *t),

            Expr::OffsetField { e, d } => operators::offset(e.eval(p), d.eval(p)),
            Expr::RoundField { e, r } => operators::round(e.eval(p), r.eval(p)),
            Expr::ShellField { e, t } => operators::shell(e.eval(p), t.eval(p)),
            Expr::SmoothUnionField { a, b, k } => {
                operators::smooth_union(a.eval(p), b.eval(p), k.eval(p))
            }

            Expr::Translate { e, t } => {
                e.eval([p[0] - t[0], p[1] - t[1], p[2] - t[2]])
            }
            Expr::Rotate { e, axis, angle } => e.eval(rotate_point(p, *axis, -*angle)),
            Expr::Scale { e, s } => {
                // Distance scales by |s|, never the signed factor — a negative s is a
                // point-reflection (handled by dividing p), not a field-sign flip.
                let s = if *s == 0.0 { 1.0 } else { *s };
                e.eval([p[0] / s, p[1] / s, p[2] / s]) * s.abs()
            }

            Expr::Sweep { curve, profile } => {
                let (u, v, overrun) = curve.local_coords(p);
                let dp = profile.eval([u, v, 0.0]);
                if overrun <= 0.0 {
                    dp
                } else {
                    // Open sweep END-CAP: this branch is reached only when `overrun > 0`,
                    // i.e. the point projects strictly past a flat cap, so it is always
                    // EXTERIOR. Distance is the hypot of the in-plane overshoot (0 when the
                    // projection lands inside the profile → perpendicular to the cap disk)
                    // and the axial overrun. Adding `dp.min(0)` here would wrongly report a
                    // point on-axis just past the cap as interior. Pseudo-SDF near the rim.
                    (dp.max(0.0).powi(2) + overrun * overrun).sqrt()
                }
            }

            Expr::Lattice {
                kind,
                period,
                thickness,
            } => {
                // A zero/negative period makes the 2π/period scale non-finite; clamp
                // to a tiny positive so a graded period that dips to 0 stays defined.
                let per = period.eval(p).max(1e-6);
                tpms_value_f64(*kind, p, per).abs() - 0.5 * thickness.eval(p)
            }
            Expr::StrutLattice { period, radius } => {
                strut_lattice_distance(p, *period) - radius.eval(p)
            }
        }
    }

    /// Conservative analytic [`Aabb`] of this expression's zero set.
    pub fn bounds(&self) -> Aabb {
        match self {
            Expr::Sphere { r } => Aabb::centered([*r, *r, *r]),
            Expr::Box { half } => Aabb::centered(*half),
            Expr::RoundBox { half, r } => {
                Aabb::centered([half[0] + r, half[1] + r, half[2] + r])
            }
            Expr::Cylinder { r, h } => Aabb::centered([*r, *r, h * 0.5]),
            Expr::Cone { r, h } => Aabb::centered([*r, *r, h * 0.5]),
            Expr::Capsule { a, b, r } => {
                let lo = [
                    a[0].min(b[0]) - r,
                    a[1].min(b[1]) - r,
                    a[2].min(b[2]) - r,
                ];
                let hi = [
                    a[0].max(b[0]) + r,
                    a[1].max(b[1]) + r,
                    a[2].max(b[2]) + r,
                ];
                Aabb::new(lo, hi)
            }
            Expr::Torus { major, minor } => {
                let radial = major + minor;
                Aabb::centered([radial, radial, *minor])
            }
            // A half-space is unbounded; report the huge box for grid clipping.
            Expr::Plane { .. } => Aabb::infinite(),

            Expr::Union(a, b) => a.bounds().union(b.bounds()),
            // A smooth blend bulges OUTWARD past both operands by up to ~k, so the
            // union bound is expanded by k to stay conservative.
            Expr::SmoothUnion { a, b, k } => a.bounds().union(b.bounds()).expand(k.max(0.0)),
            Expr::Intersection(a, b) => a.bounds().intersect(b.bounds()),
            Expr::SmoothIntersection { a, b, k } => {
                a.bounds().intersect(b.bounds()).expand(k.max(0.0))
            }
            // a − b never reaches past a's own bound.
            Expr::Difference(a, _) => a.bounds(),
            Expr::SmoothDifference { a, b: _, k } => a.bounds().expand(k.max(0.0)),

            // d − dist > 0 moves the surface outward by dist (dist > 0).
            Expr::Offset { e, d } => e.bounds().expand(d.max(0.0)),
            Expr::Round { e, r } => e.bounds().expand(r.max(0.0)),
            // |d| − t puts a surface at ±t, so both the outer (+t) and the inner
            // material stay within the original bound expanded by t.
            Expr::Shell { e, t } => e.bounds().expand(t.max(0.0)),
            Expr::Onion { e, t } => e.bounds().expand(t.max(0.0)),

            // Size the band off the MAX of the modulated parameter range (Spike-C):
            // a non-finite max (an unclamped FromSdf) makes the surface reach
            // unbounded, so report the infinite box for the rasterizer to clip.
            Expr::OffsetField { e, d } => expand_by_range_max(e.bounds(), d.range().1),
            Expr::RoundField { e, r } => expand_by_range_max(e.bounds(), r.range().1),
            Expr::ShellField { e, t } => expand_by_range_max(e.bounds(), t.range().1),
            Expr::SmoothUnionField { a, b, k } => {
                expand_by_range_max(a.bounds().union(b.bounds()), k.range().1)
            }

            Expr::Translate { e, t } => e.bounds().translate(*t),
            Expr::Rotate { e, axis, angle } => e.bounds().rotate(*axis, *angle),
            Expr::Scale { e, s } => e.bounds().scale(s.abs().max(f64::MIN_POSITIVE)),

            Expr::Sweep { curve, profile, .. } => {
                // The profile is in-plane (XY of its own frame); its reach is the
                // farthest in-plane CORNER of its bounds — `hypot(rx, ry)`, not the
                // per-axis max. A frame rotated ~45° in world XY puts that corner up to
                // √2 farther from the spine than any single axis, so a per-axis pad would
                // crop the swept wall at the grid edge. A sphere of that corner radius at
                // every station bounds the tube conservatively for any frame orientation.
                let pb = profile.bounds();
                let rx = pb.min[0].abs().max(pb.max[0].abs());
                let ry = pb.min[1].abs().max(pb.max[1].abs());
                let reach = (rx * rx + ry * ry).sqrt();
                let pad = reach + 1e-3;
                let pts = curve.points();
                if pts.is_empty() {
                    return Aabb::centered([pad, pad, pad]);
                }
                let mut lo = [f64::INFINITY; 3];
                let mut hi = [f64::NEG_INFINITY; 3];
                for s in pts {
                    for d in 0..3 {
                        lo[d] = lo[d].min(s[d] - pad);
                        hi[d] = hi[d].max(s[d] + pad);
                    }
                }
                Aabb { min: lo, max: hi }
            }

            // A TPMS / strut lattice is infinite (periodic); CONFORMAL use clips it
            // via Intersection(Lattice, region), whose bound is the finite region's.
            Expr::Lattice { .. } => Aabb::infinite(),
            Expr::StrutLattice { .. } => Aabb::infinite(),
        }
    }
}

/// Distance from `p` to the nearest axis-aligned cylindrical strut of a cubic grid
/// with `period` spacing. Struts run along the cell edges (the lines where two of
/// the three coordinates are integer multiples of `period`). For each axis, the
/// strut family parallel to that axis is the set of lines fixed in the other two
/// coordinates; the in-cell distance to the nearest such line is the planar
/// distance in those two coordinates to the nearest grid node. The strut distance
/// is the min over the three families.
fn strut_lattice_distance(p: [f64; 3], period: f64) -> f64 {
    let per = period.max(1e-6);
    // Signed offset of each coordinate to its nearest grid line, in [-per/2, per/2].
    let nearest = |c: f64| {
        let r = (c / per).round() * per;
        c - r
    };
    let d = [nearest(p[0]), nearest(p[1]), nearest(p[2])];
    // Strut along axis k: distance is the hypot of the offsets in the OTHER two axes.
    let dx = (d[1] * d[1] + d[2] * d[2]).sqrt();
    let dy = (d[0] * d[0] + d[2] * d[2]).sqrt();
    let dz = (d[0] * d[0] + d[1] * d[1]).sqrt();
    dx.min(dy).min(dz)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    const EPS: f64 = 1e-9;

    #[test]
    fn sphere_distance_at_known_points() {
        let s = Expr::Sphere { r: 2.0 };
        assert!((s.eval([0.0, 0.0, 0.0]) + 2.0).abs() < EPS, "center = -r");
        assert!(s.eval([2.0, 0.0, 0.0]).abs() < EPS, "on surface = 0");
        assert!((s.eval([5.0, 0.0, 0.0]) - 3.0).abs() < EPS, "outside = dist - r");
    }

    #[test]
    fn box_distance_at_known_points() {
        let b = Expr::Box { half: [1.0, 1.0, 1.0] };
        assert!(b.eval([0.0, 0.0, 0.0]).abs() - 1.0 < EPS);
        assert!((b.eval([0.0, 0.0, 0.0]) + 1.0).abs() < EPS, "center = -half");
        assert!(b.eval([1.0, 0.0, 0.0]).abs() < EPS, "on face = 0");
        assert!((b.eval([2.0, 0.0, 0.0]) - 1.0).abs() < EPS, "outside face");
        // Diagonally outside a corner.
        assert!((b.eval([2.0, 2.0, 1.0]) - 2f64.sqrt()).abs() < EPS);
    }

    #[test]
    fn torus_distance_at_known_points() {
        let t = Expr::Torus { major: 3.0, minor: 1.0 };
        // On the major circle: distance is -minor (inside the tube center).
        assert!((t.eval([3.0, 0.0, 0.0]) + 1.0).abs() < EPS);
        // On the outer tube surface.
        assert!(t.eval([4.0, 0.0, 0.0]).abs() < EPS);
        // On the inner tube surface.
        assert!(t.eval([2.0, 0.0, 0.0]).abs() < EPS);
        // Above the major circle by minor.
        assert!(t.eval([3.0, 0.0, 1.0]).abs() < EPS);
    }

    #[test]
    fn cylinder_distance_at_known_points() {
        let c = Expr::Cylinder { r: 1.0, h: 2.0 };
        assert!((c.eval([0.0, 0.0, 0.0]) + 1.0).abs() < EPS, "axis center");
        assert!(c.eval([1.0, 0.0, 0.0]).abs() < EPS, "on side");
        assert!(c.eval([0.0, 0.0, 1.0]).abs() < EPS, "on top cap");
        assert!((c.eval([0.0, 0.0, 2.0]) - 1.0).abs() < EPS, "above cap");
    }

    #[test]
    fn cone_apex_and_base() {
        let c = Expr::Cone { r: 1.0, h: 2.0 };
        // Apex at z = +h/2 = +1, radius 0.
        assert!(c.eval([0.0, 0.0, 1.0]).abs() < 1e-6, "apex on surface");
        // A point on the axis just above the base plane is interior.
        assert!(c.eval([0.0, 0.0, -0.5]) < 0.0, "axis interior");
        // The base disc center lies ON the base cap plane (distance ~0).
        assert!(c.eval([0.0, 0.0, -1.0]).abs() < 1e-6, "base center on cap");
        // Base rim at (1,0,-1) on the surface.
        assert!(c.eval([1.0, 0.0, -1.0]).abs() < 1e-6, "base rim on surface");
        // Well outside.
        assert!(c.eval([5.0, 0.0, 0.0]) > 0.0);
    }

    #[test]
    fn capsule_distance_at_known_points() {
        let c = Expr::Capsule {
            a: [0.0, 0.0, -1.0],
            b: [0.0, 0.0, 1.0],
            r: 0.5,
        };
        assert!((c.eval([0.0, 0.0, 0.0]) + 0.5).abs() < EPS, "axis center = -r");
        assert!(c.eval([0.5, 0.0, 0.0]).abs() < EPS, "on side");
        // Spherical cap end.
        assert!(c.eval([0.0, 0.0, 1.5]).abs() < EPS);
    }

    #[test]
    fn plane_halfspace_sign() {
        let p = Expr::Plane { n: [0.0, 0.0, 1.0], h: 0.0 };
        assert!(p.eval([0.0, 0.0, -1.0]) < 0.0, "below is inside");
        assert!(p.eval([0.0, 0.0, 1.0]) > 0.0, "above is outside");
        assert!(p.eval([5.0, 5.0, 0.0]).abs() < EPS, "on plane");
    }

    #[test]
    fn translate_moves_the_surface() {
        let s = Expr::Translate {
            e: Box::new(Expr::Sphere { r: 1.0 }),
            t: [5.0, 0.0, 0.0],
        };
        assert!((s.eval([5.0, 0.0, 0.0]) + 1.0).abs() < EPS);
        assert!(s.eval([6.0, 0.0, 0.0]).abs() < EPS);
    }

    #[test]
    fn scale_scales_distance() {
        let s = Expr::Scale {
            e: Box::new(Expr::Sphere { r: 1.0 }),
            s: 2.0,
        };
        // Scaled sphere has radius 2.
        assert!(s.eval([2.0, 0.0, 0.0]).abs() < EPS);
        assert!((s.eval([0.0, 0.0, 0.0]) + 2.0).abs() < EPS);
    }

    #[test]
    fn negative_scale_preserves_field_sign() {
        // A negative uniform scale is a reflection, not a sign flip: the interior
        // must stay interior (distance scales by |s|).
        let s = Expr::Scale {
            e: Box::new(Expr::Sphere { r: 1.0 }),
            s: -2.0,
        };
        assert!((s.eval([0.0, 0.0, 0.0]) + 2.0).abs() < EPS, "center stays inside");
        assert!(s.eval([2.0, 0.0, 0.0]).abs() < EPS, "radius is |s|");
        assert!(s.eval([3.0, 0.0, 0.0]) > 0.0, "outside stays outside");
    }

    #[test]
    fn rotate_preserves_distance_for_symmetric_shape() {
        // Rotating a box 90° about Z maps an x-face to a y-face.
        let b = Expr::Rotate {
            e: Box::new(Expr::Box { half: [2.0, 1.0, 1.0] }),
            axis: [0.0, 0.0, 1.0],
            angle: PI / 2.0,
        };
        // The long axis (originally x, half 2) is now along y.
        assert!(b.eval([0.0, 2.0, 0.0]).abs() < 1e-9, "rotated long face");
        assert!((b.eval([1.0, 0.0, 0.0]) + 0.0).abs() < 1e-9, "now-short x face");
    }

    #[test]
    fn k_zero_smooth_equals_hard() {
        let a = Expr::Sphere { r: 1.0 };
        let b = Expr::Translate {
            e: Box::new(Expr::Sphere { r: 1.0 }),
            t: [1.5, 0.0, 0.0],
        };
        let hard_u = Expr::Union(Box::new(a.clone()), Box::new(b.clone()));
        let soft_u = Expr::SmoothUnion {
            a: Box::new(a.clone()),
            b: Box::new(b.clone()),
            k: 0.0,
        };
        let hard_i = Expr::Intersection(Box::new(a.clone()), Box::new(b.clone()));
        let soft_i = Expr::SmoothIntersection {
            a: Box::new(a.clone()),
            b: Box::new(b.clone()),
            k: 0.0,
        };
        let hard_d = Expr::Difference(Box::new(a.clone()), Box::new(b.clone()));
        let soft_d = Expr::SmoothDifference {
            a: Box::new(a.clone()),
            b: Box::new(b.clone()),
            k: 0.0,
        };
        for &p in &[
            [0.0, 0.0, 0.0],
            [0.75, 0.3, 0.1],
            [1.5, 0.0, 0.0],
            [-0.5, 0.5, 0.2],
            [2.0, 0.0, 0.0],
        ] {
            assert!((hard_u.eval(p) - soft_u.eval(p)).abs() < EPS, "union k=0 at {p:?}");
            assert!((hard_i.eval(p) - soft_i.eval(p)).abs() < EPS, "inter k=0 at {p:?}");
            assert!((hard_d.eval(p) - soft_d.eval(p)).abs() < EPS, "diff k=0 at {p:?}");
        }
    }

    /// Spike-C invariant: the polynomial smooth-union fillet throat is exactly k/4
    /// below the corner at the seam (where the two distances are equal). Sample two
    /// coincident planes (a == b everywhere) so the seam is the whole field.
    #[test]
    fn smooth_union_fillet_bulge_is_k_over_4() {
        let k = 0.8;
        // Two identical fields: smin(a, a, k) = a - k/4 at the seam.
        for &(a, b) in &[(0.0, 0.0), (1.0, 1.0), (-2.0, -2.0), (3.5, 3.5)] {
            let s = operators::smooth_union(a, b, k);
            assert!(
                (s - (a - k / 4.0)).abs() < 1e-12,
                "smin seam must be a - k/4: got {s} expected {}",
                a - k / 4.0
            );
        }
    }

    #[test]
    fn bounds_are_conservative_no_crossing_outside() {
        // Sample a margin outside the reported bounds and assert the field is
        // strictly positive there (the surface is fully contained).
        let exprs: Vec<Expr> = vec![
            Expr::Sphere { r: 1.3 },
            Expr::Box { half: [1.0, 0.5, 2.0] },
            Expr::RoundBox { half: [1.0, 1.0, 1.0], r: 0.3 },
            Expr::Cylinder { r: 1.0, h: 3.0 },
            Expr::Cone { r: 1.0, h: 2.0 },
            Expr::Torus { major: 2.0, minor: 0.6 },
            Expr::Capsule { a: [-1.0, 0.0, 0.0], b: [1.0, 0.5, 0.0], r: 0.4 },
            Expr::Union(
                Box::new(Expr::Sphere { r: 1.0 }),
                Box::new(Expr::Translate {
                    e: Box::new(Expr::Sphere { r: 1.0 }),
                    t: [1.5, 0.0, 0.0],
                }),
            ),
            Expr::SmoothUnion {
                a: Box::new(Expr::Sphere { r: 1.0 }),
                b: Box::new(Expr::Translate {
                    e: Box::new(Expr::Sphere { r: 1.0 }),
                    t: [1.5, 0.0, 0.0],
                }),
                k: 0.5,
            },
            Expr::Translate {
                e: Box::new(Expr::Box { half: [1.0, 1.0, 1.0] }),
                t: [3.0, -2.0, 1.0],
            },
            Expr::Rotate {
                e: Box::new(Expr::Box { half: [2.0, 0.5, 0.5] }),
                axis: [0.2, 1.0, 0.3],
                angle: 0.7,
            },
            Expr::Scale {
                e: Box::new(Expr::Sphere { r: 1.0 }),
                s: 1.7,
            },
            Expr::Shell {
                e: Box::new(Expr::Sphere { r: 1.0 }),
                t: 0.2,
            },
            Expr::Offset {
                e: Box::new(Expr::Box { half: [1.0, 1.0, 1.0] }),
                d: 0.5,
            },
        ];
        for expr in &exprs {
            let b = expr.bounds();
            // Just outside each face of the bounds, the field must be positive
            // (no zero-crossing escapes the box).
            let margin = 1e-3;
            let samples = [
                [b.min[0] - margin, (b.min[1] + b.max[1]) * 0.5, (b.min[2] + b.max[2]) * 0.5],
                [b.max[0] + margin, (b.min[1] + b.max[1]) * 0.5, (b.min[2] + b.max[2]) * 0.5],
                [(b.min[0] + b.max[0]) * 0.5, b.min[1] - margin, (b.min[2] + b.max[2]) * 0.5],
                [(b.min[0] + b.max[0]) * 0.5, b.max[1] + margin, (b.min[2] + b.max[2]) * 0.5],
                [(b.min[0] + b.max[0]) * 0.5, (b.min[1] + b.max[1]) * 0.5, b.min[2] - margin],
                [(b.min[0] + b.max[0]) * 0.5, (b.min[1] + b.max[1]) * 0.5, b.max[2] + margin],
            ];
            for s in samples {
                assert!(
                    expr.eval(s) > 0.0,
                    "field must be positive outside bounds at {s:?} (got {})",
                    expr.eval(s)
                );
            }
        }
    }

    fn straight_z_spine(n: usize, h: f64) -> Vec<[f64; 3]> {
        (0..=n)
            .map(|i| [0.0, 0.0, -h * 0.5 + h * (i as f64 / n as f64)])
            .collect()
    }

    /// A CIRCLE profile (a Sphere reads `hypot(u,v) - r` in-plane) swept along a
    /// STRAIGHT spine must match the Cylinder primitive near the surface.
    #[test]
    fn circle_swept_straight_matches_cylinder() {
        let r = 0.7;
        let h = 4.0;
        let spine = straight_z_spine(8, h);
        let sweep = Expr::Sweep {
            curve: SweptCurve::new(&spine, false),
            profile: Box::new(Expr::Sphere { r }),
        };
        let cyl = Expr::Cylinder { r, h };

        // Sample on/near the side wall at several heights and angles.
        for &z in &[-1.0, 0.0, 1.0] {
            for k in 0..8 {
                let a = k as f64 * PI / 4.0;
                let p = [r * a.cos(), r * a.sin(), z];
                let ds = sweep.eval(p);
                let dc = cyl.eval(p);
                assert!(
                    (ds - dc).abs() < 0.05,
                    "side wall sweep {ds} vs cylinder {dc} at {p:?}"
                );
                // Interior negative, exterior positive.
                assert!(sweep.eval([0.0, 0.0, z]) < 0.0, "axis interior");
                assert!(sweep.eval([r * 2.0, 0.0, z]) > 0.0, "outside positive");
            }
        }
        // End cap: a point past z = +h/2 must be outside.
        assert!(sweep.eval([0.0, 0.0, h]) > 0.0, "past end cap is outside");
        assert!(sweep.eval([0.0, 0.0, 0.0]) < 0.0, "core interior");
    }

    /// A circle swept along an ARC spine: points on the expected tube surface read
    /// ~0, interior < 0, exterior > 0.
    #[test]
    fn circle_swept_arc_tube_signs() {
        let major = 3.0;
        let r = 0.5;
        // Quarter-circle arc of radius `major` in the XY plane.
        let mut spine = Vec::new();
        let steps = 24;
        for i in 0..=steps {
            let a = (i as f64 / steps as f64) * (PI / 2.0);
            spine.push([major * a.cos(), major * a.sin(), 0.0]);
        }
        let sweep = Expr::Sweep {
            curve: SweptCurve::new(&spine, false),
            profile: Box::new(Expr::Sphere { r }),
        };

        // Mid-arc station (45°): the spine point and offsets from it.
        let am = PI / 4.0;
        let center = [major * am.cos(), major * am.sin(), 0.0];
        // On the tube surface: offset by r in +z (perpendicular to the planar arc).
        let on = [center[0], center[1], r];
        assert!(sweep.eval(on).abs() < 0.06, "on tube surface ~0: {}", sweep.eval(on));
        // Interior: the spine point itself.
        assert!(sweep.eval(center) < 0.0, "tube core interior");
        // Exterior: far above.
        let out = [center[0], center[1], r * 3.0];
        assert!(sweep.eval(out) > 0.0, "outside tube positive");
    }

    /// An ASYMMETRIC profile (a thin in-plane box) follows the frame orientation:
    /// along a straight +Z spine the box's wide axis stays along the frame normal,
    /// so the swept solid is wider along one in-plane axis than the other.
    #[test]
    fn asymmetric_profile_follows_frame() {
        let spine = straight_z_spine(6, 3.0);
        let curve = SweptCurve::new(&spine, false);
        let f = curve.frames()[3];
        // A box half [0.4, 0.15] in-plane (z half large so it never caps here).
        let sweep = Expr::Sweep {
            curve,
            profile: Box::new(Expr::Box {
                half: [0.4, 0.15, 10.0],
            }),
        };
        // Step along the frame normal (the profile's local x) vs binormal (local y).
        let mid = [0.0, 0.0, 0.0];
        let along_n = [
            mid[0] + f.normal[0] * 0.3,
            mid[1] + f.normal[1] * 0.3,
            mid[2] + f.normal[2] * 0.3,
        ];
        let along_b = [
            mid[0] + f.binormal[0] * 0.3,
            mid[1] + f.binormal[1] * 0.3,
            mid[2] + f.binormal[2] * 0.3,
        ];
        // 0.3 is inside the 0.4 half along the normal, but outside the 0.15 half
        // along the binormal — the asymmetry must show through the frame.
        assert!(sweep.eval(along_n) < 0.0, "inside wide (normal) axis");
        assert!(sweep.eval(along_b) > 0.0, "outside narrow (binormal) axis");
    }

    /// A point on-axis just past an open cap must read EXTERIOR. The earlier end-cap
    /// form `outside + dp.min(0)` wrongly reported it interior (the solid leaked past
    /// its flat cap by the profile's interior depth).
    #[test]
    fn open_cap_just_past_is_exterior() {
        let r = 0.7;
        let h = 4.0;
        let sweep = Expr::Sweep {
            curve: SweptCurve::new(&straight_z_spine(8, h), false),
            profile: Box::new(Expr::Sphere { r }),
        };
        // On-axis (deep inside the profile in-plane, dp = -r) but just past the cap.
        for &eps in &[0.01, 0.1, 0.4] {
            let p = [0.0, 0.0, h * 0.5 + eps];
            assert!(sweep.eval(p) > 0.0, "on-axis {eps} past cap must be exterior: {}", sweep.eval(p));
        }
        // Just INSIDE the cap stays interior.
        assert!(sweep.eval([0.0, 0.0, h * 0.5 - 0.1]) < 0.0, "just inside the cap is interior");
    }

    /// `bounds()` must use the diagonal profile reach: a box profile on a frame
    /// rotated ~45° in world XY puts its corner at hypot(rx,ry) ≈ √2·half from the
    /// spine. A per-axis pad cropped that corner and truncated the swept wall.
    #[test]
    fn sweep_bounds_contains_rotated_profile_corner() {
        // Straight +Z spine, but rotate the whole sweep 45° about Z so the box's
        // in-plane axes are diagonal to world X/Y.
        let half = [1.0_f64, 0.6, 10.0];
        let inner = Expr::Sweep {
            curve: SweptCurve::new(&straight_z_spine(6, 3.0), false),
            profile: Box::new(Expr::Box { half }),
        };
        let rotated = Expr::Rotate {
            e: Box::new(inner),
            axis: [0.0, 0.0, 1.0],
            angle: PI / 4.0,
        };
        let b = rotated.bounds();
        // The profile's farthest corner is hypot(1.0, 0.6) ≈ 1.166 from the axis.
        let corner = (half[0] * half[0] + half[1] * half[1]).sqrt();
        assert!(
            b.max[0] >= corner - 1e-6 && b.max[1] >= corner - 1e-6,
            "bounds {b:?} must reach the diagonal corner {corner}"
        );
        // No zero-crossing outside the reported bounds: sample just beyond +X.
        let outside = [b.max[0] + 0.25, 0.0, 0.0];
        assert!(rotated.eval(outside) > 0.0, "field positive just outside bounds");
    }

    /// A circle swept along a CLOSED non-planar loop: the closure correction keeps
    /// the frame seamless, so the swept tube is watertight in sign — interior < 0,
    /// on-surface ~0, exterior > 0 — with no twist seam at the wrap segment.
    #[test]
    fn closed_sweep_tube_signs_and_continuity() {
        let major = 3.0;
        let r = 0.5;
        let tilt = 0.6; // non-planar: z wobbles so holonomy is non-trivial.
        let steps = 48;
        let spine: Vec<[f64; 3]> = (0..steps)
            .map(|i| {
                let a = (i as f64 / steps as f64) * 2.0 * PI;
                [major * a.cos(), major * a.sin(), tilt * (2.0 * a).sin()]
            })
            .collect();
        let curve = SweptCurve::new(&spine, true);

        // Every frame stays orthonormal after the closure correction.
        for fr in curve.frames() {
            assert!((dot3(fr.tangent, fr.normal)).abs() < 1e-6, "t·n ~ 0");
            assert!((dot3(fr.normal, fr.binormal)).abs() < 1e-6, "n·b ~ 0");
            assert!((dot3(fr.normal, fr.normal) - 1.0).abs() < 1e-6, "n unit");
        }
        // Adjacent normals (including the wrap segment) turn smoothly — no seam.
        let fs = curve.frames();
        for i in 0..fs.len() {
            let j = (i + 1) % fs.len();
            assert!(dot3(fs[i].normal, fs[j].normal) > 0.3, "no frame seam at {i}->{j}");
        }

        let sweep = Expr::Sweep {
            curve,
            profile: Box::new(Expr::Sphere { r }),
        };
        // Interior (a spine point), surface (offset by r), exterior (far) at a station.
        let a = 0.7_f64;
        let c = [major * a.cos(), major * a.sin(), tilt * (2.0 * a).sin()];
        assert!(sweep.eval(c) < 0.0, "closed tube core interior");
        let out = [major * 1.5, 0.0, 0.0];
        assert!(sweep.eval(out) > 0.0, "outside closed tube positive");
    }

    /// A FLAT circle has holonomy θ ≈ 2π, so with few stations a wrong denominator
    /// (spreading θ over n instead of n-1 intervals) leaves a large kink on the wrap
    /// segment. The corrected frame must close: every adjacent pair, INCLUDING the
    /// wrap (n-1 → 0), turns by the same small step.
    #[test]
    fn closed_sweep_flat_circle_closes_at_wrap() {
        let major = 3.0;
        let steps = 8; // few stations: θ/n would be ~45°, θ/(n-1) closes it.
        let spine: Vec<[f64; 3]> = (0..steps)
            .map(|i| {
                let a = (i as f64 / steps as f64) * 2.0 * PI;
                [major * a.cos(), major * a.sin(), 0.0]
            })
            .collect();
        let fs = SweptCurve::new(&spine, true);
        let frames = fs.frames();
        // The per-step turn between consecutive frames (incl. the wrap) is uniform.
        let n = frames.len();
        let step_dot = dot3(frames[0].normal, frames[1].normal);
        for i in 0..n {
            let j = (i + 1) % n;
            let d = dot3(frames[i].normal, frames[j].normal);
            assert!(
                (d - step_dot).abs() < 0.1,
                "wrap seam at {i}->{j}: dot {d} vs uniform {step_dot}"
            );
        }
    }

    fn dot3(a: [f64; 3], b: [f64; 3]) -> f64 {
        a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    }

    // ── Position-modulated field operators (Phase 2b) ──

    /// ADDITIVE PARITY: an `OffsetField` driven by `Const(d)` is bit-identical to the
    /// constant `Offset { d }` everywhere — a modulated op with a constant field
    /// reproduces the constant op exactly.
    #[test]
    fn offset_field_const_equals_constant_offset() {
        let d = 0.37;
        let base = Expr::Box { half: [1.0, 0.8, 1.2] };
        let modulated = Expr::OffsetField {
            e: Box::new(base.clone()),
            d: ScalarField::Const(d),
        };
        let constant = Expr::Offset {
            e: Box::new(base),
            d,
        };
        for &p in &[
            [0.0, 0.0, 0.0],
            [0.5, -0.3, 0.7],
            [1.5, 1.0, -0.4],
            [-2.0, 0.2, 0.9],
            [0.1, 0.1, 0.1],
        ] {
            assert_eq!(
                modulated.eval(p),
                constant.eval(p),
                "OffsetField(Const) must equal Offset at {p:?}"
            );
        }
    }

    /// ADDITIVE PARITY for the smooth blend: `SmoothUnionField` with `Const(k)` equals
    /// the constant `SmoothUnion { k }` everywhere.
    #[test]
    fn smooth_union_field_const_equals_constant() {
        let k = 0.6;
        let a = Expr::Sphere { r: 1.0 };
        let b = Expr::Translate {
            e: Box::new(Expr::Sphere { r: 1.0 }),
            t: [1.3, 0.0, 0.0],
        };
        let modulated = Expr::SmoothUnionField {
            a: Box::new(a.clone()),
            b: Box::new(b.clone()),
            k: ScalarField::Const(k),
        };
        let constant = Expr::SmoothUnion {
            a: Box::new(a),
            b: Box::new(b),
            k,
        };
        for &p in &[
            [0.0, 0.0, 0.0],
            [0.65, 0.3, 0.1],
            [1.3, 0.0, 0.0],
            [-0.5, 0.5, 0.2],
            [2.0, 0.0, 0.0],
        ] {
            assert_eq!(
                modulated.eval(p),
                constant.eval(p),
                "SmoothUnionField(Const) must equal SmoothUnion at {p:?}"
            );
        }
    }

    /// SPIKE-C INVARIANT: a `ShellField` with an `AxialRamp` thickness rasterizes to
    /// exactly `|d(p)| − t(z)` — the base distance shelled by the per-position ramped
    /// thickness, to machine precision. Sample many points off a planar base
    /// (`eval = z`) and confirm the field equals `|z| − t(z)` at each.
    #[test]
    fn shell_field_axial_ramp_matches_thickness() {
        let base = Expr::Plane { n: [0.0, 0.0, 1.0], h: 0.0 };
        let t = ScalarField::AxialRamp {
            axis: 2,
            a: -2.0,
            b: 2.0,
            lo: 0.2,
            hi: 0.5,
        };
        let shell = Expr::ShellField {
            e: Box::new(base),
            t: t.clone(),
        };
        for &z in &[-1.5_f64, -0.4, 0.0, 0.3, 0.6, 1.0, 1.4] {
            let p = [0.7, -0.2, z];
            let expected = z.abs() - t.eval(p);
            assert!(
                (shell.eval(p) - expected).abs() < 1e-12,
                "ShellField = |z| − t(z) at z={z}: got {} expected {expected}",
                shell.eval(p)
            );
        }
    }

    /// CONSERVATIVE BOUNDS: a ramp-modulated `ShellField` must report a box that
    /// contains the whole wall — no zero-crossing just outside any face.
    #[test]
    fn shell_field_bounds_conservative() {
        let base = Expr::Sphere { r: 1.0 };
        let shell = Expr::ShellField {
            e: Box::new(base),
            t: ScalarField::AxialRamp {
                axis: 2,
                a: -1.0,
                b: 1.0,
                lo: 0.1,
                hi: 0.6,
            },
        };
        let b = shell.bounds();
        let margin = 1e-3;
        let samples = [
            [b.min[0] - margin, 0.0, 0.0],
            [b.max[0] + margin, 0.0, 0.0],
            [0.0, b.min[1] - margin, 0.0],
            [0.0, b.max[1] + margin, 0.0],
            [0.0, 0.0, b.min[2] - margin],
            [0.0, 0.0, b.max[2] + margin],
        ];
        for s in samples {
            assert!(
                shell.eval(s) > 0.0,
                "field must be positive outside bounds at {s:?} (got {})",
                shell.eval(s)
            );
        }
    }

    /// An unbounded `FromSdf` makes a bounds-affecting op report the infinite box;
    /// wrapping it in `Clamp` restores a finite, conservative bound.
    #[test]
    fn from_sdf_field_bounds_unbounded_then_clamped() {
        let base = Expr::Sphere { r: 1.0 };
        let driver = Expr::Sphere { r: 0.5 };
        let unbounded = Expr::OffsetField {
            e: Box::new(base.clone()),
            d: ScalarField::FromSdf {
                e: Box::new(driver.clone()),
                scale: 1.0,
                offset: 0.0,
            },
        };
        let ub = unbounded.bounds();
        assert!(ub.max[0] >= 1.0e9, "unclamped FromSdf must report infinite bounds");

        let clamped = Expr::OffsetField {
            e: Box::new(base),
            d: ScalarField::Clamp {
                f: Box::new(ScalarField::FromSdf {
                    e: Box::new(driver),
                    scale: 1.0,
                    offset: 0.0,
                }),
                min: 0.0,
                max: 0.3,
            },
        };
        let cb = clamped.bounds();
        assert!(cb.max[0] < 1.0e9, "clamped FromSdf must report finite bounds");
        // base sphere (r=1) grown by at most 0.3 → reaches ~1.3; box must contain it.
        assert!(cb.max[0] >= 1.3 - 1e-9, "clamped bound must reach the grown surface");
    }

    /// A field-modulated shell rasterizes and contours to a WATERTIGHT mesh.
    #[test]
    fn shell_field_rasterizes_watertight() {
        use super::super::rasterize;
        use crate::contour::surface_nets_mesh;
        use std::collections::HashMap;

        let shell = Expr::ShellField {
            e: Box::new(Expr::Sphere { r: 1.2 }),
            t: ScalarField::AxialRamp {
                axis: 2,
                a: -1.2,
                b: 1.2,
                lo: 0.12,
                hi: 0.3,
            },
        };
        let grid = rasterize(&shell, shell.bounds(), 36, 3).unwrap();
        let mesh = surface_nets_mesh(&grid);
        assert!(!mesh.positions.is_empty(), "modulated shell must contour to vertices");
        assert!(!mesh.indices.is_empty(), "modulated shell must contour to triangles");

        let mut edges: HashMap<(u32, u32), i32> = HashMap::new();
        for tri in mesh.indices.chunks_exact(3) {
            for &(a, b) in &[(tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])] {
                let key = if a < b { (a, b) } else { (b, a) };
                *edges.entry(key).or_insert(0) += 1;
            }
        }
        assert!(
            edges.values().all(|&c| c == 2),
            "field-modulated shell contour must be watertight"
        );
    }

    // ── Lattices (Phase 2c) ──

    fn watertight(indices: &[u32]) -> bool {
        use std::collections::HashMap;
        let mut edges: HashMap<(u32, u32), i32> = HashMap::new();
        for tri in indices.chunks_exact(3) {
            for &(a, b) in &[(tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])] {
                let key = if a < b { (a, b) } else { (b, a) };
                *edges.entry(key).or_insert(0) += 1;
            }
        }
        edges.values().all(|&c| c == 2)
    }

    /// A const-thickness TPMS lattice clipped to a box rasterizes and contours to a
    /// non-empty mesh, with both strut (interior) and void (exterior) present inside
    /// the clip region, and is WATERTIGHT across a usable resolution band.
    ///
    /// Watertightness of a clipped TPMS lattice is RESOLUTION-SENSITIVE, not an
    /// unconditional guarantee: a box clip stays watertight only when the clip planes
    /// land cleanly between lattice walls. These params/clip are watertight across
    /// res 44–64 but NOT at res 40 (where a clip plane grazes a strut and surface-nets
    /// emits a non-manifold seam). The test sweeps the band so it proves a reliable
    /// usable range, not a single lucky resolution. A high-genus jacket conformed to a
    /// curved wall presents far more near-tangential grazes against ANY clip, which is
    /// why `chamber_v1` cannot be gated on watertight (see `sdf::tests::chamber_v1_*`).
    #[test]
    fn tpms_lattice_clipped_contours_watertight_with_strut_and_void() {
        use super::super::rasterize;
        use crate::contour::surface_nets_mesh;

        let lattice = Expr::Lattice {
            kind: LatticeType::Gyroid,
            period: ScalarField::Const(1.2),
            thickness: ScalarField::Const(0.6),
        };
        let region = Expr::Box {
            half: [1.2, 1.2, 1.2],
        };
        let conformal = Expr::Intersection(Box::new(lattice), Box::new(region));

        // The bare lattice is infinite; the clipped region drives the grid bounds.
        let bounds = conformal.bounds();
        assert!(bounds.max[0] < 1.0e9, "clipped lattice must be finite");

        // Both strut and void inside the region (sample the raw lattice field).
        let raw = Expr::Lattice {
            kind: LatticeType::Gyroid,
            period: ScalarField::Const(1.2),
            thickness: ScalarField::Const(0.6),
        };
        let mut has_neg = false;
        let mut has_pos = false;
        for k in 0..12 {
            for j in 0..12 {
                let p = [
                    -1.1 + 0.2 * k as f64,
                    -1.1 + 0.2 * j as f64,
                    0.1 * k as f64,
                ];
                let v = raw.eval(p);
                if v < 0.0 {
                    has_neg = true;
                } else if v > 0.0 {
                    has_pos = true;
                }
            }
        }
        assert!(has_neg, "lattice must have strut (negative) material");
        assert!(has_pos, "lattice must have void (positive) space");

        for res in [44usize, 48, 52, 56, 64] {
            let grid = rasterize(&conformal, bounds, res, 3).unwrap();
            let mesh = surface_nets_mesh(&grid);
            assert!(
                !mesh.positions.is_empty(),
                "clipped lattice must contour to vertices at res {res}"
            );
            assert!(
                !mesh.indices.is_empty(),
                "clipped lattice must contour to triangles at res {res}"
            );
            assert!(
                watertight(&mesh.indices),
                "clipped TPMS lattice must be watertight at res {res}"
            );
        }
    }

    /// GRADED THICKNESS: a lattice whose thickness ramps with z has a wall half-width
    /// that tracks `½·t(z)`. At an on-surface point (`f ≈ 0`) the field reads
    /// `≈ −½·t(z)`, so the field gets more negative where the ramp is thicker.
    #[test]
    fn tpms_lattice_graded_thickness_tracks_ramp() {
        // Find a point where the gyroid nodal field is ~0 at two different z, then
        // confirm the field value there equals −½·t(z) for the ramped thickness.
        let period = 1.0;
        let thickness = ScalarField::AxialRamp {
            axis: 2,
            a: 0.0,
            b: 4.0,
            lo: 0.2,
            hi: 0.8,
        };
        let lattice = Expr::Lattice {
            kind: LatticeType::Gyroid,
            period: ScalarField::Const(period),
            thickness: thickness.clone(),
        };
        // For each z, find a point ON the minimal surface (raw nodal field = 0) by
        // scanning x for a sign change at fixed (y, z) then bisecting. On that point
        // the lattice field is `|0| − ½·t(z) = −½·t(z)`, so it must track the ramp.
        // At y = 0 the gyroid reduces to sin(kx) + sin(kz)·cos(kx); at z = 0.5 and 3.5
        // (period 1) the sin(kz) term vanishes, leaving sin(kx) — a clean crossing.
        for &z in &[0.5_f64, 3.5] {
            let y = 0.0;
            let raw = |x: f64| tpms_value_f64(LatticeType::Gyroid, [x, y, z], period);
            // Scan one period for a bracket containing a zero crossing.
            let mut lo = 0.0_f64;
            let mut hi = 0.0_f64;
            let mut found = false;
            let steps = 200;
            let mut prev_x = 0.0;
            for i in 1..=steps {
                let x = (i as f64 / steps as f64) * period;
                if raw(prev_x).signum() != raw(x).signum() {
                    lo = prev_x;
                    hi = x;
                    found = true;
                    break;
                }
                prev_x = x;
            }
            assert!(found, "gyroid must cross zero within one period at z={z}");
            for _ in 0..60 {
                let mid = 0.5 * (lo + hi);
                if raw(lo).signum() == raw(mid).signum() {
                    lo = mid;
                } else {
                    hi = mid;
                }
            }
            let xs = 0.5 * (lo + hi);
            let p = [xs, y, z];
            let expected = -0.5 * thickness.eval(p);
            assert!(
                (lattice.eval(p) - expected).abs() < 1e-3,
                "graded lattice on-surface = −½·t(z) at z={z}: got {} expected {expected}",
                lattice.eval(p)
            );
        }
        // The thicker end is more deeply negative on-surface than the thin end.
        let thin_half = 0.5 * thickness.eval([0.0, 0.0, 0.5]);
        let thick_half = 0.5 * thickness.eval([0.0, 0.0, 3.5]);
        assert!(thick_half > thin_half, "ramp must widen the wall with z");
    }

    /// A graded (non-Const) period actually drives the field: the gyroid scale is
    /// `2π/period(p)`, so at a point where a ramped period differs from a constant one
    /// the lattice value differs. Guards that the period ScalarField is really sampled.
    #[test]
    fn lattice_graded_period_changes_the_field() {
        let thickness = ScalarField::Const(0.3);
        let graded = Expr::Lattice {
            kind: LatticeType::Gyroid,
            period: ScalarField::AxialRamp { axis: 2, a: 0.0, b: 4.0, lo: 1.0, hi: 3.0 },
            thickness: thickness.clone(),
        };
        // At z=3 the ramped period is 2.5; compare against a fixed period-1 lattice at a
        // point where the two scales disagree, so the eval must differ.
        let fixed = Expr::Lattice {
            kind: LatticeType::Gyroid,
            period: ScalarField::Const(1.0),
            thickness,
        };
        let p = [0.4, 0.6, 3.0];
        assert!(
            (graded.eval(p) - fixed.eval(p)).abs() > 1e-6,
            "graded period must change the field vs a constant period"
        );
    }

    /// A bare `Lattice` reports the infinite box; `Intersection(Lattice, box)` reports
    /// the box's own bounds — the conformal-clipping contract.
    #[test]
    fn lattice_bounds_infinite_but_intersection_is_finite() {
        let lattice = Expr::Lattice {
            kind: LatticeType::Diamond,
            period: ScalarField::Const(1.0),
            thickness: ScalarField::Const(0.3),
        };
        let lb = lattice.bounds();
        assert!(lb.max[0] >= 1.0e9, "bare lattice must report the infinite box");

        let region = Expr::Box {
            half: [2.0, 1.0, 0.5],
        };
        let clipped = Expr::Intersection(Box::new(lattice), Box::new(region.clone()));
        assert_eq!(
            clipped.bounds(),
            region.bounds(),
            "Intersection(Lattice, box) bounds must equal the box bounds"
        );
    }

    /// STRUT LATTICE: a point ON a strut axis reads interior (< 0), a point at the
    /// cell center reads exterior (> 0), and radius grading widens the strut (a point
    /// just off the axis flips from exterior to interior as the radius grows).
    #[test]
    fn strut_lattice_axis_interior_center_exterior_and_grades() {
        let period = 2.0;
        // A point on the z-axis strut through the origin (x=y=0): its distance to that
        // strut family is 0 — so it is inside any radius > 0.
        let on_axis = [0.0, 0.0, 0.7];
        // The cell center is offset per/2 on each of the two off-axis coords from the
        // nearest strut of each family, so its nearest-strut distance is per/√2 (≈0.707
        // at period 1) — the farthest interior point, hence exterior for thin radii.
        let center = [period * 0.5, period * 0.5, period * 0.5];

        let thin = Expr::StrutLattice {
            period,
            radius: ScalarField::Const(0.2),
        };
        assert!(thin.eval(on_axis) < 0.0, "on-axis must be inside the strut");
        assert!(thin.eval(center) > 0.0, "cell center must be exterior");

        // A point off ALL three strut families, at strut-distance hypot(0.25,0.25) ≈
        // 0.354: outside a 0.2 strut but inside a 0.5 one — radius widens the strut.
        let off = [0.25, 0.25, 0.5];
        assert!(thin.eval(off) > 0.0, "off-axis is outside a 0.2 strut");
        let thick = Expr::StrutLattice {
            period,
            radius: ScalarField::Const(0.5),
        };
        assert!(thick.eval(off) < 0.0, "radius grading must widen the strut");

        // A z-graded radius flips the same fixed-distance point. Keep the xy offsets
        // 0.25 each (z-strut distance 0.354, z-independent) and the z-offset >= 0.25
        // so the min strut distance stays 0.354 at both samples; only the radius moves.
        let graded = Expr::StrutLattice {
            period,
            radius: ScalarField::AxialRamp {
                axis: 2,
                a: 0.0,
                b: 1.0,
                lo: 0.2,
                hi: 0.5,
            },
        };
        assert!(graded.eval([0.25, 0.25, 0.3]) > 0.0, "thin end excludes the point");
        assert!(graded.eval([0.25, 0.25, 0.7]) < 0.0, "thick end includes the point");
    }

    /// A conformal (clipped) strut lattice contours to a non-empty, WATERTIGHT mesh.
    #[test]
    fn strut_lattice_clipped_contours_watertight() {
        use super::super::rasterize;
        use crate::contour::surface_nets_mesh;

        let lattice = Expr::StrutLattice {
            period: 1.0,
            radius: ScalarField::Const(0.18),
        };
        let region = Expr::Box {
            half: [1.5, 1.5, 1.5],
        };
        let conformal = Expr::Intersection(Box::new(lattice), Box::new(region));
        let bounds = conformal.bounds();
        let grid = rasterize(&conformal, bounds, 56, 3).unwrap();
        let mesh = surface_nets_mesh(&grid);
        assert!(!mesh.positions.is_empty(), "clipped strut lattice must contour");
        assert!(!mesh.indices.is_empty(), "clipped strut lattice must have triangles");
        assert!(watertight(&mesh.indices), "clipped strut lattice must be watertight");
    }
}
