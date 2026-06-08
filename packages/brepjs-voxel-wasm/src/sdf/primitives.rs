//! Exact-distance SDF primitive functions (Inigo Quilez catalog), centered at the
//! origin unless noted. All `f64`, allocation-free, so the [`super::expr::Expr`]
//! evaluator can call them on the hot voxel loop without per-cell heap traffic.

/// Length of a 3-vector.
#[inline]
fn len(v: [f64; 3]) -> f64 {
    (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt()
}

#[inline]
fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

#[inline]
fn sub(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/// Signed distance to a sphere of radius `r`.
#[inline]
pub fn sphere(p: [f64; 3], r: f64) -> f64 {
    len(p) - r
}

/// Signed distance to an axis-aligned box of half-extents `half`.
#[inline]
pub fn box_sdf(p: [f64; 3], half: [f64; 3]) -> f64 {
    let q = [
        p[0].abs() - half[0],
        p[1].abs() - half[1],
        p[2].abs() - half[2],
    ];
    let outside = len([q[0].max(0.0), q[1].max(0.0), q[2].max(0.0)]);
    let inside = q[0].max(q[1]).max(q[2]).min(0.0);
    outside + inside
}

/// Signed distance to a box with rounded edges of radius `r`.
#[inline]
pub fn round_box(p: [f64; 3], half: [f64; 3], r: f64) -> f64 {
    box_sdf(p, half) - r
}

/// Signed distance to a capped cylinder, axis +Z, radius `r`, total height `h`
/// (centered at the origin, so it spans z ∈ [-h/2, h/2]).
#[inline]
pub fn cylinder(p: [f64; 3], r: f64, h: f64) -> f64 {
    let d_radial = (p[0] * p[0] + p[1] * p[1]).sqrt() - r;
    let d_axial = p[2].abs() - h * 0.5;
    let outside = (d_radial.max(0.0).powi(2) + d_axial.max(0.0).powi(2)).sqrt();
    let inside = d_radial.max(d_axial).min(0.0);
    outside + inside
}

/// Signed distance to a capped cone, axis +Z, base radius `r` at z = -h/2 tapering
/// to a point at z = +h/2 (total height `h`, centered at the origin). Robust IQ
/// capped-cone form (`sdConeBound`-free exact variant) reduced to a 2D profile in
/// (radial, axial): the convex region bounded by the base cap segment and the
/// slant edge, signed by which side of those two edges the point lies on.
#[inline]
pub fn cone(p: [f64; 3], r: f64, h: f64) -> f64 {
    let qx = (p[0] * p[0] + p[1] * p[1]).sqrt();
    let qy = p[2];
    let half_h = h * 0.5;

    // Base cap segment: (0,-h/2) → (r,-h/2). Distance to it.
    let cap_x = qx - qx.clamp(0.0, r);
    let cap_y = qy + half_h;
    let dist_cap = cap_x * cap_x + cap_y * cap_y;

    // Slant edge: base (r,-h/2) → apex (0,+h/2). Distance to it.
    let (ax, ay) = (r, -half_h);
    let (ex, ey) = (-r, h); // edge vector b - a
    let pax = qx - ax;
    let pay = qy - ay;
    let t = ((pax * ex + pay * ey) / (ex * ex + ey * ey)).clamp(0.0, 1.0);
    let sx = qx - (ax + ex * t);
    let sy = qy - (ay + ey * t);
    let dist_slant = sx * sx + sy * sy;

    let dist = dist_cap.min(dist_slant).sqrt();

    // Inside when above the base cap plane AND on the interior side of the slant
    // edge (the cross product of the edge with the point vector is positive).
    let above_base = qy + half_h; // > 0 above the base plane
    let inside_slant = ex * pay - ey * pax; // > 0 on the axis side of the slant
    let inside = above_base > 0.0 && inside_slant > 0.0;
    if inside {
        -dist
    } else {
        dist
    }
}

/// Signed distance to a capsule (line segment `a`→`b`, radius `r`).
#[inline]
pub fn capsule(p: [f64; 3], a: [f64; 3], b: [f64; 3], r: f64) -> f64 {
    let pa = sub(p, a);
    let ba = sub(b, a);
    let denom = dot(ba, ba);
    let t = if denom > 0.0 {
        (dot(pa, ba) / denom).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let proj = [a[0] + ba[0] * t, a[1] + ba[1] * t, a[2] + ba[2] * t];
    len(sub(p, proj)) - r
}

/// Signed distance to a torus in the XY plane (axis +Z): tube of `minor` radius
/// swept around a circle of `major` radius.
#[inline]
pub fn torus(p: [f64; 3], major: f64, minor: f64) -> f64 {
    let q_x = (p[0] * p[0] + p[1] * p[1]).sqrt() - major;
    (q_x * q_x + p[2] * p[2]).sqrt() - minor
}

/// Signed distance to a half-space: the plane through `h·n` with outward normal
/// `n` (assumed unit length). Negative on the `-n` side.
#[inline]
pub fn plane(p: [f64; 3], n: [f64; 3], h: f64) -> f64 {
    dot(p, n) - h
}
