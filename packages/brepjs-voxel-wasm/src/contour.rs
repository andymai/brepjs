//! SDF → triangle-mesh contouring (ADR-0013 voxel domain, Contour seam).
//!
//! v1 contourer is Surface Nets (`fast-surface-nets`), which extracts a smooth
//! dual mesh from the dense [`Grid`] SDF. The seam is the [`Contourer`] trait:
//! manifold dual contouring (sharp-feature preserving) slots in behind the same
//! `contour(&Grid) -> ContourMesh` boundary later without touching the bridge.
//!
//! Surface Nets samples a 2×2×2 corner neighbourhood per cell, so it needs a
//! 1-voxel positive (air) margin on every face or the surface clips. The grid's
//! `for_bounds(.., padding_voxels >= 1)` plus the FWN voxelizer (which writes
//! positive distances into the padding ring) satisfy that structurally.
//
// Wired but not yet consumed by a wasm export; the cdylib build can't see the
// bridge-seam caller, so silence dead-code here.
#![allow(dead_code)]

use fast_surface_nets::ndshape::RuntimeShape;
use fast_surface_nets::{surface_nets, SurfaceNetsBuffer};

use crate::grid::Grid;
use crate::sparse::{IntHashMap, SparseGrid, TILE};

/// A triangle mesh ready for the wasm bridge. `positions`/`normals` are flat
/// xyz (length 3·V); `indices` is a triangle list (3 indices per triangle).
/// Positions are in WORLD space (origin + index·spacing), not grid-index space.
#[derive(Debug, Default)]
pub struct ContourMesh {
    pub positions: Vec<f32>,
    pub normals: Vec<f32>,
    pub indices: Vec<u32>,
}

/// The contouring seam: SDF grid in, triangle mesh out. v1 implementor is
/// Surface Nets; a manifold dual contourer can replace it behind this trait.
pub trait Contourer {
    fn contour(&self, grid: &Grid) -> ContourMesh;
}

/// v1 Surface Nets contourer (zero-config; behaviour lives in `surface_nets_mesh`).
#[derive(Debug, Default)]
pub struct SurfaceNets;

impl Contourer for SurfaceNets {
    fn contour(&self, grid: &Grid) -> ContourMesh {
        surface_nets_mesh(grid)
    }
}

/// Contour `grid`'s dense SDF with Surface Nets and map every output vertex from
/// grid-index space into world coords. `surface_nets` 0.2 emits a triangle index
/// list directly, so indices pass through unchanged; positions are scaled by the
/// grid spacing and offset by the grid origin.
pub fn surface_nets_mesh(grid: &Grid) -> ContourMesh {
    let [nx, ny, nz] = grid.dims();
    let shape = RuntimeShape::<u32, 3>::new([nx as u32, ny as u32, nz as u32]);

    // A grid with any axis < 2 voxels has no cell for the 2×2×2 sampling; there
    // is no surface to extract, so return an empty mesh rather than under/overflow.
    if nx < 2 || ny < 2 || nz < 2 {
        return ContourMesh::default();
    }

    let mut buffer = SurfaceNetsBuffer::default();
    surface_nets(
        grid.data(),
        &shape,
        [0, 0, 0],
        [nx as u32 - 1, ny as u32 - 1, nz as u32 - 1],
        &mut buffer,
    );

    let origin = grid.origin();
    let spacing = grid.spacing();

    let mut positions = Vec::with_capacity(buffer.positions.len() * 3);
    for p in &buffer.positions {
        positions.push(origin[0] + p[0] * spacing);
        positions.push(origin[1] + p[1] * spacing);
        positions.push(origin[2] + p[2] * spacing);
    }

    let mut normals = Vec::with_capacity(buffer.normals.len() * 3);
    for n in &buffer.normals {
        normals.push(n[0]);
        normals.push(n[1]);
        normals.push(n[2]);
    }

    ContourMesh {
        positions,
        normals,
        indices: buffer.indices,
    }
}

// --- Seam-free tiled Surface Nets over a SparseGrid ---------------------------
//
// A from-scratch reimplementation of dual Surface Nets keyed on GLOBAL cell coords
// (NOT per-tile fast_surface_nets + weld). It reproduces dense `surface_nets_mesh`
// EXACTLY by replicating fast-surface-nets 0.2's estimator (centroid of edge
// crossings + central-difference gradient) and quad winding. Seam-freedom is
// structural: each surface cell is owned by exactly one tile (the tile of its MIN
// corner) so each vertex is emitted once under a unique global key, and cross-tile
// quads are emitted because the edge loop looks up neighbour cells through the
// global map regardless of which tile owns them. The parity gate proves it.

/// Corner offsets, ordered to match fast-surface-nets `CUBE_CORNERS`: corner `i`
/// has offset `[i&1, (i>>1)&1, (i>>2)&1]`.
const CORNER_OFFSETS: [[usize; 3]; 8] = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
];

