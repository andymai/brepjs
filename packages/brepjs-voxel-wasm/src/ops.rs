//! Voxelization + grid boolean ops (ADR-0013 voxel domain, Ops seam).
//!
//! `voxelize_mesh` writes a signed distance field into a [`Grid`]: the unsigned
//! distance is the exact closest-point-on-triangle distance (not plane distance),
//! and the SIGN comes from the validated Generalized Winding Number in [`fwn`].
//! That FWN sign is the keystone — it classifies inside/outside on NON-watertight
//! input, so a holey mesh still yields a watertight SDF that the contourer can
//! turn back into a closed surface. For the same reason flood-fill is unnecessary
//! in v1: the FWN already classifies open meshes, so a connected-component fill is
//! a deferred robustness refinement, not a correctness requirement.
//!
//! v1 voxelization is brute-force O(voxels · triangles). Narrow-band evaluation
//! and a BVH over the triangles are deferred Ops-seam optimizations; resolution is
//! capped upstream (`Grid::for_bounds`) to keep the brute-force pass bounded.
//
// Wired but not yet consumed by a wasm export; the cdylib build can't see the
// callers the contour/bridge seams will add, so silence dead-code here.
#![allow(dead_code)]

use crate::bvh::{Bvh, BETA};
use crate::fwn::Mesh;
use crate::grid::{Grid, GridError};

/// Squared length of a 3-vector.
fn len_sq(v: [f64; 3]) -> f64 {
    v[0] * v[0] + v[1] * v[1] + v[2] * v[2]
}

fn sub(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/// Exact distance from point `p` to triangle (a,b,c), via the closest point on
/// the triangle (Ericson, *Real-Time Collision Detection*, §5.1.5). Handles the
/// vertex / edge / face Voronoi regions rather than approximating with the plane.
pub(crate) fn point_to_triangle_distance(
    p: [f64; 3],
    a: [f64; 3],
    b: [f64; 3],
    c: [f64; 3],
) -> f64 {
    let ab = sub(b, a);
    let ac = sub(c, a);
    let ap = sub(p, a);

    let d1 = dot(ab, ap);
    let d2 = dot(ac, ap);
    if d1 <= 0.0 && d2 <= 0.0 {
        return len_sq(ap).sqrt(); // vertex region A
    }

    let bp = sub(p, b);
    let d3 = dot(ab, bp);
    let d4 = dot(ac, bp);
    if d3 >= 0.0 && d4 <= d3 {
        return len_sq(bp).sqrt(); // vertex region B
    }

    let vc = d1 * d4 - d3 * d2;
    if vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0 {
        let v = d1 / (d1 - d3);
        let closest = [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]];
        return len_sq(sub(p, closest)).sqrt(); // edge region AB
    }

    let cp = sub(p, c);
    let d5 = dot(ab, cp);
    let d6 = dot(ac, cp);
    if d6 >= 0.0 && d5 <= d6 {
        return len_sq(cp).sqrt(); // vertex region C
    }

    let vb = d5 * d2 - d1 * d6;
    if vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0 {
        let w = d2 / (d2 - d6);
        let closest = [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]];
        return len_sq(sub(p, closest)).sqrt(); // edge region AC
    }

    let va = d3 * d6 - d5 * d4;
    if va <= 0.0 && (d4 - d3) >= 0.0 && (d5 - d6) >= 0.0 {
        let w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        let closest = [
            b[0] + w * (c[0] - b[0]),
            b[1] + w * (c[1] - b[1]),
            b[2] + w * (c[2] - b[2]),
        ];
        return len_sq(sub(p, closest)).sqrt(); // edge region BC
    }

    // Face region: barycentric interior.
    let denom = 1.0 / (va + vb + vc);
    let v = vb * denom;
    let w = vc * denom;
    let closest = [
        a[0] + ab[0] * v + ac[0] * w,
        a[1] + ab[1] * v + ac[1] * w,
        a[2] + ab[2] * v + ac[2] * w,
    ];
    len_sq(sub(p, closest)).sqrt()
}

/// Fill `grid` with a signed distance field for `mesh`.
///
/// For each voxel at world position `p`: the unsigned distance is the minimum
/// closest-point distance over all triangles (found via a BVH branch-and-bound,
/// bit-exact with the brute min); the sign is `-1` if `mesh.is_inside`
/// (FWN > 0.5) else `+1`. Storing `sign * unsigned` makes even a non-watertight
/// mesh produce a watertight SDF, because the sign comes from the winding number
/// rather than from surface connectivity.
pub fn voxelize_mesh(grid: &mut Grid, mesh: &Mesh) {
    voxelize_mesh_banded(grid, mesh, f64::INFINITY);
}

// Surface Nets reads a 2×2×2 neighbourhood, so every zero-crossing it extracts
// needs a correctly-signed collar of at least one full voxel on the far side; a
// 2-voxel margin is the conservative collar that keeps any extracted cell from
// reading a clamped value on the side facing the surface.
const BAND_MARGIN_VOXELS: f64 = 2.0;

