use crate::decimate::{decimate, DecimateReport};
use crate::deviation::{measure, DeviationStats};
use crate::estimate::{estimate, Estimate, MeshKind};
use crate::ingest::{self, Format, Unit};
use crate::json::{array, Obj};
use crate::math::V3;
use crate::mesh::{weld, Mesh, Topology};
use crate::regions::{self, RegionMesh, RegionParams};
use crate::repair::{
    classify_components, cleanup_degenerate, repair, Component, HoleFill, RepairReport,
};

#[derive(Clone, Debug)]
pub struct Options {
    pub format_hint: String,
    /// `None` reads the unit from the file (3MF) or assumes millimeters.
    pub unit: Option<Unit>,
    /// Merge/decimation tolerance in millimeters; `None` estimates it.
    pub tolerance: Option<f64>,
    pub max_triangles: usize,
    pub fill_holes: HoleFill,
    /// Return the welded input mesh with each vertex's distance to the result.
    pub heatmap: bool,
}

impl Default for Options {
    fn default() -> Options {
        Options {
            format_hint: String::new(),
            unit: None,
            tolerance: None,
            max_triangles: 200_000,
            fill_holes: HoleFill::All,
            heatmap: false,
        }
    }
}

pub struct Body {
    pub closed: bool,
    pub volume: f64,
    pub parent: Option<usize>,
}

pub struct Tier0 {
    pub regions: RegionMesh,
    pub bodies: Vec<Body>,
    pub input: Mesh,
    pub input_deviation: Vec<f32>,
    pub report: String,
    /// The repaired (and, for scans, decimated) mesh the regions were built on.
    pub mesh: Mesh,
    pub kind: MeshKind,
    pub tolerance: f64,
    pub quantization: f64,
    /// 90th-percentile tessellation chord error (see `Estimate`).
    pub chord_error: f64,
}

pub const MAX_DEVIATION_SAMPLES: usize = 200_000;
/// A billion kilometers. Anything larger is a corrupt or misread file, and
/// squaring such coordinates would overflow.
const MAX_COORDINATE_MM: f64 = 1e15;

/// Read a mesh only far enough to confirm its units before a run: its format,
/// the unit it declares (3MF; `null` otherwise), its triangle count, and its
/// bounding box in its own units, as JSON.
pub fn inspect(bytes: &[u8], format_hint: &str) -> Result<String, String> {
    let format = ingest::detect(bytes, format_hint)
        .ok_or("unrecognized mesh format (expected STL, OBJ, PLY, or 3MF)")?;
    let ingested = ingest::parse(bytes, format)?;
    let mesh = &ingested.mesh;
    if mesh.triangles.is_empty() {
        return Err("the mesh has no triangles".into());
    }
    // Only vertices a triangle uses: an OBJ or PLY can keep stray ones, which
    // conversion drops.
    let mut bb = crate::math::Bbox::empty();
    for &v in mesh.triangles.iter().flatten() {
        bb.expand(mesh.positions[v as usize]);
    }
    let obj = Obj::new().str("format", format.name());
    let obj = match ingested.unit {
        Some(u) => obj.str("unit", u.name()),
        None => obj.raw("unit", "null"),
    };
    Ok(obj
        .int("triangles", mesh.triangles.len())
        .nums("bboxMin", &bb.min)
        .nums("bboxMax", &bb.max)
        .finish())
}

