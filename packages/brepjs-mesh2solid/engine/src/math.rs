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

/// `a²` as a rounded square and what the rounding lost, which together are
/// exact while neither overflows nor underflows (Dekker's product).
#[inline]
fn two_square(a: f64) -> (f64, f64) {
    const SPLIT: f64 = 134_217_729.0;
    let c = SPLIT * a;
    let hi = c - (c - a);
    let lo = a - hi;
    let p = a * a;
    (p, ((hi * hi - p) + 2.0 * hi * lo) + lo * lo)
}

/// `√(x² + y²)` rounded to nearest, or `None` where this cannot tell which
/// way it rounds. The sum of squares and the root's correction are each
/// carried in two parts, which puts the root within 2⁻¹⁰⁰ of the exact one.
/// That settles the rounding unless the root sits within a millionth of an
/// ulp of halfway between two values.
fn rounded_hypot(x: f64, y: f64) -> Option<f64> {
    let (a, b) = (x.abs(), y.abs());
    let (big, small) = if a >= b { (a, b) } else { (b, a) };
    // The squares and their lost parts stay clear of overflow and underflow
    // in this range. A NaN fails the test too.
    if !(small > 1e-100 && big < 1e100) {
        return (small == 0.0 && big.is_finite()).then_some(big);
    }
    let (hx, lx) = two_square(big);
    let (hy, ly) = two_square(small);
    let sum = hx + hy;
    let sum_lo = (hy - (sum - hx)) + (lx + ly);
    let root = sum.sqrt();
    let (p, p_lo) = two_square(root);
    let correction = (((sum - p) - p_lo) + sum_lo) / (2.0 * root);
    let rounded = root + correction;
    let left = correction - (rounded - root);
    let bits = rounded.to_bits();
    let half_ulp = f64::from_bits(((bits >> 52) - 53) << 52);
    // Below a power of two the values are twice as dense, so half an ulp
    // is not the distance to halfway there.
    let power_of_two = bits << 12 == 0;
    let settled = !power_of_two && left.abs() <= half_ulp * (1.0 - 1.0 / 1_048_576.0);
    settled.then_some(rounded)
}

