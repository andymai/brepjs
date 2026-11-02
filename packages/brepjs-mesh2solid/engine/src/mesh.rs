use std::collections::HashMap;

use crate::math::{sub, tri_area, Bbox, V3};

#[derive(Clone, Debug, Default)]
pub struct Mesh {
    pub positions: Vec<V3>,
    pub triangles: Vec<[u32; 3]>,
}

pub const NO_NEIGHBOR: u32 = u32::MAX;
pub const NON_MANIFOLD: u32 = u32::MAX - 1;

impl Mesh {
    pub fn bbox(&self) -> Bbox {
        Bbox::of(&self.positions)
    }

    pub fn tri(&self, t: usize) -> [V3; 3] {
        let [a, b, c] = self.triangles[t];
        [
            self.positions[a as usize],
            self.positions[b as usize],
            self.positions[c as usize],
        ]
    }

    pub fn area(&self, t: usize) -> f64 {
        let [a, b, c] = self.tri(t);
        tri_area(a, b, c)
    }

    pub fn scale(&mut self, s: f64) {
        if s == 1.0 {
            return;
        }
        for p in &mut self.positions {
            for v in p.iter_mut() {
                *v *= s;
            }
        }
    }

    /// Signed volume by the divergence theorem; positive when a closed mesh faces outward.
    /// Measured about the first vertex rather than the origin, so a small body
    /// far from the origin doesn't lose its sign to cancellation.
    pub fn signed_volume_of(&self, tris: &[u32]) -> f64 {
        let Some(&first) = tris.first() else {
            return 0.0;
        };
        let o = self.tri(first as usize)[0];
        let mut v = 0.0;
        for &t in tris {
            let [a, b, c] = self.tri(t as usize).map(|p| sub(p, o));
            v += crate::math::dot(a, crate::math::cross(b, c));
        }
        v / 6.0
    }

    /// Drop vertices no triangle references, renumbering triangles.
    pub fn compact(&mut self) {
        let mut remap = vec![u32::MAX; self.positions.len()];
        let mut positions = Vec::with_capacity(self.positions.len());
        for tri in &mut self.triangles {
            for v in tri.iter_mut() {
                let old = *v as usize;
                if remap[old] == u32::MAX {
                    remap[old] = positions.len() as u32;
                    positions.push(self.positions[old]);
                }
                *v = remap[old];
            }
        }
        self.positions = positions;
    }
}

#[inline]
pub(crate) fn edge_key(a: u32, b: u32) -> u64 {
    let (lo, hi) = if a < b { (a, b) } else { (b, a) };
    ((lo as u64) << 32) | hi as u64
}

/// Triangle adjacency across edges. Edge `i` of triangle `t` runs from corner `i`
/// to corner `(i + 1) % 3`.
pub struct Topology {
    /// Neighbor triangle across each edge, or `NO_NEIGHBOR` (open boundary) or
    /// `NON_MANIFOLD` (three or more triangles share the edge).
    pub neighbors: Vec<[u32; 3]>,
    pub boundary_edges: usize,
    pub non_manifold_edges: usize,
    pub edge_count: usize,
}

impl Topology {
    pub fn build(mesh: &Mesh) -> Topology {
        let mut edges: HashMap<u64, Vec<(u32, u8)>> =
            HashMap::with_capacity(mesh.triangles.len() * 2);
        for (t, tri) in mesh.triangles.iter().enumerate() {
            for i in 0..3 {
                let a = tri[i];
                let b = tri[(i + 1) % 3];
                edges
                    .entry(edge_key(a, b))
                    .or_default()
                    .push((t as u32, i as u8));
            }
        }
        let mut neighbors = vec![[NO_NEIGHBOR; 3]; mesh.triangles.len()];
        let mut boundary_edges = 0;
        let mut non_manifold_edges = 0;
        for uses in edges.values() {
            match uses.len() {
                1 => boundary_edges += 1,
                2 => {
                    let (t0, i0) = uses[0];
                    let (t1, i1) = uses[1];
                    neighbors[t0 as usize][i0 as usize] = t1;
                    neighbors[t1 as usize][i1 as usize] = t0;
                }
                _ => {
                    non_manifold_edges += 1;
                    for &(t, i) in uses {
                        neighbors[t as usize][i as usize] = NON_MANIFOLD;
                    }
                }
            }
        }
        Topology {
            neighbors,
            boundary_edges,
            non_manifold_edges,
            edge_count: edges.len(),
        }
    }

