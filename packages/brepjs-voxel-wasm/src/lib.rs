//! brepjs-voxel-wasm — voxel/SDF geometry engine (ADR-0013).
//!
//! v1 surface is the repair-slice keystone: the Generalized Winding Number sign,
//! exposed across the wasm boundary as flat typed-array calls (no zero-copy; the
//! TS loader passes Float32Array/Uint32Array in and gets a typed array back).

mod bvh;
mod contour;
mod tpms;

// Public so the criterion bench (an external harness built against the rlib)
// can reach `Mesh`, `Grid`, and the `voxelize_mesh_*_pub` bench shims. The wasm
// surface is unchanged — none of these carry #[wasm_bindgen].
pub mod fwn;
pub mod grid;
pub mod ops;

use wasm_bindgen::prelude::*;

use crate::grid::Grid;
use crate::tpms::LatticeType;

/// Repaired triangle mesh handed back across the wasm boundary. wasm-bindgen
/// exposes the `Vec` getters as typed arrays (flat xyz positions/normals,
/// triangle-list indices). World-space coords; the bridge does not re-scale.
#[wasm_bindgen]
pub struct RepairResult {
    positions: Vec<f32>,
    normals: Vec<f32>,
    indices: Vec<u32>,
}

#[wasm_bindgen]
impl RepairResult {
    #[wasm_bindgen(getter)]
    pub fn positions(&self) -> Vec<f32> {
        self.positions.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn normals(&self) -> Vec<f32> {
        self.normals.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn indices(&self) -> Vec<u32> {
        self.indices.clone()
    }
}

/// Axis-aligned bounding box of flat xyz vertices. `verts` must be non-empty and
/// a multiple of 3 (the TS bridge validates this before crossing the boundary).
// Guard the lattice scalar params at the wasm boundary. The TS layer already
// validates these, but this artifact is also consumed directly, and period == 0
// makes the 2*PI/period scale non-finite (NaN field).
fn check_lattice_params(period: f32, thickness: f32) -> Result<(), JsError> {
    if !(period.is_finite() && period > 0.0) {
        return Err(JsError::new("lattice period must be a positive finite number"));
    }
    if !(thickness.is_finite() && thickness > 0.0) {
        return Err(JsError::new("lattice thickness must be a positive finite number"));
    }
    Ok(())
}

fn bbox(verts: &[f32]) -> ([f32; 3], [f32; 3]) {
    let mut min = [f32::INFINITY; 3];
    let mut max = [f32::NEG_INFINITY; 3];
    for p in verts.chunks_exact(3) {
        for axis in 0..3 {
            if p[axis] < min[axis] {
                min[axis] = p[axis];
            }
            if p[axis] > max[axis] {
                max[axis] = p[axis];
            }
        }
    }
    (min, max)
}

/// Repair a (possibly non-watertight) mesh into a closed surface: voxelize the
/// FWN-signed SDF over a grid sized to the mesh bbox, then Surface-Nets contour
/// it back to triangles (world-space). `resolution` sizes the longest bbox axis;
/// `padding` is the positive air margin Surface Nets needs (>= 1 to avoid clip).
///
/// `verts`: flat xyz, length 3·V. `tris`: flat vertex indices, length 3·T.
/// Errors (as a JS exception) if the grid exceeds the voxel cap.
#[wasm_bindgen]
pub fn repair_mesh(
    verts: &[f32],
    tris: &[u32],
    resolution: u32,
    padding: u32,
) -> Result<RepairResult, JsError> {
    let mesh = fwn::Mesh::from_flat(verts, tris);
    let (min, max) = bbox(verts);

    let mut grid = Grid::for_bounds(min, max, resolution as usize, padding as usize)
        .map_err(|e| JsError::new(&format!("voxel grid allocation failed: {e:?}")))?;

    ops::voxelize_mesh(&mut grid, &mesh);
    let mesh = contour::surface_nets_mesh(&grid);

    Ok(RepairResult {
        positions: mesh.positions,
        normals: mesh.normals,
        indices: mesh.indices,
    })
}

/// Fill a mesh with a TPMS lattice infill: voxelize the FWN-signed solid over a
/// grid sized to the mesh bbox, build a shell field of the chosen lattice over the
/// same grid, intersect them (keep voxels both inside the solid AND in strut
/// material), then Surface-Nets contour back to triangles (world-space).
///
/// `verts`: flat xyz, length 3·V. `tris`: flat vertex indices, length 3·T.
/// `lattice_type`: 0=Gyroid, 1=SchwarzP, 2=Diamond. `period` is the unit-cell size
/// (world units); `thickness` is the strut wall width in field units.
/// Errors (as a JS exception) on a bad lattice tag or a grid over the voxel cap.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn lattice_infill(
    verts: &[f32],
    tris: &[u32],
    resolution: u32,
    padding: u32,
    lattice_type: u32,
    period: f32,
    thickness: f32,
) -> Result<RepairResult, JsError> {
    let kind = LatticeType::from_u32(lattice_type)
        .ok_or_else(|| JsError::new(&format!("unknown lattice type: {lattice_type}")))?;
    check_lattice_params(period, thickness)?;

    let mesh = fwn::Mesh::from_flat(verts, tris);
    let (min, max) = bbox(verts);

    let mut solid = Grid::for_bounds(min, max, resolution as usize, padding as usize)
        .map_err(|e| JsError::new(&format!("voxel grid allocation failed: {e:?}")))?;
    ops::voxelize_mesh(&mut solid, &mesh);

    let mut shell = solid.same_shape();
    tpms::fill_tpms_shell(&mut shell, kind, period, thickness);

    let infill = ops::voxel_intersection(&solid, &shell)
        .map_err(|e| JsError::new(&format!("voxel intersection failed: {e:?}")))?;

    let out = contour::surface_nets_mesh(&infill);

    Ok(RepairResult {
        positions: out.positions,
        normals: out.normals,
        indices: out.indices,
    })
}

/// The infinite TPMS lattice clipped to an axis-aligned box. Build a grid over
/// `[min..max]`, fill the chosen lattice shell field, Surface-Nets contour it.
///
/// `lattice_type`: 0=Gyroid, 1=SchwarzP, 2=Diamond. `period` is the unit-cell size
/// (world units); `thickness` is the strut wall width in field units.
/// Errors (as a JS exception) on a bad lattice tag or a grid over the voxel cap.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn tpms_box(
    min_x: f32,
    min_y: f32,
    min_z: f32,
    max_x: f32,
    max_y: f32,
    max_z: f32,
    resolution: u32,
    padding: u32,
    lattice_type: u32,
    period: f32,
    thickness: f32,
) -> Result<RepairResult, JsError> {
    let kind = LatticeType::from_u32(lattice_type)
        .ok_or_else(|| JsError::new(&format!("unknown lattice type: {lattice_type}")))?;
    check_lattice_params(period, thickness)?;

    let mut grid = Grid::for_bounds(
        [min_x, min_y, min_z],
        [max_x, max_y, max_z],
        resolution as usize,
        padding as usize,
    )
    .map_err(|e| JsError::new(&format!("voxel grid allocation failed: {e:?}")))?;
    tpms::fill_tpms_shell(&mut grid, kind, period, thickness);

    // Clip the (periodic) lattice to the requested box: intersect with the box
    // SDF so struts are bounded at [min..max] and the padding ring stays air.
    let mut clip = grid.same_shape();
    ops::fill_box_sdf(&mut clip, [min_x, min_y, min_z], [max_x, max_y, max_z]);
    let bounded = ops::voxel_intersection(&grid, &clip)
        .map_err(|e| JsError::new(&format!("voxel intersection failed: {e:?}")))?;

    let out = contour::surface_nets_mesh(&bounded);

    Ok(RepairResult {
        positions: out.positions,
        normals: out.normals,
        indices: out.indices,
    })
}

