//! Distance between the input mesh and the output surface, both directions.

use crate::math::{add, dot, scale, sub, V3};

#[derive(Clone, Copy)]
struct Aabb {
    min: V3,
    max: V3,
}

impl Aabb {
    fn empty() -> Aabb {
        Aabb {
            min: [f64::INFINITY; 3],
            max: [f64::NEG_INFINITY; 3],
        }
    }

    fn grow(&mut self, p: V3) {
        for (k, &v) in p.iter().enumerate() {
            self.min[k] = self.min[k].min(v);
            self.max[k] = self.max[k].max(v);
        }
    }

    fn dist2(&self, p: V3) -> f64 {
        let mut d = 0.0;
        for (k, &x) in p.iter().enumerate() {
            let v = (self.min[k] - x).max(0.0).max(x - self.max[k]);
            d += v * v;
        }
        d
    }
}

struct Node {
    bb: Aabb,
    /// Leaf: start..start+count into `order`. Inner: left child at `start`,
    /// right child at `start + 1`, count == 0.
    start: u32,
    count: u32,
}

pub struct Bvh {
    tris: Vec<[V3; 3]>,
    order: Vec<u32>,
    nodes: Vec<Node>,
}

const LEAF: usize = 4;

impl Bvh {
    pub fn new(tris: Vec<[V3; 3]>) -> Bvh {
        let mut order: Vec<u32> = (0..tris.len() as u32).collect();
        let centroids: Vec<V3> = tris
            .iter()
            .map(|t| scale(add(add(t[0], t[1]), t[2]), 1.0 / 3.0))
            .collect();
        let mut nodes = Vec::with_capacity(2 * tris.len() / LEAF + 1);
        nodes.push(Node {
            bb: Aabb::empty(),
            start: 0,
            count: 0,
        });
        let mut stack = vec![(0usize, 0usize, tris.len())];
        while let Some((node, lo, hi)) = stack.pop() {
            let mut bb = Aabb::empty();
            let mut cb = Aabb::empty();
            for &t in &order[lo..hi] {
                for p in tris[t as usize] {
                    bb.grow(p);
                }
                cb.grow(centroids[t as usize]);
            }
            nodes[node].bb = bb;
            if hi - lo <= LEAF {
                nodes[node].start = lo as u32;
                nodes[node].count = (hi - lo) as u32;
                continue;
            }
            let ext = sub(cb.max, cb.min);
            let axis = if ext[0] >= ext[1] && ext[0] >= ext[2] {
                0
            } else if ext[1] >= ext[2] {
                1
            } else {
                2
            };
            let mid = (lo + hi) / 2;
            order[lo..hi].select_nth_unstable_by(mid - lo, |&a, &b| {
                centroids[a as usize][axis].total_cmp(&centroids[b as usize][axis])
            });
            let left = nodes.len();
            nodes.push(Node {
                bb: Aabb::empty(),
                start: 0,
                count: 0,
            });
            nodes.push(Node {
                bb: Aabb::empty(),
                start: 0,
                count: 0,
            });
            nodes[node].start = left as u32;
            nodes[node].count = 0;
            stack.push((left, lo, mid));
            stack.push((left + 1, mid, hi));
        }
        Bvh { tris, order, nodes }
    }

    pub fn distance(&self, p: V3, stack: &mut Vec<u32>) -> f64 {
        self.nearest(p, stack).0
    }

    /// (distance, index of the nearest triangle). The index is `u32::MAX` when
    /// no triangle is nearer than infinity: an empty tree or a non-finite point.
    pub fn nearest(&self, p: V3, stack: &mut Vec<u32>) -> (f64, u32) {
        if self.tris.is_empty() {
            return (f64::INFINITY, u32::MAX);
        }
        let mut best = f64::INFINITY;
        let mut best_t = u32::MAX;
        stack.clear();
        stack.push(0);
        while let Some(n) = stack.pop() {
            let node = &self.nodes[n as usize];
            if node.bb.dist2(p) >= best {
                continue;
            }
            if node.count > 0 {
                for &t in &self.order[node.start as usize..(node.start + node.count) as usize] {
                    let [a, b, c] = self.tris[t as usize];
                    let q = closest_on_triangle(p, a, b, c);
                    let d = sub(p, q);
                    let d2 = dot(d, d);
                    if d2 < best {
                        best = d2;
                        best_t = t;
                    }
                }
            } else {
                let (l, r) = (node.start, node.start + 1);
                let dl = self.nodes[l as usize].bb.dist2(p);
                let dr = self.nodes[r as usize].bb.dist2(p);
                if dl < dr {
                    stack.push(r);
                    stack.push(l);
                } else {
                    stack.push(l);
                    stack.push(r);
                }
            }
        }
        (best.sqrt(), best_t)
    }
}