pub fn run_tier0(bytes: &[u8], opts: &Options) -> Result<Tier0, String> {
    let format = ingest::detect(bytes, &opts.format_hint)
        .ok_or("unrecognized mesh format (expected STL, OBJ, PLY, or 3MF)")?;
    let ingested = ingest::parse(bytes, format)?;
    let mut warnings = ingested.warnings;
    let (unit, unit_source) = match (opts.unit, ingested.unit) {
        (Some(u), _) => (u, "option"),
        (None, Some(u)) => (u, "file"),
        (None, None) => (Unit::Millimeter, "assumed"),
    };
    let mut mesh = ingested.mesh;
    let raw_triangles = mesh.triangles.len();
    let raw_vertices = mesh.positions.len();
    let max_abs = mesh
        .positions
        .iter()
        .flat_map(|p| p.iter())
        .fold(0.0f64, |a, &b| a.max(b.abs()));
    let quantization = ingested.storage.resolution(max_abs) * unit.to_mm();
    mesh.scale(unit.to_mm());
    if mesh
        .positions
        .iter()
        .flat_map(|p| p.iter())
        .any(|c| !c.is_finite() || c.abs() > MAX_COORDINATE_MM)
    {
        return Err(format!(
            "mesh coordinates exceed {MAX_COORDINATE_MM:e} mm after unit conversion"
        ));
    }

    let diag = mesh.bbox().diag();
    if !diag.is_finite() || diag <= 0.0 {
        return Err("mesh has zero extent".into());
    }
    let mut merged = weld(&mut mesh, 0.0);
    merged += weld(&mut mesh, diag * 1e-10);
    mesh.compact();
    let input = mesh.clone();

    let (repair_report, _) = repair(&mut mesh, opts.fill_holes);
    let topo = Topology::build(&mesh);
    let est = estimate(&mesh, &topo, quantization);
    let (tolerance, tol_source) = match opts.tolerance {
        Some(t) if t > 0.0 => (t, "option"),
        _ => (est.tolerance, "auto"),
    };

    let needs_decimation = mesh.triangles.len() > opts.max_triangles || est.kind == MeshKind::Scan;
    let decimation = if needs_decimation {
        let r = decimate(&mut mesh, opts.max_triangles, tolerance);
        if r.over_budget_collapses > 0 {
            warnings.push(format!(
                "decimated past the tolerance to fit {} triangles (largest error {:.4} mm)",
                opts.max_triangles, r.max_error
            ));
        }
        if !r.budget_reached {
            warnings.push(format!(
                "decimation stopped at {} triangles, above the {} budget, to keep the surface valid",
                r.triangles_after, opts.max_triangles
            ));
        }
        Some(r)
    } else {
        None
    };

    let degenerates_fixed = cleanup_degenerate(&mut mesh);
    let topo = Topology::build(&mesh);
    let components = classify_components(&mut mesh, &topo);
    let topo = Topology::build(&mesh);
    let params = match est.kind {
        MeshKind::Cad => RegionParams::cad(tolerance),
        MeshKind::Scan => RegionParams::scan(tolerance),
    };
    let rm = regions::build(&mesh, &topo, params, &components);

    let out_tris: Vec<[V3; 3]> = rm
        .regions
        .iter()
        .flat_map(|r| r.triangles.iter())
        .map(|t| t.map(|v| rm.positions[v as usize]))
        .collect();
    let in_tris: Vec<[V3; 3]> = input
        .triangles
        .iter()
        .map(|t| t.map(|v| input.positions[v as usize]))
        .collect();
    let mut per_vertex = Vec::new();
    let dev = measure(
        &input.positions,
        &in_tris,
        &out_tris,
        tolerance,
        if opts.heatmap {
            Some(&mut per_vertex)
        } else {
            None
        },
        MAX_DEVIATION_SAMPLES,
    );

    let bodies: Vec<Body> = components
        .iter()
        .map(|c| Body {
            closed: c.closed,
            volume: c.volume,
            parent: c.parent,
        })
        .collect();
    collect_warnings(&mut warnings, &repair_report, &components);

    let report = report_json(&ReportParts {
        format,
        unit,
        unit_source,
        raw_triangles,
        raw_vertices,
        input: &input,
        merged,
        repair: &repair_report,
        degenerates_fixed,
        est: &est,
        tolerance,
        tol_source,
        decimation: decimation.as_ref(),
        rm: &rm,
        components: &components,
        dev: &dev,
        warnings: &warnings,
    });

    Ok(Tier0 {
        regions: rm,
        bodies,
        input,
        input_deviation: per_vertex,
        report,
        mesh,
        kind: est.kind,
        tolerance,
        quantization: est.quantization,
        chord_error: est.chord_error,
    })
}

fn collect_warnings(warnings: &mut Vec<String>, r: &RepairReport, comps: &[Component]) {
    if r.holes_filled > 0 {
        warnings.push(format!(
            "filled {} hole(s) with {} triangle(s)",
            r.holes_filled, r.hole_triangles_added
        ));
    }
    if r.holes_remaining > 0 {
        warnings.push(format!("{} hole(s) left open", r.holes_remaining));
    }
    if r.holes_too_large > 0 {
        warnings.push(format!(
            "{} hole(s) have outlines too long to fill reliably and were left open",
            r.holes_too_large
        ));
    }
    if r.non_manifold_edges > 0 {
        warnings.push(format!("{} non-manifold edge(s)", r.non_manifold_edges));
    }
    if r.non_orientable_components > 0 {
        warnings.push(format!(
            "{} body(ies) could not be oriented consistently",
            r.non_orientable_components
        ));
    }
    let open = comps.iter().filter(|c| !c.closed).count();
    if open > 0 {
        warnings.push(format!("{open} open body(ies) cannot become solids"));
    }
}

