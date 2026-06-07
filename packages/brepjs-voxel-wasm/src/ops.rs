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

use crate::bvh::Bvh;
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
    let bvh = Bvh::build(mesh);
    let mut stack: Vec<u32> = Vec::new();
    let [nx, ny, nz] = grid.dims();
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let wp = grid.world_pos(x, y, z);
                let p = [wp[0] as f64, wp[1] as f64, wp[2] as f64];

                let unsigned = bvh.nearest_distance_with(p, &mut stack);

                let sign = if mesh.is_inside(p) { -1.0 } else { 1.0 };
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
pub fn voxelize_mesh_brute_pub(grid: &mut Grid, mesh: &Mesh) {
    voxelize_mesh_brute(grid, mesh);
}

#[cfg(not(target_arch = "wasm32"))]
#[doc(hidden)]
pub fn voxelize_mesh_bvh_pub(grid: &mut Grid, mesh: &Mesh) {
    voxelize_mesh(grid, mesh);
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