/// World-space narrow-band radius for a voxelize call: the op's own reach
/// (`extra_world`) plus a [`BAND_MARGIN_VOXELS`]-voxel Surface-Nets collar. Never
/// a magic constant — each op sizes the band from its own transform (offset →
/// `|distance|`, shell → `thickness`, repair → `0`).
pub(crate) fn band_radius(grid: &Grid, extra_world: f32) -> f64 {
    (extra_world + BAND_MARGIN_VOXELS as f32 * grid.spacing()) as f64
}

/// Narrow-band core of [`voxelize_mesh`]: identical, but the distance pass clamps
/// at `band` world units. `band = f64::INFINITY` is the exact unbounded path, so
/// `voxelize_mesh` is literally this with an infinite band. The contoured surface
/// (the SDF=0 crossing) is unchanged for any `band` covering the op's read depth;
/// only far-field MAGNITUDES clamp to `sign * band`.
pub(crate) fn voxelize_mesh_banded(grid: &mut Grid, mesh: &Mesh, band: f64) {
    let bvh = Bvh::build(mesh);
    // One scratch stack: the distance and sign traversals run sequentially per
    // voxel and each clear()s on entry, so a single buffer serves both.
    let mut stack: Vec<u32> = Vec::new();
    let [nx, ny, nz] = grid.dims();
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let wp = grid.world_pos(x, y, z);
                let p = [wp[0] as f64, wp[1] as f64, wp[2] as f64];

                let unsigned = bvh.nearest_distance_within(p, band, &mut stack);

                let sign = if bvh.winding_number_fast(p, BETA, &mut stack) > 0.5 {
                    -1.0
                } else {
                    1.0
                };
                grid.set(x, y, z, (sign * unsigned) as f32);
            }
        }
    }
}

/// Brute reference for the distance pass: the unsigned min over all triangles.
/// The BVH leaf primitive reused, scanned linearly — the parity oracle for
/// [`Bvh::nearest_distance`](crate::bvh::Bvh::nearest_distance). Native-only
/// (test/bench); excluded from the wasm cdylib so it adds no shipped code.
#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn nearest_distance_brute(mesh: &Mesh, p: [f64; 3]) -> f64 {
    let mut unsigned = f64::INFINITY;
    for t in &mesh.tris {
        let d = point_to_triangle_distance(p, mesh.verts[t[0]], mesh.verts[t[1]], mesh.verts[t[2]]);
        if d < unsigned {
            unsigned = d;
        }
    }
    unsigned
}

/// Brute-force reference voxelizer (no BVH): the frozen pre-acceleration body,
/// kept as the parity oracle for [`voxelize_mesh`] and the bench baseline.
/// Native-only; excluded from the wasm cdylib.
#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn voxelize_mesh_brute(grid: &mut Grid, mesh: &Mesh) {
    let [nx, ny, nz] = grid.dims();
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let wp = grid.world_pos(x, y, z);
                let p = [wp[0] as f64, wp[1] as f64, wp[2] as f64];

                let unsigned = nearest_distance_brute(mesh, p);

                let sign = if mesh.is_inside(p) { -1.0 } else { 1.0 };
                grid.set(x, y, z, (sign * unsigned) as f32);
            }
        }
    }
}

/// Write ONLY the unsigned distance field (no FWN sign) via the brute min, so a
/// bench can isolate the distance pass from the unaccelerated sign pass.
#[cfg(not(target_arch = "wasm32"))]
fn distance_field_brute(grid: &mut Grid, mesh: &Mesh) {
    let [nx, ny, nz] = grid.dims();
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let wp = grid.world_pos(x, y, z);
                let p = [wp[0] as f64, wp[1] as f64, wp[2] as f64];
                grid.set(x, y, z, nearest_distance_brute(mesh, p) as f32);
            }
        }
    }
}

/// Write ONLY the FWN sign field via the EXACT per-triangle winding number, so a
/// bench can isolate the sign pass (the ~98% of e2e that PR2 accelerates).
#[cfg(not(target_arch = "wasm32"))]
fn sign_field_exact(grid: &mut Grid, mesh: &Mesh) {
    let [nx, ny, nz] = grid.dims();
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let wp = grid.world_pos(x, y, z);
                let p = [wp[0] as f64, wp[1] as f64, wp[2] as f64];
                grid.set(x, y, z, if mesh.is_inside(p) { -1.0 } else { 1.0 });
            }
        }
    }
}

/// Write ONLY the FWN sign field via the hierarchical Barnes–Hut query.
#[cfg(not(target_arch = "wasm32"))]
fn sign_field_fast(grid: &mut Grid, mesh: &Mesh) {
    let bvh = Bvh::build(mesh);
    let mut stack: Vec<u32> = Vec::new();
    let [nx, ny, nz] = grid.dims();
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let wp = grid.world_pos(x, y, z);
                let p = [wp[0] as f64, wp[1] as f64, wp[2] as f64];
                let s = if bvh.winding_number_fast(p, BETA, &mut stack) > 0.5 {
                    -1.0
                } else {
                    1.0
                };
                grid.set(x, y, z, s);
            }
        }
    }
}

/// Write ONLY the unsigned distance field (no FWN sign) via the BVH.
#[cfg(not(target_arch = "wasm32"))]
fn distance_field_bvh(grid: &mut Grid, mesh: &Mesh) {
    let bvh = Bvh::build(mesh);
    let mut stack: Vec<u32> = Vec::new();
    let [nx, ny, nz] = grid.dims();
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let wp = grid.world_pos(x, y, z);
                let p = [wp[0] as f64, wp[1] as f64, wp[2] as f64];
                grid.set(x, y, z, bvh.nearest_distance_with(p, &mut stack) as f32);
            }
        }
    }
}