/// Offset (grow/shrink) a mesh by an exact SDF iso-shift. Voxelize the mesh into
/// a true SDF, subtract `distance` from every voxel (so `distance > 0` grows
/// outward, `< 0` shrinks inward), then Surface-Nets contour back to triangles.
/// Because the field is a true SDF this is an exact offset — no reinitialization.
///
/// `verts`: flat xyz, length 3·V. `tris`: flat vertex indices, length 3·T.
/// An outward offset surface extends past the input bbox, so the grid bounds are
/// expanded by `distance.max(0)` on every side before allocation.
/// Errors (as a JS exception) on a non-finite `distance` or a grid over the cap.
#[wasm_bindgen]
pub fn offset_mesh(
    verts: &[f32],
    tris: &[u32],
    distance: f32,
    resolution: u32,
    padding: u32,
) -> Result<RepairResult, JsError> {
    if !distance.is_finite() {
        return Err(JsError::new("offset distance must be a finite number"));
    }

    let mesh = fwn::Mesh::from_flat(verts, tris);
    let (min, max) = bbox(verts);

    let grow = distance.max(0.0);
    let emin = [min[0] - grow, min[1] - grow, min[2] - grow];
    let emax = [max[0] + grow, max[1] + grow, max[2] + grow];

    let mut grid = Grid::for_bounds(emin, emax, resolution as usize, padding as usize)
        .map_err(|e| JsError::new(&format!("voxel grid allocation failed: {e:?}")))?;
    ops::voxelize_mesh(&mut grid, &mesh);
    ops::offset_sdf(&mut grid, distance);

    let out = contour::surface_nets_mesh(&grid);

    Ok(RepairResult {
        positions: out.positions,
        normals: out.normals,
        indices: out.indices,
    })
}

