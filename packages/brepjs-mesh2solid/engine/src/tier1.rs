//! Tier 1 driver: segment the repaired mesh into analytic surfaces on top of
//! the Tier 0 result, which stays available as the fallback.

use crate::deviation::{closest_on_triangle, measure, Bvh};
use crate::estimate::MeshKind;
use crate::fit::Surface;
use crate::json::{array, Obj};
use crate::math::{add, scale, Bbox, V3};
use crate::mesh::{Mesh, Topology};
use crate::pipeline::{run_tier0, Options, Tier0, MAX_DEVIATION_SAMPLES};
use crate::segment::{absorb, consolidate, segment, unfit_area, Params, Segmentation};
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
    let mut seg = segment(&t0.mesh, &topo, &params);
    if params.robust {
        // Noisy fits of tangent neighbours meet a few degrees apart, which
        // would read as a kink, so a scan skips the dissolve.
        consolidate(&t0.mesh, &mut seg, &params, &tri_body);
    } else {
        dissolve_kinks(&t0.mesh, &topo, &mut seg, tol);
        absorb(&t0.mesh, &topo, &mut seg, &params);
    }
    let snapped = snap(&t0.mesh, &topo, &mut seg, tol, params.robust, &tri_body);
    let bvh = Bvh::new(
        t0.mesh
            .triangles
            .iter()
            .map(|t| t.map(|v| t0.mesh.positions[v as usize]))
            .collect(),
    );
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

impl Tier1 {
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
