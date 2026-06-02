//! brepjs-voxel-wasm — voxel/SDF geometry engine (ADR-0013).
//!
//! v1 surface is the repair-slice keystone: the Generalized Winding Number sign,
//! exposed across the wasm boundary as flat typed-array calls (no zero-copy; the
//! TS loader passes Float32Array/Uint32Array in and gets a typed array back).

mod contour;
mod fwn;
mod grid;
mod ops;
mod tpms;

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

    #[test]
    fn tpms_box_produces_a_mesh() {
        let r = tpms_box(0.0, 0.0, 0.0, 3.0, 3.0, 3.0, 32, 1, 0, 1.0, 0.4)
            .expect("tpms_box must succeed");
        assert!(!r.positions.is_empty(), "tpms_box mesh must have vertices");
        assert!(!r.indices.is_empty(), "tpms_box mesh must have triangles");
    }
}