/// Hollow a mesh into a shell of wall `thickness` inward from the surface.
/// Voxelize the mesh into a solid SDF, build the shell field
/// `max(solid, -(solid + thickness))` (the solid intersected with the complement
/// of its inward erosion), then Surface-Nets contour back to triangles.
///
/// `verts`: flat xyz, length 3·V. `tris`: flat vertex indices, length 3·T. The
/// shell grows inward only, so the grid is sized to the mesh bbox (no expansion).
/// Errors (as a JS exception) on a non-positive/non-finite `thickness` or a grid
/// over the voxel cap.
#[wasm_bindgen]
pub fn shell_mesh(
    verts: &[f32],
    tris: &[u32],
    thickness: f32,
    resolution: u32,
    padding: u32,
) -> Result<RepairResult, JsError> {
    if !(thickness.is_finite() && thickness > 0.0) {
        return Err(JsError::new("shell thickness must be a positive finite number"));
    }

    let mesh = fwn::Mesh::from_flat(verts, tris);
    let (min, max) = bbox(verts);

    let mut solid = Grid::for_bounds(min, max, resolution as usize, padding as usize)
        .map_err(|e| JsError::new(&format!("voxel grid allocation failed: {e:?}")))?;
    ops::voxelize_mesh(&mut solid, &mesh);

    let shell = ops::shell_sdf(&solid, thickness);
    let out = contour::surface_nets_mesh(&shell);

    Ok(RepairResult {
        positions: out.positions,
        normals: out.normals,
        indices: out.indices,
    })
}

/// Robust CSG boolean of two meshes via voxelized SDFs. Voxelize both meshes over
/// a shared grid sized to their UNION bbox, combine by `op`
/// (0=union, 1=intersection, 2=difference A−B), then Surface-Nets contour.
///
/// `verts_a`/`verts_b`: flat xyz; `tris_a`/`tris_b`: flat vertex indices.
/// Errors (as a JS exception) on an unknown `op` tag, a dim mismatch, or a grid
/// over the voxel cap.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn voxel_boolean(
    verts_a: &[f32],
    tris_a: &[u32],
    verts_b: &[f32],
    tris_b: &[u32],
    op: u32,
    resolution: u32,
    padding: u32,
) -> Result<RepairResult, JsError> {
    if op > 2 {
        return Err(JsError::new(&format!("unknown boolean op: {op}")));
    }

    let mesh_a = fwn::Mesh::from_flat(verts_a, tris_a);
    let mesh_b = fwn::Mesh::from_flat(verts_b, tris_b);
    let (min_a, max_a) = bbox(verts_a);
    let (min_b, max_b) = bbox(verts_b);

    let umin = [
        min_a[0].min(min_b[0]),
        min_a[1].min(min_b[1]),
        min_a[2].min(min_b[2]),
    ];
    let umax = [
        max_a[0].max(max_b[0]),
        max_a[1].max(max_b[1]),
        max_a[2].max(max_b[2]),
    ];

    let mut grid_a = Grid::for_bounds(umin, umax, resolution as usize, padding as usize)
        .map_err(|e| JsError::new(&format!("voxel grid allocation failed: {e:?}")))?;
    ops::voxelize_mesh(&mut grid_a, &mesh_a);

    let mut grid_b = grid_a.same_shape();
    ops::voxelize_mesh(&mut grid_b, &mesh_b);

    let combined = match op {
        0 => ops::voxel_union(&grid_a, &grid_b),
        1 => ops::voxel_intersection(&grid_a, &grid_b),
        _ => ops::voxel_difference(&grid_a, &grid_b),
    }
    .map_err(|e| JsError::new(&format!("voxel boolean failed: {e:?}")))?;

    let out = contour::surface_nets_mesh(&combined);

    Ok(RepairResult {
        positions: out.positions,
        normals: out.normals,
        indices: out.indices,
    })
}