struct ReportParts<'a> {
    format: Format,
    unit: Unit,
    unit_source: &'a str,
    raw_triangles: usize,
    raw_vertices: usize,
    input: &'a Mesh,
    merged: usize,
    repair: &'a RepairReport,
    degenerates_fixed: usize,
    est: &'a Estimate,
    tolerance: f64,
    tol_source: &'a str,
    decimation: Option<&'a DecimateReport>,
    rm: &'a RegionMesh,
    components: &'a [Component],
    dev: &'a DeviationStats,
    warnings: &'a [String],
}

fn report_json(p: &ReportParts) -> String {
    let bb = p.input.bbox();
    let units = Obj::new()
        .str("unit", p.unit.name())
        .str("source", p.unit_source)
        .num("scaleToMm", p.unit.to_mm())
        .finish();
    let input = Obj::new()
        .int("rawTriangles", p.raw_triangles)
        .int("rawVertices", p.raw_vertices)
        .int("triangles", p.input.triangles.len())
        .int("vertices", p.input.positions.len())
        .int("weldedVertices", p.merged)
        .nums("bboxMin", &bb.min)
        .nums("bboxMax", &bb.max)
        .finish();
    let r = p.repair;
    let repair = Obj::new()
        .int("degenerateRemoved", r.degenerate_removed)
        .int("duplicatesRemoved", r.duplicates_removed)
        .int("flipped", r.flipped)
        .int("nonOrientableBodies", r.non_orientable_components)
        .int("holesFilled", r.holes_filled)
        .int("holeTrianglesAdded", r.hole_triangles_added)
        .int("holesRemaining", r.holes_remaining)
        .int("holesTooLarge", r.holes_too_large)
        .int("nonManifoldEdges", r.non_manifold_edges)
        .int("zeroAreaTriangles", r.zero_area_triangles)
        .int("degeneratesFixed", p.degenerates_fixed)
        .finish();
    let e = p.est;
    let estimate = Obj::new()
        .str("kind", e.kind.name())
        .num("flatFraction", e.flat_fraction)
        .num("quantization", e.quantization)
        .num("noiseSigma", e.noise_sigma)
        .num("planeResidual", e.plane_residual)
        .num("chordError", e.chord_error)
        .num("medianEdge", e.median_edge)
        .num("autoTolerance", e.tolerance)
        .finish();
    let tolerance = Obj::new()
        .num("value", p.tolerance)
        .str("source", p.tol_source)
        .finish();
    let decimation = match p.decimation {
        Some(d) => Obj::new()
            .boolean("applied", true)
            .int("before", d.triangles_before)
            .int("after", d.triangles_after)
            .num("maxError", d.max_error)
            .int("overBudgetCollapses", d.over_budget_collapses)
            .boolean("budgetReached", d.budget_reached)
            .finish(),
        None => Obj::new().boolean("applied", false).finish(),
    };
    let rm = p.rm;
    let polygons = rm.regions.iter().filter(|r| !r.loops.is_empty()).count();
    let regions = Obj::new()
        .int("count", rm.regions.len())
        .int("polygons", polygons)
        .int(
            "outputTriangles",
            rm.regions.iter().map(|r| r.triangles.len()).sum::<usize>(),
        )
        .int("triangleFallbackRegions", rm.triangle_fallback_regions)
        .int("nonPlanarTriangles", rm.non_planar_triangles)
        .int("unpinchedVertices", rm.unpinched_vertices)
        .int("droppedVertices", rm.dropped_vertices)
        .int("snappedVertices", rm.snapped_vertices)
        .num("maxSnap", rm.max_snap)
        .num(
            "maxPlaneDeviation",
            rm.regions
                .iter()
                .map(|r| r.max_deviation)
                .fold(0.0, f64::max),
        )
        .finish();
    let bodies: Vec<String> = p
        .components
        .iter()
        .enumerate()
        .map(|(i, c)| {
            Obj::new()
                .boolean("closed", c.closed)
                .boolean("manifold", c.manifold)
                .num("volume", c.volume)
                .num("parent", c.parent.map(|x| x as f64).unwrap_or(-1.0))
                .int(
                    "regions",
                    rm.regions.iter().filter(|r| r.body as usize == i).count(),
                )
                .finish()
        })
        .collect();
    let d = p.dev;
    let deviation = Obj::new()
        .num("max", d.max)
        .num("rms", d.rms)
        .num("p95", d.p95)
        .num("withinTolerance", d.within_tolerance)
        .num("reverseMax", d.reverse_max)
        .int("samples", d.samples)
        .finish();
    Obj::new()
        .str("engineVersion", env!("CARGO_PKG_VERSION"))
        .str("format", p.format.name())
        .raw("units", &units)
        .raw("input", &input)
        .raw("repair", &repair)
        .raw("estimate", &estimate)
        .raw("tolerance", &tolerance)
        .raw("decimation", &decimation)
        .raw("regions", &regions)
        .raw("bodies", &array(&bodies))
        .raw("deviation", &deviation)
        .strs("warnings", p.warnings)
        .finish()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ingest::stl_bytes;
    use crate::mesh::fixtures::{cube, sphere};

    #[test]
    fn inspect_reports_format_size_and_no_unit_for_stl() {
        // 25 survives binary STL's float32 exactly.
        let json = inspect(&stl_bytes(&cube(25.0)), "part.stl").unwrap();
        assert!(json.contains(r#""format":"stl""#), "{json}");
        assert!(json.contains(r#""unit":null"#), "{json}");
        assert!(json.contains(r#""triangles":12"#), "{json}");
        assert!(json.contains(r#""bboxMax":[25,25,25]"#), "{json}");
        assert!(inspect(b"not a mesh at all", "").is_err());
    }

    #[test]
    fn inspect_ignores_vertices_no_triangle_uses() {
        let obj = "v 0 0 0\nv 10 0 0\nv 0 10 0\nv 0 0 10\nv 1000 1000 1000\n\
                   f 1 3 2\nf 1 2 4\nf 1 4 3\nf 2 3 4\n";
        let json = inspect(obj.as_bytes(), "part.obj").unwrap();
        assert!(json.contains(r#""bboxMax":[10,10,10]"#), "{json}");
    }

    #[test]
    fn binary_stl_cube_end_to_end() {
        let bytes = stl_bytes(&cube(25.4));
        let out = run_tier0(
            &bytes,
            &Options {
                unit: Some(Unit::Inch),
                ..Options::default()
            },
        )
        .unwrap();
        assert_eq!(out.regions.regions.len(), 6);
        assert_eq!(out.bodies.len(), 1);
        assert!(out.bodies[0].closed);
        let v = out.bodies[0].volume;
        let expected = (25.4f64 * 25.4).powi(3);
        assert!((v - expected).abs() / expected < 1e-6, "volume {v}");
        assert!(out.report.contains(r#""unit":"in""#));
        assert!(out.report.contains(r#""kind":"cad""#));
    }

    #[test]
    fn noisy_sphere_decimates_and_reports() {
        let mut m = sphere(30.0, 80, 160);
        let mut state = 99u64;
        for p in m.positions.iter_mut() {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            let g = ((state >> 11) as f64 / (1u64 << 53) as f64 - 0.5) * 0.05;
            let n = crate::math::normalize(*p).unwrap();
            *p = crate::math::add(*p, crate::math::scale(n, g));
        }
        let bytes = stl_bytes(&m);
        let out = run_tier0(
            &bytes,
            &Options {
                max_triangles: 5_000,
                heatmap: true,
                ..Options::default()
            },
        )
        .unwrap();
        assert!(out.report.contains(r#""kind":"scan""#));
        let tris: usize = out.regions.regions.iter().map(|r| r.triangles.len()).sum();
        assert!(tris <= 5_100, "tris {tris}");
        assert_eq!(out.input_deviation.len(), out.input.positions.len());
        assert!(out.bodies[0].closed);
    }

    #[test]
    fn overflowing_unit_conversion_is_rejected() {
        let mut m = cube(1e300);
        m.positions[1][0] = 1e300;
        let bytes = crate::ingest::obj_bytes(&m);
        let err = run_tier0(
            &bytes,
            &Options {
                format_hint: "big.obj".into(),
                unit: Some(Unit::Foot),
                ..Options::default()
            },
        )
        .err()
        .unwrap();
        assert!(err.contains("exceed"), "{err}");
    }

    #[test]
    fn open_mesh_with_holes_left_open() {
        let mut m = cube(10.0);
        m.triangles.truncate(10);
        let bytes = stl_bytes(&m);
        let out = run_tier0(
            &bytes,
            &Options {
                fill_holes: HoleFill::None,
                ..Options::default()
            },
        )
        .unwrap();
        assert!(!out.bodies[0].closed);
        assert!(out.report.contains("open body"));
    }
}
