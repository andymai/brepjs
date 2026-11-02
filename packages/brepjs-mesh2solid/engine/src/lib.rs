//! The engine behind brepjs-mesh2solid: mesh ingest, repair, analysis and planar-region
//! extraction for brepjs's mesh-to-solid conversion. The wasm surface returns
//! flat typed arrays plus a JSON report; all B-Rep construction happens in the
//! TypeScript package that consumes it.

pub mod decimate;
pub mod deviation;
pub mod earcut;
pub mod estimate;
pub mod ingest;
mod json;
pub mod math;
pub mod mesh;
pub mod pipeline;
pub mod regions;
pub mod repair;

use wasm_bindgen::prelude::*;

use crate::ingest::Unit;
use crate::pipeline::{run_tier0, Options};
use crate::repair::HoleFill;

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Tier 0 conversion output. Region `r` owns loops in `loops` (encoded as
/// `[loopCount, len0, ...ids0, len1, ...ids1, ...]` per region, in order) and
/// triangles `triangle_offsets[r]..triangle_offsets[r + 1]`, counted in
/// triangles: its vertex indices are `triangles[3 * triangle_offsets[r]..3 *
/// triangle_offsets[r + 1]]`. Indices refer to `positions` (flat xyz, mm).
#[wasm_bindgen]
pub struct Tier0Result {
    positions: Vec<f64>,
    loops: Vec<u32>,
    triangles: Vec<u32>,
    triangle_offsets: Vec<u32>,
    region_body: Vec<u32>,
    body_closed: Vec<u8>,
    body_parent: Vec<i32>,
    input_positions: Vec<f64>,
    input_indices: Vec<u32>,
    input_deviation: Vec<f32>,
    report: String,
}

#[wasm_bindgen]
impl Tier0Result {
    #[wasm_bindgen(getter)]
    pub fn positions(&self) -> Vec<f64> {
        self.positions.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn loops(&self) -> Vec<u32> {
        self.loops.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn triangles(&self) -> Vec<u32> {
        self.triangles.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn triangle_offsets(&self) -> Vec<u32> {
        self.triangle_offsets.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn region_body(&self) -> Vec<u32> {
        self.region_body.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn body_closed(&self) -> Vec<u8> {
        self.body_closed.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn body_parent(&self) -> Vec<i32> {
        self.body_parent.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn input_positions(&self) -> Vec<f64> {
        self.input_positions.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn input_indices(&self) -> Vec<u32> {
        self.input_indices.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn input_deviation(&self) -> Vec<f32> {
        self.input_deviation.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn report(&self) -> String {
        self.report.clone()
    }
}

/// Run the Tier 0 pipeline on raw file bytes.
///
/// `unit`: "auto" or one of um/mm/cm/m/in/ft. `tolerance`: millimeters, or
/// NaN/≤0 to estimate it. `fill_holes`: -1 fills every hole, 0 none, n > 0
/// holes with at most n edges. `heatmap` returns the welded input mesh with each
/// vertex's distance to the result.
#[wasm_bindgen]
pub fn convert_tier0(
    bytes: &[u8],
    format_hint: &str,
    unit: &str,
    tolerance: f64,
    max_triangles: u32,
    fill_holes: i32,
    heatmap: bool,
) -> Result<Tier0Result, JsError> {
    let unit = if unit.eq_ignore_ascii_case("auto") || unit.is_empty() {
        None
    } else {
        Some(Unit::parse(unit).ok_or_else(|| JsError::new(&format!("unknown unit {unit:?}")))?)
    };
    let opts = Options {
        format_hint: format_hint.to_string(),
        unit,
        tolerance: if tolerance.is_finite() && tolerance > 0.0 {
            Some(tolerance)
        } else {
            None
        },
        max_triangles: max_triangles.max(4) as usize,
        fill_holes: match fill_holes {
            n if n < 0 => HoleFill::All,
            0 => HoleFill::None,
            n => HoleFill::UpTo(n as usize),
        },
        heatmap,
    };
    let out = run_tier0(bytes, &opts).map_err(|e| JsError::new(&e))?;
    Ok(pack(out, heatmap))
}

fn pack(out: pipeline::Tier0, heatmap: bool) -> Tier0Result {
    let rm = out.regions;
    let mut loops = Vec::new();
    let mut triangles = Vec::new();
    let mut triangle_offsets = vec![0u32];
    let mut region_body = Vec::with_capacity(rm.regions.len());
    for r in &rm.regions {
        loops.push(r.loops.len() as u32);
        for lp in &r.loops {
            loops.push(lp.len() as u32);
            loops.extend_from_slice(lp);
        }
        for t in &r.triangles {
            triangles.extend_from_slice(t);
        }
        triangle_offsets.push((triangles.len() / 3) as u32);
        region_body.push(r.body);
    }
    let positions = rm
        .positions
        .iter()
        .flat_map(|p| p.iter().copied())
        .collect();
    let (input_positions, input_indices) = if heatmap {
        (
            out.input
                .positions
                .iter()
                .flat_map(|p| p.iter().copied())
                .collect(),
            out.input
                .triangles
                .iter()
                .flat_map(|t| t.iter().copied())
                .collect(),
        )
    } else {
        (Vec::new(), Vec::new())
    };
    Tier0Result {
        positions,
        loops,
        triangles,
        triangle_offsets,
        region_body,
        body_closed: out.bodies.iter().map(|b| b.closed as u8).collect(),
        body_parent: out
            .bodies
            .iter()
            .map(|b| b.parent.map(|p| p as i32).unwrap_or(-1))
            .collect(),
        input_positions,
        input_indices,
        input_deviation: out.input_deviation,
        report: out.report,
    }
}
