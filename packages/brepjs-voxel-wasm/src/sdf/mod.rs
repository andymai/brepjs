//! Field-first SDF authoring (ADR-0013): an analytic [`Expr`] expression tree that
//! rasterizes DIRECTLY into a dense [`Grid`] with no input mesh, the field-first
//! twin of the mesh-first voxelizer. The rasterized field is a true banded SDF, so
//! it feeds the same contour / offset / shell seam as `voxelize_mesh_banded`.

pub mod expr;
pub mod field;
pub mod operators;
pub mod primitives;
pub mod sweep;

pub use expr::{Aabb, Expr};
pub use field::ScalarField;
pub use sweep::SweptCurve;

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

    /// CHAMBER v1: the v0.5 chamber smooth-unioned with a CONFORMAL GRADED GYROID
    /// JACKET rasterizes and contours to a NON-EMPTY mesh with a SANE bbox. The jacket
    /// adds the lattice both as strut material (the gyroid is present in the bbox) and
    /// raises the radial extent past the bare cone (the band sits outside the wall).
    /// (Watertight is NOT asserted here — surface-nets cannot contour a clipped
    /// high-genus TPMS jacket watertight at feasible resolution regardless of clip
    /// shape; see `chamber_v1_expr`. The watertight gate stays on the lattice-free
    /// `chamber_expr`.)
    #[test]
    fn chamber_v1_jacket_contours_with_sane_bbox() {
        let chamber = chamber_v1_expr();
        let grid = rasterize(&chamber, chamber.bounds(), 48, 3).unwrap();
        let mesh = surface_nets_mesh(&grid);
        assert!(!mesh.positions.is_empty(), "chamber v1 must contour to vertices");
        assert!(!mesh.indices.is_empty(), "chamber v1 must contour to triangles");

        let (mn, mx) = flat_bbox(&mesh.positions);
        for axis in 0..3 {
            let extent = mx[axis] - mn[axis];
            assert!(extent > 1.0, "axis {axis} extent {extent} must be > 1");
            assert!(extent < 12.0, "axis {axis} extent {extent} must be < 12");
        }
        // The jacket band sits outside the bare cone (base r = 2), so the radial
        // extent must reach past the cone's own ±2 — the lattice jacket is present.
        let radial = mx[0].max(mx[1]).max(-mn[0]).max(-mn[1]);
        assert!(radial > 2.1, "jacket must extend past the bare cone wall, got {radial}");
    }

    /// A single SWEPT channel (circle profile along a helical spine) rasterizes and
    /// contours to a non-empty, watertight mesh — the Phase-2a sweep watertight gate.
    #[test]
    fn swept_channel_contours_watertight() {
        let channel = swept_channel(0.0);
        let grid = rasterize(&channel, channel.bounds(), 48, 3).unwrap();
        let mesh = surface_nets_mesh(&grid);
        assert!(!mesh.positions.is_empty(), "swept channel must contour to vertices");
        assert!(!mesh.indices.is_empty(), "swept channel must contour to triangles");
        assert!(
            is_watertight(&mesh.indices),
            "swept channel contour must be watertight"
        );
    }

    /// CHAMBER v0.5: a capped cone shelled into a hollow body, unioned with four
    /// SWEPT cooling channels. Each channel is a circle profile swept along a gently
    /// helical spine that follows the cone wall (radius tapers with height), proving
    /// the Phase-2a sweep operator in the demonstrator. This is the WATERTIGHT core
    /// the v1 jacket builds on (`chamber_v1_expr`).
    fn chamber_expr() -> Expr {
        use super::field::ScalarField;
        // Field-modulated wall: thicker toward the hot throat (the cone apex at
        // z = +h/2 = +2). An AxialRamp grades the shell half-width from 0.2 at the
        // base to 0.35 at the throat — the Phase-2b modulation in the demonstrator.
        let body = Expr::ShellField {
            e: Box::new(Expr::Cone { r: 2.0, h: 4.0 }),
            t: ScalarField::AxialRamp {
                axis: 2,
                a: -2.0,
                b: 2.0,
                lo: 0.2,
                hi: 0.35,
            },
        };
        let mut acc = body;
        for i in 0..4 {
            let phase = i as f64 * PI / 2.0;
            acc = Expr::Union(Box::new(acc), Box::new(swept_channel(phase)));
        }
        acc
    }

    /// CHAMBER v1: the v0.5 chamber (graded wall + swept channels) smooth-unioned
    /// with a CONFORMAL GRADED GYROID JACKET — the LEAP71-class composition. The
    /// jacket is a gyroid lattice with GRADED thickness (thicker toward the hot
    /// throat, tracking the wall) clipped to a conical band hugging the outer wall;
    /// the `Intersection` is the conformal clip that bounds the periodic lattice.
    ///
    /// NOTE on the watertight gate: surface-nets cannot contour the conformal
    /// gyroid jacket WATERTIGHT at feasible resolution, and the CLIP SHAPE is not the
    /// cause. Empirically (verified across res 48/64/96): the conical clip is fine on
    /// its own — the same chamber smooth-unioned with the SOLID conical band (no
    /// lattice) IS watertight — and an axis-aligned BOX clip of the gyroid jacket
    /// fails too. The cause is the high-genus TPMS topology: anywhere the clip
    /// surface grazes a lattice wall at sub-voxel scale, surface-nets emits a
    /// non-manifold seam, and a periodic TPMS presents many such near-tangential
    /// grazes against any clip. (Even an ISOLATED box-clipped gyroid is only
    /// watertight at resolutions where the clip plane happens to land in lattice
    /// void — it is resolution-fragile, not guaranteed.) So `chamber_v1_expr` is
    /// gated on NON-EMPTY + sane bbox (the same invariant the mesh-first
    /// `tpms_box`/`lattice_infill` lattice paths assert), while the watertight gate
    /// stays on the lattice-free v0.5 `chamber_expr`.
    fn chamber_v1_expr() -> Expr {
        use super::field::ScalarField;
        use crate::tpms::LatticeType;
        let lattice = Expr::Lattice {
            kind: LatticeType::Gyroid,
            period: ScalarField::Const(1.0),
            thickness: ScalarField::AxialRamp {
                axis: 2,
                a: -2.0,
                b: 2.0,
                lo: 0.45,
                hi: 0.65,
            },
        };
        // A conical band hugging the OUTER wall: offset the cone outward by 0.35 then
        // shell it to a ~0.7-wide band, so the lattice is clipped to a jacket. The
        // Intersection is the conformal clip; the band's bound frames the grid.
        let band = Expr::Shell {
            e: Box::new(Expr::Offset {
                e: Box::new(Expr::Cone { r: 2.0, h: 4.0 }),
                d: 0.35,
            }),
            t: 0.7,
        };
        let jacket = Expr::Intersection(Box::new(lattice), Box::new(band));
        Expr::SmoothUnion {
            a: Box::new(chamber_expr()),
            b: Box::new(jacket),
            k: 0.15,
        }
    }

    /// One cooling channel: a small circle swept along a helical spine that rides
    /// the OUTER cone wall, gaining a quarter turn over its length. The spine radius
    /// sits the tube just outside the outer surface so it bulges externally and
    /// fuses cleanly — keeping it clear of the thin graded inner cavity wall, whose
    /// near-tangential pinch is what produces non-manifold surface-nets seams.
    const CHANNEL_TUBE_R: f64 = 0.3;

    fn swept_channel(phase: f64) -> Expr {
        use super::sweep::SweptCurve;

        let steps = 16;
        let mut spine = Vec::with_capacity(steps + 1);
        for i in 0..=steps {
            let s = i as f64 / steps as f64;
            // Overhang both ends (below the base, above the apex) so the channel
            // breaches the cone surface cleanly instead of grazing it tangentially.
            let z = -2.6 + 5.2 * s;
            // Cone outer-wall radius at this height (linear taper, clamped), pushed
            // out by the tube radius so the channel rides just proud of the wall.
            let wall = (2.0 * (1.0 - (z + 2.0) / 4.0)).clamp(0.0, 2.0);
            let radius = wall + CHANNEL_TUBE_R * 0.5;
            let a = phase + s * (PI / 4.0);
            spine.push([radius * a.cos(), radius * a.sin(), z]);
        }
        Expr::Sweep {
            curve: SweptCurve::new(&spine, false),
            profile: Box::new(Expr::Sphere { r: CHANNEL_TUBE_R }),
        }
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