/// Ericson, Real-Time Collision Detection §5.1.5.
pub fn closest_on_triangle(p: V3, a: V3, b: V3, c: V3) -> V3 {
    let ab = sub(b, a);
    let ac = sub(c, a);
    let ap = sub(p, a);
    let d1 = dot(ab, ap);
    let d2 = dot(ac, ap);
    if d1 <= 0.0 && d2 <= 0.0 {
        return a;
    }
    let bp = sub(p, b);
    let d3 = dot(ab, bp);
    let d4 = dot(ac, bp);
    if d3 >= 0.0 && d4 <= d3 {
        return b;
    }
    let vc = d1 * d4 - d3 * d2;
    if vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0 {
        let v = d1 / (d1 - d3);
        return add(a, scale(ab, v));
    }
    let cp = sub(p, c);
    let d5 = dot(ab, cp);
    let d6 = dot(ac, cp);
    if d6 >= 0.0 && d5 <= d6 {
        return c;
    }
    let vb = d5 * d2 - d1 * d6;
    if vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0 {
        let w = d2 / (d2 - d6);
        return add(a, scale(ac, w));
    }
    let va = d3 * d6 - d5 * d4;
    if va <= 0.0 && (d4 - d3) >= 0.0 && (d5 - d6) >= 0.0 {
        let w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        return add(b, scale(sub(c, b), w));
    }
    let denom = 1.0 / (va + vb + vc);
    let v = vb * denom;
    let w = vc * denom;
    add(a, add(scale(ab, v), scale(ac, w)))
}

#[derive(Clone, Debug, Default)]
pub struct DeviationStats {
    pub max: f64,
    pub rms: f64,
    pub p95: f64,
    /// Share of sampled input points within `tolerance` of the output.
    pub within_tolerance: f64,
    /// Largest distance from the output back to the input over the sampled
    /// points (each sampled output triangle's corners and centroid).
    pub reverse_max: f64,
    pub samples: usize,
}

/// `per_point` is filled with the distance of every input vertex to the
/// output when requested; otherwise stats come from a strided sample.
pub fn measure(
    input_points: &[V3],
    input_tris: &[[V3; 3]],
    output_tris: &[[V3; 3]],
    tolerance: f64,
    per_point: Option<&mut Vec<f32>>,
    max_samples: usize,
) -> DeviationStats {
    let out_bvh = Bvh::new(output_tris.to_vec());
    let mut stack = Vec::new();
    let mut dists: Vec<f64> = Vec::new();
    match per_point {
        Some(buf) => {
            buf.clear();
            buf.reserve(input_points.len());
            for &p in input_points {
                let d = out_bvh.distance(p, &mut stack);
                buf.push(d as f32);
                dists.push(d);
            }
        }
        None => {
            let stride = input_points.len().div_ceil(max_samples.max(1)).max(1);
            for &p in input_points.iter().step_by(stride) {
                dists.push(out_bvh.distance(p, &mut stack));
            }
        }
    }
    let mut stats = DeviationStats {
        samples: dists.len(),
        ..DeviationStats::default()
    };
    if !dists.is_empty() {
        stats.max = dists.iter().cloned().fold(0.0, f64::max);
        stats.rms = (dists.iter().map(|d| d * d).sum::<f64>() / dists.len() as f64).sqrt();
        stats.within_tolerance =
            dists.iter().filter(|&&d| d <= tolerance).count() as f64 / dists.len() as f64;
        let k = ((dists.len() - 1) as f64 * 0.95).round() as usize;
        let (_, x, _) = dists.select_nth_unstable_by(k, |a, b| a.total_cmp(b));
        stats.p95 = *x;
    }
    let in_bvh = Bvh::new(input_tris.to_vec());
    let stride = output_tris.len().div_ceil(max_samples.max(1)).max(1);
    for t in output_tris.iter().step_by(stride) {
        let c = scale(add(add(t[0], t[1]), t[2]), 1.0 / 3.0);
        for p in [t[0], t[1], t[2], c] {
            stats.reverse_max = stats.reverse_max.max(in_bvh.distance(p, &mut stack));
        }
    }
    stats
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn closest_point_regions() {
        let (a, b, c) = ([0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]);
        let q = closest_on_triangle([0.2, 0.2, 5.0], a, b, c);
        assert!(crate::math::dist(q, [0.2, 0.2, 0.0]) < 1e-12);
        assert_eq!(closest_on_triangle([-1.0, -1.0, 0.0], a, b, c), a);
        assert_eq!(closest_on_triangle([2.0, -1.0, 0.0], a, b, c), b);
        let q = closest_on_triangle([1.0, 1.0, 0.0], a, b, c);
        assert!((q[0] - 0.5).abs() < 1e-12 && (q[1] - 0.5).abs() < 1e-12);
    }

    #[test]
    fn bvh_matches_brute_force() {
        let mut tris = Vec::new();
        for i in 0..40 {
            let x = i as f64;
            tris.push([[x, 0.0, 0.0], [x + 1.0, 0.0, 0.0], [x, 1.0, (i % 3) as f64]]);
        }
        let bvh = Bvh::new(tris.clone());
        let mut stack = Vec::new();
        for k in 0..50 {
            let p = [
                k as f64 * 0.83,
                (k % 7) as f64 * 0.3 - 1.0,
                (k % 5) as f64 - 2.0,
            ];
            let brute = tris
                .iter()
                .map(|t| {
                    let q = closest_on_triangle(p, t[0], t[1], t[2]);
                    crate::math::dist(p, q)
                })
                .fold(f64::INFINITY, f64::min);
            assert!((bvh.distance(p, &mut stack) - brute).abs() < 1e-12);
        }
    }

    #[test]
    fn identical_surfaces_have_zero_deviation() {
        let tris = vec![[[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]];
        let pts = vec![[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]];
        let mut per = Vec::new();
        let s = measure(&pts, &tris, &tris, 1e-9, Some(&mut per), 1000);
        assert_eq!(s.max, 0.0);
        assert_eq!(s.within_tolerance, 1.0);
        assert_eq!(per.len(), 3);
    }
}