const CORNER_VECTORS: [[f32; 3]; 8] = [
    [0.0, 0.0, 0.0],
    [1.0, 0.0, 0.0],
    [0.0, 1.0, 0.0],
    [1.0, 1.0, 0.0],
    [0.0, 0.0, 1.0],
    [1.0, 0.0, 1.0],
    [0.0, 1.0, 1.0],
    [1.0, 1.0, 1.0],
];

const CUBE_EDGES: [[usize; 2]; 12] = [
    [0b000, 0b001],
    [0b000, 0b010],
    [0b000, 0b100],
    [0b001, 0b011],
    [0b001, 0b101],
    [0b010, 0b011],
    [0b010, 0b110],
    [0b011, 0b111],
    [0b100, 0b101],
    [0b100, 0b110],
    [0b101, 0b111],
    [0b110, 0b111],
];

/// fast-surface-nets `centroid_of_edge_intersections`: average of the per-edge
/// zero-crossing points (in cube-local [0,1]^3 coords).
fn centroid_of_edge_intersections(dists: &[f32; 8]) -> [f32; 3] {
    let mut count = 0u32;
    let mut sum = [0.0f32; 3];
    for &[c1, c2] in CUBE_EDGES.iter() {
        let d1 = dists[c1];
        let d2 = dists[c2];
        if (d1 < 0.0) != (d2 < 0.0) {
            count += 1;
            let interp1 = d1 / (d1 - d2);
            let interp2 = 1.0 - interp1;
            let v1 = CORNER_VECTORS[c1];
            let v2 = CORNER_VECTORS[c2];
            for d in 0..3 {
                sum[d] += interp2 * v1[d] + interp1 * v2[d];
            }
        }
    }
    // True per-component division (NOT reciprocal-multiply): fast-surface-nets 0.2
    // computes `sum / count`, and for f32 `s / n != s * (1/n)` by up to 1 ULP for
    // non-power-of-two counts (count=3 is common on spheres). Matching it exactly
    // keeps the sparse contour bit-identical to the dense oracle on wasm. count>=1
    // here: the caller only enters with 1..=7 negative corners, so an edge crosses.
    let n = count as f32;
    [sum[0] / n, sum[1] / n, sum[2] / n]
}

/// fast-surface-nets `sdf_gradient`: bilinear interpolation of the 12 edge deltas,
/// transcribed component-wise from the glam swizzle form. `s` is the cube-local
/// surface point.
fn sdf_gradient(d: &[f32; 8], s: [f32; 3]) -> [f32; 3] {
    let p00 = [d[0b001], d[0b010], d[0b100]];
    let n00 = [d[0b000], d[0b000], d[0b000]];
    let p10 = [d[0b101], d[0b011], d[0b110]];
    let n10 = [d[0b100], d[0b001], d[0b010]];
    let p01 = [d[0b011], d[0b110], d[0b101]];
    let n01 = [d[0b010], d[0b100], d[0b001]];
    let p11 = [d[0b111], d[0b111], d[0b111]];
    let n11 = [d[0b110], d[0b101], d[0b011]];

    let mut d00 = [0.0f32; 3];
    let mut d10 = [0.0f32; 3];
    let mut d01 = [0.0f32; 3];
    let mut d11 = [0.0f32; 3];
    for i in 0..3 {
        d00[i] = p00[i] - n00[i];
        d10[i] = p10[i] - n10[i];
        d01[i] = p01[i] - n01[i];
        d11[i] = p11[i] - n11[i];
    }

    let neg = [1.0 - s[0], 1.0 - s[1], 1.0 - s[2]];
    // yzx() = [a[1], a[2], a[0]]; zxy() = [a[2], a[0], a[1]].
    let neg_yzx = [neg[1], neg[2], neg[0]];
    let neg_zxy = [neg[2], neg[0], neg[1]];
    let s_yzx = [s[1], s[2], s[0]];
    let s_zxy = [s[2], s[0], s[1]];

    let mut g = [0.0f32; 3];
    for i in 0..3 {
        g[i] = neg_yzx[i] * neg_zxy[i] * d00[i]
            + neg_yzx[i] * s_zxy[i] * d10[i]
            + s_yzx[i] * neg_zxy[i] * d01[i]
            + s_yzx[i] * s_zxy[i] * d11[i];
    }
    g
}

fn dist_sq(a: [f32; 3], b: [f32; 3]) -> f32 {
    let dx = a[0] - b[0];
    let dy = a[1] - b[1];
    let dz = a[2] - b[2];
    dx * dx + dy * dy + dz * dz
}

/// Per-cell record after Pass A: the global vertex index and its grid-LOCAL
/// position (`[x,y,z] + centroid`). The split decision in Pass B must compare
/// LOCAL coords — fast-surface-nets makes the same comparison on array-local
/// positions before the world-space scale, and a uniform scale can flip a
/// near-tie under f32 rounding, so comparing world coords would diverge.
struct CellVertex {
    index: u32,
    local: [f32; 3],
}