    #[inline]
    pub fn neighbor(&self, t: usize, i: usize) -> Option<usize> {
        let n = self.neighbors[t][i];
        if n == NO_NEIGHBOR || n == NON_MANIFOLD {
            None
        } else {
            Some(n as usize)
        }
    }

    /// Connected components over manifold edges, as lists of triangle ids.
    pub fn components(&self) -> Vec<Vec<u32>> {
        let n = self.neighbors.len();
        let mut comp = vec![u32::MAX; n];
        let mut out = Vec::new();
        let mut stack = Vec::new();
        for seed in 0..n {
            if comp[seed] != u32::MAX {
                continue;
            }
            let id = out.len() as u32;
            let mut members = Vec::new();
            comp[seed] = id;
            stack.push(seed);
            while let Some(t) = stack.pop() {
                members.push(t as u32);
                for i in 0..3 {
                    if let Some(nb) = self.neighbor(t, i) {
                        if comp[nb] == u32::MAX {
                            comp[nb] = id;
                            stack.push(nb);
                        }
                    }
                }
            }
            out.push(members);
        }
        out
    }
}

/// Merge vertices closer than `eps` (exact duplicates when `eps` is 0). Returns
/// the number of vertices removed.
pub fn weld(mesh: &mut Mesh, eps: f64) -> usize {
    let before = mesh.positions.len();
    let mut remap = vec![0u32; before];
    let mut kept: Vec<V3> = Vec::with_capacity(before);
    if eps <= 0.0 || !eps.is_finite() {
        let mut seen: HashMap<[u64; 3], u32> = HashMap::with_capacity(before);
        for (i, p) in mesh.positions.iter().enumerate() {
            let key = [canon(p[0]), canon(p[1]), canon(p[2])];
            let id = *seen.entry(key).or_insert_with(|| {
                kept.push(*p);
                (kept.len() - 1) as u32
            });
            remap[i] = id;
        }
    } else {
        let inv = 1.0 / eps;
        let cell = |p: V3| -> [i64; 3] {
            [
                (p[0] * inv).floor() as i64,
                (p[1] * inv).floor() as i64,
                (p[2] * inv).floor() as i64,
            ]
        };
        let mut grid: HashMap<[i64; 3], Vec<u32>> = HashMap::with_capacity(before);
        let eps2 = eps * eps;
        for (i, p) in mesh.positions.iter().enumerate() {
            let c = cell(*p);
            let mut found = None;
            'search: for dx in -1..=1 {
                for dy in -1..=1 {
                    for dz in -1..=1 {
                        if let Some(bucket) = grid.get(&[c[0] + dx, c[1] + dy, c[2] + dz]) {
                            for &k in bucket {
                                let d = sub(kept[k as usize], *p);
                                if d[0] * d[0] + d[1] * d[1] + d[2] * d[2] <= eps2 {
                                    found = Some(k);
                                    break 'search;
                                }
                            }
                        }
                    }
                }
            }
            let id = match found {
                Some(k) => k,
                None => {
                    kept.push(*p);
                    let k = (kept.len() - 1) as u32;
                    grid.entry(c).or_default().push(k);
                    k
                }
            };
            remap[i] = id;
        }
    }
    for tri in &mut mesh.triangles {
        for v in tri.iter_mut() {
            *v = remap[*v as usize];
        }
    }
    mesh.positions = kept;
    before - mesh.positions.len()
}

#[inline]
fn canon(v: f64) -> u64 {
    if v == 0.0 {
        0
    } else {
        v.to_bits()
    }
}

#[cfg(test)]
pub mod fixtures {
    use super::Mesh;

    /// Axis-aligned box, outward-facing, 12 triangles over 8 shared vertices.
    pub fn cube(size: f64) -> Mesh {
        let s = size;
        let positions = vec![
            [0.0, 0.0, 0.0],
            [s, 0.0, 0.0],
            [s, s, 0.0],
            [0.0, s, 0.0],
            [0.0, 0.0, s],
            [s, 0.0, s],
            [s, s, s],
            [0.0, s, s],
        ];
        let triangles = vec![
            [0, 2, 1],
            [0, 3, 2],
            [4, 5, 6],
            [4, 6, 7],
            [0, 1, 5],
            [0, 5, 4],
            [1, 2, 6],
            [1, 6, 5],
            [2, 3, 7],
            [2, 7, 6],
            [3, 0, 4],
            [3, 4, 7],
        ];
        Mesh {
            positions,
            triangles,
        }
    }

