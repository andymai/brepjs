//! Analytic SDF expression tree (ADR-0013 field-first path). An [`Expr`] composes
//! exact-distance primitives, CSG/smooth operators, and domain transforms into a
//! pure function `eval(p) -> signed distance`, plus a conservative analytic
//! [`Aabb`] so the rasterizer can size a grid without sampling.

use super::operators;
use super::primitives;

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

            Expr::Translate { e, t } => e.bounds().translate(*t),
            Expr::Rotate { e, axis, angle } => e.bounds().rotate(*axis, *angle),
            Expr::Scale { e, s } => e.bounds().scale(s.abs().max(f64::MIN_POSITIVE)),
        }
    }
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
}
