//! Least-squares fitting of analytic surfaces to mesh samples.
//!
//! Curved primitives (cylinder, cone, sphere, torus) are all surfaces of
//! revolution, so they share one path: every surface normal line crosses the
//! axis, which gives the axis from the sample normals; the meridian profile in
//! the axis frame (distance from the axis against height) then says which
//! primitive it is. A Levenberg-Marquardt pass on point distances refines the
//! result, so the approximate mesh normals only have to seed it.

use crate::math::{add, cross, dot, fit_plane, norm, normalize, scale, sub, sym_eigen, V3};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Surface {
    Plane {
        n: V3,
        d: f64,
    },
    /// Axis through `o` with unit direction `a`.
    Cylinder {
        o: V3,
        a: V3,
        r: f64,
    },
    /// Apex, unit axis pointing into the opening, half-angle in radians.
    Cone {
        apex: V3,
        a: V3,
        half_angle: f64,
    },
    Sphere {
        c: V3,
        r: f64,
    },
    Torus {
        c: V3,
        a: V3,
        major: f64,
        minor: f64,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Kind {
    Plane,
    Cylinder,
    Sphere,
    Cone,
    Torus,
}

impl Kind {
    pub fn name(self) -> &'static str {
        match self {
            Kind::Plane => "plane",
            Kind::Cylinder => "cylinder",
            Kind::Sphere => "sphere",
            Kind::Cone => "cone",
            Kind::Torus => "torus",
        }
    }
}

impl Surface {
    pub fn kind(&self) -> Kind {
        match self {
            Surface::Plane { .. } => Kind::Plane,
            Surface::Cylinder { .. } => Kind::Cylinder,
            Surface::Cone { .. } => Kind::Cone,
            Surface::Sphere { .. } => Kind::Sphere,
            Surface::Torus { .. } => Kind::Torus,
        }
    }

    /// Signed distance (positive on the side the parameterisation calls outside).
    pub fn signed_distance(&self, p: V3) -> f64 {
        match *self {
            Surface::Plane { n, d } => dot(n, p) - d,
            Surface::Cylinder { o, a, r } => radial(p, o, a).1 - r,
            Surface::Sphere { c, r } => norm(sub(p, c)) - r,
            Surface::Cone {
                apex,
                a,
                half_angle,
            } => {
                let (h, rho) = radial(p, apex, a);
                rho * half_angle.cos() - h * half_angle.sin()
            }
            Surface::Torus { c, a, major, minor } => {
                let (h, rho) = radial(p, c, a);
                (rho - major).hypot(h) - minor
            }
        }
    }

    pub fn distance(&self, p: V3) -> f64 {
        self.signed_distance(p).abs()
    }

    /// Within `eps` of where the normal is undefined (a cone's apex). A fitted
    /// apex sits a hair off the mesh's apex vertex, where the normal is noise.
    pub fn near_singular(&self, p: V3, eps: f64) -> bool {
        match *self {
            Surface::Cone { apex, .. } => norm(sub(p, apex)) <= eps,
            _ => false,
        }
    }

    /// Unit normal (gradient of the signed distance) at a point on or near the
    /// surface; `None` where it is undefined (on an axis, at a center or apex).
    pub fn normal(&self, p: V3) -> Option<V3> {
        match *self {
            Surface::Plane { n, .. } => Some(n),
            Surface::Sphere { c, .. } => normalize(sub(p, c)),
            Surface::Cylinder { o, a, .. } => {
                let v = sub(p, o);
                normalize(sub(v, scale(a, dot(v, a))))
            }
            Surface::Cone {
                apex,
                a,
                half_angle,
            } => {
                let v = sub(p, apex);
                let u = normalize(sub(v, scale(a, dot(v, a))))?;
                Some(sub(scale(u, half_angle.cos()), scale(a, half_angle.sin())))
            }
            Surface::Torus { c, a, major, .. } => {
                let v = sub(p, c);
                let u = normalize(sub(v, scale(a, dot(v, a))))?;
                normalize(sub(p, add(c, scale(u, major))))
            }
        }
    }

    /// Closest point on the surface (cone: on the nappe the axis points into).
    pub fn project(&self, p: V3) -> V3 {
        match *self {
            Surface::Plane { n, .. } => sub(p, scale(n, self.signed_distance(p))),
            Surface::Sphere { c, r } => match normalize(sub(p, c)) {
                Some(u) => add(c, scale(u, r)),
                None => add(c, [r, 0.0, 0.0]),
            },
            Surface::Cylinder { o, a, r } => {
                let v = sub(p, o);
                let h = dot(v, a);
                let radial_v = sub(v, scale(a, h));
                let u = normalize(radial_v).unwrap_or_else(|| any_perpendicular(a));
                add(add(o, scale(a, h)), scale(u, r))
            }
            Surface::Cone {
                apex,
                a,
                half_angle,
            } => {
                let v = sub(p, apex);
                let h = dot(v, a);
                let radial_v = sub(v, scale(a, h));
                let u = normalize(radial_v).unwrap_or_else(|| any_perpendicular(a));
                let g = add(scale(a, half_angle.cos()), scale(u, half_angle.sin()));
                let t = dot(v, g).max(0.0);
                add(apex, scale(g, t))
            }
            Surface::Torus { c, a, major, minor } => {
                let v = sub(p, c);
                let h = dot(v, a);
                let radial_v = sub(v, scale(a, h));
                let u = normalize(radial_v).unwrap_or_else(|| any_perpendicular(a));
                let spine = add(c, scale(u, major));
                let w = sub(p, spine);
                let dir = normalize(w).unwrap_or(a);
                add(spine, scale(dir, minor))
            }
        }
    }
}

/// (height along the axis, distance from the axis) of `p`.
fn radial(p: V3, o: V3, a: V3) -> (f64, f64) {
    let v = sub(p, o);
    let h = dot(v, a);
    (h, norm(sub(v, scale(a, h))))
}

fn any_perpendicular(a: V3) -> V3 {
    let helper = if a[0].abs() < 0.9 {
        [1.0, 0.0, 0.0]
    } else {
        [0.0, 1.0, 0.0]
    };
    normalize(cross(helper, a)).unwrap_or([0.0, 1.0, 0.0])
}

pub fn max_residual(s: &Surface, pts: &[V3]) -> f64 {
    pts.iter().map(|&p| s.distance(p)).fold(0.0, f64::max)
}

pub fn rms_residual(s: &Surface, pts: &[V3]) -> f64 {
    if pts.is_empty() {
        return 0.0;
    }
    (pts.iter()
        .map(|&p| s.signed_distance(p).powi(2))
        .sum::<f64>()
        / pts.len() as f64)
        .sqrt()
}

pub fn plane(pts: &[V3]) -> Option<Surface> {
    let (n, d) = fit_plane(pts.iter().map(|&p| (p, 1.0)))?;
    Some(Surface::Plane { n, d })
}

/// Solve a small dense system by Gaussian elimination with partial pivoting.
pub(crate) fn solve(mut m: Vec<Vec<f64>>, mut r: Vec<f64>) -> Option<Vec<f64>> {
    let n = r.len();
    let scale_ref = m.iter().flatten().map(|x| x.abs()).fold(0.0, f64::max);
    if scale_ref <= 0.0 {
        return None;
    }
    for col in 0..n {
        let piv = (col..n).max_by(|&a, &b| m[a][col].abs().total_cmp(&m[b][col].abs()))?;
        if m[piv][col].abs() < 1e-14 * scale_ref {
            return None;
        }
        m.swap(col, piv);
        r.swap(col, piv);
        let pivot_row = m[col].clone();
        for row in col + 1..n {
            let f = m[row][col] / pivot_row[col];
            for (cell, &p) in m[row].iter_mut().zip(pivot_row.iter()).skip(col) {
                *cell -= f * p;
            }
            r[row] -= f * r[col];
        }
    }
    let mut x = vec![0.0; n];
    for row in (0..n).rev() {
        let s: f64 = (row + 1..n).map(|k| m[row][k] * x[k]).sum();
        x[row] = (r[row] - s) / m[row][row];
    }
    Some(x)
}

/// Point closest (least squares) to all normal lines, with its RMS distance.
fn normal_line_focus(pts: &[V3], normals: &[V3]) -> Option<(V3, f64)> {
    let mut m = [[0.0; 3]; 3];
    let mut b = [0.0; 3];
    for (&p, &n) in pts.iter().zip(normals) {
        for i in 0..3 {
            for j in 0..3 {
                let pij = if i == j { 1.0 } else { 0.0 } - n[i] * n[j];
                m[i][j] += pij;
                b[i] += pij * p[j];
            }
        }
    }
    let (vals, _) = sym_eigen(m);
    if vals[0] < 1e-3 * vals[2] {
        return None;
    }
    let c = solve(m.iter().map(|r| r.to_vec()).collect(), b.to_vec())?;
    let c = [c[0], c[1], c[2]];
    let ss: f64 = pts
        .iter()
        .zip(normals)
        .map(|(&p, &n)| {
            let v = sub(c, p);
            let along = dot(v, n);
            dot(v, v) - along * along
        })
        .sum();
    Some((c, (ss.max(0.0) / pts.len() as f64).sqrt()))
}

/// Axis line that the normal lines cross, by alternating least squares on
/// Σ ((o - pᵢ)·(a × nᵢ))². Returns (point on axis, unit direction, rms).
fn revolution_axis(pts: &[V3], normals: &[V3], a0: V3) -> Option<(V3, V3, f64)> {
    let mut a = normalize(a0)?;
    let mut o = [0.0; 3];
    for _ in 0..40 {
        // o given a: least squares in the plane perpendicular to a.
        let (u, v) = (any_perpendicular(a), cross(a, any_perpendicular(a)));
        let mut m = [[0.0; 2]; 2];
        let mut r = [0.0; 2];
        for (&p, &n) in pts.iter().zip(normals) {
            let w = cross(a, n);
            let wu = dot(w, u);
            let wv = dot(w, v);
            let target = dot(p, w);
            m[0][0] += wu * wu;
            m[0][1] += wu * wv;
            m[1][1] += wv * wv;
            r[0] += wu * target;
            r[1] += wv * target;
        }
        m[1][0] = m[0][1];
        let det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
        if det.abs() < 1e-18 * (m[0][0] + m[1][1]).powi(2).max(f64::MIN_POSITIVE) {
            return None;
        }
        let x = (r[0] * m[1][1] - r[1] * m[0][1]) / det;
        let y = (m[0][0] * r[1] - m[1][0] * r[0]) / det;
        o = add(scale(u, x), scale(v, y));
        // a given o: smallest eigenvector of Σ m mᵀ with m = n × (o - p).
        let mut c = [[0.0; 3]; 3];
        for (&p, &n) in pts.iter().zip(normals) {
            let mm = cross(n, sub(o, p));
            for i in 0..3 {
                for j in 0..3 {
                    c[i][j] += mm[i] * mm[j];
                }
            }
        }
        let (_, vecs) = sym_eigen(c);
        let mut next = vecs[0];
        if dot(next, a) < 0.0 {
            next = scale(next, -1.0);
        }
        let moved = norm(sub(next, a));
        a = next;
        if moved < 1e-12 {
            break;
        }
    }
    let ss: f64 = pts
        .iter()
        .zip(normals)
        .map(|(&p, &n)| {
            let w = cross(a, n);
            let wl = norm(w);
            if wl < 1e-9 {
                0.0
            } else {
                (dot(sub(o, p), w) / wl).powi(2)
            }
        })
        .sum();
    Some((o, a, (ss / pts.len() as f64).sqrt()))
}

/// Kasa circle fit to 2D points: (center, radius).
fn circle_2d(pts: &[[f64; 2]]) -> Option<([f64; 2], f64)> {
    let mut m = vec![vec![0.0; 3]; 3];
    let mut r = vec![0.0; 3];
    for p in pts {
        let row = [p[0], p[1], 1.0];
        let z = p[0] * p[0] + p[1] * p[1];
        for i in 0..3 {
            for j in 0..3 {
                m[i][j] += row[i] * row[j];
            }
            r[i] += row[i] * z;
        }
    }
    let s = solve(m, r)?;
    let c = [s[0] / 2.0, s[1] / 2.0];
    let rad2 = s[2] + c[0] * c[0] + c[1] * c[1];
    (rad2 > 0.0).then(|| (c, rad2.sqrt()))
}

/// Candidate surfaces of revolution for the samples, before refinement.
fn revolution_candidates(pts: &[V3], normals: &[V3]) -> Vec<Surface> {
    let mut out = Vec::new();
    let scale_ref = {
        let b = crate::math::Bbox::of(pts);
        b.diag().max(f64::MIN_POSITIVE)
    };
    if let Some((c, rms)) = normal_line_focus(pts, normals) {
        let r = pts.iter().map(|&p| norm(sub(p, c))).sum::<f64>() / pts.len() as f64;
        if rms < 0.05 * r.max(scale_ref * 1e-3) {
            out.push(Surface::Sphere { c, r });
        }
    }
    let mut cov = [[0.0; 3]; 3];
    for n in normals {
        for i in 0..3 {
            for j in 0..3 {
                cov[i][j] += n[i] * n[j];
            }
        }
    }
    let (_, eig) = sym_eigen(cov);
    let mut axes: Vec<(V3, V3, f64)> = eig
        .iter()
        .filter_map(|&a0| revolution_axis(pts, normals, a0))
        .collect();
    axes.sort_by(|x, y| x.2.total_cmp(&y.2));
    for &(o, a, _) in axes.iter().take(2) {
        let prof: Vec<[f64; 2]> = pts
            .iter()
            .map(|&p| {
                let (h, rho) = radial(p, o, a);
                [rho, h]
            })
            .collect();
        let n = prof.len() as f64;
        let mean_rho = prof.iter().map(|q| q[0]).sum::<f64>() / n;
        out.push(Surface::Cylinder { o, a, r: mean_rho });
        // Cone: rho = m h + b by least squares.
        let mean_h = prof.iter().map(|q| q[1]).sum::<f64>() / n;
        let shh: f64 = prof.iter().map(|q| (q[1] - mean_h).powi(2)).sum();
        let shr: f64 = prof
            .iter()
            .map(|q| (q[1] - mean_h) * (q[0] - mean_rho))
            .sum();
        if shh > 0.0 {
            let m = shr / shh;
            if m.abs() > 1e-6 && m.abs() < 1e6 {
                let b = mean_rho - m * mean_h;
                let h_apex = -b / m;
                let dir = if m > 0.0 { a } else { scale(a, -1.0) };
                out.push(Surface::Cone {
                    apex: add(o, scale(a, h_apex)),
                    a: dir,
                    half_angle: m.abs().atan(),
                });
            }
        }
        if let Some((c2, rad)) = circle_2d(&prof) {
            let center = add(o, scale(a, c2[1]));
            if c2[0].abs() < 1e-3 * rad {
                out.push(Surface::Sphere { c: center, r: rad });
            } else {
                out.push(Surface::Torus {
                    c: center,
                    a,
                    major: c2[0].abs(),
                    minor: rad,
                });
            }
        }
    }
    out
}

fn pack(s: &Surface) -> Vec<f64> {
    match *s {
        Surface::Plane { n, d } => vec![n[0], n[1], n[2], d],
        Surface::Cylinder { o, a, r } => vec![o[0], o[1], o[2], a[0], a[1], a[2], r],
        Surface::Cone {
            apex,
            a,
            half_angle,
        } => vec![apex[0], apex[1], apex[2], a[0], a[1], a[2], half_angle],
        Surface::Sphere { c, r } => vec![c[0], c[1], c[2], r],
        Surface::Torus { c, a, major, minor } => {
            vec![c[0], c[1], c[2], a[0], a[1], a[2], major, minor]
        }
    }
}

/// Perturb `s` along parameter direction `k` by `eps` (axes rotate in their tangent plane).
fn perturbed(s: &Surface, k: usize, eps: f64) -> Surface {
    let rot = |a: V3, which: usize| -> V3 {
        let u = any_perpendicular(a);
        let v = cross(a, u);
        let t = if which == 0 { u } else { v };
        normalize(add(a, scale(t, eps))).unwrap_or(a)
    };
    let shift = |p: V3, i: usize| -> V3 {
        let mut q = p;
        q[i] += eps;
        q
    };
    match *s {
        Surface::Plane { n, d } => match k {
            0 | 1 => {
                let n2 = rot(n, k);
                Surface::Plane { n: n2, d }
            }
            _ => Surface::Plane { n, d: d + eps },
        },
        Surface::Sphere { c, r } => match k {
            0..=2 => Surface::Sphere { c: shift(c, k), r },
            _ => Surface::Sphere { c, r: r + eps },
        },
        Surface::Cylinder { o, a, r } => {
            let (u, v) = (any_perpendicular(a), cross(a, any_perpendicular(a)));
            match k {
                0 => Surface::Cylinder {
                    o: add(o, scale(u, eps)),
                    a,
                    r,
                },
                1 => Surface::Cylinder {
                    o: add(o, scale(v, eps)),
                    a,
                    r,
                },
                2 | 3 => Surface::Cylinder {
                    o,
                    a: rot(a, k - 2),
                    r,
                },
                _ => Surface::Cylinder { o, a, r: r + eps },
            }
        }
        Surface::Cone {
            apex,
            a,
            half_angle,
        } => match k {
            0..=2 => Surface::Cone {
                apex: shift(apex, k),
                a,
                half_angle,
            },
            3 | 4 => Surface::Cone {
                apex,
                a: rot(a, k - 3),
                half_angle,
            },
            _ => Surface::Cone {
                apex,
                a,
                half_angle: half_angle + eps,
            },
        },
        Surface::Torus { c, a, major, minor } => match k {
            0..=2 => Surface::Torus {
                c: shift(c, k),
                a,
                major,
                minor,
            },
            3 | 4 => Surface::Torus {
                c,
                a: rot(a, k - 3),
                major,
                minor,
            },
            5 => Surface::Torus {
                c,
                a,
                major: major + eps,
                minor,
            },
            _ => Surface::Torus {
                c,
                a,
                major,
                minor: minor + eps,
            },
        },
    }
}

fn dof(s: &Surface) -> usize {
    match s {
        Surface::Plane { .. } => 3,
        Surface::Sphere { .. } => 4,
        Surface::Cylinder { .. } => 5,
        Surface::Cone { .. } => 6,
        Surface::Torus { .. } => 7,
    }
}

/// Levenberg-Marquardt on signed point distances. Each step perturbs the
/// current surface along its local parameter directions, so axes stay unit.
pub fn refine(s: Surface, pts: &[V3]) -> Surface {
    refine_for(s, pts, 60)
}

/// LM on point distances. A torus or cone hypothesis on data that is not
/// one slides along a degenerate family (major radius or apex running off)
/// without converging, so first guesses get a short budget.
fn refine_for(s: Surface, pts: &[V3], max_iters: usize) -> Surface {
    if pts.len() < dof(&s) + 1 {
        return s;
    }
    let scale_ref = crate::math::Bbox::of(pts).diag().max(1e-9);
    let mut cur = s;
    let mut lambda = 1e-3;
    let mut cost: f64 = pts.iter().map(|&p| cur.signed_distance(p).powi(2)).sum();
    let k = dof(&cur);
    for _ in 0..max_iters {
        let eps = 1e-7 * scale_ref;
        let base: Vec<f64> = pts.iter().map(|&p| cur.signed_distance(p)).collect();
        let cols: Vec<Vec<f64>> = (0..k)
            .map(|j| {
                let sj = perturbed(&cur, j, eps);
                pts.iter()
                    .zip(&base)
                    .map(|(&p, &b)| (sj.signed_distance(p) - b) / eps)
                    .collect()
            })
            .collect();
        let mut jtj = vec![vec![0.0; k]; k];
        let mut jtr = vec![0.0; k];
        for i in 0..pts.len() {
            for a in 0..k {
                jtr[a] -= cols[a][i] * base[i];
                for b in 0..k {
                    jtj[a][b] += cols[a][i] * cols[b][i];
                }
            }
        }
        let mut improved = false;
        for _ in 0..8 {
            let mut m = jtj.clone();
            for (d, row) in m.iter_mut().enumerate() {
                row[d] += lambda * (jtj[d][d].max(1e-12));
            }
            let Some(step) = solve(m, jtr.clone()) else {
                lambda *= 10.0;
                continue;
            };
            let mut cand = cur;
            for (j, &sj) in step.iter().enumerate() {
                cand = perturbed(&cand, j, sj);
            }
            let c2: f64 = pts.iter().map(|&p| cand.signed_distance(p).powi(2)).sum();
            if c2.is_finite() && c2 < cost {
                let gain = cost - c2;
                cur = cand;
                cost = c2;
                lambda = (lambda * 0.3).max(1e-12);
                improved = gain > 1e-15 * (1.0 + cost);
                break;
            }
            lambda *= 10.0;
        }
        if !improved {
            break;
        }
    }
    cur
}

/// Candidate fits for the samples, refined, best (simplest within `tol`, else
/// lowest residual) first. `normals` are per-sample unit normals.
pub fn fit_candidates(pts: &[V3], normals: &[V3]) -> Vec<(Surface, f64)> {
    fit_candidates_where(pts, normals, |_| true)
}

/// `fit_candidates` restricted to the kinds `keep` accepts, skipping the
/// refinement of the rest.
pub fn fit_candidates_where(
    pts: &[V3],
    normals: &[V3],
    keep: impl Fn(Kind) -> bool,
) -> Vec<(Surface, f64)> {
    let mut out: Vec<(Surface, f64)> = Vec::new();
    if keep(Kind::Plane) {
        if let Some(p) = plane(pts) {
            out.push((p, max_residual(&p, pts)));
        }
    }
    for c in revolution_candidates(pts, normals) {
        if !keep(c.kind()) {
            continue;
        }
        let r = refine_for(c, pts, 20);
        if params_finite(&r) {
            out.push((r, max_residual(&r, pts)));
        }
    }
    out
}

fn params_finite(s: &Surface) -> bool {
    pack(s).iter().all(|v| v.is_finite())
        && match *s {
            Surface::Cylinder { r, .. } | Surface::Sphere { r, .. } => r > 0.0,
            Surface::Cone { half_angle, .. } => {
                half_angle > 0.0 && half_angle < std::f64::consts::FRAC_PI_2
            }
            Surface::Torus { major, minor, .. } => major > 0.0 && minor > 0.0,
            Surface::Plane { .. } => true,
        }
}

/// The simplest surface that fits every sample within `tol`.
pub fn best_fit(pts: &[V3], normals: &[V3], tol: f64) -> Option<(Surface, f64)> {
    let mut cands = fit_candidates(pts, normals);
    cands.retain(|(_, r)| *r <= tol);
    cands.sort_by(|a, b| a.0.kind().cmp(&b.0.kind()).then(a.1.total_cmp(&b.1)));
    cands.into_iter().next()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(a: V3) -> (V3, V3) {
        let u = any_perpendicular(a);
        (u, cross(a, u))
    }

    /// Samples (points, normals) on a patch of `s` over the parameter box.
    fn sample(s: &Surface, steps: usize, t0: f64, t1: f64, h0: f64, h1: f64) -> (Vec<V3>, Vec<V3>) {
        let mut pts = Vec::new();
        let mut nrm = Vec::new();
        for i in 0..=steps {
            for j in 0..=steps {
                let t = t0 + (t1 - t0) * i as f64 / steps as f64;
                let h = h0 + (h1 - h0) * j as f64 / steps as f64;
                let (p, n) = match *s {
                    Surface::Cylinder { o, a, r } => {
                        let (u, v) = frame(a);
                        let dir = add(scale(u, t.cos()), scale(v, t.sin()));
                        (add(add(o, scale(a, h)), scale(dir, r)), dir)
                    }
                    Surface::Sphere { c, r } => {
                        let dir = [h.cos() * t.cos(), h.cos() * t.sin(), h.sin()];
                        (add(c, scale(dir, r)), dir)
                    }
                    Surface::Cone {
                        apex,
                        a,
                        half_angle,
                    } => {
                        let (u, v) = frame(a);
                        let dir = add(scale(u, t.cos()), scale(v, t.sin()));
                        let g = add(scale(a, half_angle.cos()), scale(dir, half_angle.sin()));
                        let p = add(apex, scale(g, h));
                        let n = sub(scale(dir, half_angle.cos()), scale(a, half_angle.sin()));
                        (p, n)
                    }
                    Surface::Torus { c, a, major, minor } => {
                        let (u, v) = frame(a);
                        let dir = add(scale(u, t.cos()), scale(v, t.sin()));
                        let n = add(scale(dir, h.cos()), scale(a, h.sin()));
                        (add(add(c, scale(dir, major)), scale(n, minor)), n)
                    }
                    Surface::Plane { .. } => unreachable!(),
                };
                pts.push(p);
                nrm.push(n);
            }
        }
        (pts, nrm)
    }

    fn noisy(pts: &mut [V3], nrm: &mut [V3], amp: f64) {
        let mut s = 7u64;
        let mut rnd = || {
            s ^= s << 13;
            s ^= s >> 7;
            s ^= s << 17;
            (s >> 11) as f64 / (1u64 << 53) as f64 - 0.5
        };
        for (p, n) in pts.iter_mut().zip(nrm.iter_mut()) {
            *p = add(*p, [rnd() * amp, rnd() * amp, rnd() * amp]);
            *n = normalize(add(*n, [rnd() * 0.05, rnd() * 0.05, rnd() * 0.05])).unwrap();
        }
    }

    #[test]
    fn quarter_cylinder_recovered() {
        let truth = Surface::Cylinder {
            o: [1.0, 2.0, 3.0],
            a: normalize([0.2, 0.1, 1.0]).unwrap(),
            r: 3.0,
        };
        let (mut p, mut n) = sample(&truth, 12, 0.0, std::f64::consts::FRAC_PI_2, -4.0, 6.0);
        noisy(&mut p, &mut n, 1e-6);
        let (s, res) = best_fit(&p, &n, 1e-4).unwrap();
        assert_eq!(s.kind(), Kind::Cylinder, "{s:?}");
        assert!(res < 1e-4);
        if let Surface::Cylinder { r, .. } = s {
            assert!((r - 3.0).abs() < 1e-5);
        }
    }

    #[test]
    fn sphere_octant_recovered() {
        let truth = Surface::Sphere {
            c: [5.0, -1.0, 2.0],
            r: 2.5,
        };
        let (p, n) = sample(
            &truth,
            10,
            0.0,
            std::f64::consts::FRAC_PI_2,
            0.0,
            std::f64::consts::FRAC_PI_2 * 0.9,
        );
        let (s, _) = best_fit(&p, &n, 1e-6).unwrap();
        assert_eq!(s.kind(), Kind::Sphere, "{s:?}");
        if let Surface::Sphere { c, r } = s {
            assert!((r - 2.5).abs() < 1e-8 && norm(sub(c, [5.0, -1.0, 2.0])) < 1e-8);
        }
    }

    #[test]
    fn cone_frustum_recovered() {
        let truth = Surface::Cone {
            apex: [0.0, 0.0, -10.0],
            a: [0.0, 0.0, 1.0],
            half_angle: 0.3,
        };
        let (p, n) = sample(&truth, 12, 0.0, 5.0, 5.0, 15.0);
        let (s, _) = best_fit(&p, &n, 1e-6).unwrap();
        assert_eq!(s.kind(), Kind::Cone, "{s:?}");
        if let Surface::Cone {
            apex, half_angle, ..
        } = s
        {
            assert!((half_angle - 0.3).abs() < 1e-7 && norm(sub(apex, [0.0, 0.0, -10.0])) < 1e-6);
        }
    }

    #[test]
    fn fillet_torus_patch_recovered() {
        let truth = Surface::Torus {
            c: [2.0, 0.0, 1.0],
            a: normalize([0.0, 0.3, 1.0]).unwrap(),
            major: 10.0,
            minor: 1.5,
        };
        let (p, n) = sample(&truth, 14, 0.0, 2.0, 0.0, std::f64::consts::FRAC_PI_2);
        let (s, _) = best_fit(&p, &n, 1e-6).unwrap();
        assert_eq!(s.kind(), Kind::Torus, "{s:?}");
        if let Surface::Torus { major, minor, .. } = s {
            assert!((major - 10.0).abs() < 1e-6 && (minor - 1.5).abs() < 1e-6);
        }
    }

    #[test]
    fn plane_preferred_when_flat() {
        let pts: Vec<V3> = (0..30)
            .map(|i| [i as f64 * 0.3, (i * 7 % 11) as f64, 2.0])
            .collect();
        let nrm = vec![[0.0, 0.0, 1.0]; pts.len()];
        let (s, _) = best_fit(&pts, &nrm, 1e-9).unwrap();
        assert_eq!(s.kind(), Kind::Plane);
    }

    #[test]
    fn solve_pivots_past_a_zero_diagonal() {
        let m = vec![
            vec![0.0, 0.0, -1.0],
            vec![1.0, 0.0, 0.0],
            vec![0.0, 1.0, 0.0],
        ];
        let x = solve(m, vec![-3.0, 27.0, 5.0]).unwrap();
        assert_eq!(x, vec![27.0, 5.0, 3.0]);
    }

    #[test]
    fn projection_lands_on_surface() {
        let surfaces = [
            Surface::Cylinder {
                o: [0.0; 3],
                a: [0.0, 0.0, 1.0],
                r: 2.0,
            },
            Surface::Sphere {
                c: [1.0, 1.0, 1.0],
                r: 3.0,
            },
            Surface::Cone {
                apex: [0.0; 3],
                a: [0.0, 0.0, 1.0],
                half_angle: 0.4,
            },
            Surface::Torus {
                c: [0.0; 3],
                a: [0.0, 0.0, 1.0],
                major: 5.0,
                minor: 1.0,
            },
        ];
        for s in surfaces {
            let q = s.project([3.0, 1.0, 4.0]);
            assert!(s.distance(q) < 1e-9, "{s:?} {q:?}");
        }
    }
}
