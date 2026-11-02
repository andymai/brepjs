//! Tier 1 driver: segment the repaired mesh into analytic surfaces on top of
//! the Tier 0 result, which stays available as the fallback.

use crate::charts::{self, ChartInput, ChartParams, Charts};
use crate::deviation::{closest_on_triangle, measure, Bvh};
use crate::estimate::MeshKind;
use crate::fit::Surface;
use crate::json::{array, Obj};
use crate::math::{add, scale, Bbox, V3};
use crate::mesh::{Mesh, Topology};
use crate::pipeline::{run_tier0, Options, Tier0, MAX_DEVIATION_SAMPLES};
use crate::segment::{
    absorb, consolidate, dissolve_redundant, merge_adjacent, reassign, refit_from, segment,
    unfit_area, Params, RegionPoints, Segmentation,
};
use crate::snap::{dissolve_kinks, snap, SnapReport};

pub struct Tier1 {
    pub t0: Tier0,
    pub seg: Segmentation,
    pub tol: f64,
    /// Body (connected component, in Tier 0's order) of each mesh triangle.
    pub tri_body: Vec<u32>,
    /// Largest gap between a fitted triangle and its exact surface.
    pub sag: f64,
    pub snapped: SnapReport,
    bvh: Bvh,
}

/// Edges sharper than this split fitting neighbourhoods. Growth itself is
/// decided by point distances, so a chamfer under this angle still separates.
const CREASE_DEG: f64 = 50.0;

/// The coarsest chord a CAD tessellation of this mesh plausibly has. The chord
/// estimate is a 90th percentile and undershoots the worst faces a few times;
/// the floors keep fine meshes from rejecting their own surfaces.
fn max_sag(t0: &Tier0, tol: f64) -> f64 {
    let diag = t0.mesh.bbox().diag();
    (8.0 * t0.chord_error).max(20.0 * tol).max(1e-3 * diag)
}

pub fn run_tier1(bytes: &[u8], opts: &Options) -> Result<Tier1, String> {
    let t0 = run_tier0(bytes, opts)?;
    let tol = match t0.kind {
        MeshKind::Cad => (t0.quantization * 16.0).max(t0.tolerance),
        MeshKind::Scan => t0.tolerance,
    };
    let topo = Topology::build(&t0.mesh);
    let params = Params {
        tol,
        max_sag: max_sag(&t0, tol),
        crease_deg: CREASE_DEG,
        robust: matches!(t0.kind, MeshKind::Scan),
    };
    // Same mesh and adjacency as Tier 0's classify_components, so the same order.
    let mut tri_body = vec![u32::MAX; t0.mesh.triangles.len()];
    for (b, comp) in topo.components().iter().enumerate() {
        for &t in comp {
            tri_body[t as usize] = b as u32;
        }
    }
    let bvh = Bvh::new(
        t0.mesh
            .triangles
            .iter()
            .map(|t| t.map(|v| t0.mesh.positions[v as usize]))
            .collect(),
    );
    let mut seg = segment(&t0.mesh, &topo, &params);
    if params.robust {
        // Noisy fits of tangent neighbours meet a few degrees apart, which
        // would read as a kink, so a scan skips the dissolve.
        consolidate(&t0.mesh, &mut seg, &params, &tri_body);
        let normals = vertex_normals(&t0.input);
        // A fillet split into strips must be whole before its neighbours can
        // be judged against it, and dropping a fragment can let strips join,
        // so the two alternate.
        for _ in 0..3 {
            let mut measured = measured_points(&t0, &normals, &bvh, &seg, None);
            refit_from(&t0.mesh, &mut seg, &measured.pts, &params);
            merge_adjacent(&t0.mesh, &topo, &mut seg, &params, &tri_body, &mut measured);
            let dropped =
                dissolve_redundant(&t0.mesh, &topo, &mut seg, &params, &tri_body, &measured);
            // Merging runs to a fixed point; only a dropped fragment opens new merges.
            if dropped == 0 {
                break;
            }
        }
        reassign(&t0.mesh, &mut seg, &params, &tri_body);
        let measured = measured_points(&t0, &normals, &bvh, &seg, Some(2.0 * tol));
        refit_from(&t0.mesh, &mut seg, &measured.pts, &params);
    } else {
        dissolve_kinks(&t0.mesh, &topo, &mut seg, tol);
        absorb(&t0.mesh, &topo, &mut seg, &params);
    }
    let snapped = snap(&t0.mesh, &topo, &mut seg, tol, params.robust, &tri_body);
    let sag = input_sag(&t0.mesh, &seg);
    Ok(Tier1 {
        t0,
        seg,
        tol,
        tri_body,
        sag,
        snapped,
        bvh,
    })
}

