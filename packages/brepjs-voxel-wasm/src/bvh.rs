//! Median-split AABB BVH over the triangle soup, for nearest-point queries.
//!
//! Accelerates the distance pass in [`crate::ops::voxelize_mesh`] from
//! O(voxels · triangles) to ~O(voxels · log triangles): a branch-and-bound
//! traversal that prunes any box whose lower-bound distance already exceeds the
//! best triangle distance found so far. The leaf test reuses the exact Ericson
//! [`crate::ops::point_to_triangle_distance`] verbatim, so the returned nearest
//! distance is bit-exact with the brute min over all triangles — this is an
//! acceleration, never an approximation.
//
// Built once per voxelize call; internal to the crate, no wasm surface. The
// cdylib build can't see every caller, so silence dead-code as elsewhere.
#![allow(dead_code)]

use crate::fwn::Mesh;
use crate::ops::point_to_triangle_distance;

/// Leaf triangle threshold: small enough that the linear leaf scan is cheap,
/// large enough to bound tree depth and node count.
const LEAF_SIZE: usize = 4;

/// Axis-aligned bounding box in f64.
#[derive(Clone, Copy)]
struct Aabb {
    min: [f64; 3],
    max: [f64; 3],
}

impl Aabb {
    fn empty() -> Aabb {
        Aabb {
            min: [f64::INFINITY; 3],
            max: [f64::NEG_INFINITY; 3],
        }
    }

    fn from_tri(a: [f64; 3], b: [f64; 3], c: [f64; 3]) -> Aabb {
        let mut bb = Aabb::empty();
        bb.expand_point(a);
        bb.expand_point(b);
        bb.expand_point(c);
        bb
    }

    fn expand_point(&mut self, p: [f64; 3]) {
        for (d, &pd) in p.iter().enumerate() {
            if pd < self.min[d] {
                self.min[d] = pd;
            }
            if pd > self.max[d] {
                self.max[d] = pd;
            }
        }
    }

    fn union(&self, other: &Aabb) -> Aabb {
        let mut bb = *self;
        for d in 0..3 {
            if other.min[d] < bb.min[d] {
                bb.min[d] = other.min[d];
            }
            if other.max[d] > bb.max[d] {
                bb.max[d] = other.max[d];
            }
        }
        bb
    }

    /// Squared distance from `p` to the nearest point of the box (0 when inside).
    /// True lower bound on the distance to any triangle contained in the box, so
    /// it is safe to prune a subtree whose value already exceeds the best found.
    fn dist_sq_to_point(&self, p: [f64; 3]) -> f64 {
        let mut acc = 0.0;
        for (d, &pd) in p.iter().enumerate() {
            let gap = (self.min[d] - pd).max(0.0).max(pd - self.max[d]);
            acc += gap * gap;
        }
        acc
    }
}

/// A triangle with vertices dereferenced once at build time, so traversal never
/// re-indexes `mesh.verts`.
#[derive(Clone, Copy)]
struct Tri {
    a: [f64; 3],
    b: [f64; 3],
    c: [f64; 3],
}

enum NodeKind {
    Leaf { start: u32, count: u32 },
    Inner { left: u32, right: u32 },
}

struct BvhNode {
    bounds: Aabb,
    kind: NodeKind,
}

pub struct Bvh {
    nodes: Vec<BvhNode>,
    tris: Vec<Tri>,
    root: u32,
}

impl Bvh {
    pub fn build(mesh: &Mesh) -> Bvh {
        let tris: Vec<Tri> = mesh
            .tris
            .iter()
            .map(|t| Tri {
                a: mesh.verts[t[0]],
                b: mesh.verts[t[1]],
                c: mesh.verts[t[2]],
            })
            .collect();

        if tris.is_empty() {
            return Bvh {
                nodes: Vec::new(),
                tris,
                root: 0,
            };
        }

        let bounds: Vec<Aabb> = tris.iter().map(|t| Aabb::from_tri(t.a, t.b, t.c)).collect();
        let centroids: Vec<[f64; 3]> = tris
            .iter()
            .map(|t| {
                [
                    (t.a[0] + t.b[0] + t.c[0]) / 3.0,
                    (t.a[1] + t.b[1] + t.c[1]) / 3.0,
                    (t.a[2] + t.b[2] + t.c[2]) / 3.0,
                ]
            })
            .collect();

        let mut order: Vec<u32> = (0..tris.len() as u32).collect();
        let mut nodes: Vec<BvhNode> = Vec::new();
        let root = build_recursive(&mut nodes, &mut order, 0, tris.len(), &bounds, &centroids);

        // Reorder tris so each leaf's slice is contiguous in [start, start+count).
        let reordered: Vec<Tri> = order.iter().map(|&i| tris[i as usize]).collect();

        Bvh {
            nodes,
            tris: reordered,
            root,
        }
    }