/// Write ONLY the unsigned distance field via the BVH with a narrow band, so a
/// bench can isolate the far-field-prune win on the distance pass.
#[cfg(not(target_arch = "wasm32"))]
fn distance_field_banded(grid: &mut Grid, mesh: &Mesh, band: f64) {
    let bvh = Bvh::build(mesh);
    let mut stack: Vec<u32> = Vec::new();
    let [nx, ny, nz] = grid.dims();
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let wp = grid.world_pos(x, y, z);
                let p = [wp[0] as f64, wp[1] as f64, wp[2] as f64];
                grid.set(x, y, z, bvh.nearest_distance_within(p, band, &mut stack) as f32);
            }
        }
    }
}

// Bench-only re-exports: criterion builds an external harness against the rlib,
// which can't reach `pub(crate)`/private items. These shims keep the wasm
// surface unchanged (no #[wasm_bindgen]) while letting the bench call each path.
// Gated to native builds so they add no code to the shipped cdylib.
//
// `distance_field_*` isolate the accelerated pass (no FWN sign); the
// `voxelize_mesh_*` shims run the full pipeline whose speedup is bounded by the
// still-brute sign pass.
#[cfg(not(target_arch = "wasm32"))]
#[doc(hidden)]
pub fn distance_field_brute_pub(grid: &mut Grid, mesh: &Mesh) {
    distance_field_brute(grid, mesh);
}

#[cfg(not(target_arch = "wasm32"))]
#[doc(hidden)]
pub fn distance_field_bvh_pub(grid: &mut Grid, mesh: &Mesh) {
    distance_field_bvh(grid, mesh);
}

#[cfg(not(target_arch = "wasm32"))]
#[doc(hidden)]
pub fn sign_field_exact_pub(grid: &mut Grid, mesh: &Mesh) {
    sign_field_exact(grid, mesh);
}

#[cfg(not(target_arch = "wasm32"))]
#[doc(hidden)]
pub fn sign_field_fast_pub(grid: &mut Grid, mesh: &Mesh) {
    sign_field_fast(grid, mesh);
}

#[cfg(not(target_arch = "wasm32"))]
#[doc(hidden)]
pub fn voxelize_mesh_brute_pub(grid: &mut Grid, mesh: &Mesh) {
    voxelize_mesh_brute(grid, mesh);
}

#[cfg(not(target_arch = "wasm32"))]
#[doc(hidden)]
pub fn voxelize_mesh_bvh_pub(grid: &mut Grid, mesh: &Mesh) {
    voxelize_mesh(grid, mesh);
}

#[cfg(not(target_arch = "wasm32"))]
#[doc(hidden)]
pub fn distance_field_banded_pub(grid: &mut Grid, mesh: &Mesh, band: f64) {
    distance_field_banded(grid, mesh, band);
}

#[cfg(not(target_arch = "wasm32"))]
#[doc(hidden)]
pub fn voxelize_mesh_banded_pub(grid: &mut Grid, mesh: &Mesh, band: f64) {
    voxelize_mesh_banded(grid, mesh, band);
}

#[cfg(not(target_arch = "wasm32"))]
#[doc(hidden)]
pub fn band_radius_pub(grid: &Grid, extra_world: f32) -> f64 {
    band_radius(grid, extra_world)
}

/// Require two grids to share dimensions, else [`GridError::DimMismatch`].
fn require_same_dims(a: &Grid, b: &Grid) -> Result<(), GridError> {
    if a.dims() != b.dims() {
        return Err(GridError::DimMismatch {
            expected: a.dims(),
            got: b.dims(),
        });
    }
    Ok(())
}

/// Elementwise combine two same-dim grids into a new grid shaped like `a`.
fn combine(a: &Grid, b: &Grid, f: impl Fn(f32, f32) -> f32) -> Result<Grid, GridError> {
    require_same_dims(a, b)?;
    let [nx, ny, nz] = a.dims();
    let mut out = a.same_shape();
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                out.set(x, y, z, f(a.at(x, y, z), b.at(x, y, z)));
            }
        }
    }
    Ok(out)
}

/// Union (CSG OR): elementwise `min` of two SDFs.
pub fn voxel_union(a: &Grid, b: &Grid) -> Result<Grid, GridError> {
    combine(a, b, f32::min)
}

/// Intersection (CSG AND): elementwise `max` of two SDFs.
pub fn voxel_intersection(a: &Grid, b: &Grid) -> Result<Grid, GridError> {
    combine(a, b, f32::max)
}

/// Difference (CSG `a` minus `b`): elementwise `max(a, -b)`.
pub fn voxel_difference(a: &Grid, b: &Grid) -> Result<Grid, GridError> {
    combine(a, b, |x, y| x.max(-y))
}

/// Shift an SDF iso-level: subtract `distance` from every voxel in place. On a
/// true SDF this is an exact offset — `distance > 0` grows the surface outward,
/// `distance < 0` shrinks it inward — with no reinitialization needed.
pub fn offset_sdf(grid: &mut Grid, distance: f32) {
    let [nx, ny, nz] = grid.dims();
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                grid.set(x, y, z, grid.at(x, y, z) - distance);
            }
        }
    }
}