/// Winding number at each query point, against a triangle-soup mesh.
///
/// `verts`: flat xyz, length 3·V. `tris`: flat vertex indices, length 3·T.
/// `queries`: flat xyz, length 3·Q. Returns length Q (winding number per query).
#[wasm_bindgen]
pub fn winding_numbers(verts: &[f32], tris: &[u32], queries: &[f32]) -> Vec<f32> {
    let mesh = fwn::Mesh::from_flat(verts, tris);
    queries
        .chunks_exact(3)
        .map(|q| mesh.winding_number([q[0] as f64, q[1] as f64, q[2] as f64]) as f32)
        .collect()
}

/// Inside/outside classification per query point (winding number > 0.5).
///
/// Returns length Q: 1 = inside, 0 = outside. This is the sign decision the
/// repair pipeline makes on non-watertight input.
#[wasm_bindgen]
pub fn points_inside(verts: &[f32], tris: &[u32], queries: &[f32]) -> Vec<u8> {
    let mesh = fwn::Mesh::from_flat(verts, tris);
    queries
        .chunks_exact(3)
        .map(|q| u8::from(mesh.is_inside([q[0] as f64, q[1] as f64, q[2] as f64])))
        .collect()
}

/// Crate version, for the loader to assert artifact/loader compatibility.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Unit cube [0,1]^3, outward-facing triangles.
    fn unit_cube() -> (Vec<f32>, Vec<u32>) {
        let verts: Vec<f32> = vec![
            0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0,
            1.0, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0,
        ];
        let tris: Vec<u32> = vec![
            0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7,
            3, 1, 2, 6, 1, 6, 5,
        ];
        (verts, tris)
    }

    #[test]
    fn lattice_infill_produces_a_mesh() {
        let (verts, tris) = unit_cube();
        let r = lattice_infill(&verts, &tris, 32, 2, 0, 0.4, 0.4).expect("infill must succeed");
        assert!(!r.positions.is_empty(), "infill mesh must have vertices");
        assert!(!r.indices.is_empty(), "infill mesh must have triangles");
    }

    /// Bounding box of flat xyz vertices, for asserting offset growth.
    fn flat_bbox(verts: &[f32]) -> ([f32; 3], [f32; 3]) {
        bbox(verts)
    }

    #[test]
    fn offset_mesh_grows_bbox_outward() {
        let (verts, tris) = unit_cube();
        let r = offset_mesh(&verts, &tris, 0.25, 24, 2).expect("offset must succeed");
        assert!(!r.positions.is_empty(), "offset mesh must have vertices");
        assert!(!r.indices.is_empty(), "offset mesh must have triangles");

        let (omin, omax) = flat_bbox(&r.positions);
        let (imin, imax) = flat_bbox(&verts);
        // An outward offset must push the surface past the input bbox on every axis.
        for axis in 0..3 {
            assert!(
                omin[axis] < imin[axis] && omax[axis] > imax[axis],
                "offset bbox must grow on axis {axis}: in [{},{}] out [{},{}]",
                imin[axis],
                imax[axis],
                omin[axis],
                omax[axis]
            );
        }
    }

    #[test]
    fn shell_mesh_produces_a_mesh() {
        let (verts, tris) = unit_cube();
        let r = shell_mesh(&verts, &tris, 0.2, 32, 2).expect("shell must succeed");
        assert!(!r.positions.is_empty(), "shell mesh must have vertices");
        assert!(!r.indices.is_empty(), "shell mesh must have triangles");
    }

    #[test]
    fn voxel_boolean_union_of_overlapping_cubes() {
        let (verts_a, tris_a) = unit_cube();
        // Second cube shifted +0.5 on x so the two overlap.
        let (mut verts_b, tris_b) = unit_cube();
        for p in verts_b.chunks_exact_mut(3) {
            p[0] += 0.5;
        }
        let r = voxel_boolean(&verts_a, &tris_a, &verts_b, &tris_b, 0, 24, 2)
            .expect("union must succeed");
        assert!(!r.positions.is_empty(), "union mesh must have vertices");
        assert!(!r.indices.is_empty(), "union mesh must have triangles");
    }

    #[test]
    fn tpms_box_produces_a_mesh() {
        let r = tpms_box(0.0, 0.0, 0.0, 3.0, 3.0, 3.0, 32, 1, 0, 1.0, 0.4)
            .expect("tpms_box must succeed");
        assert!(!r.positions.is_empty(), "tpms_box mesh must have vertices");
        assert!(!r.indices.is_empty(), "tpms_box mesh must have triangles");
    }
}
