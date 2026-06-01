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
}
