//! Quadric-error edge-collapse decimation (Garland & Heckbert 1997).
//!
//! Every collapse whose area-weighted mean squared distance to the original
//! planes stays under `max_error²` is taken; past that, collapses continue only
//! while the mesh is above its triangle budget. Open-boundary edges carry
//! penalty planes so outlines hold; vertices on non-manifold edges never move.

use std::cmp::Ordering;
use std::collections::BinaryHeap;

use crate::math::{add, cross, dist, dot, normalize, scale, sub, tri_cross, tri_quality, V3};
use crate::mesh::{Mesh, Topology, NON_MANIFOLD, NO_NEIGHBOR};

#[derive(Clone, Copy, Default)]
struct Quadric([f64; 10]);

impl Quadric {
    fn plane(n: V3, d: f64, w: f64) -> Quadric {
        let (a, b, c, e) = (n[0], n[1], n[2], -d);
        Quadric([
            w * a * a,
            w * a * b,
            w * a * c,
            w * a * e,
            w * b * b,
            w * b * c,
            w * b * e,
            w * c * c,
            w * c * e,
            w * e * e,
        ])
    }

    fn add(&mut self, o: &Quadric) {
        for k in 0..10 {
            self.0[k] += o.0[k];
        }
    }

    fn sum(a: &Quadric, b: &Quadric) -> Quadric {
        let mut q = *a;
        q.add(b);
        q
    }

    fn error_at(&self, p: V3) -> f64 {
        let q = &self.0;
        let (x, y, z) = (p[0], p[1], p[2]);
        q[0] * x * x
            + 2.0 * q[1] * x * y
            + 2.0 * q[2] * x * z
            + 2.0 * q[3] * x
            + q[4] * y * y
            + 2.0 * q[5] * y * z
            + 2.0 * q[6] * y
            + q[7] * z * z
            + 2.0 * q[8] * z
            + q[9]
    }

    fn minimizer(&self) -> Option<V3> {
        let q = &self.0;
        let m = [[q[0], q[1], q[2]], [q[1], q[4], q[5]], [q[2], q[5], q[7]]];
        let r = [-q[3], -q[6], -q[8]];
        let det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
            - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
            + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
        let scale_ref = (m[0][0] + m[1][1] + m[2][2]).powi(3);
        if scale_ref <= 0.0 || det.abs() < 1e-9 * scale_ref {
            return None;
        }
        let inv = 1.0 / det;
        let solve = |c: usize| {
            let mut mm = m;
            for row in 0..3 {
                mm[row][c] = r[row];
            }
            mm[0][0] * (mm[1][1] * mm[2][2] - mm[1][2] * mm[2][1])
                - mm[0][1] * (mm[1][0] * mm[2][2] - mm[1][2] * mm[2][0])
                + mm[0][2] * (mm[1][0] * mm[2][1] - mm[1][1] * mm[2][0])
        };
        Some([solve(0) * inv, solve(1) * inv, solve(2) * inv])
    }
}

#[derive(PartialEq)]
struct Candidate {
    cost: f64,
    u: u32,
    v: u32,
    vu: u32,
    vv: u32,
    target: V3,
}

impl Eq for Candidate {}

impl Ord for Candidate {
    fn cmp(&self, other: &Self) -> Ordering {
        other.cost.total_cmp(&self.cost)
    }
}

impl PartialOrd for Candidate {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

#[derive(Debug, Default, Clone)]
pub struct DecimateReport {
    pub triangles_before: usize,
    pub triangles_after: usize,
    /// sqrt of the largest accepted collapse cost (RMS distance to merged planes).
    pub max_error: f64,
    pub over_budget_collapses: usize,
    /// False when topology guards blocked every remaining collapse before the
    /// mesh got down to the triangle budget.
    pub budget_reached: bool,
}

const BOUNDARY_WEIGHT: f64 = 1000.0;

struct State<'a> {
    pos: &'a mut Vec<V3>,
    tris: &'a mut Vec<[u32; 3]>,
    alive: Vec<bool>,
    vtris: Vec<Vec<u32>>,
    q: Vec<Quadric>,
    area: Vec<f64>,
    removed: Vec<bool>,
    locked: Vec<bool>,
    boundary: Vec<bool>,
    version: Vec<u32>,
}