    /// Exact nearest unsigned distance from `p` to the triangle soup. Returns
    /// `f64::INFINITY` for an empty mesh (matching the brute init value).
    /// Allocates a traversal stack; the voxelization hot path uses
    /// [`nearest_distance_with`](Self::nearest_distance_with) to reuse one.
    pub fn nearest_distance(&self, p: [f64; 3]) -> f64 {
        let mut stack = Vec::new();
        self.nearest_distance_with(p, &mut stack)
    }

    /// As [`nearest_distance`](Self::nearest_distance), but reuses a caller-owned
    /// traversal stack to avoid a per-query heap allocation — at ~47K voxels per
    /// `voxelize_mesh` call that turns 47K allocations into one grow-once buffer.
    pub fn nearest_distance_with(&self, p: [f64; 3], stack: &mut Vec<u32>) -> f64 {
        if self.nodes.is_empty() {
            return f64::INFINITY;
        }

        // `best_sq` drives the squared-space pruning lower bound; `best_d` carries
        // the exact linear distance of the same argmin triangle. Returning `best_d`
        // (not `best_sq.sqrt()`) makes the result the identical f64 the brute min
        // produces — squared comparison is monotonic in d, so the argmin matches.
        let mut best_sq = f64::INFINITY;
        let mut best_d = f64::INFINITY;
        stack.clear();
        stack.push(self.root);

        while let Some(idx) = stack.pop() {
            let node = &self.nodes[idx as usize];
            if node.bounds.dist_sq_to_point(p) >= best_sq {
                continue;
            }
            match node.kind {
                NodeKind::Leaf { start, count } => {
                    for t in &self.tris[start as usize..(start + count) as usize] {
                        let d = point_to_triangle_distance(p, t.a, t.b, t.c);
                        let d_sq = d * d;
                        if d_sq < best_sq {
                            best_sq = d_sq;
                            best_d = d;
                        }
                    }
                }
                NodeKind::Inner { left, right } => {
                    let dl = self.nodes[left as usize].bounds.dist_sq_to_point(p);
                    let dr = self.nodes[right as usize].bounds.dist_sq_to_point(p);
                    // Push the farther child first so the nearer one is popped
                    // first and tightens `best_sq` early (perf only, not result).
                    if dl <= dr {
                        stack.push(right);
                        stack.push(left);
                    } else {
                        stack.push(left);
                        stack.push(right);
                    }
                }
            }
        }

        best_d
    }
}

/// Build a subtree over `order[start..end]`, appending nodes to `nodes` and
/// returning the new node's index. Partitions `order` in place by median centroid.
fn build_recursive(
    nodes: &mut Vec<BvhNode>,
    order: &mut [u32],
    start: usize,
    end: usize,
    bounds: &[Aabb],
    centroids: &[[f64; 3]],
) -> u32 {
    let count = end - start;

    let mut node_bounds = Aabb::empty();
    for &i in &order[start..end] {
        node_bounds = node_bounds.union(&bounds[i as usize]);
    }

    if count <= LEAF_SIZE {
        return push_leaf(nodes, node_bounds, start, count);
    }

    let mut cmin = [f64::INFINITY; 3];
    let mut cmax = [f64::NEG_INFINITY; 3];
    for &i in &order[start..end] {
        let c = centroids[i as usize];
        for d in 0..3 {
            if c[d] < cmin[d] {
                cmin[d] = c[d];
            }
            if c[d] > cmax[d] {
                cmax[d] = c[d];
            }
        }
    }

    let extent = [cmax[0] - cmin[0], cmax[1] - cmin[1], cmax[2] - cmin[2]];
    if extent[0] <= 0.0 && extent[1] <= 0.0 && extent[2] <= 0.0 {
        // All centroids coincide — can't split on a centroid axis.
        return push_leaf(nodes, node_bounds, start, count);
    }

    let axis = if extent[0] >= extent[1] && extent[0] >= extent[2] {
        0
    } else if extent[1] >= extent[2] {
        1
    } else {
        2
    };

    // Spatial-median split: partition centroids around the midpoint of their
    // range on the longest axis. A hand-rolled partition avoids pulling in
    // `select_nth_unstable_by`, whose monomorphization is ~13KB of cdylib. The
    // BVH result is exact for ANY partition, so this only affects tree balance.
    let split_val = (cmin[axis] + cmax[axis]) * 0.5;
    let mut mid = partition_by_axis(order, start, end, axis, split_val, centroids);
    // A tight cluster can land every centroid on one side; fall back to a
    // balanced index split so the recursion always makes progress.
    if mid == start || mid == end {
        mid = start + count / 2;
    }

    let self_idx = nodes.len() as u32;
    nodes.push(BvhNode {
        bounds: node_bounds,
        kind: NodeKind::Leaf { start: 0, count: 0 },
    });

    let left = build_recursive(nodes, order, start, mid, bounds, centroids);
    let right = build_recursive(nodes, order, mid, end, bounds, centroids);
    nodes[self_idx as usize].kind = NodeKind::Inner { left, right };
    self_idx
}

