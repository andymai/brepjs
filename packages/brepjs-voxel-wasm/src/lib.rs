//! brepjs-voxel-wasm — voxel/SDF geometry engine (ADR-0013).
//!
//! v1 surface is the repair-slice keystone: the Generalized Winding Number sign,
//! exposed across the wasm boundary as flat typed-array calls (no zero-copy; the
//! TS loader passes Float32Array/Uint32Array in and gets a typed array back).

mod contour;
mod fwn;
mod grid;
mod ops;

use wasm_bindgen::prelude::*;

use crate::grid::Grid;

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