impl State<'_> {
    fn neighbors(&self, v: u32) -> Vec<u32> {
        let mut out = Vec::new();
        for &t in &self.vtris[v as usize] {
            if !self.alive[t as usize] {
                continue;
            }
            for &w in &self.tris[t as usize] {
                if w != v {
                    out.push(w);
                }
            }
        }
        out.sort_unstable();
        out.dedup();
        out
    }

    fn edge_tris(&self, u: u32, v: u32) -> Vec<u32> {
        self.vtris[u as usize]
            .iter()
            .copied()
            .filter(|&t| self.alive[t as usize] && self.tris[t as usize].contains(&v))
            .collect()
    }

    fn candidate(&self, u: u32, v: u32) -> Option<Candidate> {
        let (ui, vi) = (u as usize, v as usize);
        if self.locked[ui] && self.locked[vi] {
            return None;
        }
        let q = Quadric::sum(&self.q[ui], &self.q[vi]);
        let a = (self.area[ui] + self.area[vi]).max(f64::MIN_POSITIVE);
        let (pu, pv) = (self.pos[ui], self.pos[vi]);
        let target = if self.locked[ui] {
            pu
        } else if self.locked[vi] {
            pv
        } else {
            let mid = scale(add(pu, pv), 0.5);
            let len = dist(pu, pv);
            match q.minimizer() {
                Some(p) if dist(p, mid) <= len => p,
                _ => *[pu, pv, mid]
                    .iter()
                    .min_by(|x, y| q.error_at(**x).total_cmp(&q.error_at(**y)))
                    .unwrap_or(&mid),
            }
        };
        let cost = (q.error_at(target) / a).max(0.0);
        Some(Candidate {
            cost,
            u,
            v,
            vu: self.version[ui],
            vv: self.version[vi],
            target,
        })
    }

    fn valid(&self, u: u32, v: u32, p: V3) -> bool {
        let shared = self.edge_tris(u, v);
        if shared.is_empty() || shared.len() > 2 {
            return false;
        }
        if self.boundary[u as usize] && self.boundary[v as usize] && shared.len() != 1 {
            return false;
        }
        let nu = self.neighbors(u);
        let nv = self.neighbors(v);
        let common = nu.iter().filter(|w| nv.binary_search(w).is_ok()).count();
        if common != shared.len() {
            return false;
        }
        // The link condition alone lets a tetrahedron (or any closed piece whose
        // collapse leaves two triangles on the same three vertices) fold into a
        // zero-volume double face. Refuse any collapse that duplicates a face.
        let mut after: Vec<[u32; 3]> = Vec::new();
        for moving in [u, v] {
            for &t in &self.vtris[moving as usize] {
                if !self.alive[t as usize] {
                    continue;
                }
                let tri = self.tris[t as usize];
                if tri.contains(&u) && tri.contains(&v) {
                    continue;
                }
                let mut k = tri.map(|w| if w == u { v } else { w });
                k.sort_unstable();
                after.push(k);
            }
        }
        after.sort_unstable();
        if after.windows(2).any(|w| w[0] == w[1]) {
            return false;
        }
        for (moving, other) in [(u, v), (v, u)] {
            for &t in &self.vtris[moving as usize] {
                if !self.alive[t as usize] {
                    continue;
                }
                let tri = self.tris[t as usize];
                if tri.contains(&other) {
                    continue;
                }
                let pts = tri.map(|w| self.pos[w as usize]);
                let moved = tri.map(|w| if w == moving { p } else { self.pos[w as usize] });
                let (Some(n0), Some(n1)) = (
                    normalize(tri_cross(pts[0], pts[1], pts[2])),
                    normalize(tri_cross(moved[0], moved[1], moved[2])),
                ) else {
                    return false;
                };
                if dot(n0, n1) < 0.2 {
                    return false;
                }
                let q0 = tri_quality(pts[0], pts[1], pts[2]);
                let q1 = tri_quality(moved[0], moved[1], moved[2]);
                if q1 < 0.02 && q1 < q0 {
                    return false;
                }
            }
        }
        true
    }

    fn collapse(&mut self, u: u32, v: u32, p: V3) {
        let (ui, vi) = (u as usize, v as usize);
        self.pos[vi] = p;
        let incident = std::mem::take(&mut self.vtris[ui]);
        for t in incident {
            let ti = t as usize;
            if !self.alive[ti] {
                continue;
            }
            if self.tris[ti].contains(&v) {
                self.alive[ti] = false;
                continue;
            }
            for w in self.tris[ti].iter_mut() {
                if *w == u {
                    *w = v;
                }
            }
            self.vtris[vi].push(t);
        }
        self.vtris[vi].retain(|&t| self.alive[t as usize]);
        let qu = self.q[ui];
        self.q[vi].add(&qu);
        self.area[vi] += self.area[ui];
        self.boundary[vi] |= self.boundary[ui];
        self.removed[ui] = true;
        self.version[ui] += 1;
        self.version[vi] += 1;
    }
}

