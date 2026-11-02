//! Ear-clipping triangulation of a polygon with holes (Eberly's hole bridging).
//!
//! Input loops are 2D; output triangles index into the concatenation of the
//! loops (outer first, then holes in order) and wind counter-clockwise.

use crate::math::{cross, dot, normalize, sub, V3};

type P2 = [f64; 2];

#[inline]
fn orient(a: P2, b: P2, c: P2) -> f64 {
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

/// Sine of the turn at `b` below which three points count as collinear. Ears
/// flatter than this would be zero-area slivers, so they are never emitted.
const COLLINEAR_SIN: f64 = 1e-9;

/// `orient(a, b, c)` scaled to the sine of the angle at `b`.
fn turn(a: P2, b: P2, c: P2) -> f64 {
    let s = ((b[0] - a[0]).hypot(b[1] - a[1])) * ((c[0] - b[0]).hypot(c[1] - b[1]));
    if s > 0.0 {
        orient(a, b, c) / s
    } else {
        0.0
    }
}

fn signed_area(pts: &[P2]) -> f64 {
    let n = pts.len();
    (0..n)
        .map(|i| {
            let a = pts[i];
            let b = pts[(i + 1) % n];
            a[0] * b[1] - b[0] * a[1]
        })
        .sum::<f64>()
        * 0.5
}

fn in_triangle(p: P2, a: P2, b: P2, c: P2) -> bool {
    orient(a, b, p) >= 0.0 && orient(b, c, p) >= 0.0 && orient(c, a, p) >= 0.0
}

/// Splice each hole into the outer ring through a mutually visible vertex pair,
/// producing one weakly simple ring of indices into `pts`.
fn bridge(pts: &[P2], outer: Vec<usize>, holes: Vec<Vec<usize>>) -> Option<Vec<usize>> {
    let mut ring = outer;
    let mut holes = holes;
    holes.sort_by(|a, b| {
        let ma = a
            .iter()
            .map(|&i| pts[i][0])
            .fold(f64::NEG_INFINITY, f64::max);
        let mb = b
            .iter()
            .map(|&i| pts[i][0])
            .fold(f64::NEG_INFINITY, f64::max);
        mb.total_cmp(&ma)
    });
    for hole in holes {
        let (hi, &m_idx) = hole
            .iter()
            .enumerate()
            .max_by(|a, b| pts[*a.1][0].total_cmp(&pts[*b.1][0]))?;
        let m = pts[m_idx];
        let n = ring.len();
        let mut best_x = f64::INFINITY;
        let mut best_edge = None;
        for i in 0..n {
            let a = pts[ring[i]];
            let b = pts[ring[(i + 1) % n]];
            if a[1] == m[1] && a[0] >= m[0] && a[0] < best_x {
                best_x = a[0];
                best_edge = Some((i, i, true));
            }
            if (a[1] > m[1]) != (b[1] > m[1]) {
                let t = (m[1] - a[1]) / (b[1] - a[1]);
                let x = a[0] + t * (b[0] - a[0]);
                if x >= m[0] && x < best_x {
                    best_x = x;
                    best_edge = Some((i, (i + 1) % n, false));
                }
            }
        }
        let (ea, eb, at_vertex) = best_edge?;
        let pick = if at_vertex {
            ea
        } else {
            let p = if pts[ring[ea]][0] > pts[ring[eb]][0] {
                ea
            } else {
                eb
            };
            let i_pt = [best_x, m[1]];
            let pp = pts[ring[p]];
            let mut chosen = p;
            let mut best_angle = f64::INFINITY;
            let (t0, t1, t2) = if orient(m, i_pt, pp) >= 0.0 {
                (m, i_pt, pp)
            } else {
                (m, pp, i_pt)
            };
            for (k, &ri) in ring.iter().enumerate() {
                let q = pts[ri];
                if k == p || q == pp {
                    continue;
                }
                let prev = pts[ring[(k + n - 1) % n]];
                let next = pts[ring[(k + 1) % n]];
                let reflex = orient(prev, q, next) <= 0.0;
                if reflex && in_triangle(q, t0, t1, t2) {
                    let d = [q[0] - m[0], q[1] - m[1]];
                    let angle = d[1].abs().atan2(d[0]);
                    if angle < best_angle {
                        best_angle = angle;
                        chosen = k;
                    }
                }
            }
            chosen
        };
        let mut spliced = Vec::with_capacity(ring.len() + hole.len() + 2);
        spliced.extend_from_slice(&ring[..=pick]);
        for k in 0..=hole.len() {
            spliced.push(hole[(hi + k) % hole.len()]);
        }
        spliced.push(ring[pick]);
        spliced.extend_from_slice(&ring[pick + 1..]);
        ring = spliced;
    }
    Some(ring)
}

fn clip(pts: &[P2], ring: &[usize]) -> Option<Vec<[usize; 3]>> {
    let n = ring.len();
    if n < 3 {
        return Some(Vec::new());
    }
    let mut prev: Vec<usize> = (0..n).map(|i| (i + n - 1) % n).collect();
    let mut next: Vec<usize> = (0..n).map(|i| (i + 1) % n).collect();
    let mut alive = n;
    let mut out = Vec::with_capacity(n - 2);
    let mut cur = 0;
    let mut since_clip = 0;
    let mut relaxed = false;
    while alive > 3 {
        let (ip, inx) = (prev[cur], next[cur]);
        let (a, b, c) = (pts[ring[ip]], pts[ring[cur]], pts[ring[inx]]);
        let o = turn(a, b, c);
        let convex = o > COLLINEAR_SIN;
        let mut ear = convex || (relaxed && o >= -COLLINEAR_SIN);
        if convex {
            let mut k = next[inx];
            while k != ip {
                let q = pts[ring[k]];
                if q != a && q != b && q != c {
                    let qp = pts[ring[prev[k]]];
                    let qn = pts[ring[next[k]]];
                    // A vertex on the ear's diagonal (turn ~0) blocks it too: clipping
                    // over it would leave that vertex out of every triangle.
                    if turn(qp, q, qn) <= COLLINEAR_SIN && in_triangle(q, a, b, c) {
                        ear = false;
                        break;
                    }
                }
                k = next[k];
            }
        }
        if ear {
            if convex {
                out.push([ring[ip], ring[cur], ring[inx]]);
            }
            next[ip] = inx;
            prev[inx] = ip;
            alive -= 1;
            cur = inx;
            since_clip = 0;
            relaxed = false;
        } else {
            cur = inx;
            since_clip += 1;
            if since_clip > alive {
                if relaxed {
                    return None;
                }
                relaxed = true;
                since_clip = 0;
            }
        }
    }
    let (a, b, c) = (prev[cur], cur, next[cur]);
    if turn(pts[ring[a]], pts[ring[b]], pts[ring[c]]) > COLLINEAR_SIN {
        out.push([ring[a], ring[b], ring[c]]);
    }
    Some(out)
}

/// Triangulate a 2D polygon. The outer ring may wind either way; holes are
/// re-wound as needed.
pub fn triangulate_2d(outer: &[P2], holes: &[Vec<P2>]) -> Option<Vec<[usize; 3]>> {
    let mut pts: Vec<P2> = outer.to_vec();
    let mut outer_idx: Vec<usize> = (0..outer.len()).collect();
    if signed_area(outer) < 0.0 {
        outer_idx.reverse();
    }
    let mut hole_idx = Vec::with_capacity(holes.len());
    for h in holes {
        let base = pts.len();
        pts.extend_from_slice(h);
        let mut idx: Vec<usize> = (base..base + h.len()).collect();
        if signed_area(h) > 0.0 {
            idx.reverse();
        }
        if idx.len() >= 3 {
            hole_idx.push(idx);
        }
    }
    let ring = bridge(&pts, outer_idx, hole_idx)?;
    clip(&pts, &ring)
}

/// Orthonormal basis (u, v) with u × v = n.
pub fn plane_basis(n: V3) -> (V3, V3) {
    let helper = if n[0].abs() < 0.9 {
        [1.0, 0.0, 0.0]
    } else {
        [0.0, 1.0, 0.0]
    };
    let u = normalize(cross(helper, n)).unwrap_or([1.0, 0.0, 0.0]);
    let v = cross(n, u);
    (u, v)
}

/// Triangulate planar 3D loops (outer first) as seen from `normal`; triangles
/// wind counter-clockwise about `normal` and index the concatenated loops.
pub fn triangulate_3d(loops: &[Vec<V3>], normal: V3) -> Option<Vec<[usize; 3]>> {
    let (outer, holes) = loops.split_first()?;
    let (u, v) = plane_basis(normal);
    let o = outer[0];
    let proj = |p: V3| {
        let d = sub(p, o);
        [dot(d, u), dot(d, v)]
    };
    let outer2: Vec<P2> = outer.iter().map(|&p| proj(p)).collect();
    if signed_area(&outer2) <= 0.0 {
        return None;
    }
    let holes2: Vec<Vec<P2>> = holes
        .iter()
        .map(|h| h.iter().map(|&p| proj(p)).collect())
        .collect();
    triangulate_2d(&outer2, &holes2)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn area_sum(pts: &[P2], tris: &[[usize; 3]]) -> f64 {
        tris.iter()
            .map(|t| 0.5 * orient(pts[t[0]], pts[t[1]], pts[t[2]]))
            .sum()
    }

    #[test]
    fn square() {
        let sq = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
        let t = triangulate_2d(&sq, &[]).unwrap();
        assert_eq!(t.len(), 2);
        assert!((area_sum(&sq, &t) - 1.0).abs() < 1e-12);
    }

    #[test]
    fn clockwise_input_reoriented() {
        let sq = [[0.0, 0.0], [0.0, 1.0], [1.0, 1.0], [1.0, 0.0]];
        let t = triangulate_2d(&sq, &[]).unwrap();
        assert!((area_sum(&sq, &t) - 1.0).abs() < 1e-12);
    }

    #[test]
    fn concave_l_shape() {
        let l = [
            [0.0, 0.0],
            [2.0, 0.0],
            [2.0, 1.0],
            [1.0, 1.0],
            [1.0, 2.0],
            [0.0, 2.0],
        ];
        let t = triangulate_2d(&l, &[]).unwrap();
        assert_eq!(t.len(), 4);
        assert!((area_sum(&l, &t) - 3.0).abs() < 1e-12);
    }

    #[test]
    fn square_with_two_holes() {
        let outer = [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]];
        let h1 = vec![[2.0, 2.0], [4.0, 2.0], [4.0, 4.0], [2.0, 4.0]];
        let h2 = vec![[6.0, 6.0], [8.0, 6.0], [8.0, 8.0], [6.0, 8.0]];
        let t = triangulate_2d(&outer, &[h1.clone(), h2.clone()]).unwrap();
        let mut pts = outer.to_vec();
        pts.extend(h1);
        pts.extend(h2);
        assert!((area_sum(&pts, &t) - 92.0).abs() < 1e-9);
        assert_eq!(t.len(), 12 + 2 * 2 - 2);
    }

    #[test]
    fn collinear_points_on_edge() {
        let p = [[0.0, 0.0], [1.0, 0.0], [2.0, 0.0], [2.0, 1.0], [0.0, 1.0]];
        let t = triangulate_2d(&p, &[]).unwrap();
        assert!((area_sum(&p, &t) - 2.0).abs() < 1e-12);
    }

    #[test]
    fn circle_with_circular_hole() {
        let n = 64;
        let ring = |r: f64, cw: bool| -> Vec<P2> {
            (0..n)
                .map(|i| {
                    let a = 2.0 * std::f64::consts::PI * i as f64 / n as f64;
                    let a = if cw { -a } else { a };
                    [r * a.cos(), r * a.sin()]
                })
                .collect()
        };
        let outer = ring(10.0, false);
        let hole = ring(3.0, true);
        let t = triangulate_2d(&outer, std::slice::from_ref(&hole)).unwrap();
        let mut pts = outer.clone();
        pts.extend(hole.clone());
        let expected = signed_area(&outer) + signed_area(&hole);
        assert!((area_sum(&pts, &t) - expected).abs() < 1e-9);
    }

    #[test]
    fn plane_projection_keeps_winding() {
        let n = normalize([0.3, -0.2, 0.9]).unwrap();
        let (u, v) = plane_basis(n);
        let sq: Vec<V3> = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]
            .iter()
            .map(|p| crate::math::add(crate::math::scale(u, p[0]), crate::math::scale(v, p[1])))
            .collect();
        let t = triangulate_3d(std::slice::from_ref(&sq), n).unwrap();
        for tri in t {
            let c = crate::math::tri_cross(sq[tri[0]], sq[tri[1]], sq[tri[2]]);
            assert!(dot(c, n) > 0.0);
        }
        let mut rev = sq;
        rev.reverse();
        assert!(triangulate_3d(&[rev], n).is_none());
    }
}
