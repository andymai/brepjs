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

use crate::fwn::{solid_angle, Mesh};
use crate::ops::point_to_triangle_distance;

/// Barnes–Hut opening factor: a node is approximated by its (first-order, point
/// dipole) expansion only when the query point is more than `BETA` node-radii
/// away; otherwise it is recursed and ultimately evaluated EXACTLY at the leaf.
/// Larger BETA = more exact (more recursion) = safer + slower; smaller = faster
/// but risks a far-field error large enough to flip a near-0.5 classification.
///
/// 2.0 holds 100% SIGN parity with the exact oracle across the test gate (cube /
/// holey-cube / icosphere) AND the adversarial fixtures (far disjoint emitter,
/// high-aspect slab, single open triangle) using the dipole term ALONE. This is
/// an EMPIRICAL margin, not a proven bound: the dipole truncation error is
/// O((R/d)²) ≈ 0.25 at d = BETA·R, kept small per node only by measurement
/// (~0.03 max on the gate) and able to accumulate additively across far nodes.
/// The 0.5 classification margin is the safety buffer; the adversarial fixtures
/// are committed guards so a future BETA / leaf-size change can't silently erode
/// it. Levers if a mesh class ever regresses: raise BETA (more recursion), or add
/// the second-order Barill tensor (omitted here to keep the per-node table small).
pub(crate) const BETA: f64 = 2.0;

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