pub fn decimate(mesh: &mut Mesh, target_triangles: usize, max_error: f64) -> DecimateReport {
    let before = mesh.triangles.len();
    let mut report = DecimateReport {
        triangles_before: before,
        triangles_after: before,
        ..DecimateReport::default()
    };
    if before == 0 {
        return report;
    }
    let topo = Topology::build(mesh);
    let nv = mesh.positions.len();
    let mut q = vec![Quadric::default(); nv];
    let mut area = vec![0.0; nv];
    let mut locked = vec![false; nv];
    let mut boundary = vec![false; nv];
    let mut vtris: Vec<Vec<u32>> = vec![Vec::new(); nv];
    for (t, tri) in mesh.triangles.iter().enumerate() {
        let pts = tri.map(|v| mesh.positions[v as usize]);
        let c = tri_cross(pts[0], pts[1], pts[2]);
        let a = 0.5 * crate::math::norm(c);
        if let Some(n) = normalize(c) {
            let k = Quadric::plane(n, dot(n, pts[0]), a);
            for &v in tri {
                q[v as usize].add(&k);
                area[v as usize] += a;
            }
        }
        for &v in tri {
            vtris[v as usize].push(t as u32);
        }
        for i in 0..3 {
            let (va, vb) = (tri[i], tri[(i + 1) % 3]);
            match topo.neighbors[t][i] {
                NO_NEIGHBOR => {
                    boundary[va as usize] = true;
                    boundary[vb as usize] = true;
                    if let Some(n) = normalize(c) {
                        let e = sub(mesh.positions[vb as usize], mesh.positions[va as usize]);
                        if let Some(bn) = normalize(cross(e, n)) {
                            let w = BOUNDARY_WEIGHT * dot(e, e);
                            let k = Quadric::plane(bn, dot(bn, mesh.positions[va as usize]), w);
                            q[va as usize].add(&k);
                            q[vb as usize].add(&k);
                        }
                    }
                }
                NON_MANIFOLD => {
                    locked[va as usize] = true;
                    locked[vb as usize] = true;
                }
                _ => {}
            }
        }
    }

    let mut st = State {
        pos: &mut mesh.positions,
        tris: &mut mesh.triangles,
        alive: vec![true; before],
        vtris,
        q,
        area,
        removed: vec![false; nv],
        locked,
        boundary,
        version: vec![0; nv],
    };

    let mut heap = BinaryHeap::new();
    for tri in st.tris.iter() {
        for i in 0..3 {
            let (a, b) = (tri[i], tri[(i + 1) % 3]);
            if a < b {
                if let Some(c) = st.candidate(a, b) {
                    heap.push(c);
                }
            }
        }
    }
    let threshold = max_error * max_error;
    let mut alive_count = before;
    while let Some(c) = heap.pop() {
        let (ui, vi) = (c.u as usize, c.v as usize);
        if st.removed[ui] || st.removed[vi] || st.version[ui] != c.vu || st.version[vi] != c.vv {
            continue;
        }
        let over_budget = alive_count > target_triangles;
        if c.cost > threshold && !over_budget {
            break;
        }
        let (keep, gone) = if st.locked[ui] {
            (c.u, c.v)
        } else {
            (c.v, c.u)
        };
        if !st.valid(gone, keep, c.target) {
            continue;
        }
        let killed = st.edge_tris(gone, keep).len();
        st.collapse(gone, keep, c.target);
        alive_count -= killed;
        report.max_error = report.max_error.max(c.cost.sqrt());
        if c.cost > threshold {
            report.over_budget_collapses += 1;
        }
        for w in st.neighbors(keep) {
            let (a, b) = if keep < w { (keep, w) } else { (w, keep) };
            if let Some(nc) = st.candidate(a, b) {
                heap.push(nc);
            }
        }
    }

    let alive = std::mem::take(&mut st.alive);
    let mut k = 0;
    mesh.triangles.retain(|_| {
        let keep = alive[k];
        k += 1;
        keep
    });
    mesh.compact();
    report.triangles_after = mesh.triangles.len();
    report.budget_reached = report.triangles_after <= target_triangles;
    report
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mesh::fixtures::{cube, sphere};

    fn grid_plane(n: usize) -> Mesh {
        let mut m = Mesh::default();
        for j in 0..=n {
            for i in 0..=n {
                m.positions.push([i as f64, j as f64, 0.0]);
            }
        }
        let id = |i: usize, j: usize| (j * (n + 1) + i) as u32;
        for j in 0..n {
            for i in 0..n {
                m.triangles.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)]);
                m.triangles.push([id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
            }
        }
        m
    }

    #[test]
    fn flat_grid_collapses_but_keeps_outline() {
        let mut m = grid_plane(10);
        let r = decimate(&mut m, usize::MAX, 1e-9);
        assert!(r.triangles_after < 50, "after {}", r.triangles_after);
        let area: f64 = (0..m.triangles.len()).map(|t| m.area(t)).sum();
        assert!((area - 100.0).abs() < 1e-6, "area {area}");
        let b = m.bbox();
        assert!((b.max[0] - 10.0).abs() < 1e-9 && (b.min[1]).abs() < 1e-9);
    }

    #[test]
    fn cube_survives_lossless_pass() {
        let mut m = cube(1.0);
        decimate(&mut m, usize::MAX, 1e-9);
        assert_eq!(m.triangles.len(), 12);
        let all: Vec<u32> = (0..m.triangles.len() as u32).collect();
        assert!((m.signed_volume_of(&all) - 1.0).abs() < 1e-12);
    }

    #[test]
    fn tetrahedra_never_collapse_flat() {
        let tet = |o: f64| Mesh {
            positions: vec![
                [o, 0.0, 0.0],
                [o + 1.0, 0.0, 0.0],
                [o, 1.0, 0.0],
                [o, 0.0, 1.0],
            ],
            triangles: vec![[0, 2, 1], [0, 1, 3], [1, 2, 3], [0, 3, 2]],
        };
        let mut m = tet(0.0);
        let other = tet(5.0);
        let base = m.positions.len() as u32;
        m.positions.extend(other.positions);
        m.triangles
            .extend(other.triangles.iter().map(|t| t.map(|v| v + base)));
        decimate(&mut m, 4, 0.0);
        let all: Vec<u32> = (0..m.triangles.len() as u32).collect();
        assert_eq!(m.triangles.len(), 8);
        assert!((m.signed_volume_of(&all) - 2.0 / 6.0).abs() < 1e-12);
    }

    #[test]
    fn sphere_budget_reached_and_closed() {
        let mut m = sphere(10.0, 40, 80);
        let target = 800;
        let r = decimate(&mut m, target, 0.0);
        assert!(
            r.triangles_after <= target + 2,
            "after {}",
            r.triangles_after
        );
        let topo = Topology::build(&m);
        assert_eq!(topo.boundary_edges, 0);
        assert_eq!(topo.non_manifold_edges, 0);
        let all: Vec<u32> = (0..m.triangles.len() as u32).collect();
        let v = m.signed_volume_of(&all);
        let exact = 4.0 / 3.0 * std::f64::consts::PI * 1000.0;
        assert!((v - exact).abs() / exact < 0.05, "volume {v}");
    }
}
