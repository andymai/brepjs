//! brepjs-voxel-wasm — voxel/SDF geometry engine (ADR-0013).
//!
//! v1 surface is the repair-slice keystone: the Generalized Winding Number sign,
//! exposed across the wasm boundary as flat typed-array calls (no zero-copy; the
//! TS loader passes Float32Array/Uint32Array in and gets a typed array back).

mod fwn;

use wasm_bindgen::prelude::*;

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