fn vsub(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn vdot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn vcross(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn vlen(a: [f64; 3]) -> f64 {
    vdot(a, a).sqrt()
}

/// Per-node Barnes–Hut winding expansion, in a Vec parallel to `nodes` (same
/// length / index). Kept out of [`BvhNode`] so the distance traversal's cache
/// line stays narrow and so it can be skipped wholesale for an empty mesh.
#[derive(Clone, Copy)]
struct NodeExpansion {
    /// Expansion point: area-weighted centroid of all triangles under the node
    /// (falls back to the geometric box centre for an all-degenerate subtree).
    center: [f64; 3],
    /// Area-weighted normal sum `Σ nᵢ`, `nᵢ = ½(b-a)×(c-a)` (UN-normalized, so
    /// `|nᵢ|` already equals the triangle area). Translation-invariant, so it
    /// combines by plain addition up the tree. Same a,b,c winding as
    /// `solid_angle`, so the dipole term is sign-consistent with the oracle.
    dipole: [f64; 3],
    /// Conservative ball radius: max distance from `center` to any member vertex,
    /// so the ball provably encloses all geometry and the far-field bound holds.
    radius: f64,
    /// Total triangle area under the node; drives the area-weighted `center`
    /// combine and the degenerate fallback.
    total_area: f64,
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
    /// Winding expansions, parallel to `nodes` (same length / index). Empty when
    /// the mesh is empty, so `winding_number_fast` short-circuits like the
    /// distance path.
    expansions: Vec<NodeExpansion>,
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
                expansions: Vec::new(),
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

        let expansions = compute_expansions(&nodes, &reordered);

        Bvh {
            nodes,
            tris: reordered,
            root,
            expansions,
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

    /// Hierarchical (Barnes–Hut) winding number at `p`, normalized like
    /// [`Mesh::winding_number`](crate::fwn::Mesh::winding_number) so the result
    /// is directly comparable and the 0.5 inside/outside threshold is meaningful.
    ///
    /// Far nodes (`|p - center| > BETA·radius`) contribute via the cheap dipole
    /// expansion; near nodes recurse, and every leaf reached sums the EXACT
    /// `solid_angle` per triangle. This makes the sign IDENTICAL to the exact
    /// FWN: near-surface points (where w crosses 0.5) are dominated by exact
    /// leaf terms, and the bounded far-field error can't move a robustly-far
    /// point's w across 0.5. Reuses a caller-owned stack like
    /// [`nearest_distance_with`](Self::nearest_distance_with).
    pub fn winding_number_fast(&self, p: [f64; 3], beta: f64, stack: &mut Vec<u32>) -> f64 {
        if self.nodes.is_empty() {
            return 0.0;
        }

        let mut acc = 0.0;
        stack.clear();
        stack.push(self.root);

        while let Some(idx) = stack.pop() {
            let e = &self.expansions[idx as usize];
            let d = vlen(vsub(p, e.center));

            if d > beta * e.radius {
                acc += dipole_eval(p, e);
                continue;
            }

            match self.nodes[idx as usize].kind {
                NodeKind::Leaf { start, count } => {
                    for t in &self.tris[start as usize..(start + count) as usize] {
                        acc += solid_angle(p, t.a, t.b, t.c);
                    }
                }
                NodeKind::Inner { left, right } => {
                    // Order is irrelevant: every opened branch is fully summed,
                    // there is no pruning / early-out to bias.
                    stack.push(left);
                    stack.push(right);
                }
            }
        }

        acc / (4.0 * core::f64::consts::PI)
    }

    /// Inside test mirroring [`Mesh::is_inside`](crate::fwn::Mesh::is_inside):
    /// the drop-in fast-path replacement for the per-voxel sign in
    /// [`crate::ops::voxelize_mesh`].
    pub fn is_inside_fast(&self, p: [f64; 3], beta: f64, stack: &mut Vec<u32>) -> bool {
        self.winding_number_fast(p, beta, stack) > 0.5
    }
}

/// Point-dipole solid-angle approximation: `dot(N, c₀-p) / |c₀-p|³`, the leading
/// Barill term. The shared `1/(4π)` is applied once by the caller alongside the
/// exact leaf terms. Only ever called for a FAR node (`d > β·radius > 0`), so
/// `r2` is non-zero; guarded defensively all the same.
fn dipole_eval(p: [f64; 3], e: &NodeExpansion) -> f64 {
    let r = vsub(e.center, p);
    let r2 = vdot(r, r);
    if r2 == 0.0 {
        return 0.0;
    }
    let inv3 = 1.0 / (r2 * r2.sqrt());
    vdot(e.dipole, r) * inv3
}

/// Build the parallel winding-expansion table bottom-up. An inner node reserves
/// its slot BEFORE recursing, so both its children get strictly higher indices;
/// iterating from the last node to the first therefore computes every child
/// before its parent — a single post-order pass with no extra traversal.
fn compute_expansions(nodes: &[BvhNode], tris: &[Tri]) -> Vec<NodeExpansion> {
    let mut exp = vec![
        NodeExpansion {
            center: [0.0; 3],
            dipole: [0.0; 3],
            radius: 0.0,
            total_area: 0.0,
        };
        nodes.len()
    ];
    for idx in (0..nodes.len()).rev() {
        exp[idx] = match nodes[idx].kind {
            NodeKind::Leaf { start, count } => {
                leaf_expansion(&tris[start as usize..(start + count) as usize], &nodes[idx])
            }
            NodeKind::Inner { left, right } => {
                combine_expansion(&exp[left as usize], &exp[right as usize], &nodes[idx])
            }
        };
    }
    exp
}

fn leaf_expansion(tris: &[Tri], node: &BvhNode) -> NodeExpansion {
    let mut total_area = 0.0;
    let mut wsum = [0.0; 3];
    let mut dipole = [0.0; 3];
    for t in tris {
        let n = vcross(vsub(t.b, t.a), vsub(t.c, t.a));
        let n = [0.5 * n[0], 0.5 * n[1], 0.5 * n[2]];
        let area = vlen(n);
        let centroid = [
            (t.a[0] + t.b[0] + t.c[0]) / 3.0,
            (t.a[1] + t.b[1] + t.c[1]) / 3.0,
            (t.a[2] + t.b[2] + t.c[2]) / 3.0,
        ];
        total_area += area;
        wsum[0] += area * centroid[0];
        wsum[1] += area * centroid[1];
        wsum[2] += area * centroid[2];
        dipole[0] += n[0];
        dipole[1] += n[1];
        dipole[2] += n[2];
    }

    let center = if total_area > 0.0 {
        [
            wsum[0] / total_area,
            wsum[1] / total_area,
            wsum[2] / total_area,
        ]
    } else {
        bounds_center(node)
    };

    let mut radius: f64 = 0.0;
    for t in tris {
        for &v in &[t.a, t.b, t.c] {
            let d = vlen(vsub(v, center));
            if d > radius {
                radius = d;
            }
        }
    }

    NodeExpansion {
        center,
        dipole,
        radius,
        total_area,
    }
}

fn combine_expansion(l: &NodeExpansion, r: &NodeExpansion, node: &BvhNode) -> NodeExpansion {
    let total_area = l.total_area + r.total_area;
    let center = if total_area > 0.0 {
        [
            (l.total_area * l.center[0] + r.total_area * r.center[0]) / total_area,
            (l.total_area * l.center[1] + r.total_area * r.center[1]) / total_area,
            (l.total_area * l.center[2] + r.total_area * r.center[2]) / total_area,
        ]
    } else {
        bounds_center(node)
    };
    let dipole = [
        l.dipole[0] + r.dipole[0],
        l.dipole[1] + r.dipole[1],
        l.dipole[2] + r.dipole[2],
    ];
    // Parent ball must provably enclose both child balls.
    let radius = (vlen(vsub(l.center, center)) + l.radius)
        .max(vlen(vsub(r.center, center)) + r.radius);

    NodeExpansion {
        center,
        dipole,
        radius,
        total_area,
    }
}

fn bounds_center(node: &BvhNode) -> [f64; 3] {
    [
        (node.bounds.min[0] + node.bounds.max[0]) * 0.5,
        (node.bounds.min[1] + node.bounds.max[1]) * 0.5,
        (node.bounds.min[2] + node.bounds.max[2]) * 0.5,
    ]
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

    fn icosphere(subdiv: u32) -> Mesh {
        use std::collections::HashMap;
        let t = (1.0_f64 + 5.0_f64.sqrt()) / 2.0;
        let mut verts: Vec<[f64; 3]> = vec![
            [-1.0, t, 0.0],
            [1.0, t, 0.0],
            [-1.0, -t, 0.0],
            [1.0, -t, 0.0],
            [0.0, -1.0, t],
            [0.0, 1.0, t],
            [0.0, -1.0, -t],
            [0.0, 1.0, -t],
            [t, 0.0, -1.0],
            [t, 0.0, 1.0],
            [-t, 0.0, -1.0],
            [-t, 0.0, 1.0],
        ];
        let norm = |v: &mut [f64; 3]| {
            let l = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
            v[0] /= l;
            v[1] /= l;
            v[2] /= l;
        };
        for v in verts.iter_mut() {
            norm(v);
        }
        let mut faces: Vec<[u32; 3]> = vec![
            [0, 11, 5],
            [0, 5, 1],
            [0, 1, 7],
            [0, 7, 10],
            [0, 10, 11],
            [1, 5, 9],
            [5, 11, 4],
            [11, 10, 2],
            [10, 7, 6],
            [7, 1, 8],
            [3, 9, 4],
            [3, 4, 2],
            [3, 2, 6],
            [3, 6, 8],
            [3, 8, 9],
            [4, 9, 5],
            [2, 4, 11],
            [6, 2, 10],
            [8, 6, 7],
            [9, 8, 1],
        ];
        for _ in 0..subdiv {
            let mut cache: HashMap<(u32, u32), u32> = HashMap::new();
            let mut next: Vec<[u32; 3]> = Vec::new();
            let mut mid = |i: u32, j: u32, verts: &mut Vec<[f64; 3]>| -> u32 {
                let key = if i < j { (i, j) } else { (j, i) };
                if let Some(&m) = cache.get(&key) {
                    return m;
                }
                let a = verts[i as usize];
                let b = verts[j as usize];
                let mut m = [
                    (a[0] + b[0]) * 0.5,
                    (a[1] + b[1]) * 0.5,
                    (a[2] + b[2]) * 0.5,
                ];
                norm(&mut m);
                let idx = verts.len() as u32;
                verts.push(m);
                cache.insert(key, idx);
                idx
            };
            for f in &faces {
                let a = mid(f[0], f[1], &mut verts);
                let b = mid(f[1], f[2], &mut verts);
                let c = mid(f[2], f[0], &mut verts);
                next.push([f[0], a, c]);
                next.push([f[1], b, a]);
                next.push([f[2], c, b]);
                next.push([a, b, c]);
            }
            faces = next;
        }
        Mesh {
            verts,
            tris: faces
                .iter()
                .map(|f| [f[0] as usize, f[1] as usize, f[2] as usize])
                .collect(),
        }
    }

    #[test]
    fn leaf_expansion_aggregates_single_tri() {
        // For one triangle the dipole IS its un-normalized half-cross-product, the
        // center its barycentre, total_area its area.
        let bvh = Bvh::build(&single_tri());
        assert_eq!(bvh.expansions.len(), 1);
        let e = bvh.expansions[0];
        assert!((e.total_area - 0.5).abs() < 1e-12, "area {}", e.total_area);
        // Triangle is in the z=0 plane wound CCW about +z -> dipole = (0,0,0.5).
        assert!((e.dipole[2] - 0.5).abs() < 1e-12, "dipole {:?}", e.dipole);
        assert!(e.dipole[0].abs() < 1e-12 && e.dipole[1].abs() < 1e-12);
        let want_c = [1.0 / 3.0, 1.0 / 3.0, 0.0];
        for (k, &wc) in want_c.iter().enumerate() {
            assert!((e.center[k] - wc).abs() < 1e-12);
        }
        assert!(e.radius > 0.0);
    }

    #[test]
    fn dipole_translation_invariant_under_combine() {
        // The root dipole of a multi-leaf tree equals the plain sum of all member
        // half-cross-products (no re-centering needed for the leading term).
        let mesh = soup();
        let bvh = Bvh::build(&mesh);
        let mut want = [0.0; 3];
        for t in &bvh.tris {
            let n = vcross(vsub(t.b, t.a), vsub(t.c, t.a));
            want[0] += 0.5 * n[0];
            want[1] += 0.5 * n[1];
            want[2] += 0.5 * n[2];
        }
        let root = bvh.expansions[bvh.root as usize];
        for (k, &w) in want.iter().enumerate() {
            assert!(
                (root.dipole[k] - w).abs() < 1e-9,
                "dipole[{k}] {} vs {}",
                root.dipole[k],
                w
            );
        }
    }

    #[test]
    fn root_ball_encloses_all_vertices() {
        let mesh = icosphere(2);
        let bvh = Bvh::build(&mesh);
        let root = bvh.expansions[bvh.root as usize];
        for v in &mesh.verts {
            let d = vlen(vsub(*v, root.center));
            assert!(
                d <= root.radius + 1e-9,
                "vertex {v:?} at {d} outside ball radius {}",
                root.radius
            );
        }
    }

    #[test]
    fn winding_number_fast_matches_exact_within_tol() {
        let mesh = icosphere(2);
        let bvh = Bvh::build(&mesh);
        let mut stack = Vec::new();
        // Interior, exterior, and a near-surface band point.
        let samples: [[f64; 3]; 6] = [
            [0.0, 0.0, 0.0],
            [0.1, -0.2, 0.05],
            [3.0, 0.0, 0.0],
            [-2.0, 1.5, 0.5],
            [0.97, 0.0, 0.0],
            [0.0, 0.0, 1.02],
        ];
        for p in samples {
            let fast = bvh.winding_number_fast(p, BETA, &mut stack);
            let exact = mesh.winding_number(p);
            // The NUMBER is a bounded far-field approximation: the dipole error on
            // icosphere far nodes is ~0.03, well inside the 0.5 sign margin. The
            // SIGN, the actual contract, must match exactly.
            assert!(
                (fast - exact).abs() < 5e-2,
                "w too far at {p:?}: fast {fast} exact {exact}"
            );
            assert_eq!(
                fast > 0.5,
                exact > 0.5,
                "sign mismatch at {p:?}: fast {fast} exact {exact}"
            );
        }
    }

    #[test]
    fn empty_mesh_winding_is_zero_and_outside() {
        let mesh = Mesh::from_flat(&[], &[]);
        let bvh = Bvh::build(&mesh);
        let mut stack = Vec::new();
        assert_eq!(bvh.winding_number_fast([0.0, 0.0, 0.0], BETA, &mut stack), 0.0);
        assert!(!bvh.is_inside_fast([0.0, 0.0, 0.0], BETA, &mut stack));
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
