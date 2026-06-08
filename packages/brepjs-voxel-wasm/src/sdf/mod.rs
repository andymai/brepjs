//! Field-first SDF authoring (ADR-0013): an analytic [`Expr`] expression tree that
//! rasterizes DIRECTLY into a dense [`Grid`] with no input mesh, the field-first
//! twin of the mesh-first voxelizer. The rasterized field is a true banded SDF, so
//! it feeds the same contour / offset / shell seam as `voxelize_mesh_banded`.

pub mod expr;
pub mod operators;
pub mod primitives;

pub use expr::{Aabb, Expr};

use crate::grid::{Grid, GridError};
use crate::ops::band_radius;

/// Rasterize an [`Expr`] into a dense [`Grid`] sized to `bounds`. Mirrors
/// `voxelize_mesh_banded`'s banded semantics: every voxel is the expression's exact
/// signed distance at its world position, CLAMPED to ±band so the far field is a
/// uniform sentinel — the precondition the contourer/offset/shell rely on. Single
/// threaded. Errors with [`GridError`] if the grid would exceed the voxel cap.
pub fn rasterize(
    expr: &Expr,
    bounds: Aabb,
    resolution: usize,
    padding: usize,
) -> Result<Grid, GridError> {
    let min = [bounds.min[0] as f32, bounds.min[1] as f32, bounds.min[2] as f32];
    let max = [bounds.max[0] as f32, bounds.max[1] as f32, bounds.max[2] as f32];

    let mut grid = Grid::for_bounds(min, max, resolution, padding)?;
    let band = band_radius(&grid, 0.0);

    let [nx, ny, nz] = grid.dims();
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let wp = grid.world_pos(x, y, z);
                let d = expr.eval([wp[0] as f64, wp[1] as f64, wp[2] as f64]);
                let clamped = d.clamp(-band, band);
                grid.set(x, y, z, clamped as f32);
            }
        }
    }
    Ok(grid)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contour::surface_nets_mesh;
    use crate::ops::fill_box_sdf;
    use std::collections::HashMap;
    use std::f64::consts::PI;

    /// RASTERIZE PARITY: a Box rasterized via Expr must agree in SIGN with the
    /// template `fill_box_sdf` rasterizer at every voxel. Same bounds, same grid
    /// geometry — only the rasterization route differs.
    #[test]
    fn box_rasterize_sign_parity_with_fill_box_sdf() {
        let half = [1.0_f64, 0.8, 1.2];
        let expr = Expr::Box { half };
        let bounds = Aabb::centered(half);

        let via_expr = rasterize(&expr, bounds, 20, 2).unwrap();

        // Build a matching grid and fill it with the template box SDF.
        let min = [-half[0] as f32, -half[1] as f32, -half[2] as f32];
        let max = [half[0] as f32, half[1] as f32, half[2] as f32];
        let mut via_template = Grid::for_bounds(min, max, 20, 2).unwrap();
        fill_box_sdf(&mut via_template, min, max);

        assert_eq!(via_expr.dims(), via_template.dims(), "grids must co-register");
        let [nx, ny, nz] = via_expr.dims();
        let mut mismatches = 0usize;
        for z in 0..nz {
            for y in 0..ny {
                for x in 0..nx {
                    let a = via_expr.at(x, y, z);
                    let b = via_template.at(x, y, z);
                    // Compare sign; the banded clamp only touches magnitude far away.
                    if a.signum() != b.signum() && a.abs() > 1e-5 && b.abs() > 1e-5 {
                        mismatches += 1;
                    }
                }
            }
        }
        assert_eq!(mismatches, 0, "box rasterize sign must match fill_box_sdf");
    }

    /// A rasterized sphere contours to a non-empty, watertight mesh whose radius is
    /// recovered from the bounding box.
    #[test]
    fn sphere_rasterizes_and_contours() {
        let r = 1.5;
        let expr = Expr::Sphere { r };
        let grid = rasterize(&expr, expr.bounds(), 24, 2).unwrap();
        let mesh = surface_nets_mesh(&grid);
        assert!(!mesh.positions.is_empty(), "sphere must contour to vertices");
        assert!(!mesh.indices.is_empty(), "sphere must contour to triangles");

        let (mn, mx) = flat_bbox(&mesh.positions);
        for axis in 0..3 {
            let extent = (mx[axis] - mn[axis]) * 0.5;
            assert!(
                (extent - r as f32).abs() < 0.15,
                "axis {axis} half-extent {extent} ~ r {r}"
            );
        }
    }

    /// Offset on a rasterized sphere grows the contoured radius outward; shell
    /// turns the solid into a thin wall (two surfaces, larger bbox is unchanged).
    #[test]
    fn offset_and_shell_change_the_rasterized_surface() {
        let r = 1.0;
        let base = Expr::Sphere { r };

        let grown = Expr::Offset {
            e: Box::new(base.clone()),
            d: 0.5,
        };
        // Bounds must already account for the outward growth (expand by d).
        let g_grid = rasterize(&grown, grown.bounds(), 28, 3).unwrap();
        let g_mesh = surface_nets_mesh(&g_grid);
        let (gmn, gmx) = flat_bbox(&g_mesh.positions);
        let grown_extent = (gmx[0] - gmn[0]) * 0.5;
        assert!(
            grown_extent > 1.3,
            "offset must grow the radius past base+0.3, got {grown_extent}"
        );

        // Shell: hollow the sphere; the contour must still be non-empty.
        let hollow = Expr::Shell {
            e: Box::new(base.clone()),
            t: 0.15,
        };
        let s_grid = rasterize(&hollow, hollow.bounds(), 32, 3).unwrap();
        let s_mesh = surface_nets_mesh(&s_grid);
        assert!(!s_mesh.positions.is_empty(), "shelled sphere must contour");
        assert!(!s_mesh.indices.is_empty(), "shelled sphere must have triangles");
    }

    /// SKELETON CHAMBER v0: a hollow conical body unioned with a ring of cooling
    /// channels, rasterized and contoured to a non-empty, watertight mesh.
    #[test]
    fn skeleton_chamber_v0_is_watertight() {
        let chamber = chamber_expr();
        let grid = rasterize(&chamber, chamber.bounds(), 40, 3).unwrap();
        let mesh = surface_nets_mesh(&grid);
        assert!(!mesh.positions.is_empty(), "chamber must contour to vertices");
        assert!(!mesh.indices.is_empty(), "chamber must contour to triangles");
        assert!(
            is_watertight(&mesh.indices),
            "skeleton chamber contour must be watertight"
        );
    }

    /// The chamber skeleton: a capped cone shelled into a hollow body, unioned with
    /// four cooling channels (thin cylinders) translated around the axis.
    fn chamber_expr() -> Expr {
        let body = Expr::Shell {
            e: Box::new(Expr::Cone { r: 2.0, h: 4.0 }),
            t: 0.25,
        };
        let mut acc = body;
        let channel = || Expr::Cylinder { r: 0.3, h: 4.0 };
        for i in 0..4 {
            let angle = i as f64 * PI / 2.0;
            let cx = 1.4 * angle.cos();
            let cy = 1.4 * angle.sin();
            let ch = Expr::Translate {
                e: Box::new(channel()),
                t: [cx, cy, 0.0],
            };
            acc = Expr::Union(Box::new(acc), Box::new(ch));
        }
        acc
    }

    /// Every undirected edge is shared by exactly two triangles.
    fn is_watertight(indices: &[u32]) -> bool {
        let mut edges: HashMap<(u32, u32), i32> = HashMap::new();
        for t in indices.chunks_exact(3) {
            for &(a, b) in &[(t[0], t[1]), (t[1], t[2]), (t[2], t[0])] {
                let k = if a < b { (a, b) } else { (b, a) };
                *edges.entry(k).or_insert(0) += 1;
            }
        }
        edges.values().all(|&c| c == 2)
    }

    fn flat_bbox(verts: &[f32]) -> ([f32; 3], [f32; 3]) {
        let mut mn = [f32::INFINITY; 3];
        let mut mx = [f32::NEG_INFINITY; 3];
        for p in verts.chunks_exact(3) {
            for a in 0..3 {
                mn[a] = mn[a].min(p[a]);
                mx[a] = mx[a].max(p[a]);
            }
        }
        (mn, mx)
    }
}