/// `f64::hypot`, bit for bit wherever that is correctly rounded (it is in
/// the wasm build). The toolchain's version works through fused
/// multiply-adds, which wasm lacks and gets emulated in software: that was
/// close to half the time of fitting a torus. Plain arithmetic settles all
/// but about one call in a million, and `f64::hypot` answers those.
pub fn hypot(x: f64, y: f64) -> f64 {
    rounded_hypot(x, y).unwrap_or_else(|| x.hypot(y))
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

type M3 = [[f64; 3]; 3];

/// Bitwise equality, so a signed zero or a NaN is only equal to itself.
fn same_bits(a: &M3, b: &M3) -> bool {
    a.iter()
        .flatten()
        .zip(b.iter().flatten())
        .all(|(x, y)| x.to_bits() == y.to_bits())
}

/// One cyclic sweep of Jacobi rotations on `a`, gathered in `v`.
fn jacobi_sweep(a: &mut M3, v: &mut M3) {
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

/// Eigenvalues ascending with their eigenvectors, from a diagonalised `a`
/// and the rotations `v` that took it there.
fn sorted_eigen(a: &M3, v: &M3) -> ([f64; 3], [V3; 3]) {
    let mut idx = [0usize, 1, 2];
    idx.sort_by(|&i, &j| a[i][i].total_cmp(&a[j][j]));
    let vals = [a[idx[0]][idx[0]], a[idx[1]][idx[1]], a[idx[2]][idx[2]]];
    let col = |c: usize| [v[0][c], v[1][c], v[2][c]];
    (vals, [col(idx[0]), col(idx[1]), col(idx[2])])
}

const IDENTITY: M3 = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
const MAX_SWEEPS: usize = 50;

/// Eigen-decomposition of a symmetric 3×3 matrix by cyclic Jacobi rotations.
/// Returns eigenvalues ascending with matching unit eigenvectors.
pub fn sym_eigen(m: M3) -> ([f64; 3], [V3; 3]) {
    let mut a = m;
    let mut v = IDENTITY;
    for _ in 0..MAX_SWEEPS {
        let off = a[0][1].abs() + a[0][2].abs() + a[1][2].abs();
        if off < 1e-300 {
            break;
        }
        let before = (a, v);
        jacobi_sweep(&mut a, &mut v);
        // An off-diagonal entry too small to turn anything (its angle rounds
        // to zero) never falls under the exit threshold above. A sweep that
        // changes no bit is all that any later sweep would do.
        if same_bits(&a, &before.0) && same_bits(&v, &before.1) {
            break;
        }
    }
    sorted_eigen(&a, &v)
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

    /// Every sweep `sym_eigen` allows, with no early exit.
    fn every_sweep(m: M3) -> ([f64; 3], [V3; 3]) {
        let mut a = m;
        let mut v = IDENTITY;
        for _ in 0..MAX_SWEEPS {
            if a[0][1].abs() + a[0][2].abs() + a[1][2].abs() < 1e-300 {
                break;
            }
            jacobi_sweep(&mut a, &mut v);
        }
        sorted_eigen(&a, &v)
    }

    #[test]
    fn stopping_at_an_unchanged_sweep_changes_no_bit() {
        let mut s = 0x9e3779b97f4a7c15u64;
        let mut rnd = || {
            s ^= s << 13;
            s ^= s >> 7;
            s ^= s << 17;
            (s >> 11) as f64 / (1u64 << 53) as f64 - 0.5
        };
        let mut cases: Vec<M3> = vec![
            [[0.0; 3]; 3],
            [[2.0, 1.0, 0.0], [1.0, 2.0, 0.0], [0.0, 0.0, 5.0]],
            [[1.0, 1.0, 1.0], [1.0, 1.0, 1.0], [1.0, 1.0, 1.0]],
            [[4.0, -0.0, 0.0], [-0.0, 4.0, 1e-200], [0.0, 1e-200, 4.0]],
            [[1e-9, 1e-12, 0.0], [1e-12, 1e9, 3.0], [0.0, 3.0, -2.0]],
        ];
        for round in 0..2000 {
            // Scatter matrices of a few vectors: full rank, then nearly and
            // exactly rank deficient, as the fits build them.
            let n = 1 + round % 5;
            let flat = round % 3;
            let mut m = [[0.0; 3]; 3];
            for _ in 0..n {
                let mut d = [rnd(), rnd(), rnd()];
                if flat == 1 {
                    d[2] = 0.0;
                } else if flat == 2 {
                    d[2] *= 1e-9;
                }
                for i in 0..3 {
                    for j in 0..3 {
                        m[i][j] += d[i] * d[j];
                    }
                }
            }
            cases.push(m);
        }
        for m in cases {
            let (vals, vecs) = sym_eigen(m);
            let (all_vals, all_vecs) = every_sweep(m);
            let bits = |x: &[f64]| x.iter().map(|v| v.to_bits()).collect::<Vec<_>>();
            assert_eq!(bits(&vals), bits(&all_vals), "{m:?}");
            assert_eq!(
                bits(vecs.as_flattened()),
                bits(all_vecs.as_flattened()),
                "{m:?}"
            );
        }
    }

    /// `v << shift` as little-endian 64-bit limbs.
    fn wide(v: u128, shift: usize) -> Vec<u64> {
        let mut limbs = vec![0u64; shift / 64 + 4];
        let (at, bits) = (shift / 64, shift % 64);
        let parts = [v as u64, (v >> 64) as u64];
        for (i, part) in parts.into_iter().enumerate() {
            limbs[at + i] |= part << bits;
            if bits > 0 {
                limbs[at + i + 1] |= part >> (64 - bits);
            }
        }
        limbs
    }

    fn plus(a: &[u64], b: &[u64]) -> Vec<u64> {
        let mut out = Vec::new();
        let mut carry = 0u128;
        for i in 0..a.len().max(b.len()) + 1 {
            let sum = carry
                + u128::from(a.get(i).copied().unwrap_or(0))
                + u128::from(b.get(i).copied().unwrap_or(0));
            out.push(sum as u64);
            carry = sum >> 64;
        }
        out
    }

    fn at_most(a: &[u64], b: &[u64]) -> bool {
        for i in (0..a.len().max(b.len())).rev() {
            let (x, y) = (
                a.get(i).copied().unwrap_or(0),
                b.get(i).copied().unwrap_or(0),
            );
            if x != y {
                return x < y;
            }
        }
        true
    }

    /// Is `r` the double nearest `√(x² + y²)`? Exact, in integers of any
    /// length, for positive normal numbers: it shares no arithmetic with
    /// `rounded_hypot`.
    fn is_nearest_root(x: f64, y: f64, r: f64) -> bool {
        let parts = |v: f64| {
            let b = v.to_bits();
            assert!(b >> 52 > 0 && b >> 52 < 0x7ff, "{v:e} is not normal");
            (((b << 12 >> 12) | 1 << 52) as u128, (b >> 52) as usize)
        };
        let ((mx, ex), (my, ey), (mr, er)) = (parts(x), parts(y), parts(r));
        let low = ex.min(ey).min(er);
        // Sixteen times the sum of squares, against the squares of the two
        // points halfway to `r`'s neighbours, all in the same unit. Below a
        // power of two the neighbour is half as far.
        let sum = plus(
            &wide(mx * mx, 2 * (ex - low) + 4),
            &wide(my * my, 2 * (ey - low) + 4),
        );
        let down = if mr == 1 << 52 { 1 } else { 2 };
        let below = wide((4 * mr - down).pow(2), 2 * (er - low));
        let above = wide((4 * mr + 2).pow(2), 2 * (er - low));
        at_most(&below, &sum) && at_most(&sum, &above)
    }

    #[test]
    fn the_oracle_tells_a_neighbour_from_the_nearest() {
        for (x, y) in [(3.0, 4.0), (1.0, 1.0), (1e80, 3e-70), (5.5e-99, 7.25e-99)] {
            let exact = if x == 3.0 { 5.0 } else { f64::hypot(x, y) };
            let (up, down) = (
                f64::from_bits(exact.to_bits() + 1),
                f64::from_bits(exact.to_bits() - 1),
            );
            let near = [down, exact, up].map(|r| is_nearest_root(x, y, r));
            assert_eq!(near.iter().filter(|&&n| n).count(), 1, "{x:e} {y:e}");
        }
        assert!(is_nearest_root(3.0, 4.0, 5.0));
        // √(1 + 2⁻⁵⁴) is nearer to 1 than to the next double.
        let tiny = f64::from_bits((1023 - 27) << 52);
        assert!(is_nearest_root(1.0, tiny, 1.0));
        assert!(!is_nearest_root(
            1.0,
            tiny,
            f64::from_bits(1.0f64.to_bits() + 1)
        ));
    }

    /// The largest and smallest binary exponents the fast path of
    /// `rounded_hypot` takes (inputs between 1e-100 and 1e100).
    const FAST_EXPONENTS: (i64, i64) = (-332, 331);

    #[test]
    fn hypot_rounds_to_nearest_at_every_exponent_gap() {
        let mut s = 0x9e3779b97f4a7c15u64;
        let mut next = move || {
            s ^= s << 13;
            s ^= s >> 7;
            s ^= s << 17;
            s
        };
        let (low, high) = FAST_EXPONENTS;
        let widest = (high - low) as u64;
        let mut checked = 0u64;
        let mut near_the_edge = 0u64;
        for gap in 0..=widest {
            // Up to about 27 bits apart the smaller square can still move
            // the root across a rounding boundary.
            let rounds = if (20..=32).contains(&gap) {
                20_000
            } else {
                300
            };
            for round in 0..rounds {
                let mantissa = |bits: u64| match round % 4 {
                    0 => bits & (0xf << 48) | 1 << (bits % 48),
                    1 => bits & (0xfff << 40),
                    _ => bits << 12 >> 12,
                };
                let top = low + gap as i64 + (next() % (widest - gap + 1)) as i64;
                let big = f64::from_bits(((1023 + top) as u64) << 52 | mantissa(next()));
                let small = f64::from_bits(((1023 + top) as u64 - gap) << 52 | mantissa(next()));
                let (x, y) = if round % 2 == 0 {
                    (big, -small)
                } else {
                    (small, big)
                };
                let Some(r) = rounded_hypot(x, y) else {
                    continue;
                };
                assert!(
                    is_nearest_root(big, small, r),
                    "gap {gap}: hypot({x:e}, {y:e}) = {r:e}"
                );
                checked += 1;
                near_the_edge += u64::from((26..=28).contains(&gap));
            }
        }
        assert!(checked > 440_000, "only {checked} checked");
        assert!(
            near_the_edge > 59_000,
            "only {near_the_edge} at 26 to 28 bits"
        );
    }

    #[test]
    fn hypot_rounds_to_nearest_beside_a_halfway_root() {
        let mut s = 0xd1b54a32d192ed03u64;
        let mut next = move || {
            s ^= s << 13;
            s ^= s >> 7;
            s ^= s << 17;
            s
        };
        // With x an integer of 53 bits and y² = x + ¼, the root is x + ½:
        // halfway to the next double, with y 26 bits below x. Scaling y
        // moves the root off halfway by a chosen share of an ulp, and far
        // enough takes it to the next halfway point or under the first.
        let nudges: [f64; 9] = [0.0, 1e-9, 3e-7, 6e-7, 1.5e-6, 1e-4, 1e-2, 0.3, 0.8];
        let (mut settled, mut undecided) = (0u64, 0u64);
        for _ in 0..20_000 {
            let int = (1u64 << 52 | next() >> 12) as f64;
            let scale = f64::from_bits((1023 - 300 + next() % 560) << 52);
            for nudge in nudges {
                for side in [-1.0, 1.0] {
                    let x = int * scale;
                    let y = (int + 0.25).sqrt() * (1.0 + side * nudge) * scale;
                    match rounded_hypot(x, y) {
                        Some(r) => {
                            assert!(
                                is_nearest_root(x, y, r),
                                "hypot({x:e}, {y:e}) = {r:e} (nudge {nudge})"
                            );
                            settled += 1;
                        }
                        None => undecided += 1,
                    }
                }
            }
        }
        // The exact family, and the nudges under a millionth of an ulp.
        assert!(undecided > 100_000, "only {undecided} undecided");
        assert!(settled > 200_000, "only {settled} settled");
    }

    #[test]
    fn hypot_takes_its_fast_path_only_inside_its_limits() {
        let step = |v: f64, by: i64| f64::from_bits((v.to_bits() as i64 + by) as u64);
        let others = |v: f64| [v, v * 1.5, v * 8192.0, v * 1.9e8, 1.0, step(1e100, -1)];
        let mut inside = 0;
        // The smaller input must be above 1e-100.
        for by in -3..=3 {
            let small = step(1e-100, by);
            for big in others(small) {
                let r = rounded_hypot(small, -big);
                if by <= 0 {
                    assert_eq!(r, None, "{small:e} is under the limit");
                } else if let Some(r) = r {
                    assert!(is_nearest_root(big, small, r), "hypot({small:e}, {big:e})");
                    inside += 1;
                }
            }
        }
        // The larger input must be below 1e100.
        for by in -3..=3 {
            let big = step(1e100, by);
            for small in [
                big,
                big / 1.5,
                big / 8192.0,
                big / 1.9e8,
                1.0,
                step(1e-100, 1),
            ] {
                let r = rounded_hypot(-big, small);
                if by >= 0 {
                    assert_eq!(r, None, "{big:e} is over the limit");
                } else if let Some(r) = r {
                    assert!(is_nearest_root(big, small, r), "hypot({big:e}, {small:e})");
                    inside += 1;
                }
            }
        }
        assert!(inside >= 30, "only {inside} inside the limits settled");

        // Equal inputs.
        let mut bits = 0x3ff0_0000_0000_0001u64;
        for _ in 0..50_000 {
            bits = bits
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            let exponent = (1023 + FAST_EXPONENTS.0) as u64 + (bits >> 40) % 660;
            let x = f64::from_bits(exponent << 52 | bits >> 12);
            if let Some(r) = rounded_hypot(x, x) {
                assert!(is_nearest_root(x, x, r), "hypot({x:e}, {x:e}) = {r:e}");
                inside += 1;
            }
        }
        assert!(inside > 45_000);

        // A zero leaves the other input, whatever its size.
        let subnormal = f64::from_bits(12345);
        for x in [
            0.0,
            subnormal,
            f64::MIN_POSITIVE,
            1e-200,
            2.5,
            1e200,
            f64::MAX,
        ] {
            for zero in [0.0, -0.0] {
                assert_eq!(rounded_hypot(-x, zero).map(f64::to_bits), Some(x.to_bits()));
                assert_eq!(rounded_hypot(zero, x).map(f64::to_bits), Some(x.to_bits()));
            }
        }
        // Subnormal, infinite and NaN inputs go to `f64::hypot`.
        for x in [
            subnormal,
            f64::MIN_POSITIVE,
            1e-200,
            1e200,
            f64::INFINITY,
            f64::NAN,
        ] {
            for y in [subnormal, 1.0, 1e-99, 1e99, x] {
                assert_eq!(rounded_hypot(x, y), None, "{x:e} {y:e}");
                assert_eq!(rounded_hypot(y, -x), None, "{y:e} {x:e}");
            }
        }
        assert_eq!(rounded_hypot(f64::INFINITY, 0.0), None);
        assert_eq!(rounded_hypot(0.0, f64::NAN), None);
    }

    #[test]
    fn hypot_rounds_to_nearest() {
        let mut s = 0x2545f4914f6cdd1du64;
        let mut next = || {
            s ^= s << 13;
            s ^= s >> 7;
            s ^= s << 17;
            s
        };
        let mut settled = 0;
        let rounds = 400_000;
        for round in 0..rounds {
            let mantissa = |bits: u64| match round % 4 {
                // Few set bits: sums of squares that land on or near a
                // value halfway between two doubles.
                0 => bits & (0xf << 48) | 1 << (bits % 48),
                1 => bits & (0xfff << 40),
                _ => bits << 12 >> 12,
            };
            let exponent = 1023 - 250 + (next() % 500);
            let x = f64::from_bits(exponent << 52 | mantissa(next()));
            let y = f64::from_bits((exponent - next() % 9) << 52 | mantissa(next()));
            let (x, y) = if round % 2 == 0 { (x, -y) } else { (y, x) };
            let Some(r) = rounded_hypot(x, y) else {
                continue;
            };
            settled += 1;
            assert!(
                is_nearest_root(x.abs(), y.abs(), r),
                "hypot({x:e}, {y:e}) = {r:e}"
            );
        }
        assert!(
            settled > rounds * 9 / 10,
            "only {settled} of {rounds} settled"
        );

        // (8k + 1)² + (15k + 4)² = (17k + 4)² + 1: for these k the root is
        // 2⁻⁵⁵ of an ulp past 17k + 4, an odd number of 54 bits, which is
        // halfway between two doubles. No approximation settles that.
        for step in 0..2000u64 {
            let k = 530_000_000_000_001 + 35_000_000_000 * step;
            let (x, y) = ((8 * k + 1) as f64, (15 * k + 4) as f64);
            assert_eq!((x as u64, y as u64), (8 * k + 1, 15 * k + 4));
            assert_eq!((17 * k + 4) >> 53, 1);
            assert_eq!(rounded_hypot(x, y), None, "k = {k}");
        }

        assert_eq!(hypot(3.0, 4.0), 5.0);
        assert_eq!(hypot(-2.5, 0.0), 2.5);
        assert_eq!(hypot(0.0, 0.0), 0.0);
        assert_eq!(hypot(1e-200, 1e-200), 1e-200f64.hypot(1e-200));
        assert_eq!(hypot(1e200, 1e200), 1e200f64.hypot(1e200));
        assert_eq!(hypot(f64::INFINITY, f64::NAN), f64::INFINITY);
        assert!(hypot(f64::NAN, 1.0).is_nan());
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
