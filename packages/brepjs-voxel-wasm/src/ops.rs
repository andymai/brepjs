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
fn point_to_triangle_distance(p: [f64; 3], a: [f64; 3], b: [f64; 3], c: [f64; 3]) -> f64 {
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
/// closest-point distance over all triangles; the sign is `-1` if `mesh.is_inside`
/// (FWN > 0.5) else `+1`. Storing `sign * unsigned` makes even a non-watertight
/// mesh produce a watertight SDF, because the sign comes from the winding number
/// rather than from surface connectivity.
pub fn voxelize_mesh(grid: &mut Grid, mesh: &Mesh) {
    let [nx, ny, nz] = grid.dims();
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let wp = grid.world_pos(x, y, z);
                let p = [wp[0] as f64, wp[1] as f64, wp[2] as f64];

                let mut unsigned = f64::INFINITY;
                for t in &mesh.tris {
                    let d = point_to_triangle_distance(
                        p,
                        mesh.verts[t[0]],
                        mesh.verts[t[1]],
                        mesh.verts[t[2]],
                    );
                    if d < unsigned {
                        unsigned = d;
                    }
                }

                let sign = if mesh.is_inside(p) { -1.0 } else { 1.0 };
                grid.set(x, y, z, (sign * unsigned) as f32);
            }
        }
    }
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
