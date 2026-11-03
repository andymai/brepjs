//! The engine behind brepjs-mesh2solid: mesh ingest, repair, analysis and planar-region
//! extraction for brepjs's mesh-to-solid conversion. The wasm surface returns
//! flat typed arrays plus a JSON report; all B-Rep construction happens in the
//! TypeScript package that consumes it.

pub mod charts;
pub mod decimate;
pub mod deviation;
pub mod earcut;
pub mod estimate;
pub mod fit;
pub mod ingest;
mod json;
pub mod math;
pub mod mesh;
pub mod pipeline;
pub mod regions;
pub mod repair;
pub mod segment;
pub mod snap;
pub mod tier1;

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

fn options(
    format_hint: &str,
    unit: &str,
    tolerance: f64,
    max_triangles: u32,
    fill_holes: i32,
    heatmap: bool,
) -> Result<Options, JsError> {
    let unit = if unit.eq_ignore_ascii_case("auto") || unit.is_empty() {
        None
    } else {
        Some(Unit::parse(unit).ok_or_else(|| JsError::new(&format!("unknown unit {unit:?}")))?)
    };
    Ok(Options {
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
    })
}

/// Format, declared unit, triangle count, and bounding box of a mesh file, as
/// JSON (see `pipeline::inspect`).
#[wasm_bindgen]
pub fn inspect(bytes: &[u8], format_hint: &str) -> Result<String, JsError> {
    pipeline::inspect(bytes, format_hint).map_err(|e| JsError::new(&e))
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
    let opts = options(
        format_hint,
        unit,
        tolerance,
        max_triangles,
        fill_holes,
        heatmap,
    )?;
    let out = run_tier0(bytes, &opts).map_err(|e| JsError::new(&e))?;
    Ok(pack(&out, heatmap))
}

fn pack(out: &pipeline::Tier0, heatmap: bool) -> Tier0Result {
    let rm = &out.regions;
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
        input_deviation: out.input_deviation.clone(),
        report: out.report.clone(),
    }
}

/// Tier 1 session: the Tier 0 result plus the analytic segmentation, kept in
/// wasm memory so B-Rep assembly can ask which surface a sample point lies on.
/// Call `free()` when done.
#[wasm_bindgen]
pub struct Tier1Session {
    inner: tier1::Tier1,
    heatmap: bool,
    /// Per input vertex distance to the last triangulation `deviation` measured.
    measured: Vec<f32>,
}

#[wasm_bindgen]
impl Tier1Session {
    /// Kind per surface: 0 plane, 1 cylinder, 2 sphere, 3 cone, 4 torus.
    #[wasm_bindgen(getter)]
    pub fn surface_kinds(&self) -> Vec<u8> {
        self.inner
            .seg
            .regions
            .iter()
            .map(|r| tier1::pack_surface(&r.surface).0)
            .collect()
    }

    /// Eight parameter slots per surface. Plane: normal, offset. Cylinder: axis
    /// point, axis, radius. Sphere: center, radius. Cone: apex, axis (into the
    /// opening), half-angle. Torus: center, axis, major, minor.
    #[wasm_bindgen(getter)]
    pub fn surface_params(&self) -> Vec<f64> {
        self.inner
            .seg
            .regions
            .iter()
            .flat_map(|r| tier1::pack_surface(&r.surface).1)
            .collect()
    }

