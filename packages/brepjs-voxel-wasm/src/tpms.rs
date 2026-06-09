//! Triply-periodic minimal surface (TPMS) lattice fields (ADR-0013 voxel domain).
//!
//! Each family is an APPROXIMATE implicit `f(x,y,z)` — the raw nodal trig form,
//! not a true distance. Its `f = 0` level set is the minimal surface itself; the
//! field is smooth and crosses zero cleanly, so Surface Nets contours it without
//! normalization in v1. A solid double-sided wall of total width `thickness`
//! straddling the surface is `|f| - thickness/2` (negative = strut material), so
//! `halfThickness` is in `f`-units, not millimetres — metric thickness (dividing
//! by `‖∇f‖`) is a deferred v2 refinement.
//
// The field seam is consumed by the lattice bridge, not yet by a wasm export, so
// the cdylib build can't see all callers; silence dead-code here.
#![allow(dead_code)]

use std::f32::consts::PI;

use crate::grid::Grid;

/// TPMS family selector. The `u32` mapping (0=Gyroid, 1=SchwarzP, 2=Diamond) is
/// the stable wasm-boundary encoding consumed by the lattice bridge.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LatticeType {
    Gyroid,
    SchwarzP,
    Diamond,
}

impl LatticeType {
    /// Decode the wasm-boundary `u32` tag; `None` for an out-of-range value so the
    /// bridge can reject it before evaluating a field.
    pub fn from_u32(tag: u32) -> Option<LatticeType> {
        match tag {
            0 => Some(LatticeType::Gyroid),
            1 => Some(LatticeType::SchwarzP),
            2 => Some(LatticeType::Diamond),
            _ => None,
        }
    }
}

/// Evaluate the implicit field `f` at world point `p`, with coordinates scaled by
/// `2π / period`. The `f = 0` level set is the minimal surface.
pub fn tpms_value(kind: LatticeType, p: [f32; 3], period: f32) -> f32 {
    let k = 2.0 * PI / period;
    let (x, y, z) = (p[0] * k, p[1] * k, p[2] * k);

    match kind {
        LatticeType::Gyroid => x.sin() * y.cos() + y.sin() * z.cos() + z.sin() * x.cos(),
        LatticeType::SchwarzP => x.cos() + y.cos() + z.cos(),
        LatticeType::Diamond => {
            x.sin() * y.sin() * z.sin()
                + x.sin() * y.cos() * z.cos()
                + x.cos() * y.sin() * z.cos()
                + x.cos() * y.cos() * z.sin()
        }
    }
}

/// Evaluate the implicit field at an `f64` world point. The trig form is f32
/// internally — the field is Lipschitz and APPROXIMATE (not a true distance), so
/// the f32→f64 widening at the boundary costs no accuracy the field could honor —
/// and lets the [`crate::sdf::Expr`] algebra evaluate a lattice node in f64.
pub fn tpms_value_f64(kind: LatticeType, p: [f64; 3], period: f64) -> f64 {
    tpms_value(kind, [p[0] as f32, p[1] as f32, p[2] as f32], period as f32) as f64
}

/// Write a shell field over `grid`: every voxel gets `|f| - thickness/2` at its
/// world position (negative = inside the strut wall). Surface Nets then meshes the
/// `= 0` isosurface into two offset sheets bounding a wall of width `thickness`.
pub fn fill_tpms_shell(grid: &mut Grid, kind: LatticeType, period: f32, thickness: f32) {
    let half = thickness * 0.5;
    let [nx, ny, nz] = grid.dims();
    for z in 0..nz {
        for y in 0..ny {
            for x in 0..nx {
                let p = grid.world_pos(x, y, z);
                grid.set(x, y, z, tpms_value(kind, p, period).abs() - half);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_u32_maps_known_tags() {
        assert_eq!(LatticeType::from_u32(0), Some(LatticeType::Gyroid));
        assert_eq!(LatticeType::from_u32(1), Some(LatticeType::SchwarzP));
        assert_eq!(LatticeType::from_u32(2), Some(LatticeType::Diamond));
        assert_eq!(LatticeType::from_u32(3), None);
        assert_eq!(LatticeType::from_u32(u32::MAX), None);
    }

    #[test]
    fn tpms_fields_are_periodic_on_every_axis() {
        let period = 2.0;
        let p = [0.37, 0.81, 0.12];
        for kind in [LatticeType::Gyroid, LatticeType::SchwarzP, LatticeType::Diamond] {
            let f0 = tpms_value(kind, p, period);
            for axis in 0..3 {
                let mut shifted = p;
                shifted[axis] += period;
                let f1 = tpms_value(kind, shifted, period);
                assert!(
                    (f0 - f1).abs() < 1e-4,
                    "{kind:?} must repeat after one period on axis {axis}: {f0} vs {f1}"
                );
            }
        }
    }

    #[test]
    fn schwarz_p_and_diamond_evaluate_finite() {
        let period = 3.0;
        let p = [0.5, 1.25, 2.0];
        let fp = tpms_value(LatticeType::SchwarzP, p, period);
        let fd = tpms_value(LatticeType::Diamond, p, period);
        assert!(fp.is_finite(), "SchwarzP must evaluate finite, got {fp}");
        assert!(fd.is_finite(), "Diamond must evaluate finite, got {fd}");
    }

    #[test]
    fn shell_field_has_both_strut_and_void() {
        // A grid spanning >1 period guarantees the field sweeps the full f-range,
        // so |f| - half straddles zero: some voxels solid (negative), some void.
        let period = 1.0;
        let mut g = Grid::for_bounds([0.0, 0.0, 0.0], [3.0, 3.0, 3.0], 24, 0).unwrap();
        fill_tpms_shell(&mut g, LatticeType::Gyroid, period, 0.4);

        let mut has_neg = false;
        let mut has_pos = false;
        let [nx, ny, nz] = g.dims();
        for z in 0..nz {
            for y in 0..ny {
                for x in 0..nx {
                    let v = g.at(x, y, z);
                    if v < 0.0 {
                        has_neg = true;
                    } else if v > 0.0 {
                        has_pos = true;
                    }
                }
            }
        }
        assert!(has_neg, "shell field must have strut (negative) voxels");
        assert!(has_pos, "shell field must have void (positive) voxels");
    }
}