/// Decimation spends a scan's triangle budget on its curves and leaves a flat
/// face a few large triangles, whose corners sit mostly along the seams where
/// a fillet pulls them inward, and it flattens the start of each fillet; fits
/// to decimated vertices are biased. The input's own vertices cover every
/// surface evenly: each goes to the region of its nearest decimated triangle,
/// when it lies `within` that region's surface if given.
fn measured_points(
    t0: &Tier0,
    normals: &[V3],
    bvh: &Bvh,
    seg: &Segmentation,
    within: Option<f64>,
) -> RegionPoints {
    let mut out = RegionPoints {
        pts: vec![Vec::new(); seg.regions.len()],
        nrm: vec![Vec::new(); seg.regions.len()],
    };
    let input = &t0.input.positions;
    let stride = input.len().div_ceil(MAX_DEVIATION_SAMPLES).max(1);
    let mut stack = Vec::new();
    for (v, &p) in input.iter().enumerate().step_by(stride) {
        let (_, t) = bvh.nearest(p, &mut stack);
        let Some(&r) = seg.region_of.get(t as usize) else {
            continue;
        };
        if r == u32::MAX {
            continue;
        }
        let r = r as usize;
        if within.is_some_and(|w| seg.regions[r].surface.distance(p) > w) {
            continue;
        }
        out.pts[r].push(p);
        out.nrm[r].push(normals[v]);
    }
    out
}

/// Area-weighted unit normal at each vertex (zero where none is defined).
fn vertex_normals(mesh: &Mesh) -> Vec<V3> {
    let mut acc = vec![[0.0; 3]; mesh.positions.len()];
    for tri in &mesh.triangles {
        let [a, b, c] = tri.map(|v| mesh.positions[v as usize]);
        let n = crate::math::tri_cross(a, b, c);
        for &v in tri {
            acc[v as usize] = add(acc[v as usize], n);
        }
    }
    acc.into_iter()
        .map(|n| crate::math::normalize(n).unwrap_or([0.0; 3]))
        .collect()
}

/// Sampled at centroids and edge midpoints, near where a triangle sits farthest
/// from a surface its corners lie on: an estimate of how far the exact rebuild
/// can sit from the mesh (callers add a margin), which a percentile chord
/// estimate undershoots.
fn input_sag(mesh: &Mesh, seg: &Segmentation) -> f64 {
    let mut sag = 0.0f64;
    for r in &seg.regions {
        for &t in &r.tris {
            let [a, b, c] = mesh.tri(t as usize);
            let probes = [
                scale(add(add(a, b), c), 1.0 / 3.0),
                scale(add(a, b), 0.5),
                scale(add(b, c), 0.5),
                scale(add(c, a), 0.5),
            ];
            for p in probes {
                sag = sag.max(r.surface.distance(p));
            }
        }
    }
    sag
}

/// Freeform charts stay within this angle of their mean normal, so each is a
/// height field over its mean plane that one fitted surface can follow.
const CHART_CONE_DEG: f64 = 40.0;
/// A curved chart spans at most this share of its body's diagonal.
const CHART_EXTENT: f64 = 0.5;
/// Runs are cut to at most this share of their body's diagonal.
const CHART_RUN: f64 = 0.1;
const MAX_CHARTS: usize = 512;

impl Tier1 {
    /// Every body split into freeform charts, for rebuilding it from filled
    /// B-spline faces when the analytic rebuild fails; `None` when the mesh
    /// doesn't split into few enough disc-shaped charts.
    pub fn charts(&self) -> Option<Charts> {
        let mesh = &self.t0.mesh;
        let topo = Topology::build(mesh);
        let robust = matches!(self.t0.kind, MeshKind::Scan);
        let params = ChartParams {
            cone_deg: CHART_CONE_DEG,
            // Decimated scan triangles tilt with the noise.
            cone_slack: if robust { 0.05 } else { 0.0 },
            crease_deg: CREASE_DEG,
            noise: if robust { self.t0.tolerance } else { 0.0 },
            max_extent: CHART_EXTENT,
            max_run: CHART_RUN,
            max_charts: MAX_CHARTS,
        };
        let input = &self.t0.input;
        let mask = vec![true; mesh.triangles.len()];
        let src = ChartInput {
            mesh,
            topo: &topo,
            mask: &mask,
            tri_body: &self.tri_body,
            bvh: &self.bvh,
            input,
            stride: input.positions.len().div_ceil(MAX_DEVIATION_SAMPLES).max(1),
        };
        charts::build(&src, &params)
    }