    /// Bounding box (min xyz, max xyz) of each surface's mesh region.
    #[wasm_bindgen(getter)]
    pub fn surface_bounds(&self) -> Vec<f64> {
        self.inner
            .surface_bounds()
            .iter()
            .flat_map(|b| [b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2]])
            .collect()
    }

    #[wasm_bindgen(getter)]
    pub fn tolerance(&self) -> f64 {
        self.inner.tol
    }

    /// Largest gap between a fitted mesh triangle and its exact surface.
    #[wasm_bindgen(getter)]
    pub fn sag(&self) -> f64 {
        self.inner.sag
    }

    #[wasm_bindgen(getter)]
    pub fn unfit_triangles(&self) -> u32 {
        self.inner.seg.unfit_triangles as u32
    }

    /// Share of the mesh area no fitted surface covers.
    #[wasm_bindgen(getter)]
    pub fn unfit_area(&self) -> f64 {
        segment::unfit_area(&self.inner.t0.mesh, &self.inner.seg)
    }

    #[wasm_bindgen(getter)]
    pub fn tier1_report(&self) -> String {
        self.inner.report_json()
    }

    /// For flat xyz `points`: (surface id or -1, distance to the mesh) per point.
    pub fn nearest(&self, points: &[f64]) -> Vec<f64> {
        let pts: Vec<math::V3> = points.as_chunks::<3>().0.to_vec();
        self.inner
            .nearest(&pts)
            .into_iter()
            .flat_map(|(s, d)| [s as f64, d])
            .collect()
    }

    /// Like `nearest`, but labels each point with the fitted surface closest
    /// to its nearest mesh point (robust to fuzzy region boundaries on scans).
    pub fn nearest_by_surface(&self, points: &[f64]) -> Vec<f64> {
        let pts: Vec<math::V3> = points.as_chunks::<3>().0.to_vec();
        self.inner
            .nearest_by_surface(&pts)
            .into_iter()
            .flat_map(|(s, d)| [s as f64, d])
            .collect()
    }

    /// Body index (as in the Tier 0 result's bodies) nearest each flat xyz point, or -1.
    pub fn bodies_of(&self, points: &[f64]) -> Vec<f64> {
        let pts: Vec<math::V3> = points.as_chunks::<3>().0.to_vec();
        self.inner
            .bodies_of(&pts)
            .into_iter()
            .map(|b| b as f64)
            .collect()
    }

    /// 1 per closed body, 0 per open one, as in the Tier 0 result.
    #[wasm_bindgen(getter)]
    pub fn body_closed(&self) -> Vec<u8> {
        self.inner
            .t0
            .bodies
            .iter()
            .map(|b| u8::from(b.closed))
            .collect()
    }

    /// Cavity parent per body (-1 for a top-level body), as in the Tier 0 result.
    #[wasm_bindgen(getter)]
    pub fn body_parent(&self) -> Vec<i32> {
        self.inner
            .t0
            .bodies
            .iter()
            .map(|b| b.parent.map(|p| p as i32).unwrap_or(-1))
            .collect()
    }

    /// Per input vertex distance to the last triangulation passed to `deviation`
    /// (empty unless the session was created with a heatmap).
    #[wasm_bindgen(getter)]
    pub fn measured_deviation(&self) -> Vec<f32> {
        self.measured.clone()
    }

    /// Deviation JSON between the input mesh and a candidate triangulation.
    pub fn deviation(&mut self, positions: &[f64], indices: &[u32]) -> String {
        let p: Vec<math::V3> = positions.as_chunks::<3>().0.to_vec();
        let tris: Vec<[math::V3; 3]> = indices
            .as_chunks::<3>()
            .0
            .iter()
            .filter_map(|t| {
                Some([
                    *p.get(t[0] as usize)?,
                    *p.get(t[1] as usize)?,
                    *p.get(t[2] as usize)?,
                ])
            })
            .collect();
        let mut per_vertex = Vec::new();
        let json = self
            .inner
            .deviation_json(&tris, self.heatmap.then_some(&mut per_vertex));
        self.measured = per_vertex;
        json
    }

    /// The whole-mesh Tier 0 result, the fallback when Tier 1 can't rebuild.
    pub fn tier0(&self) -> Tier0Result {
        pack(&self.inner.t0, self.heatmap)
    }

    /// Every body split into freeform charts for a B-spline rebuild, or
    /// `undefined` when the mesh doesn't split into few enough discs.
    pub fn charts(&self) -> Option<FreeformCharts> {
        self.inner.charts().map(|inner| FreeformCharts { inner })
    }
}

