pub type V3 = [f64; 3];

#[inline]
pub fn sub(a: V3, b: V3) -> V3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

#[inline]
pub fn add(a: V3, b: V3) -> V3 {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

#[inline]
pub fn scale(a: V3, s: f64) -> V3 {
    [a[0] * s, a[1] * s, a[2] * s]
}

#[inline]
pub fn dot(a: V3, b: V3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

#[inline]
pub fn cross(a: V3, b: V3) -> V3 {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

#[inline]
pub fn norm(a: V3) -> f64 {
    dot(a, a).sqrt()
}

#[inline]
pub fn dist(a: V3, b: V3) -> f64 {
    norm(sub(a, b))
}

pub fn normalize(a: V3) -> Option<V3> {
    let n = norm(a);
    if n > 0.0 && n.is_finite() {
        Some(scale(a, 1.0 / n))
    } else {
        None
    }
}

/// Newell normal of a polygon (length = 2 × area); the polygon winds
/// counter-clockwise about it.
pub fn newell_normal(pts: &[V3]) -> V3 {
    let mut n = [0.0; 3];
    for i in 0..pts.len() {
        let a = pts[i];
        let b = pts[(i + 1) % pts.len()];
        n[0] += (a[1] - b[1]) * (a[2] + b[2]);
        n[1] += (a[2] - b[2]) * (a[0] + b[0]);
        n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    n
}

/// Unnormalized triangle normal (length = 2 × area).
#[inline]
pub fn tri_cross(a: V3, b: V3, c: V3) -> V3 {
    cross(sub(b, a), sub(c, a))
}

#[inline]
pub fn tri_area(a: V3, b: V3, c: V3) -> f64 {
    0.5 * norm(tri_cross(a, b, c))
}

/// Smallest altitude over longest edge: 0 for a needle, ~0.87 for equilateral.
pub fn tri_quality(a: V3, b: V3, c: V3) -> f64 {
    let longest = dist(a, b).max(dist(b, c)).max(dist(c, a));
    if longest <= 0.0 {
        return 0.0;
    }
    let twice_area = norm(tri_cross(a, b, c));
    (twice_area / longest) / longest
}

#[derive(Clone, Copy, Debug)]
pub struct Bbox {
    pub min: V3,
    pub max: V3,
}

impl Bbox {
    pub fn empty() -> Bbox {
        Bbox {
            min: [f64::INFINITY; 3],
            max: [f64::NEG_INFINITY; 3],
        }
    }

    pub fn of(points: &[V3]) -> Bbox {
        let mut b = Bbox::empty();
        for &p in points {
            b.expand(p);
        }
        b
    }

    pub fn expand(&mut self, p: V3) {
        for (k, &v) in p.iter().enumerate() {
            self.min[k] = self.min[k].min(v);
            self.max[k] = self.max[k].max(v);
        }
    }

    pub fn diag(&self) -> f64 {
        if self.min[0] > self.max[0] {
            return 0.0;
        }
        dist(self.min, self.max)
    }

    pub fn size(&self) -> V3 {
        if self.min[0] > self.max[0] {
            return [0.0; 3];
        }
        sub(self.max, self.min)
    }

    pub fn contains_box(&self, other: &Bbox) -> bool {
        (0..3).all(|k| self.min[k] <= other.min[k] && self.max[k] >= other.max[k])
    }

    pub fn volume(&self) -> f64 {
        let s = self.size();
        s[0] * s[1] * s[2]
    }
}

/// Eigen-decomposition of a symmetric 3×3 matrix by cyclic Jacobi rotations.
/// Returns eigenvalues ascending with matching unit eigenvectors.
pub fn sym_eigen(m: [[f64; 3]; 3]) -> ([f64; 3], [V3; 3]) {
    let mut a = m;
    let mut v = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
    for _ in 0..50 {
        let off = a[0][1].abs() + a[0][2].abs() + a[1][2].abs();
        if off < 1e-300 {
            break;
        }
        for (p, q) in [(0usize, 1usize), (0, 2), (1, 2)] {
            if a[p][q].abs() < 1e-300 {
                continue;
            }
            let theta = (a[q][q] - a[p][p]) / (2.0 * a[p][q]);
            let t = theta.signum() / (theta.abs() + (theta * theta + 1.0).sqrt());
            let t = if theta == 0.0 { 1.0 } else { t };
            let c = 1.0 / (t * t + 1.0).sqrt();
            let s = t * c;
            for row in a.iter_mut() {
                let akp = row[p];
                let akq = row[q];
                row[p] = c * akp - s * akq;
                row[q] = s * akp + c * akq;
            }
            let (rp, rq) = (a[p], a[q]);
            a[p] = std::array::from_fn(|k| c * rp[k] - s * rq[k]);
            a[q] = std::array::from_fn(|k| s * rp[k] + c * rq[k]);
            for row in v.iter_mut() {
                let vp = row[p];
                let vq = row[q];
                row[p] = c * vp - s * vq;
                row[q] = s * vp + c * vq;
            }
        }
    }
    let mut idx = [0usize, 1, 2];
    idx.sort_by(|&i, &j| a[i][i].total_cmp(&a[j][j]));
    let vals = [a[idx[0]][idx[0]], a[idx[1]][idx[1]], a[idx[2]][idx[2]]];
    let col = |c: usize| [v[0][c], v[1][c], v[2][c]];
    (vals, [col(idx[0]), col(idx[1]), col(idx[2])])
}

/// Least-squares plane through weighted points: (unit normal, offset) with n·x = d.
pub fn fit_plane(points: impl Iterator<Item = (V3, f64)>) -> Option<(V3, f64)> {
    let mut wsum = 0.0;
    let mut c = [0.0; 3];
    let pts: Vec<(V3, f64)> = points.collect();
    for &(p, w) in &pts {
        wsum += w;
        c = add(c, scale(p, w));
    }
    if wsum <= 0.0 {
        return None;
    }
    c = scale(c, 1.0 / wsum);
    let mut m = [[0.0; 3]; 3];
    for &(p, w) in &pts {
        let d = sub(p, c);
        for i in 0..3 {
            for j in 0..3 {
                m[i][j] += w * d[i] * d[j];
            }
        }
    }
    let (_, vecs) = sym_eigen(m);
    let n = normalize(vecs[0])?;
    Some((n, dot(n, c)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn eigen_recovers_diagonal() {
        let (vals, vecs) = sym_eigen([[3.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 2.0]]);
        assert!((vals[0] - 1.0).abs() < 1e-12);
        assert!((vals[2] - 3.0).abs() < 1e-12);
        assert!((vecs[0][1].abs() - 1.0).abs() < 1e-12);
    }

    #[test]
    fn eigen_rotated_matrix() {
        let m = [[2.0, 1.0, 0.0], [1.0, 2.0, 0.0], [0.0, 0.0, 5.0]];
        let (vals, vecs) = sym_eigen(m);
        assert!((vals[0] - 1.0).abs() < 1e-12);
        assert!((vals[1] - 3.0).abs() < 1e-12);
        assert!((vals[2] - 5.0).abs() < 1e-12);
        let v = vecs[0];
        assert!((v[0] + v[1]).abs() < 1e-9);
    }

    #[test]
    fn plane_fit_tilted() {
        let n = normalize([1.0, 2.0, 3.0]).unwrap();
        let d = 4.0;
        let pts: Vec<(V3, f64)> = (0..20)
            .map(|i| {
                let u = [i as f64 * 0.37, (i * i) as f64 * 0.11, 0.0];
                let off = d - dot(n, u);
                (add(u, scale(n, off)), 1.0)
            })
            .collect();
        let (fn_, fd) = fit_plane(pts.into_iter()).unwrap();
        let s = if dot(fn_, n) < 0.0 { -1.0 } else { 1.0 };
        assert!((dot(fn_, n) * s - 1.0).abs() < 1e-9);
        assert!((fd * s - d).abs() < 1e-9);
    }
}