    /// For each point: the fitted surface closest to the nearest point on the
    /// mesh (or -1 with no surfaces), and the distance to the mesh. On a scan
    /// the segmentation's region boundaries are fuzzy; the surfaces aren't.
    pub fn nearest_by_surface(&self, points: &[V3]) -> Vec<(i64, f64)> {
        let mut stack = Vec::new();
        let m = &self.t0.mesh;
        points
            .iter()
            .map(|&p| {
                let (d, t) = self.bvh.nearest(p, &mut stack);
                if (t as usize) >= m.triangles.len() {
                    return (-1, d);
                }
                let [a, b, c] = m.tri(t as usize);
                let q = closest_on_triangle(p, a, b, c);
                let best = self
                    .seg
                    .regions
                    .iter()
                    .enumerate()
                    .map(|(i, r)| (i, r.surface.distance(q)))
                    .min_by(|x, y| x.1.total_cmp(&y.1));
                (best.map_or(-1, |(i, _)| i as i64), d)
            })
            .collect()
    }

    /// For each point: (surface id or -1 where the nearest triangle fit none, distance).
    pub fn nearest(&self, points: &[V3]) -> Vec<(i64, f64)> {
        let mut stack = Vec::new();
        points
            .iter()
            .map(|&p| {
                let (d, t) = self.bvh.nearest(p, &mut stack);
                let r = self
                    .seg
                    .region_of
                    .get(t as usize)
                    .copied()
                    .unwrap_or(u32::MAX);
                (if r == u32::MAX { -1 } else { r as i64 }, d)
            })
            .collect()
    }

    /// Body of the mesh triangle nearest each point, or -1.
    pub fn bodies_of(&self, points: &[V3]) -> Vec<i64> {
        let mut stack = Vec::new();
        points
            .iter()
            .map(|&p| {
                let (_, t) = self.bvh.nearest(p, &mut stack);
                match self.tri_body.get(t as usize) {
                    Some(&b) if b != u32::MAX => b as i64,
                    _ => -1,
                }
            })
            .collect()
    }

    pub fn surface_bounds(&self) -> Vec<Bbox> {
        self.seg
            .regions
            .iter()
            .map(|r| {
                let mut b = Bbox::empty();
                for &t in &r.tris {
                    for p in self.t0.mesh.tri(t as usize) {
                        b.expand(p);
                    }
                }
                b
            })
            .collect()
    }

    /// Deviation between the input mesh and candidate output triangles, as JSON.
    /// Deviation of `out_tris` from the input mesh, measured against the same
    /// tolerance as Tier 0's report; fills `per_vertex` (input vertex order) when given.
    pub fn deviation_json(
        &self,
        out_tris: &[[V3; 3]],
        per_vertex: Option<&mut Vec<f32>>,
    ) -> String {
        let input = &self.t0.input;
        let in_tris: Vec<[V3; 3]> = input
            .triangles
            .iter()
            .map(|t| t.map(|v| input.positions[v as usize]))
            .collect();
        let d = measure(
            &input.positions,
            &in_tris,
            out_tris,
            self.t0.tolerance,
            per_vertex,
            MAX_DEVIATION_SAMPLES,
        );
        Obj::new()
            .num("max", d.max)
            .num("rms", d.rms)
            .num("p95", d.p95)
            .num("withinTolerance", d.within_tolerance)
            .num("reverseMax", d.reverse_max)
            .int("samples", d.samples)
            .finish()
    }

    pub fn report_json(&self) -> String {
        let surfaces: Vec<String> = self
            .seg
            .regions
            .iter()
            .map(|r| {
                Obj::new()
                    .str("kind", r.surface.kind().name())
                    .int("triangles", r.tris.len())
                    .num("maxResidual", r.max_residual)
                    .finish()
            })
            .collect();
        Obj::new()
            .num("fitTolerance", self.tol)
            .int("unfitTriangles", self.seg.unfit_triangles)
            .num("unfitArea", unfit_area(&self.t0.mesh, &self.seg))
            .int("tangentPairs", self.snapped.tangent_pairs.len())
            .int("snappedSurfaces", self.snapped.snapped)
            .raw("surfaces", &array(&surfaces))
            .finish()
    }
}

/// Kind code and eight parameter slots per surface, for the wasm boundary.
pub fn pack_surface(s: &Surface) -> (u8, [f64; 8]) {
    match *s {
        Surface::Plane { n, d } => (0, [n[0], n[1], n[2], d, 0.0, 0.0, 0.0, 0.0]),
        Surface::Cylinder { o, a, r } => (1, [o[0], o[1], o[2], a[0], a[1], a[2], r, 0.0]),
        Surface::Sphere { c, r } => (2, [c[0], c[1], c[2], r, 0.0, 0.0, 0.0, 0.0]),
        Surface::Cone {
            apex,
            a,
            half_angle,
        } => (
            3,
            [apex[0], apex[1], apex[2], a[0], a[1], a[2], half_angle, 0.0],
        ),
        Surface::Torus { c, a, major, minor } => {
            (4, [c[0], c[1], c[2], a[0], a[1], a[2], major, minor])
        }
    }
}
