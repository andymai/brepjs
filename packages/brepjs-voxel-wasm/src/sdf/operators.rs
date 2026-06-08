//! SDF combinator distance functions (Inigo Quilez catalog). Hard CSG ops plus
//! the polynomial smooth-min family, where `k = 0` reproduces the hard op exactly.

/// Hard union: nearer surface wins.
#[inline]
pub fn union(a: f64, b: f64) -> f64 {
    a.min(b)
}

/// Hard intersection.
#[inline]
pub fn intersection(a: f64, b: f64) -> f64 {
    a.max(b)
}

/// Hard difference `a − b`.
#[inline]
pub fn difference(a: f64, b: f64) -> f64 {
    a.max(-b)
}

/// Polynomial smooth-min (IQ): blends the two surfaces over a width `k`, leaving a
/// fillet whose throat is exactly `k/4` below the unblended corner at the seam
/// (`a == b`). `k <= 0` falls through to the hard `min`, so the smooth ops degrade
/// to their hard counterparts at `k = 0` bit-exactly.
#[inline]
pub fn smooth_union(a: f64, b: f64, k: f64) -> f64 {
    if k <= 0.0 {
        return a.min(b);
    }
    let h = (0.5 + 0.5 * (b - a) / k).clamp(0.0, 1.0);
    // mix(b, a, h) - k*h*(1-h)
    (b * (1.0 - h) + a * h) - k * h * (1.0 - h)
}

/// Smooth intersection: the De Morgan dual of [`smooth_union`].
#[inline]
pub fn smooth_intersection(a: f64, b: f64, k: f64) -> f64 {
    if k <= 0.0 {
        return a.max(b);
    }
    let h = (0.5 - 0.5 * (b - a) / k).clamp(0.0, 1.0);
    (b * (1.0 - h) + a * h) + k * h * (1.0 - h)
}

/// Smooth difference `a − b`: smooth-intersect `a` with the complement of `b`.
#[inline]
pub fn smooth_difference(a: f64, b: f64, k: f64) -> f64 {
    if k <= 0.0 {
        return a.max(-b);
    }
    let h = (0.5 - 0.5 * (a + b) / k).clamp(0.0, 1.0);
    (a * (1.0 - h) + (-b) * h) + k * h * (1.0 - h)
}

/// Iso-level offset of the SDF value `d`: grow (`dist > 0`) or shrink (`dist < 0`) a surface.
#[inline]
pub fn offset(d: f64, dist: f64) -> f64 {
    d - dist
}

/// Round a surface by radius `r`: an outward iso-shift (same algebra as offset by `+r`)
/// that inflates the solid and rounds convex edges.
#[inline]
pub fn round(d: f64, r: f64) -> f64 {
    d - r
}

/// Shell of half-width `t` around the zero set: `|d| − t`.
#[inline]
pub fn shell(d: f64, t: f64) -> f64 {
    d.abs() - t
}

/// Onion: a hollow concentric shell of half-width `t` (alias of [`shell`]).
#[inline]
pub fn onion(d: f64, t: f64) -> f64 {
    d.abs() - t
}