/// Seam-free tiled Surface Nets over a [`SparseGrid`]: reproduces dense
/// [`surface_nets_mesh`] exactly. Returns world-space positions/normals + a
/// triangle-list. Empty input (no active tiles) yields an empty mesh.
pub fn surface_nets_mesh_sparse(sparse: &SparseGrid) -> ContourMesh {
    let [nx, ny, nz] = sparse.dims();
    if nx < 2 || ny < 2 || nz < 2 {
        return ContourMesh::default();
    }
    let origin = sparse.origin();
    let spacing = sparse.spacing();

    let mut out = ContourMesh::default();
    // Global cell coord -> emitted vertex. Key is the packed linear cell id, hashed
    // by the integer hasher (no SipHash code in the cdylib), keeping wasm size down.
    let mut verts: IntHashMap<u64, CellVertex> = IntHashMap::default();

    let cell_key = |x: usize, y: usize, z: usize| -> u64 {
        (x as u64) + (y as u64) * (nx as u64) + (z as u64) * (nx as u64) * (ny as u64)
    };

    // Pass A — one vertex per owned surface cell. A cell (x,y,z) is owned by the
    // tile containing its MIN corner, so iterate each active tile's owned cells.
    // Cells with a max corner on the outer grid boundary (x == nx-1 etc.) have no
    // cube to sample, matching the dense loop bound `0..nx-1`.
    let mut active: Vec<[usize; 3]> = sparse.active_tiles().collect();
    // Deterministic iteration so vertex emission order is stable across runs.
    active.sort_unstable();
    for [tx, ty, tz] in active {
        let x0 = tx * TILE;
        let y0 = ty * TILE;
        let z0 = tz * TILE;
        for lz in 0..TILE {
            let z = z0 + lz;
            if z >= nz - 1 {
                break;
            }
            for ly in 0..TILE {
                let y = y0 + ly;
                if y >= ny - 1 {
                    break;
                }
                for lx in 0..TILE {
                    let x = x0 + lx;
                    if x >= nx - 1 {
                        break;
                    }
                    let mut dists = [0.0f32; 8];
                    let mut num_negative = 0;
                    for (i, slot) in dists.iter_mut().enumerate() {
                        let o = CORNER_OFFSETS[i];
                        let d = sparse.at(x + o[0], y + o[1], z + o[2]);
                        *slot = d;
                        if d < 0.0 {
                            num_negative += 1;
                        }
                    }
                    if num_negative == 0 || num_negative == 8 {
                        continue;
                    }
                    let c = centroid_of_edge_intersections(&dists);
                    let local = [x as f32 + c[0], y as f32 + c[1], z as f32 + c[2]];
                    let pos = [
                        origin[0] + local[0] * spacing,
                        origin[1] + local[1] * spacing,
                        origin[2] + local[2] * spacing,
                    ];
                    let n = sdf_gradient(&dists, c);
                    let index = (out.positions.len() / 3) as u32;
                    out.positions.extend_from_slice(&pos);
                    out.normals.extend_from_slice(&n);
                    verts.insert(cell_key(x, y, z), CellVertex { index, local });
                }
            }
        }
    }

    if verts.is_empty() {
        return ContourMesh::default();
    }

    // Pass B — quads per sign-changed edge. Iterate the SAME owned surface cells
    // (the keys in `verts`), and for each of the 3 axis edges of the cell's min
    // corner emit a quad iff the edge has a sign change. The 4 surrounding cells'
    // vertices are looked up in the GLOBAL map, so cross-tile quads emit naturally.
    let mut owned: Vec<(usize, usize, usize)> = verts
        .keys()
        .map(|&k| {
            let x = (k % nx as u64) as usize;
            let y = ((k / nx as u64) % ny as u64) as usize;
            let z = (k / (nx as u64 * ny as u64)) as usize;
            (x, y, z)
        })
        .collect();
    owned.sort_unstable();

    for (x, y, z) in owned {
        let d_self = sparse.at(x, y, z);

        // X-axis edge: p1=(x,y,z), p2=(x+1,y,z); axis_b=Y, axis_c=Z.
        // Guard mirrors fast-surface-nets: y!=0 && z!=0 && x!=nx-2.
        if y != 0 && z != 0 && x != nx - 2 {
            maybe_quad(
                &mut out.indices,
                &verts,
                &cell_key,
                d_self,
                sparse.at(x + 1, y, z),
                (x, y, z),
                (x, y.wrapping_sub(1), z),
                (x, y, z.wrapping_sub(1)),
                (x, y.wrapping_sub(1), z.wrapping_sub(1)),
            );
        }
        // Y-axis edge: p1=(x,y,z), p2=(x,y+1,z); axis_b=Z, axis_c=X.
        if x != 0 && z != 0 && y != ny - 2 {
            maybe_quad(
                &mut out.indices,
                &verts,
                &cell_key,
                d_self,
                sparse.at(x, y + 1, z),
                (x, y, z),
                (x, y, z.wrapping_sub(1)),
                (x.wrapping_sub(1), y, z),
                (x.wrapping_sub(1), y, z.wrapping_sub(1)),
            );
        }
        // Z-axis edge: p1=(x,y,z), p2=(x,y,z+1); axis_b=X, axis_c=Y.
        if x != 0 && y != 0 && z != nz - 2 {
            maybe_quad(
                &mut out.indices,
                &verts,
                &cell_key,
                d_self,
                sparse.at(x, y, z + 1),
                (x, y, z),
                (x.wrapping_sub(1), y, z),
                (x, y.wrapping_sub(1), z),
                (x.wrapping_sub(1), y.wrapping_sub(1), z),
            );
        }
    }

    out
}