    /// Triangle soup (no shared vertices), as an STL would store it.
    pub fn soup(mesh: &Mesh) -> Mesh {
        let mut out = Mesh::default();
        for tri in &mesh.triangles {
            let base = out.positions.len() as u32;
            for &v in tri {
                out.positions.push(mesh.positions[v as usize]);
            }
            out.triangles.push([base, base + 1, base + 2]);
        }
        out
    }

    /// UV sphere, outward-facing.
    pub fn sphere(radius: f64, rings: usize, segments: usize) -> Mesh {
        let mut m = Mesh::default();
        m.positions.push([0.0, 0.0, radius]);
        for r in 1..rings {
            let phi = std::f64::consts::PI * r as f64 / rings as f64;
            for s in 0..segments {
                let theta = 2.0 * std::f64::consts::PI * s as f64 / segments as f64;
                m.positions.push([
                    radius * phi.sin() * theta.cos(),
                    radius * phi.sin() * theta.sin(),
                    radius * phi.cos(),
                ]);
            }
        }
        m.positions.push([0.0, 0.0, -radius]);
        let south = (m.positions.len() - 1) as u32;
        let ring = |r: usize, s: usize| (1 + (r - 1) * segments + (s % segments)) as u32;
        for s in 0..segments {
            m.triangles.push([0, ring(1, s), ring(1, s + 1)]);
        }
        for r in 1..rings - 1 {
            for s in 0..segments {
                let a = ring(r, s);
                let b = ring(r + 1, s);
                let c = ring(r + 1, s + 1);
                let d = ring(r, s + 1);
                m.triangles.push([a, b, c]);
                m.triangles.push([a, c, d]);
            }
        }
        for s in 0..segments {
            m.triangles
                .push([south, ring(rings - 1, s + 1), ring(rings - 1, s)]);
        }
        m
    }
}

#[cfg(test)]
mod tests {
    use super::fixtures::*;
    use super::*;

    #[test]
    fn weld_soup_restores_shared_vertices() {
        let mut m = soup(&cube(1.0));
        assert_eq!(m.positions.len(), 36);
        let removed = weld(&mut m, 0.0);
        assert_eq!(removed, 28);
        assert_eq!(m.positions.len(), 8);
        let topo = Topology::build(&m);
        assert_eq!(topo.boundary_edges, 0);
        assert_eq!(topo.non_manifold_edges, 0);
        assert_eq!(topo.edge_count, 18);
    }

    #[test]
    fn tolerance_weld_merges_near_duplicates() {
        let mut m = soup(&cube(1.0));
        m.positions[5][0] += 1e-9;
        assert_eq!(weld(&mut m, 0.0), 27);
        let mut m = soup(&cube(1.0));
        m.positions[5][0] += 1e-9;
        weld(&mut m, 1e-7);
        assert_eq!(m.positions.len(), 8);
    }

    #[test]
    fn cube_is_closed_and_outward() {
        let m = cube(2.0);
        let all: Vec<u32> = (0..m.triangles.len() as u32).collect();
        assert!((m.signed_volume_of(&all) - 8.0).abs() < 1e-12);
        let topo = Topology::build(&m);
        assert_eq!(topo.components().len(), 1);
    }

    #[test]
    fn volume_sign_survives_large_offsets() {
        let mut m = cube(1e-3);
        for p in m.positions.iter_mut() {
            p[0] += 1e6;
            p[1] -= 3e5;
        }
        let all: Vec<u32> = (0..m.triangles.len() as u32).collect();
        let v = m.signed_volume_of(&all);
        assert!((v - 1e-9).abs() < 1e-11, "volume {v}");
    }

    #[test]
    fn sphere_fixture_closed() {
        let m = sphere(1.0, 12, 24);
        let topo = Topology::build(&m);
        assert_eq!(topo.boundary_edges, 0);
        let all: Vec<u32> = (0..m.triangles.len() as u32).collect();
        assert!(m.signed_volume_of(&all) > 3.9);
    }
}