/// Hollow an SDF into a shell of wall `thickness` inward from the surface:
/// `shell = max(solid, -(solid + thickness))` per voxel (the solid intersected
/// with the complement of its inward erosion). Returns a new grid shaped like
/// `solid`. `thickness` is assumed positive and finite (guarded at the boundary).
pub fn shell_sdf(solid: &Grid, thickness: f32) -> Grid {
    let [nx, ny, nz] = solid.dims();
    let mut out = solid.same_shape();
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let s = solid.at(x, y, z);
                out.set(x, y, z, s.max(-(s + thickness)));
            }
        }
    }
    out
}

/// Fill a grid with the exact signed distance to the axis-aligned box
/// `[min, max]`: negative inside, positive outside. Intersecting another field
/// with this clips it to the box (and writes positive into any padding ring).
pub fn fill_box_sdf(grid: &mut Grid, min: [f32; 3], max: [f32; 3]) {
    let center = [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
    ];
    let half = [
        (max[0] - min[0]) * 0.5,
        (max[1] - min[1]) * 0.5,
        (max[2] - min[2]) * 0.5,
    ];
    let dims = grid.dims();
    for z in 0..dims[2] {
        for y in 0..dims[1] {
            for x in 0..dims[0] {
                let p = grid.world_pos(x, y, z);
                let dx = (p[0] - center[0]).abs() - half[0];
                let dy = (p[1] - center[1]).abs() - half[1];
                let dz = (p[2] - center[2]).abs() - half[2];
                let outside =
                    (dx.max(0.0).powi(2) + dy.max(0.0).powi(2) + dz.max(0.0).powi(2)).sqrt();
                let inside = dx.max(dy).max(dz).min(0.0);
                grid.set(x, y, z, outside + inside);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Unit cube [0,1]^3, outward-facing triangles (mirrors fwn's fixture).
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

    #[test]
    fn point_to_triangle_distance_regions() {
        let a = [0.0, 0.0, 0.0];
        let b = [1.0, 0.0, 0.0];
        let c = [0.0, 1.0, 0.0];
        // Above the face interior -> perpendicular distance.
        let d_face = point_to_triangle_distance([0.25, 0.25, 2.0], a, b, c);
        assert!((d_face - 2.0).abs() < 1e-9);
        // Beyond vertex A -> distance to A.
        let d_vert = point_to_triangle_distance([-1.0, -1.0, 0.0], a, b, c);
        assert!((d_vert - 2f64.sqrt()).abs() < 1e-9);
        // Off the AB edge -> perpendicular to that edge.
        let d_edge = point_to_triangle_distance([0.5, -1.0, 0.0], a, b, c);
        assert!((d_edge - 1.0).abs() < 1e-9);
    }

    /// A single triangle in the unit box.
    fn single_tri() -> Mesh {
        let verts: Vec<f32> = vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        let tris: Vec<u32> = vec![0, 1, 2];
        Mesh::from_flat(&verts, &tris)
    }

    /// Closed axis-aligned box [min,max], outward CCW (unit_cube topology, scaled).
    fn box_mesh(min: [f32; 3], max: [f32; 3]) -> (Vec<f32>, Vec<u32>) {
        let ([a, b, c], [d, e, f]) = (min, max);
        let verts = vec![
            a, b, c, d, b, c, d, e, c, a, e, c, a, b, f, d, b, f, d, e, f, a, e, f,
        ];
        let tris = vec![
            0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7,
            3, 1, 2, 6, 1, 6, 5,
        ];
        (verts, tris)
    }

    /// A deterministic multi-triangle soup, enough tris to force BVH splits.
    fn tri_soup() -> Mesh {
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

    /// The sign-identity gate: at EVERY voxel center of the grid the fast BVH
    /// winding sign must equal the exact FWN sign. Zero mismatches allowed.
    ///
    /// Bounds are deliberately off-axis (no voxel center lands exactly on an
    /// axis-aligned face) because winding is genuinely ill-defined ON the surface
    /// — there both the exact oracle and the fast path return w = 0.5 ± float
    /// noise and either may round either way. That on-surface tie is not an
    /// approximation defect; the design notes voxel centers rarely land on a
    /// face, and these bounds honour that.
    #[test]
    fn sign_parity_fast_vs_exact_all_voxels() {
        use crate::bvh::{Bvh, BETA};
        let fixtures: [(&str, Mesh, [f32; 3], [f32; 3]); 5] = [
            ("unit_cube", unit_cube(), [-0.07, -0.05, -0.11], [1.03, 1.09, 1.07]),
            ("holey_cube", holey_cube(), [-0.07, -0.05, -0.11], [1.03, 1.09, 1.07]),
            ("icosphere2", icosphere(2), [-1.31, -1.27, -1.23], [1.29, 1.33, 1.27]),
            ("icosphere3", icosphere(3), [-1.31, -1.27, -1.23], [1.29, 1.33, 1.27]),
            ("tri_soup", tri_soup(), [-1.03, -1.47, -1.51], [7.49, 1.53, 1.47]),
        ];
        for (name, mesh, min, max) in fixtures {
            let g = Grid::for_bounds(min, max, 16, 2).unwrap();
            let bvh = Bvh::build(&mesh);
            let mut stack = Vec::new();
            let [nx, ny, nz] = g.dims();
            let mut mismatches = 0usize;
            for z in 0..nz {
                for y in 0..ny {
                    for x in 0..nx {
                        let wp = g.world_pos(x, y, z);
                        let p = [wp[0] as f64, wp[1] as f64, wp[2] as f64];
                        let fast = bvh.is_inside_fast(p, BETA, &mut stack);
                        let exact = mesh.is_inside(p);
                        if fast != exact {
                            mismatches += 1;
                        }
                    }
                }
            }
            assert_eq!(mismatches, 0, "{name}: {mismatches} sign mismatches vs exact FWN");
        }
    }

    /// Adversarial guards for the dipole-only / BETA=2 far-field margin (review P3):
    /// the regimes where the first-order approximation is least damped. Each must
    /// hold 100% SIGN parity vs the exact oracle, so a future BETA / leaf-size
    /// change can't silently erode the empirical margin.
    #[test]
    fn sign_parity_adversarial_fixtures() {
        use crate::bvh::{Bvh, BETA};

        // High-aspect closed slab: extreme node AABBs / radii.
        let (sv, st) = box_mesh([0.0, 0.0, 0.0], [10.0, 0.1, 0.1]);
        let slab = Mesh::from_flat(&sv, &st);

        // Far disjoint emitter: a small unit cube near origin PLUS a large closed
        // cube centred at x=20, whose accumulated far-field dipole error lands on
        // the queries sampled around the small near-origin component.
        let (mut cv, mut ct) = box_mesh([0.0, 0.0, 0.0], [1.0, 1.0, 1.0]);
        let (bv, bt) = box_mesh([17.0, -3.0, -3.0], [23.0, 3.0, 3.0]);
        let off = (cv.len() / 3) as u32;
        cv.extend_from_slice(&bv);
        ct.extend(bt.iter().map(|i| i + off));
        let disjoint = Mesh::from_flat(&cv, &ct);

        let cases: [(&str, Mesh, [f32; 3], [f32; 3]); 3] = [
            // Single OPEN triangle: no surrounding geometry to damp the dipole.
            ("open_tri", single_tri(), [-1.07, -1.05, -1.11], [2.03, 2.09, 1.07]),
            ("slab", slab, [-0.53, -0.57, -0.61], [10.47, 0.63, 0.67]),
            ("disjoint_far_emitter", disjoint, [-0.53, -0.57, -0.61], [1.53, 1.49, 1.47]),
        ];
        for (name, mesh, min, max) in cases {
            let g = Grid::for_bounds(min, max, 16, 2).unwrap();
            let bvh = Bvh::build(&mesh);
            let mut stack = Vec::new();
            let [nx, ny, nz] = g.dims();
            let mut mismatches = 0usize;
            for z in 0..nz {
                for y in 0..ny {
                    for x in 0..nx {
                        let wp = g.world_pos(x, y, z);
                        let p = [wp[0] as f64, wp[1] as f64, wp[2] as f64];
                        if bvh.is_inside_fast(p, BETA, &mut stack) != mesh.is_inside(p) {
                            mismatches += 1;
                        }
                    }
                }
            }
            assert_eq!(mismatches, 0, "{name}: {mismatches} sign mismatches vs exact FWN");
        }
    }

    /// Keystone explicit: the holey-cube center still classifies inside under the
    /// fast path (w > 0.5), matching the exact ~0.833.
    #[test]
    fn fast_holey_cube_center_still_inside() {
        use crate::bvh::{Bvh, BETA};
        let mesh = holey_cube();
        let bvh = Bvh::build(&mesh);
        let mut stack = Vec::new();
        let w = bvh.winding_number_fast([0.5, 0.5, 0.5], BETA, &mut stack);
        assert!(w > 0.5, "holey-cube center must stay inside, w={w}");
        assert!((w - (1.0 - 1.0 / 6.0)).abs() < 1e-2, "expected ~0.833, got {w}");
    }

    /// Full-grid SDF sign parity: voxelize_mesh (fast sign) and voxelize_mesh_brute
    /// (exact sign) must agree in SIGN at every voxel — magnitudes already match
    /// via the shared exact distance pass; only the sign source changed.
    #[test]
    fn voxelize_sign_parity_fast_vs_brute_all_voxels() {
        let fixtures: [(&str, Mesh, [f32; 3], [f32; 3]); 4] = [
            ("unit_cube", unit_cube(), [-0.07, -0.05, -0.11], [1.03, 1.09, 1.07]),
            ("holey_cube", holey_cube(), [-0.07, -0.05, -0.11], [1.03, 1.09, 1.07]),
            ("icosphere2", icosphere(2), [-1.31, -1.27, -1.23], [1.29, 1.33, 1.27]),
            ("tri_soup", tri_soup(), [-1.03, -1.47, -1.51], [7.49, 1.53, 1.47]),
        ];
        for (name, mesh, min, max) in fixtures {
            let mut a = Grid::for_bounds(min, max, 16, 2).unwrap();
            let mut b = Grid::for_bounds(min, max, 16, 2).unwrap();
            voxelize_mesh_brute(&mut a, &mesh);
            voxelize_mesh(&mut b, &mesh);
            let [nx, ny, nz] = a.dims();
            for z in 0..nz {
                for y in 0..ny {
                    for x in 0..nx {
                        let sa = a.at(x, y, z).signum();
                        let sb = b.at(x, y, z).signum();
                        assert_eq!(sa, sb, "{name}: sign mismatch at ({x},{y},{z})");
                    }
                }
            }
        }
    }

    #[test]
    fn voxelize_parity_bvh_vs_brute() {
        let fixtures: [(&str, Mesh, [f32; 3], [f32; 3]); 4] = [
            ("unit_cube", unit_cube(), [0.0, 0.0, 0.0], [1.0, 1.0, 1.0]),
            ("holey_cube", holey_cube(), [0.0, 0.0, 0.0], [1.0, 1.0, 1.0]),
            ("single_tri", single_tri(), [-0.5, -0.5, -0.5], [1.5, 1.5, 0.5]),
            ("tri_soup", tri_soup(), [-1.0, -1.5, -1.5], [7.5, 1.5, 1.5]),
        ];
        for (name, mesh, min, max) in fixtures {
            let mut a = Grid::for_bounds(min, max, 12, 2).unwrap();
            let mut b = Grid::for_bounds(min, max, 12, 2).unwrap();
            voxelize_mesh_brute(&mut a, &mesh);
            voxelize_mesh(&mut b, &mesh);

            assert_eq!(a.dims(), b.dims(), "{name}: dims must match");

            let [nx, ny, nz] = a.dims();
            let mut max_abs_diff = 0.0_f32;
            for z in 0..nz {
                for y in 0..ny {
                    for x in 0..nx {
                        let diff = (a.at(x, y, z) - b.at(x, y, z)).abs();
                        if diff > max_abs_diff {
                            max_abs_diff = diff;
                        }
                    }
                }
            }
            assert!(
                max_abs_diff < 1e-6,
                "{name}: BVH SDF must match brute, max abs diff {max_abs_diff}"
            );
        }
    }

    #[test]
    fn voxelize_watertight_cube_signs() {
        let m = unit_cube();
        let mut g = Grid::for_bounds([0.0, 0.0, 0.0], [1.0, 1.0, 1.0], 8, 1).unwrap();
        voxelize_mesh(&mut g, &m);

        // Interior cell near the cube centre.
        let [nx, ny, nz] = g.dims();
        let (cx, cy, cz) = (nx / 2, ny / 2, nz / 2);
        let center = g.world_pos(cx, cy, cz);
        assert!(
            center[0] > 0.2 && center[0] < 0.8,
            "expected an interior sample, got {center:?}"
        );
        assert!(g.at(cx, cy, cz) < 0.0, "interior voxel must be negative");

        // Exterior cell in the padding ring (corner).
        assert!(g.at(0, 0, 0) > 0.0, "exterior voxel must be positive");

        // Near-surface cell: find the cell whose |SDF| is smallest; it must be tiny.
        let mut min_abs = f32::INFINITY;
        for z in 0..nz {
            for y in 0..ny {
                for x in 0..nx {
                    let v = g.at(x, y, z).abs();
                    if v < min_abs {
                        min_abs = v;
                    }
                }
            }
        }
        assert!(
            min_abs < g.spacing(),
            "a near-surface voxel must be within one spacing of zero, got {min_abs}"
        );
    }

    #[test]
    fn voxelize_holey_cube_interior_still_negative() {
        // The keystone: dropping the +z face leaves the mesh open, but the FWN sign
        // still classifies the interior as inside, so its SDF stays negative.
        let m = holey_cube();
        let mut g = Grid::for_bounds([0.0, 0.0, 0.0], [1.0, 1.0, 1.0], 8, 1).unwrap();
        voxelize_mesh(&mut g, &m);

        let [nx, ny, nz] = g.dims();
        let (cx, cy, cz) = (nx / 2, ny / 2, nz / 2);
        assert!(
            g.at(cx, cy, cz) < 0.0,
            "holey-cube interior voxel must STILL be negative (FWN keystone)"
        );
    }

    /// Element-wise equality of two contoured meshes (exact f32 — identical inputs
    /// near the surface must produce bit-identical contours).
    fn assert_contours_equal(a: &Grid, b: &Grid, label: &str) {
        let ca = crate::contour::surface_nets_mesh(a);
        let cb = crate::contour::surface_nets_mesh(b);
        assert_eq!(ca.indices, cb.indices, "{label}: contour indices differ");
        assert_eq!(ca.positions.len(), cb.positions.len(), "{label}: position counts differ");
        for (i, (&pa, &pb)) in ca.positions.iter().zip(cb.positions.iter()).enumerate() {
            assert_eq!(pa, pb, "{label}: position[{i}] {pa} vs {pb}");
        }
    }

    /// The narrow-band voxelizer must reproduce the full-path CONTOUR exactly on
    /// every fixture whose surface is closed (or whose open spans are smaller than
    /// the band), for each op's band sizing. Far-field SDF magnitudes are NOT
    /// compared (they clamp by design); only the extracted surface is asserted,
    /// which is the cross-language parity contract.
    ///
    /// holey_cube is covered separately by
    /// [`voxelize_banded_holey_cube_contour_within_tolerance`]: its large open top
    /// is filled by FWN at a zero-crossing whose nearest triangle is ~half the cube
    /// away — farther than the 2-voxel repair band — so the open-span fill cannot
    /// reproduce the full path bit-for-bit there. That is a property of open-span
    /// FWN fill, not a sign defect; the keystone and a sub-voxel tolerance pin it.
    /// The whole banded-op parity argument rests on `band_radius` always adding a
    /// full 2-voxel collar beyond the op's reach, so no extracted contour cell ever
    /// reads a clamped value on the side facing the surface. Pin that invariant.
    #[test]
    fn band_radius_always_adds_two_voxel_collar() {
        let g = Grid::for_bounds([0.0, 0.0, 0.0], [4.0, 2.0, 1.0], 16, 2).unwrap();
        let sp = g.spacing() as f64;
        // repair (extra=0) is exactly the collar; offset/shell add their reach on top.
        assert!((band_radius(&g, 0.0) - 2.0 * sp).abs() < 1e-6);
        assert!(band_radius(&g, 0.5) >= 0.5 + 2.0 * sp - 1e-6);
        assert!(band_radius(&g, 3.0) >= 3.0 + 2.0 * sp - 1e-6);
    }

    #[test]
    fn voxelize_banded_matches_full_contoured() {
        let fixtures: [(&str, Mesh, [f32; 3], [f32; 3]); 4] = [
            ("unit_cube", unit_cube(), [0.0, 0.0, 0.0], [1.0, 1.0, 1.0]),
            ("single_tri", single_tri(), [-0.5, -0.5, -0.5], [1.5, 1.5, 0.5]),
            ("tri_soup", tri_soup(), [-1.0, -1.5, -1.5], [7.5, 1.5, 1.5]),
            ("icosphere2", icosphere(2), [-1.3, -1.3, -1.3], [1.3, 1.3, 1.3]),
        ];
        for (name, mesh, min, max) in fixtures {
            // repair: band = 2·spacing (extra = 0), contour the raw SDF.
            {
                let mut full = Grid::for_bounds(min, max, 16, 2).unwrap();
                let mut banded = full.same_shape();
                voxelize_mesh(&mut full, &mesh);
                let r = band_radius(&banded, 0.0);
                voxelize_mesh_banded(&mut banded, &mesh, r);
                assert_contours_equal(&full, &banded, &format!("{name}/repair"));
            }

            // offset: band must cover the chosen iso-shift; apply offset_sdf to both.
            {
                let distance = 0.15_f32;
                let mut full = Grid::for_bounds(min, max, 16, 2).unwrap();
                let mut banded = full.same_shape();
                voxelize_mesh(&mut full, &mesh);
                let r = band_radius(&banded, distance.abs());
                voxelize_mesh_banded(&mut banded, &mesh, r);
                offset_sdf(&mut full, distance);
                offset_sdf(&mut banded, distance);
                assert_contours_equal(&full, &banded, &format!("{name}/offset"));
            }

            // shell: band must reach inward to thickness; apply shell_sdf to both.
            {
                let thickness = 0.2_f32;
                let mut full = Grid::for_bounds(min, max, 16, 2).unwrap();
                let mut banded = full.same_shape();
                voxelize_mesh(&mut full, &mesh);
                let r = band_radius(&banded, thickness);
                voxelize_mesh_banded(&mut banded, &mesh, r);
                let full_shell = shell_sdf(&full, thickness);
                let band_shell = shell_sdf(&banded, thickness);
                assert_contours_equal(&full_shell, &band_shell, &format!("{name}/shell"));
            }
        }
    }

    /// holey_cube repair under the 2-voxel band: its open top is filled by FWN at a
    /// zero-crossing whose nearest triangle is ~half a cube away (farther than the
    /// band), so the open-span fill is the ONE region the band can't reproduce
    /// bit-for-bit — the surface there shifts by under a voxel and can add/drop a
    /// fill cell, so neither indices nor positions match exactly. The contract that
    /// DOES survive is the one vitest gates: same bbox (the surface still hugs the
    /// unit cube on all six sides) and a comparable triangle count. Asserting that
    /// here mirrors `voxelRepair.test.ts`'s `toBeCloseTo(..., 1)` bounds, the actual
    /// cross-language guard, while documenting the open-span limitation.
    #[test]
    fn voxelize_banded_holey_cube_contour_within_tolerance() {
        let mesh = holey_cube();
        let mut full = Grid::for_bounds([0.0, 0.0, 0.0], [1.0, 1.0, 1.0], 16, 2).unwrap();
        let mut banded = full.same_shape();
        voxelize_mesh(&mut full, &mesh);
        let r = band_radius(&banded, 0.0);
        voxelize_mesh_banded(&mut banded, &mesh, r);

        let cf = crate::contour::surface_nets_mesh(&full);
        let cb = crate::contour::surface_nets_mesh(&banded);

        let bbox = |pos: &[f32]| {
            let mut lo = [f32::INFINITY; 3];
            let mut hi = [f32::NEG_INFINITY; 3];
            for p in pos.chunks_exact(3) {
                for d in 0..3 {
                    lo[d] = lo[d].min(p[d]);
                    hi[d] = hi[d].max(p[d]);
                }
            }
            (lo, hi)
        };
        let (flo, fhi) = bbox(&cf.positions);
        let (blo, bhi) = bbox(&cb.positions);
        for d in 0..3 {
            assert!(
                (flo[d] - blo[d]).abs() < banded.spacing()
                    && (fhi[d] - bhi[d]).abs() < banded.spacing(),
                "axis {d}: bbox must agree within a voxel — full [{},{}] banded [{},{}]",
                flo[d],
                fhi[d],
                blo[d],
                bhi[d]
            );
        }
        let ft = cf.indices.len() / 3;
        let bt = cb.indices.len() / 3;
        let tol = (ft / 10).max(8);
        assert!(
            bt.abs_diff(ft) <= tol,
            "banded triangle count {bt} must be within {tol} of full {ft}"
        );
    }

    /// Keystone under banding: the holey-cube interior must STILL classify inside
    /// (negative SDF) when banded, because the clamp is `sign × band` and the sign
    /// comes from the unchanged `winding_number_fast`. Also asserts the far interior
    /// clamps to exactly `-band` (a correctly-signed far value, not `+band`).
    #[test]
    fn voxelize_banded_holey_cube_interior_still_negative() {
        let m = holey_cube();
        let mut g = Grid::for_bounds([0.0, 0.0, 0.0], [1.0, 1.0, 1.0], 8, 1).unwrap();
        let band = band_radius(&g, 0.0);
        voxelize_mesh_banded(&mut g, &m, band);

        let [nx, ny, nz] = g.dims();
        let (cx, cy, cz) = (nx / 2, ny / 2, nz / 2);
        assert!(
            g.at(cx, cy, cz) < 0.0,
            "banded holey-cube interior voxel must STILL be negative (FWN keystone)"
        );

        // A deep-interior cell whose nearest face is farther than the band clamps
        // to exactly -band: correctly-signed (negative), not a wrong-signed +band.
        // The cube interior depth (~0.5 to the nearest face at the centre) exceeds
        // a 2·spacing band at this resolution, so the centre itself is clamped.
        assert!(
            (g.at(cx, cy, cz) - (-band as f32)).abs() < 1e-5,
            "far interior must clamp to -band ({}), got {}",
            -band as f32,
            g.at(cx, cy, cz)
        );
    }

    /// A small grid with every cell set to `fill`, shaped from a 1-unit cube.
    fn filled_grid(fill: f32) -> Grid {
        let mut g = Grid::for_bounds([0.0, 0.0, 0.0], [1.0, 1.0, 1.0], 2, 0).unwrap();
        let [nx, ny, nz] = g.dims();
        for z in 0..nz {
            for y in 0..ny {
                for x in 0..nx {
                    g.set(x, y, z, fill);
                }
            }
        }
        g
    }

    #[test]
    fn boolean_union_is_elementwise_min() {
        let a = filled_grid(-1.0);
        let b = filled_grid(2.0);
        let u = voxel_union(&a, &b).unwrap();
        assert_eq!(u.at(0, 0, 0), -1.0);
        assert_eq!(u.dims(), a.dims());
    }

    #[test]
    fn boolean_intersection_is_elementwise_max() {
        let a = filled_grid(-1.0);
        let b = filled_grid(2.0);
        let i = voxel_intersection(&a, &b).unwrap();
        assert_eq!(i.at(0, 0, 0), 2.0);
    }

    #[test]
    fn boolean_difference_is_max_a_neg_b() {
        let a = filled_grid(-1.0);
        let b = filled_grid(-3.0);
        // max(-1, -(-3)) = max(-1, 3) = 3.
        let d = voxel_difference(&a, &b).unwrap();
        assert_eq!(d.at(0, 0, 0), 3.0);
    }

    #[test]
    fn offset_sdf_shifts_iso_level() {
        let mut g = filled_grid(0.5);
        offset_sdf(&mut g, 1.0);
        // 0.5 - 1.0 = -0.5: an outward grow turns a near-surface positive cell
        // negative (now inside the offset surface).
        assert_eq!(g.at(0, 0, 0), -0.5);
    }

    #[test]
    fn shell_sdf_hollows_interior() {
        // Deep interior of the solid (very negative) becomes positive in the
        // shell (carved out), while a near-surface cell stays inside the wall.
        let deep = filled_grid(-5.0);
        let shell = shell_sdf(&deep, 1.0);
        // max(-5, -(-5 + 1)) = max(-5, 4) = 4 -> carved out (positive).
        assert_eq!(shell.at(0, 0, 0), 4.0);

        let near = filled_grid(-0.25);
        let shell = shell_sdf(&near, 1.0);
        // max(-0.25, -(-0.25 + 1)) = max(-0.25, -0.75) = -0.25 -> still solid wall.
        assert_eq!(shell.at(0, 0, 0), -0.25);
    }

    #[test]
    fn boolean_dim_mismatch_errors() {
        let a = filled_grid(0.0);
        let b = Grid::for_bounds([0.0, 0.0, 0.0], [1.0, 1.0, 1.0], 4, 0).unwrap();
        match voxel_union(&a, &b) {
            Err(GridError::DimMismatch { expected, got }) => {
                assert_eq!(expected, a.dims());
                assert_eq!(got, b.dims());
            }
            other => panic!("expected DimMismatch, got {other:?}"),
        }
    }
}