/// Freeform charts: each a disc of the mesh bounded by runs (polylines between
/// corners) it shares with its neighbours. Call `free()` when done.
#[wasm_bindgen]
pub struct FreeformCharts {
    inner: charts::Charts,
}

#[wasm_bindgen]
impl FreeformCharts {
    /// Start of each run in `run_points` (in points), plus the end.
    #[wasm_bindgen(getter)]
    pub fn run_offsets(&self) -> Vec<u32> {
        offsets(self.inner.runs.iter().map(|r| r.pts.len()))
    }

    /// Flat xyz of every run, corner to corner.
    #[wasm_bindgen(getter)]
    pub fn run_points(&self) -> Vec<f64> {
        self.inner
            .runs
            .iter()
            .flat_map(|r| r.pts.iter().flatten().copied())
            .collect()
    }

    /// Body (as in the Tier 0 result) of each chart.
    #[wasm_bindgen(getter)]
    pub fn chart_bodies(&self) -> Vec<u32> {
        self.inner.charts.iter().map(|c| c.body).collect()
    }

    /// Start of each chart's sides in `sides`, plus the end.
    #[wasm_bindgen(getter)]
    pub fn side_offsets(&self) -> Vec<u32> {
        offsets(self.inner.charts.iter().map(|c| c.sides.len()))
    }

    /// Each chart's boundary loop in order: a run id, or `-(id + 1)` for a run
    /// traversed backwards.
    #[wasm_bindgen(getter)]
    pub fn sides(&self) -> Vec<i32> {
        self.inner
            .charts
            .iter()
            .flat_map(|c| {
                c.sides
                    .iter()
                    .map(|&(r, back)| if back { -(r as i32) - 1 } else { r as i32 })
            })
            .collect()
    }

    /// Start of each chart's surface poles in `surface_poles` (in points),
    /// plus the end. A chart's surface is a uniform cubic B-spline with k × k poles,
    /// row by row, and knots -3, -2, ..., k each of multiplicity 1; none for
    /// a chart too small to fit.
    #[wasm_bindgen(getter)]
    pub fn surface_offsets(&self) -> Vec<u32> {
        offsets(self.inner.charts.iter().map(|c| c.poles.len()))
    }

    /// Flat xyz surface poles, chart by chart.
    #[wasm_bindgen(getter)]
    pub fn surface_poles(&self) -> Vec<f64> {
        self.inner
            .charts
            .iter()
            .flat_map(|c| c.poles.iter().flatten().copied())
            .collect()
    }

    /// Largest height of a chart's fitted points off its surface, per chart.
    #[wasm_bindgen(getter)]
    pub fn fit_errors(&self) -> Vec<f64> {
        self.inner.charts.iter().map(|c| c.fit_error).collect()
    }
}

fn offsets(lens: impl Iterator<Item = usize>) -> Vec<u32> {
    let mut out = vec![0u32];
    for n in lens {
        out.push(out[out.len() - 1] + n as u32);
    }
    out
}

/// Run Tier 0 and the Tier 1 segmentation. Arguments as for `convert_tier0`.
#[wasm_bindgen]
pub fn convert_tier1(
    bytes: &[u8],
    format_hint: &str,
    unit: &str,
    tolerance: f64,
    max_triangles: u32,
    fill_holes: i32,
    heatmap: bool,
) -> Result<Tier1Session, JsError> {
    let opts = options(
        format_hint,
        unit,
        tolerance,
        max_triangles,
        fill_holes,
        heatmap,
    )?;
    let inner = tier1::run_tier1(bytes, &opts).map_err(|e| JsError::new(&e))?;
    Ok(Tier1Session {
        inner,
        heatmap,
        measured: Vec::new(),
    })
}