/// fast-surface-nets `maybe_make_quad`, keyed by global cell coord. `d1`/`d2` are
/// the two endpoint corner SDFs along the edge axis; `(v1..v4)` are the 4 cells
/// around the edge (v1=owning cell, v2=−B, v3=−C, v4=−B−C). Emits the 2 triangles
/// with the exact winding/split convention of fast-surface-nets 0.2.
#[allow(clippy::too_many_arguments)]
fn maybe_quad(
    indices: &mut Vec<u32>,
    verts: &IntHashMap<u64, CellVertex>,
    cell_key: &impl Fn(usize, usize, usize) -> u64,
    d1: f32,
    d2: f32,
    v1c: (usize, usize, usize),
    v2c: (usize, usize, usize),
    v3c: (usize, usize, usize),
    v4c: (usize, usize, usize),
) {
    let negative_face = match (d1 < 0.0, d2 < 0.0) {
        (true, false) => false,
        (false, true) => true,
        _ => return,
    };

    let lookup = |c: (usize, usize, usize)| -> Option<&CellVertex> {
        verts.get(&cell_key(c.0, c.1, c.2))
    };
    // v1 is the owning cell (always present); v2..v4 are guaranteed present because
    // an edge with a sign change is adjacent to the surface on all 4 cells.
    let (cv1, cv2, cv3, cv4) = match (lookup(v1c), lookup(v2c), lookup(v3c), lookup(v4c)) {
        (Some(a), Some(b), Some(c), Some(d)) => (a, b, c, d),
        // All 4 must be present (a sign-changed edge is surrounded by surface cells
        // in active tiles); a miss means a tile-activation invariant broke — make
        // that loud in debug rather than silently dropping a quad (a seam crack).
        _ => {
            debug_assert!(false, "maybe_quad: missing neighbor cell vertex — tile activation invariant violated");
            return;
        }
    };
    let (v1, v2, v3, v4) = (cv1.index, cv2.index, cv3.index, cv4.index);
    let (p1, p2, p3, p4) = (cv1.local, cv2.local, cv3.local, cv4.local);

    // Split along the shorter diagonal, exactly as fast-surface-nets.
    let quad = if dist_sq(p1, p4) < dist_sq(p2, p3) {
        if negative_face {
            [v1, v4, v2, v1, v3, v4]
        } else {
            [v1, v2, v4, v1, v4, v3]
        }
    } else if negative_face {
        [v2, v3, v4, v2, v1, v3]
    } else {
        [v2, v4, v3, v2, v3, v1]
    };
    indices.extend_from_slice(&quad);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fwn::Mesh;
    use crate::ops::voxelize_mesh;

    /// Unit cube [0,1]^3, outward-facing triangles (mirrors fwn/ops fixtures).
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

    #[test]
    fn contours_voxelized_cube_into_valid_mesh() {
        let m = unit_cube();
        // padding 1 gives the positive air margin Surface Nets requires.
        let mut g = Grid::for_bounds([0.0, 0.0, 0.0], [1.0, 1.0, 1.0], 8, 1).unwrap();
        voxelize_mesh(&mut g, &m);

        let mesh = surface_nets_mesh(&g);

        assert!(!mesh.positions.is_empty(), "expected a non-empty surface");
        assert!(!mesh.indices.is_empty(), "expected triangles");
        assert_eq!(mesh.positions.len() % 3, 0, "positions must be flat xyz");
        assert_eq!(mesh.indices.len() % 3, 0, "indices must be triangles");

        let vertex_count = mesh.positions.len() / 3;
        for &i in &mesh.indices {
            assert!(
                (i as usize) < vertex_count,
                "index {i} out of range for {vertex_count} vertices"
            );
        }

        // Extracted vertices should sit near the cube surface (world coords).
        for p in mesh.positions.chunks_exact(3) {
            assert!(
                p[0] > -0.5 && p[0] < 1.5 && p[1] > -0.5 && p[1] < 1.5 && p[2] > -0.5 && p[2] < 1.5,
                "vertex {p:?} is far from the unit cube"
            );
        }
    }

    #[test]
    fn degenerate_grid_yields_empty_mesh() {
        // A 1-voxel-thin axis has no cell to sample; expect an empty mesh, no panic.
        let g = Grid::for_bounds([0.0, 0.0, 0.0], [1.0, 0.0, 0.0], 1, 0).unwrap();
        let mesh = surface_nets_mesh(&g);
        assert!(mesh.positions.is_empty());
        assert!(mesh.indices.is_empty());
    }

    #[test]
    fn contourer_trait_matches_function() {
        let m = unit_cube();
        let mut g = Grid::for_bounds([0.0, 0.0, 0.0], [1.0, 1.0, 1.0], 6, 1).unwrap();
        voxelize_mesh(&mut g, &m);

        let via_trait = SurfaceNets.contour(&g);
        let via_fn = surface_nets_mesh(&g);
        assert_eq!(via_trait.positions.len(), via_fn.positions.len());
        assert_eq!(via_trait.indices, via_fn.indices);
    }

    // --- Parity gate: sparse tiled contour == dense contour -------------------

    use crate::grid::GridGeom;
    use crate::ops::{band_radius, voxelize_mesh_banded, voxelize_mesh_sparse};
    use crate::sparse::SparseGrid;

    /// Same cube with the +z (top) face dropped -> non-watertight.
    fn holey_cube() -> Mesh {
        let m = unit_cube();
        let tris = m
            .tris
            .iter()
            .filter(|t| **t != [4, 5, 6] && **t != [4, 6, 7])
            .copied()
            .collect();
        Mesh {
            verts: m.verts,
            tris,
        }
    }

    /// A thin slab [0,2]×[0,2]×[0,0.2]: a feature thinner than one tile, both of
    /// whose surfaces live in a single active tile span.
    fn slab() -> Mesh {
        let (a, b, c) = (0.0f32, 0.0f32, 0.0f32);
        let (d, e, f) = (2.0f32, 2.0f32, 0.2f32);
        let verts = vec![
            a, b, c, d, b, c, d, e, c, a, e, c, a, b, f, d, b, f, d, e, f, a, e, f,
        ];
        let tris = vec![
            0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7,
            3, 1, 2, 6, 1, 6, 5,
        ];
        Mesh::from_flat(&verts, &tris)
    }

    fn icosphere(subdiv: u32) -> Mesh {
        use std::collections::HashMap as Map;
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
            let mut cache: Map<(u32, u32), u32> = Map::new();
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

    /// Build a SparseGrid over the same geom as a dense `for_bounds(min,max,res,pad)`
    /// grid and voxelize it with the repair band (extra = 0).
    fn build_sparse(mesh: &Mesh, min: [f32; 3], max: [f32; 3], res: usize, pad: usize) -> SparseGrid {
        let dense = Grid::for_bounds(min, max, res, pad).unwrap();
        let band = band_radius(&dense, 0.0);
        let (geom, _) = GridGeom::for_bounds(min, max, res, pad);
        let mut sparse = SparseGrid::new(geom, band as f32).unwrap();
        voxelize_mesh_sparse(&mut sparse, mesh, band).unwrap();
        sparse
    }

    /// Canonical form of a mesh, invariant to vertex/triangle ordering:
    /// (sorted unique vertices, sorted triangles remapped+rotated). Vertices are
    /// compared EXACT (both paths read bit-identical corner SDFs), so a single ULP
    /// position drift fails the gate loudly.
    fn canonicalize(m: &ContourMesh) -> (Vec<[u32; 3]>, Vec<[u32; 3]>) {
        // Bit-pattern key per vertex (exact f32 equality, ordering-stable).
        let key = |p: &[f32]| [p[0].to_bits(), p[1].to_bits(), p[2].to_bits()];
        let vcount = m.positions.len() / 3;
        let mut keyed: Vec<(usize, [u32; 3])> = (0..vcount)
            .map(|i| (i, key(&m.positions[i * 3..i * 3 + 3])))
            .collect();
        keyed.sort_by_key(|a| a.1);

        // Dedup exact-equal vertices; old index -> new (deduped, sorted) index.
        let mut new_verts: Vec<[u32; 3]> = Vec::new();
        let mut remap = vec![0u32; vcount];
        for (old, k) in keyed {
            if new_verts.last() != Some(&k) {
                new_verts.push(k);
            }
            remap[old] = (new_verts.len() - 1) as u32;
        }

        let mut tris: Vec<[u32; 3]> = Vec::new();
        for t in m.indices.chunks_exact(3) {
            let mut tri = [remap[t[0] as usize], remap[t[1] as usize], remap[t[2] as usize]];
            // Rotate so the smallest index is first (preserves winding).
            let mn = tri.iter().copied().enumerate().min_by_key(|&(_, v)| v).map(|(i, _)| i).unwrap();
            tri.rotate_left(mn);
            tris.push(tri);
        }
        tris.sort_unstable();
        (new_verts, tris)
    }

    /// Watertight check: every undirected edge is shared by exactly 2 triangles.
    fn is_watertight(m: &ContourMesh) -> bool {
        use std::collections::HashMap as Map;
        let mut edges: Map<(u32, u32), i32> = Map::new();
        for t in m.indices.chunks_exact(3) {
            for &(a, b) in &[(t[0], t[1]), (t[1], t[2]), (t[2], t[0])] {
                let k = if a < b { (a, b) } else { (b, a) };
                *edges.entry(k).or_insert(0) += 1;
            }
        }
        edges.values().all(|&c| c == 2)
    }

    /// THE HARD GATE: tiled sparse contour == dense contour, canonicalized, on
    /// cube / sphere / holey-cube / thin-slab at resolutions spanning several tiles.
    #[test]
    fn sparse_contour_equals_dense_contour() {
        // (name, mesh, min, max, resolution).
        type Case = (&'static str, Mesh, [f32; 3], [f32; 3], usize);
        let cases: [Case; 6] = [
            ("cube@16", unit_cube(), [0.0, 0.0, 0.0], [1.0, 1.0, 1.0], 16),
            ("cube@40", unit_cube(), [0.0, 0.0, 0.0], [1.0, 1.0, 1.0], 40),
            ("sphere@20", icosphere(2), [-1.3, -1.3, -1.3], [1.3, 1.3, 1.3], 20),
            ("sphere@40", icosphere(2), [-1.3, -1.3, -1.3], [1.3, 1.3, 1.3], 40),
            ("holey@24", holey_cube(), [0.0, 0.0, 0.0], [1.0, 1.0, 1.0], 24),
            ("slab@40", slab(), [0.0, 0.0, 0.0], [2.0, 2.0, 0.2], 40),
        ];
        for (name, mesh, min, max, res) in cases {
            let mut dense = Grid::for_bounds(min, max, res, 2).unwrap();
            let band = band_radius(&dense, 0.0);
            voxelize_mesh_banded(&mut dense, &mesh, band);
            let oracle = surface_nets_mesh(&dense);

            let sparse = build_sparse(&mesh, min, max, res, 2);
            let candidate = surface_nets_mesh_sparse(&sparse);

            assert_eq!(
                candidate.positions.len(),
                oracle.positions.len(),
                "{name}: vertex count differs (seam: missing/dup boundary vertex)"
            );
            assert_eq!(
                candidate.indices.len(),
                oracle.indices.len(),
                "{name}: triangle count differs"
            );
            let (cv, ct) = canonicalize(&candidate);
            let (ov, ot) = canonicalize(&oracle);
            assert_eq!(cv, ov, "{name}: vertex sets differ after canonicalization");
            assert_eq!(ct, ot, "{name}: triangle sets differ after canonicalization");
        }
    }

    /// The sparse OFFSET and SHELL far-field math (offset_far / shell_far) only runs
    /// on the >DENSE_THRESHOLD route, so the 144 vitest (all small) never reach it.
    /// Pin it against the dense oracle: same transform, same contour, bit-exact.
    #[test]
    fn sparse_offset_shell_equals_dense() {
        use crate::ops::{offset_sdf, shell_sdf};
        let (min, max, res, pad) = ([-1.3, -1.3, -1.3], [1.3, 1.3, 1.3], 40, 2);
        let mesh = icosphere(2);

        // OFFSET, outward (+) and inward (-): dense offset_sdf vs sparse offset_far.
        for &distance in &[0.2f32, -0.15] {
            let grow = distance.max(0.0);
            let emin = [min[0] - grow, min[1] - grow, min[2] - grow];
            let emax = [max[0] + grow, max[1] + grow, max[2] + grow];

            let mut dense = Grid::for_bounds(emin, emax, res, pad).unwrap();
            let band = band_radius(&dense, distance.abs());
            voxelize_mesh_banded(&mut dense, &mesh, band);
            offset_sdf(&mut dense, distance);
            let oracle = surface_nets_mesh(&dense);

            let (geom, _) = GridGeom::for_bounds(emin, emax, res, pad);
            let mut sparse = SparseGrid::new(geom, band as f32).unwrap();
            voxelize_mesh_sparse(&mut sparse, &mesh, band).unwrap();
            sparse.map_active_cells(|v| v - distance);
            sparse.offset_far(distance);
            let candidate = surface_nets_mesh_sparse(&sparse);

            let (cv, ct) = canonicalize(&candidate);
            let (ov, ot) = canonicalize(&oracle);
            assert_eq!(cv, ov, "offset {distance}: vertices differ (sparse offset_far)");
            assert_eq!(ct, ot, "offset {distance}: triangles differ (sparse offset_far)");
        }

        // SHELL: dense shell_sdf vs sparse shell_far.
        let thickness = 0.2f32;
        let mut solid = Grid::for_bounds(min, max, res, pad).unwrap();
        let band = band_radius(&solid, thickness);
        voxelize_mesh_banded(&mut solid, &mesh, band);
        let shell = shell_sdf(&solid, thickness);
        let oracle = surface_nets_mesh(&shell);

        let (geom, _) = GridGeom::for_bounds(min, max, res, pad);
        let mut sparse = SparseGrid::new(geom, band as f32).unwrap();
        voxelize_mesh_sparse(&mut sparse, &mesh, band).unwrap();
        sparse.map_active_cells(|s| s.max(-(s + thickness)));
        sparse.shell_far(thickness);
        let candidate = surface_nets_mesh_sparse(&sparse);

        let (cv, ct) = canonicalize(&candidate);
        let (ov, ot) = canonicalize(&oracle);
        assert_eq!(cv, ov, "shell {thickness}: vertices differ (sparse shell_far)");
        assert_eq!(ct, ot, "shell {thickness}: triangles differ (sparse shell_far)");
    }

    /// Cheap, always-on proof the ceiling actually RISES (not just that dense
    /// refuses): a small sphere in large bounds at high res blows the dense
    /// MAX_VOXELS cap, yet its surface band is a handful of tiles, so sparse
    /// completes fast and watertight. (The full-resolution success proof is the
    /// separate #[ignore]d heavy test.)
    #[test]
    fn sparse_completes_above_dense_cap() {
        use crate::grid::MAX_VOXELS;
        let (min, max, res, pad) = ([-10.0, -10.0, -10.0], [10.0, 10.0, 10.0], 410, 2);
        assert!(
            Grid::for_bounds(min, max, res, pad).is_err(),
            "dense grid must exceed MAX_VOXELS at this res/bounds"
        );
        let mesh = icosphere(2);
        let (geom, _) = GridGeom::for_bounds(min, max, res, pad);
        let band = (2.0 * geom.spacing) as f64;
        let mut sparse = SparseGrid::new(geom, band as f32).unwrap();
        voxelize_mesh_sparse(&mut sparse, &mesh, band).unwrap();
        assert!(
            sparse.allocated_voxels() < MAX_VOXELS,
            "the surface band must be far below the dense cap"
        );
        let out = surface_nets_mesh_sparse(&sparse);
        assert!(!out.indices.is_empty(), "sparse must produce a surface above the dense cap");
        assert!(is_watertight(&out), "above-cap sparse mesh must be watertight");
    }

    /// SDF parity: sparse `at` SIGN must equal dense banded `at` SIGN at every
    /// voxel, and magnitude must agree wherever |dense| < band. Isolates the
    /// far-sign table from the contour.
    #[test]
    fn sparse_at_equals_dense_at_sign_everywhere() {
        let cases: [(&str, Mesh, [f32; 3], [f32; 3]); 3] = [
            ("cube", unit_cube(), [0.0, 0.0, 0.0], [1.0, 1.0, 1.0]),
            ("sphere", icosphere(2), [-1.3, -1.3, -1.3], [1.3, 1.3, 1.3]),
            ("holey", holey_cube(), [0.0, 0.0, 0.0], [1.0, 1.0, 1.0]),
        ];
        for (name, mesh, min, max) in cases {
            let res = 32;
            let mut dense = Grid::for_bounds(min, max, res, 2).unwrap();
            let band = band_radius(&dense, 0.0);
            voxelize_mesh_banded(&mut dense, &mesh, band);
            let sparse = build_sparse(&mesh, min, max, res, 2);

            let [nx, ny, nz] = dense.dims();
            for z in 0..nz {
                for y in 0..ny {
                    for x in 0..nx {
                        let dv = dense.at(x, y, z);
                        let sv = sparse.at(x, y, z);
                        assert_eq!(
                            dv.signum(),
                            sv.signum(),
                            "{name}: sign mismatch at ({x},{y},{z}): dense {dv} sparse {sv}"
                        );
                        if dv.abs() < band as f32 {
                            assert!(
                                (dv - sv).abs() < 1e-5,
                                "{name}: in-band magnitude mismatch at ({x},{y},{z}): {dv} vs {sv}"
                            );
                        }
                    }
                }
            }
        }
    }

    /// The candidate (sparse) mesh must be watertight on closed fixtures: a seam
    /// crack shows up as boundary edges (shared by != 2 triangles).
    #[test]
    fn sparse_contour_is_watertight() {
        for (name, mesh, min, max, res) in [
            ("cube", unit_cube(), [0.0, 0.0, 0.0], [1.0, 1.0, 1.0], 40usize),
            ("sphere", icosphere(2), [-1.3, -1.3, -1.3], [1.3, 1.3, 1.3], 40),
        ] {
            let sparse = build_sparse(&mesh, min, max, res, 2);
            let mesh_out = surface_nets_mesh_sparse(&sparse);
            assert!(!mesh_out.indices.is_empty(), "{name}: empty mesh");
            assert!(is_watertight(&mesh_out), "{name}: sparse contour is not watertight");
        }
    }

    /// Empty mesh -> no active tiles -> empty contour (matches dense).
    #[test]
    fn sparse_empty_mesh_yields_empty_contour() {
        let empty = Mesh::from_flat(&[], &[]);
        let sparse = build_sparse(&empty, [0.0, 0.0, 0.0], [1.0, 1.0, 1.0], 16, 2);
        let mesh_out = surface_nets_mesh_sparse(&sparse);
        assert!(mesh_out.positions.is_empty());
        assert!(mesh_out.indices.is_empty());
    }

    /// O(surface) witness: doubling the resolution grows allocated tiles ~4x
    /// (surface area) rather than ~8x (volume). The tile-count growth ratio is the
    /// regression-proof signal — it isolates the scaling exponent from the per-tile
    /// constant (`TILE^3`), which dominates absolute counts at coarse resolutions.
    /// At a resolution where the tile grid is fine enough, allocated voxels also
    /// drop below the dense volume (the second assertion).
    #[test]
    fn sparse_allocates_only_surface_tiles() {
        let mesh = icosphere(3);
        let min = [-1.3, -1.3, -1.3];
        let max = [1.3, 1.3, 1.3];

        // Two octaves at a fine-enough tile grid (res 64 -> ~5 tiles/axis, res 128
        // -> ~9 tiles/axis) so the shell is a clear sub-volume of the tile grid.
        let s1 = build_sparse(&mesh, min, max, 64, 2);
        let s2 = build_sparse(&mesh, min, max, 128, 2);

        let t1 = s1.allocated_tiles() as f64;
        let t2 = s2.allocated_tiles() as f64;
        let growth = t2 / t1;
        // Area scaling ~4x; volume would be ~8x. Assert it's clearly sub-volumetric.
        assert!(
            (2.5..6.0).contains(&growth),
            "tile growth on res-doubling should be ~4x (area), got {growth} (t1={t1}, t2={t2})"
        );

        // At res 128 the shell occupies far less than the dense volume.
        let dense_voxels = {
            let (_, n) = GridGeom::for_bounds(min, max, 128, 2);
            n
        };
        assert!(
            s2.allocated_voxels() < dense_voxels,
            "allocated {} should be < dense volume {} (O(surface) memory)",
            s2.allocated_voxels(),
            dense_voxels
        );
    }

    /// THE CEILING: a resolution whose dense voxel count EXCEEDS the dense
    /// `MAX_VOXELS` cap (so `Grid::for_bounds` REFUSES it) succeeds on the sparse
    /// path — the headline proof the resolution ceiling rose. `#[ignore]` because
    /// fully voxelizing a ~411^3-bound sphere shell is minutes in debug; run with
    /// `cargo test -- --ignored` (or `--release`). The always-on
    /// `sparse_ceiling_routing_refuses_dense` proves the refusal/budget logic
    /// cheaply on every gate.
    #[test]
    #[ignore = "heavy: ~411^3 shell voxelization; run with --ignored or --release"]
    fn sparse_reaches_resolution_dense_refuses() {
        use crate::grid::MAX_VOXELS;
        let mesh = icosphere(2);
        let min = [-1.3, -1.3, -1.3];
        let max = [1.3, 1.3, 1.3];
        // Pick a resolution whose dense product blows past MAX_VOXELS (64M).
        let res = 408; // ~411^3 ≈ 69M > 64M.
        let (geom, dense_voxels) = GridGeom::for_bounds(min, max, res, 2);
        assert!(
            dense_voxels > MAX_VOXELS,
            "test resolution must exceed dense cap: {dense_voxels} <= {MAX_VOXELS}"
        );
        assert!(
            Grid::for_bounds(min, max, res, 2).is_err(),
            "dense path must REFUSE this resolution"
        );

        // Sparse succeeds: only the band's (thin) tiles allocate, well under the
        // cap. A 1-voxel band keeps the shell thin so the proof runs fast; the
        // ceiling argument is independent of band width.
        let band = geom.spacing;
        let mut sparse = SparseGrid::new(geom, band).unwrap();
        voxelize_mesh_sparse(&mut sparse, &mesh, band as f64)
            .expect("sparse must succeed where dense refuses");
        let out = surface_nets_mesh_sparse(&sparse);
        assert!(!out.indices.is_empty(), "ceiling mesh must be non-empty");
        assert!(
            sparse.allocated_voxels() < MAX_VOXELS,
            "sparse allocation {} must stay under the cap {MAX_VOXELS}",
            sparse.allocated_voxels()
        );
    }

    /// Always-on ceiling guard (cheap): at a resolution past the dense cap, the
    /// dense path REFUSES; and at a resolution whose band tiles exceed the sparse
    /// budget the sparse path returns `TooLarge` from Phase-1 activation BEFORE any
    /// per-voxel allocation, so the OOM ceiling still protects the sparse path.
    #[test]
    fn sparse_ceiling_routing_refuses_dense() {
        use crate::grid::MAX_VOXELS;
        let mesh = icosphere(2);
        let min = [-1.3, -1.3, -1.3];
        let max = [1.3, 1.3, 1.3];

        // Dense refuses past 64M voxels.
        let (_, dense_voxels) = GridGeom::for_bounds(min, max, 408, 2);
        assert!(dense_voxels > MAX_VOXELS);
        assert!(Grid::for_bounds(min, max, 408, 2).is_err());

        // A resolution whose band shell exceeds MAX_ACTIVE_TILES trips the budget
        // in Phase 1 (cheap: per-triangle AABB tile marking), before allocation.
        let res = 1100;
        let (geom, _) = GridGeom::for_bounds(min, max, res, 2);
        let band = geom.spacing as f64;
        let mut sparse = SparseGrid::new(geom, band as f32).unwrap();
        let err = voxelize_mesh_sparse(&mut sparse, &mesh, band);
        assert!(
            err.is_err(),
            "sparse must refuse a band that exceeds MAX_ACTIVE_TILES"
        );
        // Nothing was allocated on refusal (budget checked before Phase 2).
        assert_eq!(sparse.allocated_tiles(), 0);
    }
}
