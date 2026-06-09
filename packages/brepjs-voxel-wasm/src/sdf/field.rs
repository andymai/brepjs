//! Position-varying scalar fields (brepjs-implicit Phase 2b). A [`ScalarField`] is a
//! pure function `eval(p) -> f64` that an operator samples PER VOXEL, turning a
//! constant operator parameter (offset distance, shell thickness, smin blend width)
//! into one that varies across space — the basis for graded walls and tapered
//! fillets. A [`Const`] field reproduces the constant operator exactly.
//!
//! [`ScalarField::range`] returns a CONSERVATIVE `(min, max)` the field can return.
//! Bounds-affecting operators expand their child AABB by the range MAX (per Spike-C:
//! size the narrow band off the MAX of the modulated parameter, not a constant), so
//! the surface never escapes the rasterized grid.
//!
//! [`Const`]: ScalarField::Const

use super::expr::Expr;

/// A scalar value as a function of world position. `eval` is allocation-free.
#[derive(Clone, Debug)]
pub enum ScalarField {
    /// A spatially constant value — reproduces a constant operator parameter exactly.
    Const(f64),
    /// Linear interpolation `lo → hi` as `coord[axis]` goes `a → b`, CLAMPED to
    /// `[min(lo,hi), max(lo,hi)]` outside `[a, b]`.
    AxialRamp {
        axis: usize,
        a: f64,
        b: f64,
        lo: f64,
        hi: f64,
    },
    /// Value by radial distance from the axis-aligned line through `center` along
    /// `axis`: `lo → hi` as that distance goes `r0 → r1`, clamped likewise.
    RadialRamp {
        center: [f64; 3],
        axis: usize,
        r0: f64,
        r1: f64,
        lo: f64,
        hi: f64,
    },
    /// An [`Expr`]'s signed distance, affinely remapped: `e.eval(p) * scale + offset`.
    /// UNBOUNDED — its [`range`](ScalarField::range) is `(-∞, +∞)`, so a
    /// bounds-affecting operator modulated by a bare `FromSdf` must be rasterized with
    /// explicit bounds (`rasterize_in`) or the field wrapped in a [`Clamp`] to bound it.
    FromSdf {
        e: Box<Expr>,
        scale: f64,
        offset: f64,
    },
    /// Clamp another field's value to `[min, max]`. Makes an otherwise unbounded field
    /// (a [`FromSdf`](ScalarField::FromSdf)) safe to drive a bounds-affecting operator.
    Clamp {
        f: Box<ScalarField>,
        min: f64,
        max: f64,
    },
}

/// Linear interpolation of `lo → hi` over `[a, b]`, clamped to the endpoint band
/// outside. A degenerate `a == b` collapses to the nearer endpoint.
fn ramp(t: f64, a: f64, b: f64, lo: f64, hi: f64) -> f64 {
    let (rlo, rhi) = (lo.min(hi), lo.max(hi));
    if (b - a).abs() <= f64::MIN_POSITIVE {
        return if t <= a { lo } else { hi }.clamp(rlo, rhi);
    }
    let s = (t - a) / (b - a);
    (lo + (hi - lo) * s).clamp(rlo, rhi)
}

impl ScalarField {
    /// The scalar value of this field at world point `p`.
    pub fn eval(&self, p: [f64; 3]) -> f64 {
        match self {
            ScalarField::Const(c) => *c,
            ScalarField::AxialRamp { axis, a, b, lo, hi } => ramp(p[*axis], *a, *b, *lo, *hi),
            ScalarField::RadialRamp {
                center,
                axis,
                r0,
                r1,
                lo,
                hi,
            } => {
                let mut sq = 0.0;
                for d in 0..3 {
                    if d != *axis {
                        let dd = p[d] - center[d];
                        sq += dd * dd;
                    }
                }
                ramp(sq.sqrt(), *r0, *r1, *lo, *hi)
            }
            ScalarField::FromSdf { e, scale, offset } => e.eval(p) * scale + offset,
            ScalarField::Clamp { f, min, max } => f.eval(p).clamp(*min, *max),
        }
    }

    /// A CONSERVATIVE `(min, max)` the field can return, used by bounds-affecting
    /// operators to expand their child AABB. An unbounded [`FromSdf`](ScalarField::FromSdf)
    /// returns `(-∞, +∞)`.
    pub fn range(&self) -> (f64, f64) {
        match self {
            ScalarField::Const(c) => (*c, *c),
            ScalarField::AxialRamp { lo, hi, .. } => (lo.min(*hi), lo.max(*hi)),
            ScalarField::RadialRamp { lo, hi, .. } => (lo.min(*hi), lo.max(*hi)),
            ScalarField::FromSdf { .. } => (f64::NEG_INFINITY, f64::INFINITY),
            ScalarField::Clamp { min, max, .. } => (*min, *max),
        }
    }
}