/// Partition `order[start..end]` in place so centroids with `axis` coord below
/// `split_val` come first; returns the boundary index. A two-pointer sweep with
/// no std selection, keeping the wasm build small.
fn partition_by_axis(
    order: &mut [u32],
    start: usize,
    end: usize,
    axis: usize,
    split_val: f64,
    centroids: &[[f64; 3]],
) -> usize {
    let mut i = start;
    let mut j = end;
    while i < j {
        if centroids[order[i] as usize][axis] < split_val {
            i += 1;
        } else {
            j -= 1;
            order.swap(i, j);
        }
    }
    i
}

fn push_leaf(nodes: &mut Vec<BvhNode>, bounds: Aabb, start: usize, count: usize) -> u32 {
    let idx = nodes.len() as u32;
    nodes.push(BvhNode {
        bounds,
        kind: NodeKind::Leaf {
            start: start as u32,
            count: count as u32,
        },
    });
    idx
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ops::nearest_distance_brute;

    fn single_tri() -> Mesh {
        let verts: Vec<f32> = vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        let tris: Vec<u32> = vec![0, 1, 2];
        Mesh::from_flat(&verts, &tris)
    }

    fn unit_cube() -> Mesh {
        let verts: Vec<f32> = vec![
            0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0,
            1.0, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0,
        ];
        let tris: Vec<u32> = vec![
            0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7,
            3, 1, 2, 6, 1, 6, 5,
        ];
        Mesh::from_flat(&verts, &tris)
    }

    /// A deterministic multi-triangle soup spanning a range of positions, large
    /// enough to force several BVH splits.
    fn soup() -> Mesh {
        let mut verts: Vec<f32> = Vec::new();
        let mut tris: Vec<u32> = Vec::new();
        for i in 0..20 {
            let x = i as f32 * 0.37;
            let y = (i as f32 * 0.91).sin();
            let z = (i as f32 * 1.3).cos();
            let base = (verts.len() / 3) as u32;
            verts.extend_from_slice(&[x, y, z, x + 0.5, y + 0.2, z, x + 0.1, y + 0.6, z + 0.3]);
            tris.extend_from_slice(&[base, base + 1, base + 2]);
        }
        Mesh::from_flat(&verts, &tris)
    }

    fn assert_matches_brute(mesh: &Mesh) {
        let bvh = Bvh::build(mesh);
        for iz in -3..=3 {
            for iy in -3..=3 {
                for ix in -3..=3 {
                    let p = [ix as f64 * 0.4, iy as f64 * 0.4, iz as f64 * 0.4];
                    let got = bvh.nearest_distance(p);
                    let want = nearest_distance_brute(mesh, p);
                    assert_eq!(got, want, "mismatch at {p:?}: bvh {got} brute {want}");
                }
            }
        }
    }

    #[test]
    fn nearest_matches_brute_single_tri() {
        assert_matches_brute(&single_tri());
    }

    #[test]
    fn nearest_matches_brute_cube() {
        assert_matches_brute(&unit_cube());
    }

    #[test]
    fn nearest_matches_brute_soup() {
        assert_matches_brute(&soup());
    }

    #[test]
    fn empty_mesh_returns_infinity() {
        let mesh = Mesh::from_flat(&[], &[]);
        let bvh = Bvh::build(&mesh);
        assert_eq!(bvh.nearest_distance([0.0, 0.0, 0.0]), f64::INFINITY);
        assert_eq!(bvh.nearest_distance([5.0, 1.0, -2.0]), f64::INFINITY);
    }

    #[test]
    fn single_tri_makes_one_leaf() {
        let bvh = Bvh::build(&single_tri());
        assert_eq!(bvh.nodes.len(), 1);
        match bvh.nodes[0].kind {
            NodeKind::Leaf { start, count } => {
                assert_eq!(start, 0);
                assert_eq!(count, 1);
            }
            _ => panic!("single triangle must build a single leaf"),
        }
    }

    #[test]
    fn degenerate_zero_area_triangle_matches_brute() {
        // Collinear verts -> zero-area triangle, line-shaped AABB. The leaf test
        // delegates to the existing Ericson fn (unchanged), so parity holds.
        let verts: Vec<f32> = vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 2.0, 0.0, 0.0];
        let tris: Vec<u32> = vec![0, 1, 2];
        let mesh = Mesh::from_flat(&verts, &tris);
        let bvh = Bvh::build(&mesh);
        for &p in &[
            [0.5, 1.0, 0.0],
            [3.0, 0.0, 0.0],
            [-1.0, -1.0, 1.0],
            [1.0, 0.0, 0.0],
        ] {
            assert_eq!(bvh.nearest_distance(p), nearest_distance_brute(&mesh, p));
        }
    }
}
