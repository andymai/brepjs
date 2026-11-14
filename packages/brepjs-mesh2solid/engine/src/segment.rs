//! Tier 1: split a CAD tessellation into regions that each lie on one analytic
//! surface.
//!
//! Seeds are taken largest triangle first. Each seed hypothesises a surface
//! from its neighbourhood of still-unassigned triangles reachable across
//! smooth edges, using the largest neighbourhood any primitive fits (a lone
//! quad of a tessellated cylinder is exactly planar, so small neighbourhoods
//! would always say "plane"). The region then grows while every vertex of a
//! candidate triangle stays within tolerance, refitting as it doubles. Planes
//! claim their large triangles before thin fillet strips get a turn.

use crate::fit::{fit_candidates, fit_candidates_where, max_residual, refine, Kind, Surface};
use crate::math::{add, dist, dot, normalize, scale, tri_cross, V3};
use crate::mesh::{Mesh, Topology};

#[derive(Clone, Debug)]
pub struct Region {
    pub surface: Surface,
    pub tris: Vec<u32>,
    pub max_residual: f64,
}

#[derive(Clone, Debug)]
pub struct Segmentation {
    pub regions: Vec<Region>,
    /// Region per triangle, `u32::MAX` where no surface fit.
    pub region_of: Vec<u32>,
    pub unfit_triangles: usize,
}

pub struct Params {
    /// Largest allowed vertex distance from a region's surface.
    pub tol: f64,
    /// Largest allowed edge-midpoint distance from a curved surface: the
    /// coarsest chord a tessellator would leave.
    pub max_sag: f64,
    /// Edges sharper than this separate neighbourhoods.
    pub crease_deg: f64,
    /// Measurement noise (a scan): judge fits by their 95th-percentile
    /// residual and triangles by their centroid, since a few vertices past any
    /// noise threshold are expected.
    pub robust: bool,
}

const NEIGHBOURHOOD_SIZES: [usize; 8] = [2, 4, 8, 16, 32, 64, 128, 256];

/// Every seed claims at least its own triangle, so a freeform mesh would seed
/// once per triangle. Past this many surfaces the arrangement could not split
/// them in reasonable time anyway; the rest stays unfit and Tier 1 falls back.
pub const MAX_REGIONS: usize = 1024;

/// Seeds go largest triangle first, so on a CAD part the first regions are its
/// big faces. When this many cover under a quarter of the area, the mesh is
/// freeform and seeding stops early.
const EARLY_REGIONS: usize = 128;

/// Does `s` fit `pts` within `tol`: every point, or 95% of them when robust.
pub(crate) fn fits(s: &Surface, pts: &[V3], tol: f64, robust: bool) -> bool {
    if !robust {
        return pts.iter().all(|&p| s.distance(p) <= tol);
    }
    // Too few points for a percentile: allow the same slack a triangle's corners get.
    if pts.len() < 20 {
        return pts.iter().all(|&p| s.distance(p) <= 2.0 * tol);
    }
    let mut d: Vec<f64> = pts.iter().map(|&p| s.distance(p)).collect();
    let k = (d.len() * 95 / 100).min(d.len() - 1);
    let (_, kth, _) = d.select_nth_unstable_by(k, f64::total_cmp);
    *kth <= tol
}

pub(crate) fn unique_vertices(mesh: &Mesh, tris: &[u32]) -> Vec<u32> {
    let mut v: Vec<u32> = tris
        .iter()
        .flat_map(|&t| mesh.triangles[t as usize])
        .collect();
    v.sort_unstable();
    v.dedup();
    v
}

/// Vertex positions and area-weighted normals from `tris` only, so a vertex on
/// a crease takes its normal from this side.
fn samples(mesh: &Mesh, tris: &[u32]) -> (Vec<V3>, Vec<V3>) {
    let verts = unique_vertices(mesh, tris);
    let mut acc: Vec<V3> = vec![[0.0; 3]; verts.len()];
    for &t in tris {
        let tri = mesh.triangles[t as usize];
        let [a, b, c] = tri.map(|v| mesh.positions[v as usize]);
        let n = tri_cross(a, b, c);
        for v in tri {
            let k = verts.binary_search(&v).unwrap_or(0);
            acc[k] = add(acc[k], n);
        }
    }
    let mut pts = Vec::with_capacity(verts.len());
    let mut nrm = Vec::with_capacity(verts.len());
    for (k, &v) in verts.iter().enumerate() {
        if let Some(n) = normalize(acc[k]) {
            pts.push(mesh.positions[v as usize]);
            nrm.push(n);
        }
    }
    (pts, nrm)
}

fn normals(mesh: &Mesh) -> Vec<Option<V3>> {
    (0..mesh.triangles.len())
        .map(|t| {
            let [a, b, c] = mesh.tri(t);
            normalize(tri_cross(a, b, c))
        })
        .collect()
}

/// Is the triangle on `s` and facing the way the surface does there?
fn accepts(
    mesh: &Mesh,
    s: &Surface,
    t: usize,
    params: &Params,
    facing: &[Option<V3>],
    reference: V3,
) -> bool {
    let tol = params.tol;
    let tri = mesh.tri(t);
    let on = if params.robust {
        let [a, b, c] = tri;
        // A decimated chord sits inside a curved surface by its sag; only the
        // corners are bounded by the decimation tolerance.
        let centroid_tol = if s.kind() == Kind::Plane {
            tol
        } else {
            2.0 * tol
        };
        s.distance(scale(add(add(a, b), c), 1.0 / 3.0)) <= centroid_tol
            && tri.iter().all(|&p| s.distance(p) <= 2.0 * tol)
    } else {
        tri.iter().all(|&p| s.distance(p) <= tol)
    };
    if !on {
        return false;
    }
    // A scan's tolerance is three noise sigmas; under ten sigmas of altitude a
    // facet's normal is mostly noise, so only its distance counts.
    if params.robust && min_altitude(tri) < 3.3 * tol {
        return true;
    }
    match (s, facing[t]) {
        (Surface::Plane { n: pn, .. }, Some(n)) => {
            dot(n, reference) > 0.0 && (!params.robust || dot(n, *pn).abs() >= MIN_FACET_COS)
        }
        (_, Some(n)) => {
            let [a, b, c] = tri;
            // Three rings of vertices fit some torus; a tessellator would not
            // leave that torus's chords this far from it.
            let mids = [
                scale(add(a, b), 0.5),
                scale(add(b, c), 0.5),
                scale(add(c, a), 0.5),
            ];
            mids.iter().all(|&m| s.distance(m) <= params.max_sag)
                && tri.iter().all(|&p| {
                    s.near_singular(p, APEX_REACH * tol)
                        || s.normal(p)
                            .is_none_or(|sn| dot(sn, n).abs() >= MIN_FACET_COS)
                })
        }
        _ => true,
    }
}

/// A tessellator never lets a facet turn more than this from the surface it
/// approximates (CAD exporters stay well under it). Without the limit, a large
/// flat face plus one fillet strip (three parallel lines) fits a cylinder. On
/// a scan planes get the limit too: noise lets a plane's corners reach the
/// start of a fillet, but not the facets there.
const MIN_FACET_COS: f64 = std::f64::consts::FRAC_1_SQRT_2;

/// A curved surface so gentle over the patch it was fitted to that it is a
/// plane soaking up noise (a cylinder of radius 1.5 m over 30 mm of a face).
fn nearly_flat(s: &Surface, pts: &[V3], extent: f64) -> bool {
    let far = 10.0 * extent;
    match *s {
        Surface::Plane { .. } => false,
        Surface::Cylinder { r, .. } | Surface::Sphere { r, .. } => r > far,
        Surface::Torus { minor, .. } => minor > far,
        Surface::Cone { apex, .. } => {
            let n = pts.len().max(1) as f64;
            let c = pts.iter().fold([0.0; 3], |a, &p| add(a, scale(p, 1.0 / n)));
            crate::math::dist(apex, c) > far
        }
    }
}

/// A triangle's shortest altitude.
fn min_altitude([a, b, c]: [V3; 3]) -> f64 {
    let longest = dist(a, b).max(dist(b, c)).max(dist(c, a));
    if longest == 0.0 {
        0.0
    } else {
        2.0 * crate::math::tri_area(a, b, c) / longest
    }
}

/// A grown region's size discounted 15% per step of surface complexity.
fn score(tris: usize, kind: Kind) -> f64 {
    tris as f64 / 1.15f64.powi(kind as i32)
}

/// The 95th-percentile distance of `pts` from `s`.
fn p95(s: &Surface, pts: &[V3]) -> f64 {
    let mut d: Vec<f64> = pts.iter().map(|&p| s.distance(p)).collect();
    if d.is_empty() {
        return 0.0;
    }
    let k = (d.len() * 95 / 100).min(d.len() - 1);
    let (_, kth, _) = d.select_nth_unstable_by(k, f64::total_cmp);
    *kth
}

/// How close to a cone's apex (in fit tolerances) the facet normal check is skipped.
pub const APEX_REACH: f64 = 10.0;

/// On a scan, regions covering at least this share of their body's surface
/// area are faces; smaller ones are noise fragments or slivers bridging a crease.
const MAJOR_AREA: f64 = 0.002;

/// Sectors about a surface's axis that a region must reach to go all the way round it.
const WRAP_SECTORS: usize = 16;

/// Does the region go all the way round its cylinder or cone? Noise leaves
/// fragments on a face and slivers along a crease, but not a closed band
/// about an axis: a drilled hole is a face however small its wall is beside
/// the part (36 holes of 6 mm through a 280 mm brake disc are 0.13% of its
/// area each).
fn wraps_its_axis(mesh: &Mesh, r: &Region) -> bool {
    let (o, a) = match r.surface {
        Surface::Cylinder { o, a, .. } => (o, a),
        Surface::Cone { apex, a, .. } => (apex, a),
        _ => return false,
    };
    if r.tris.len() < 2 * WRAP_SECTORS {
        return false;
    }
    let helper = if a[0].abs() < 0.9 {
        [1.0, 0.0, 0.0]
    } else {
        [0.0, 1.0, 0.0]
    };
    let Some(u) = normalize(crate::math::cross(helper, a)) else {
        return false;
    };
    let v = crate::math::cross(a, u);
    let mut seen = [false; WRAP_SECTORS];
    for &t in &r.tris {
        let [p, q, w] = mesh.tri(t as usize);
        let c = crate::math::sub(scale(add(add(p, q), w), 1.0 / 3.0), o);
        let angle = dot(c, v).atan2(dot(c, u)) + std::f64::consts::PI;
        let k = (angle / std::f64::consts::TAU * WRAP_SECTORS as f64) as usize;
        seen[k.min(WRAP_SECTORS - 1)] = true;
    }
    seen.iter().all(|&s| s)
}

/// The mesh bodies each region's triangles lie in, sorted. Merging can join
/// faces of separate bodies that share one surface, so there may be several.
pub fn region_bodies(regions: &[Region], tri_body: &[u32]) -> Vec<Vec<u32>> {
    regions
        .iter()
        .map(|r| {
            let mut b: Vec<u32> = r.tris.iter().map(|&t| tri_body[t as usize]).collect();
            b.sort_unstable();
            b.dedup();
            b
        })
        .collect()
}

/// Keep the major regions of a scan (see `MAJOR_AREA`), and each smaller one
/// that goes all the way round its axis, and hand every other triangle to the
/// kept surface in its own body that accepts it with its centroid closest;
/// what none accepts stays unfit. Returns how many regions were folded in.
pub fn consolidate(
    mesh: &Mesh,
    seg: &mut Segmentation,
    params: &Params,
    tri_body: &[u32],
) -> usize {
    let areas: Vec<f64> = (0..mesh.triangles.len()).map(|t| mesh.area(t)).collect();
    let bodies = tri_body.iter().map(|&b| b as usize + 1).max().unwrap_or(0);
    let mut body_area = vec![0.0; bodies];
    for (t, &b) in tri_body.iter().enumerate() {
        body_area[b as usize] += areas[t];
    }
    // Judged per body, so a small part beside a large one keeps its faces.
    let major: Vec<bool> = seg
        .regions
        .iter()
        .map(|r| {
            let mut by_body: Vec<(u32, f64)> = r
                .tris
                .iter()
                .map(|&t| (tri_body[t as usize], areas[t as usize]))
                .collect();
            by_body.sort_unstable_by_key(|x| x.0);
            by_body.chunk_by(|x, y| x.0 == y.0).any(|run| {
                let a: f64 = run.iter().map(|x| x.1).sum();
                a >= MAJOR_AREA * body_area[run[0].0 as usize]
            }) || wraps_its_axis(mesh, r)
        })
        .collect();
    let folded = major.iter().filter(|&&m| !m).count();
    let old = std::mem::take(&mut seg.regions);
    let mut regions: Vec<Region> = Vec::new();
    let mut remap = vec![u32::MAX; old.len()];
    for (k, r) in old.into_iter().enumerate() {
        if major[k] {
            remap[k] = regions.len() as u32;
            regions.push(r);
        }
    }
    let homes = region_bodies(&regions, tri_body);
    let facing = normals(mesh);
    for (t, body) in tri_body.iter().enumerate() {
        let r = seg.region_of[t];
        let kept = r != u32::MAX && remap[r as usize] != u32::MAX;
        if kept {
            seg.region_of[t] = remap[r as usize];
            continue;
        }
        let [a, b, c] = mesh.tri(t);
        let centroid = scale(add(add(a, b), c), 1.0 / 3.0);
        let mut best: Option<(usize, f64)> = None;
        for (i, reg) in regions.iter().enumerate() {
            if homes[i].binary_search(body).is_err() {
                continue;
            }
            let reference = match reg.surface {
                Surface::Plane { n, .. } => n,
                _ => [0.0, 0.0, 1.0],
            };
            if !accepts(mesh, &reg.surface, t, params, &facing, reference) {
                continue;
            }
            let d = reg.surface.distance(centroid);
            if best.is_none_or(|(_, bd)| d < bd) {
                best = Some((i, d));
            }
        }
        seg.region_of[t] = best.map_or(u32::MAX, |(i, _)| i as u32);
    }
    for r in &mut regions {
        r.tris.clear();
    }
    for (t, &r) in seg.region_of.iter().enumerate() {
        if r != u32::MAX {
            regions[r as usize].tris.push(t as u32);
        }
    }
    for r in &mut regions {
        let (pts, _) = samples(mesh, &r.tris);
        r.max_residual = max_residual(&r.surface, &pts);
    }
    seg.regions = regions;
    seg.unfit_triangles = seg.region_of.iter().filter(|&&r| r == u32::MAX).count();
    folded
}

/// On a scan a face's region grows past a tangent seam into the start of the
/// fillet, where the blend is still within noise of the face. Those triangles
/// all lie to one side, so they pull the face's fit inward (and the face's
/// own triangles push the fillet's out). Once every surface is known, hand
/// each triangle to the accepting surface in its body nearest its centroid,
/// then refit. Returns how many triangles moved.
pub fn reassign(mesh: &Mesh, seg: &mut Segmentation, params: &Params, tri_body: &[u32]) -> usize {
    let homes = region_bodies(&seg.regions, tri_body);
    let facing = normals(mesh);
    let reach = 2.0 * params.tol;
    let boxes: Vec<crate::math::Bbox> = seg
        .regions
        .iter()
        .map(|r| crate::math::Bbox::of(&samples(mesh, &r.tris).0))
        .collect();
    let inside = |b: &crate::math::Bbox, p: V3| {
        (0..3).all(|k| b.min[k] - reach <= p[k] && p[k] <= b.max[k] + reach)
    };
    let mut moved = 0;
    for (t, body) in tri_body.iter().enumerate() {
        let cur = seg.region_of[t];
        if cur == u32::MAX {
            continue;
        }
        let [a, b, c] = mesh.tri(t);
        let centroid = scale(add(add(a, b), c), 1.0 / 3.0);
        let mut best = (
            cur as usize,
            seg.regions[cur as usize].surface.distance(centroid),
        );
        for (i, reg) in seg.regions.iter().enumerate() {
            if i == cur as usize
                || homes[i].binary_search(body).is_err()
                || !inside(&boxes[i], centroid)
            {
                continue;
            }
            let d = reg.surface.distance(centroid);
            if d >= best.1 {
                continue;
            }
            let reference = match reg.surface {
                Surface::Plane { n, .. } => n,
                _ => [0.0, 0.0, 1.0],
            };
            if accepts(mesh, &reg.surface, t, params, &facing, reference) {
                best = (i, d);
            }
        }
        if best.0 != cur as usize {
            seg.region_of[t] = best.0 as u32;
            moved += 1;
        }
    }
    if moved == 0 {
        return 0;
    }
    rebuild_members(seg);
    for r in &mut seg.regions {
        let (pts, _) = samples(mesh, &r.tris);
        r.surface = refit(r.surface, &pts, params);
        r.max_residual = max_residual(&r.surface, &pts);
    }
    moved
}

/// How far (in tolerances) a triangle's centroid may sit from its region's
/// surface on a scan: the reach `dissolve_redundant` hands triangles over within.
const MISFIT_REACH: f64 = 3.0;

/// Merging and dissolving move whole regions by what their measured points
/// lie on. The chords decimation leaves across a crease come along, though
/// they lie on neither face: a triangle from the bottom of a plate to halfway
/// up its side. Release every triangle whose centroid is farther than
/// `MISFIT_REACH` tolerances from its region's surface, so a region's extent
/// and the mesh's sag are those of the face. Returns how many were released.
pub fn release_misfits(mesh: &Mesh, seg: &mut Segmentation, params: &Params) -> usize {
    let reach = MISFIT_REACH * params.tol;
    let mut released = 0;
    for t in 0..seg.region_of.len() {
        let r = seg.region_of[t];
        if r == u32::MAX {
            continue;
        }
        let [a, b, c] = mesh.tri(t);
        let centroid = scale(add(add(a, b), c), 1.0 / 3.0);
        if seg.regions[r as usize].surface.distance(centroid) > reach {
            seg.region_of[t] = u32::MAX;
            released += 1;
        }
    }
    if released > 0 {
        rebuild_members(seg);
        for r in &mut seg.regions {
            let (pts, _) = samples(mesh, &r.tris);
            r.max_residual = max_residual(&r.surface, &pts);
        }
        seg.unfit_triangles = seg.region_of.iter().filter(|&&r| r == u32::MAX).count();
    }
    released
}

/// Rebuild each region's triangle list from `region_of`, dropping regions
/// left with none (an empty region has no extent to build a patch over).
fn rebuild_members(seg: &mut Segmentation) {
    for r in &mut seg.regions {
        r.tris.clear();
    }
    for (t, &r) in seg.region_of.iter().enumerate() {
        if r != u32::MAX {
            seg.regions[r as usize].tris.push(t as u32);
        }
    }
    seg.regions.retain(|r| !r.tris.is_empty());
    for (k, r) in seg.regions.iter().enumerate() {
        for &t in &r.tris {
            seg.region_of[t as usize] = k as u32;
        }
    }
}

/// Kinds that can stand for their neighbours' points: noise rarely fakes one,
/// unlike a cone or torus, which bend to fit a strip of almost anything curved.
fn trusted(k: Kind) -> bool {
    matches!(k, Kind::Plane | Kind::Cylinder | Kind::Sphere)
}

/// Regions sharing an edge with each region.
fn adjacency(mesh: &Mesh, topo: &Topology, seg: &Segmentation) -> Vec<Vec<usize>> {
    let mut adj = vec![Vec::new(); seg.regions.len()];
    for t in 0..mesh.triangles.len() {
        let a = seg.region_of[t];
        if a == u32::MAX {
            continue;
        }
        for i in 0..3 {
            if let Some(nb) = topo.neighbor(t, i) {
                let b = seg.region_of[nb];
                if b != u32::MAX && b != a {
                    adj[a as usize].push(b as usize);
                }
            }
        }
    }
    for a in &mut adj {
        a.sort_unstable();
        a.dedup();
    }
    adj
}

/// Share of a fragment's measured points other surfaces must explain for it to be dropped.
const REDUNDANT_SHARE: f64 = 0.9;

/// On a scan, noise leaves fragments that only restate their neighbours: a
/// wide cone through the nearly flat ring where a face's fillets begin, a
/// chord plane along a fillet. Drop each small region whose measured points
/// the other surfaces in its body almost all explain, handing each triangle to
/// the surface nearest its centroid. Measured points, not triangles: the
/// decimated triangles across a tangent seam are chords lying on neither
/// surface within tolerance, while the points under them lie on one or the
/// other. The flexible kinds go first
/// (most often the noise), then planes, then cylinders and spheres, smallest
/// first within a kind, so a stray cone is gone before it can claim a fillet.
/// Returns how many regions were dropped.
pub fn dissolve_redundant(
    mesh: &Mesh,
    topo: &Topology,
    seg: &mut Segmentation,
    params: &Params,
    tri_body: &[u32],
    measured: &RegionPoints,
) -> usize {
    let areas: Vec<f64> = (0..mesh.triangles.len()).map(|t| mesh.area(t)).collect();
    let bodies = tri_body.iter().map(|&b| b as usize + 1).max().unwrap_or(0);
    let mut body_area = vec![0.0; bodies];
    for (t, &b) in tri_body.iter().enumerate() {
        body_area[b as usize] += areas[t];
    }
    let mut adj = adjacency(mesh, topo, seg);
    let rank = |k: Kind| match k {
        Kind::Cone | Kind::Torus => 0,
        Kind::Plane => 1,
        Kind::Cylinder | Kind::Sphere => 2,
    };
    let area_of = |r: &Region| r.tris.iter().map(|&t| areas[t as usize]).sum::<f64>();
    let mut order: Vec<usize> = (0..seg.regions.len())
        .filter(|&i| {
            let r = &seg.regions[i];
            let body = tri_body[r.tris[0] as usize] as usize;
            area_of(r) < MERGE_AREA * body_area[body]
        })
        .collect();
    order.sort_by(|&a, &b| {
        let (ra, rb) = (&seg.regions[a], &seg.regions[b]);
        rank(ra.surface.kind())
            .cmp(&rank(rb.surface.kind()))
            .then(area_of(ra).total_cmp(&area_of(rb)))
    });
    let mut dead = vec![false; seg.regions.len()];
    // A fragment's neighbours explain it: their surfaces run on past their
    // current regions, often across exactly the strip the fragment holds.
    // Only the rigid kinds do; a cone or torus that fits a strip of a fillet
    // would otherwise explain away the fillet's own cylinder.
    for r in order {
        let around: Vec<usize> = adj[r]
            .iter()
            .copied()
            .filter(|&i| !dead[i] && trusted(seg.regions[i].surface.kind()))
            .collect();
        let pts = &measured.pts[r];
        let explained = pts
            .iter()
            .filter(|&&p| {
                around
                    .iter()
                    .any(|&i| seg.regions[i].surface.distance(p) <= params.tol)
            })
            .count();
        if pts.is_empty() || (explained as f64) < REDUNDANT_SHARE * pts.len() as f64 {
            continue;
        }
        dead[r] = true;
        // Current members: earlier drops may have handed this region triangles.
        for t in 0..seg.region_of.len() {
            if seg.region_of[t] != r as u32 {
                continue;
            }
            let [a, b, c] = mesh.tri(t);
            let centroid = scale(add(add(a, b), c), 1.0 / 3.0);
            let best = around
                .iter()
                .map(|&i| (i, seg.regions[i].surface.distance(centroid)))
                .filter(|&(_, d)| d <= 3.0 * params.tol)
                .min_by(|x, y| x.1.total_cmp(&y.1));
            seg.region_of[t] = best.map_or(u32::MAX, |(i, _)| i as u32);
        }
        // Its neighbours now meet across the triangles it handed them.
        for &n in &around {
            let mut joined: Vec<usize> = adj[n]
                .iter()
                .chain(&around)
                .copied()
                .filter(|&k| k != n && k != r)
                .collect();
            joined.sort_unstable();
            joined.dedup();
            adj[n] = joined;
        }
    }
    let dropped = dead.iter().filter(|&&d| d).count();
    if dropped == 0 {
        return 0;
    }
    let mut remap = vec![u32::MAX; seg.regions.len()];
    let old = std::mem::take(&mut seg.regions);
    for (k, r) in old.into_iter().enumerate() {
        if !dead[k] {
            remap[k] = seg.regions.len() as u32;
            seg.regions.push(r);
        }
    }
    for r in seg.region_of.iter_mut() {
        if *r != u32::MAX {
            *r = remap[*r as usize];
        }
    }
    rebuild_members(seg);
    for r in &mut seg.regions {
        let (pts, _) = samples(mesh, &r.tris);
        r.max_residual = max_residual(&r.surface, &pts);
    }
    seg.unfit_triangles = seg.region_of.iter().filter(|&&r| r == u32::MAX).count();
    dropped
}

/// Regions smaller than this share of their body's area are tried for merging.
const MERGE_AREA: f64 = 0.05;

/// The simplest plane, cylinder or sphere fitting all of `pts` (with their
/// normals) on a scan, if any does. Merges rebuild split fillets and corner
/// balls; a merge into a cone or torus is the noise this undoes.
fn fit_union(pts: &[V3], nrm: &[V3], params: &Params) -> Option<Surface> {
    let stride = pts.len().div_ceil(MAX_REFIT_SAMPLES).max(1);
    let sub_p: Vec<V3> = pts.iter().step_by(stride).copied().collect();
    let sub_n: Vec<V3> = nrm.iter().step_by(stride).copied().collect();
    let extent = crate::math::Bbox::of(pts).diag();
    let mut cands: Vec<Surface> = fit_candidates_where(&sub_p, &sub_n, trusted)
        .into_iter()
        .map(|(c, _)| c)
        .collect();
    cands.sort_by_key(|c| c.kind());
    cands.into_iter().find_map(|c| {
        let c = if c.kind() == Kind::Plane {
            c
        } else {
            refine(c, &sub_p)
        };
        (fits(&c, pts, params.tol, true) && !nearly_flat(&c, pts, extent)).then_some(c)
    })
}

/// Unexplained measured points each side of an adjacent merge must contribute.
const MIN_MERGE_EVIDENCE: usize = 10;

/// On a scan one face can come back as several regions that do not touch: the
/// wall of a disc between the scallops cut into it, a top face split by a
/// boss. Each small region's own fit is tilted by noise, so `merge_equivalent`
/// leaves them apart, and the arrangement would then get nearly coincident
/// patches. Join every pair of regions in one body whose measured points one
/// plane, cylinder or sphere fits. Of two kinds the simpler carries the union:
/// within noise a narrow strip of a cylinder fits a shallow cone as well, and
/// part of a flat face a cylinder of large radius. Returns how many merges
/// were made.
pub fn merge_same_surface(
    mesh: &Mesh,
    seg: &mut Segmentation,
    params: &Params,
    tri_body: &[u32],
    measured: &mut RegionPoints,
) -> usize {
    // Stable ids survive the index shifts of merging, so a pair once found not
    // to share a surface is not tried again until one side changes.
    let mut ids: Vec<usize> = (0..seg.regions.len()).collect();
    let mut next_id = ids.len();
    let mut rejected: std::collections::BTreeSet<(usize, usize)> =
        std::collections::BTreeSet::new();
    let mut merges = 0;
    loop {
        let homes = region_bodies(&seg.regions, tri_body);
        let n = seg.regions.len();
        let mut found = None;
        'pairs: for i in 0..n {
            for j in i + 1..n {
                let key = (ids[i], ids[j]);
                if rejected.contains(&key) {
                    continue;
                }
                match shared_surface(seg, measured, &homes, params, i, j) {
                    Some(s) => {
                        found = Some((i, j, s));
                        break 'pairs;
                    }
                    None => {
                        rejected.insert(key);
                    }
                }
            }
        }
        let Some((i, j, s)) = found else {
            break;
        };
        let mut union = seg.regions[i].tris.clone();
        union.extend_from_slice(&seg.regions[j].tris);
        let (pts, _) = samples(mesh, &union);
        seg.regions[i] = Region {
            surface: s,
            max_residual: max_residual(&s, &pts),
            tris: union,
        };
        seg.regions.remove(j);
        let (pj, nj) = (measured.pts.remove(j), measured.nrm.remove(j));
        measured.pts[i].extend(pj);
        measured.nrm[i].extend(nj);
        for r in seg.region_of.iter_mut() {
            if *r == j as u32 {
                *r = i as u32;
            } else if *r != u32::MAX && *r > j as u32 {
                *r -= 1;
            }
        }
        // The merged region is new to every other one.
        let (gone_i, gone_j) = (ids[i], ids[j]);
        rejected.retain(|&(a, b)| ![a, b].iter().any(|k| *k == gone_i || *k == gone_j));
        ids.remove(j);
        ids[i] = next_id;
        next_id += 1;
        merges += 1;
    }
    merges
}

/// The surface that fits the measured points of regions `i` and `j`, when
/// they are in one body and one plane, cylinder or sphere fits both.
fn shared_surface(
    seg: &Segmentation,
    measured: &RegionPoints,
    homes: &[Vec<u32>],
    params: &Params,
    i: usize,
    j: usize,
) -> Option<Surface> {
    let (si, sj) = (seg.regions[i].surface, seg.regions[j].surface);
    // The simpler kind's surface carries the union; of one kind, the larger's.
    let i_carries = match si.kind().cmp(&sj.kind()) {
        std::cmp::Ordering::Less => true,
        std::cmp::Ordering::Greater => false,
        std::cmp::Ordering::Equal => measured.pts[i].len() >= measured.pts[j].len(),
    };
    let (big, small) = if i_carries { (i, j) } else { (j, i) };
    let carrier = seg.regions[big].surface;
    if !trusted(carrier.kind()) {
        return None;
    }
    if let (Surface::Plane { n: a, .. }, Surface::Plane { n: b, .. }) = (si, sj) {
        if dot(a, b) <= 0.0 {
            return None;
        }
    }
    if !homes[i].iter().any(|b| homes[j].binary_search(b).is_ok()) {
        return None;
    }
    if measured.pts[small].len() < MIN_MERGE_EVIDENCE
        || !fits(&carrier, &measured.pts[small], 2.0 * params.tol, true)
    {
        return None;
    }
    let union: Vec<V3> = measured.pts[big]
        .iter()
        .chain(&measured.pts[small])
        .copied()
        .collect();
    let stride = union.len().div_ceil(MAX_REFIT_SAMPLES).max(1);
    let sample: Vec<V3> = union.iter().step_by(stride).copied().collect();
    let s = match carrier {
        plane @ Surface::Plane { .. } => crate::fit::plane(&union)
            .map(|p| orient_like(p, plane))
            .unwrap_or(plane),
        curved => refine(curved, &sample),
    };
    (fits(&s, &measured.pts[big], params.tol, true)
        && fits(&s, &measured.pts[small], params.tol, true))
    .then_some(s)
}

/// Measured points per region, with their normals: on a scan, the input's own
/// vertices rather than the decimated mesh's (see `merge_adjacent`).
pub struct RegionPoints {
    pub pts: Vec<Vec<V3>>,
    pub nrm: Vec<Vec<V3>>,
}

/// On a scan a fillet's arc can come back as a few strips (chord planes near
/// its tangent seams, a cone between them), each fitting within noise, where
/// one cylinder fits them all. Merge neighbouring regions, smallest first,
/// while one surface fits their union; faces meeting at a real crease never
/// share one. Unions are judged on `measured` points: decimating within the
/// tolerance flattens the start of each fillet, so the decimated vertices fit
/// no single surface there. Returns how many merges were made.
pub fn merge_adjacent(
    mesh: &Mesh,
    topo: &Topology,
    seg: &mut Segmentation,
    params: &Params,
    tri_body: &[u32],
    measured: &mut RegionPoints,
) -> usize {
    let areas: Vec<f64> = (0..mesh.triangles.len()).map(|t| mesh.area(t)).collect();
    let bodies = tri_body.iter().map(|&b| b as usize + 1).max().unwrap_or(0);
    let mut body_area = vec![0.0; bodies];
    for (t, &b) in tri_body.iter().enumerate() {
        body_area[b as usize] += areas[t];
    }
    // Stable ids survive the index shifts of merging, so a pair once found not
    // to share a surface is not tried again until one side changes.
    let mut ids: Vec<usize> = (0..seg.regions.len()).collect();
    let mut next_id = ids.len();
    let mut rejected: std::collections::BTreeSet<(usize, usize)> =
        std::collections::BTreeSet::new();
    let mut merges = 0;
    loop {
        let region_area: Vec<f64> = seg
            .regions
            .iter()
            .map(|r| r.tris.iter().map(|&t| areas[t as usize]).sum())
            .collect();
        let mut pairs: std::collections::BTreeSet<(usize, usize)> = Default::default();
        for t in 0..mesh.triangles.len() {
            let a = seg.region_of[t];
            if a == u32::MAX {
                continue;
            }
            for i in 0..3 {
                if let Some(nb) = topo.neighbor(t, i) {
                    let b = seg.region_of[nb];
                    if b != u32::MAX && b != a {
                        pairs.insert((a.min(b) as usize, a.max(b) as usize));
                    }
                }
            }
        }
        let mut order: Vec<(f64, usize, usize)> = pairs
            .into_iter()
            .filter_map(|(i, j)| {
                let small = region_area[i].min(region_area[j]);
                let body = tri_body[seg.regions[i].tris[0] as usize] as usize;
                (small < MERGE_AREA * body_area[body]).then_some((small, i, j))
            })
            .collect();
        order.sort_by(|x, y| x.0.total_cmp(&y.0));
        let adj = adjacency(mesh, topo, seg);
        let mut done = None;
        for (_, i, j) in order {
            let key = (ids[i], ids[j]);
            if rejected.contains(&key) {
                continue;
            }
            // Only the points no other surface already explains: the measured
            // points under a seam's chords lie partly on the face beside it.
            let around: Vec<usize> = adj[i]
                .iter()
                .chain(&adj[j])
                .copied()
                .filter(|&k| k != i && k != j && trusted(seg.regions[k].surface.kind()))
                .collect();
            let explained = |p: V3| {
                around
                    .iter()
                    .any(|&k| seg.regions[k].surface.distance(p) <= params.tol)
            };
            let all = measured.pts[i].len() + measured.pts[j].len();
            let stride = all.div_ceil(4 * MAX_REFIT_SAMPLES).max(1);
            let (pts, nrm): (Vec<V3>, Vec<V3>) = measured.pts[i]
                .iter()
                .zip(&measured.nrm[i])
                .chain(measured.pts[j].iter().zip(&measured.nrm[j]))
                .step_by(stride)
                .filter(|(p, _)| !explained(**p))
                .map(|(p, n)| (*p, *n))
                .unzip();
            // The union's surface is fitted to these points only, and the merged
            // region takes every triangle of both. A side whose points the other
            // surfaces all explain gives the fit no evidence: its triangles
            // would join a surface they do not lie on.
            let own = |r: usize| measured.pts[r].iter().filter(|p| !explained(**p)).count();
            if pts.len() < 20 || own(i).min(own(j)) < MIN_MERGE_EVIDENCE {
                rejected.insert(key);
                continue;
            }
            // A robust fit lets one point in twenty miss, so a small face beside
            // a large one (the flat end of a long shank) would vanish into it
            // as that twentieth: the surface must fit each side on its own.
            let fits_side = |s: &Surface, r: usize| {
                let side: Vec<V3> = measured.pts[r]
                    .iter()
                    .copied()
                    .filter(|p| !explained(*p))
                    .collect();
                fits(s, &side, params.tol, true)
            };
            match fit_union(&pts, &nrm, params).filter(|s| fits_side(s, i) && fits_side(s, j)) {
                Some(s) => {
                    let mut union = seg.regions[i].tris.clone();
                    union.extend_from_slice(&seg.regions[j].tris);
                    done = Some((i, j, s, union));
                    break;
                }
                None => {
                    rejected.insert(key);
                }
            }
        }
        let Some((i, j, s, union)) = done else {
            break;
        };
        let (pts, _) = samples(mesh, &union);
        seg.regions[i] = Region {
            surface: s,
            max_residual: max_residual(&s, &pts),
            tris: union,
        };
        seg.regions.remove(j);
        let (pj, nj) = (measured.pts.remove(j), measured.nrm.remove(j));
        measured.pts[i].extend(pj);
        measured.nrm[i].extend(nj);
        for r in seg.region_of.iter_mut() {
            if *r == j as u32 {
                *r = i as u32;
            } else if *r != u32::MAX && *r > j as u32 {
                *r -= 1;
            }
        }
        // What the merged surface explains changed for the regions beside it.
        let touched: Vec<usize> = adj[i].iter().chain(&adj[j]).map(|&k| ids[k]).collect();
        rejected.retain(|&(a, b)| !touched.contains(&a) && !touched.contains(&b));
        ids.remove(j);
        ids[i] = next_id;
        next_id += 1;
        merges += 1;
    }
    merges
}

/// Refit each region's surface to `points[region]` (when it has enough of
/// them), keeping a refit only where it still fits. Returns how many moved.
pub fn refit_from(
    mesh: &Mesh,
    seg: &mut Segmentation,
    points: &[Vec<V3>],
    params: &Params,
) -> usize {
    let mut changed = 0;
    for (r, pts) in seg.regions.iter_mut().zip(points) {
        if pts.len() < 20 {
            continue;
        }
        let s = refit(r.surface, pts, params);
        if s != r.surface {
            r.surface = s;
            r.max_residual = max_residual(&s, &samples(mesh, &r.tris).0);
            changed += 1;
        }
    }
    changed
}

/// Share of the mesh area no region covers.
pub fn unfit_area(mesh: &Mesh, seg: &Segmentation) -> f64 {
    let mut total = 0.0;
    let mut unfit = 0.0;
    for (t, &region) in seg.region_of.iter().enumerate().take(mesh.triangles.len()) {
        let a = mesh.area(t);
        total += a;
        if region == u32::MAX {
            unfit += a;
        }
    }
    if total > 0.0 {
        unfit / total
    } else {
        0.0
    }
}

/// Hand unfit triangles to a neighbouring region whose surface accepts them,
/// until none moves: fragments a dissolve removed beside a well-supported
/// surface usually belong to it. Returns how many were absorbed.
pub fn absorb(mesh: &Mesh, topo: &Topology, seg: &mut Segmentation, params: &Params) -> usize {
    let facing = normals(mesh);
    let mut total = 0;
    loop {
        let mut moved = 0;
        for t in 0..mesh.triangles.len() {
            if seg.region_of[t] != u32::MAX {
                continue;
            }
            for i in 0..3 {
                let Some(nb) = topo.neighbor(t, i) else {
                    continue;
                };
                let r = seg.region_of[nb];
                if r == u32::MAX {
                    continue;
                }
                let s = seg.regions[r as usize].surface;
                let reference = match s {
                    Surface::Plane { n, .. } => n,
                    _ => [0.0, 0.0, 1.0],
                };
                if accepts(mesh, &s, t, params, &facing, reference) {
                    seg.region_of[t] = r;
                    seg.regions[r as usize].tris.push(t as u32);
                    moved += 1;
                    break;
                }
            }
        }
        if moved == 0 {
            break;
        }
        total += moved;
    }
    if total > 0 {
        for r in &mut seg.regions {
            r.tris.sort_unstable();
            let (pts, _) = samples(mesh, &r.tris);
            r.max_residual = max_residual(&r.surface, &pts);
        }
        seg.unfit_triangles = seg.region_of.iter().filter(|&&r| r == u32::MAX).count();
    }
    total
}

/// Refit `s` to the samples (planes by PCA, curved surfaces by LM on a
/// subsample) and keep the refit only if every sample stays within `tol`.
fn refit(s: Surface, pts: &[V3], params: &Params) -> Surface {
    let stride = pts.len().div_ceil(MAX_REFIT_SAMPLES).max(1);
    let sub: Vec<V3> = pts.iter().step_by(stride).copied().collect();
    let r = match s.kind() {
        Kind::Plane => crate::fit::plane(pts)
            .map(|p| orient_like(p, s))
            .unwrap_or(s),
        _ => refine(s, &sub),
    };
    if fits(&r, pts, params.tol, params.robust) {
        r
    } else {
        s
    }
}

const MAX_REFIT_SAMPLES: usize = 2000;

/// Grow a region from `seed` on `start`, refitting after each pass, until a
/// pass adds nothing. Only unassigned triangles join.
#[allow(clippy::too_many_arguments)]
fn grow(
    mesh: &Mesh,
    topo: &Topology,
    region_of: &[u32],
    seed: usize,
    start: Surface,
    params: &Params,
    facing: &[Option<V3>],
    reference: V3,
) -> (Surface, Vec<u32>) {
    let mut surface = start;
    let mut inside = std::collections::HashSet::new();
    inside.insert(seed as u32);
    let mut tris = vec![seed as u32];
    for _pass in 0..24 {
        let mut queue = tris.clone();
        let mut added = 0;
        while let Some(t) = queue.pop() {
            for i in 0..3 {
                let Some(nb) = topo.neighbor(t as usize, i) else {
                    continue;
                };
                if region_of[nb] != u32::MAX || inside.contains(&(nb as u32)) {
                    continue;
                }
                if !accepts(mesh, &surface, nb, params, facing, reference) {
                    continue;
                }
                inside.insert(nb as u32);
                tris.push(nb as u32);
                queue.push(nb as u32);
                added += 1;
            }
        }
        if added == 0 {
            break;
        }
        let (pts, _) = samples(mesh, &tris);
        surface = refit(surface, &pts, params);
    }
    (surface, tris)
}

pub fn segment(mesh: &Mesh, topo: &Topology, params: &Params) -> Segmentation {
    let n = mesh.triangles.len();
    let facing = normals(mesh);
    let areas: Vec<f64> = (0..n).map(|t| mesh.area(t)).collect();
    let crease_cos = params.crease_deg.to_radians().cos();
    let smooth = |t: usize, nb: usize| match (facing[t], facing[nb]) {
        (Some(a), Some(b)) => dot(a, b) >= crease_cos,
        _ => true,
    };
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&a, &b| areas[b].total_cmp(&areas[a]));
    let mut region_of = vec![u32::MAX; n];
    let mut regions: Vec<Region> = Vec::new();
    let mut tried = vec![false; n];

    let total_area: f64 = areas.iter().sum();
    let mut claimed = 0.0;
    for &seed in &order {
        if regions.len() >= MAX_REGIONS
            || (regions.len() == EARLY_REGIONS && claimed < 0.25 * total_area)
        {
            break;
        }
        if region_of[seed] != u32::MAX || tried[seed] || facing[seed].is_none() {
            continue;
        }
        tried[seed] = true;
        let hood = neighbourhood(mesh, topo, &region_of, seed, &smooth);
        // One candidate per kind: whatever fits the largest neighbourhood it fits.
        let mut cands: Vec<Surface> = Vec::new();
        for &size in &NEIGHBOURHOOD_SIZES {
            let take = &hood[..size.min(hood.len())];
            let (pts, nrm) = samples(mesh, take);
            let extent = crate::math::Bbox::of(&pts).diag();
            for (s, res) in fit_candidates(&pts, &nrm) {
                if res > params.tol && !(params.robust && fits(&s, &pts, params.tol, true)) {
                    continue;
                }
                if params.robust && nearly_flat(&s, &pts, extent) {
                    continue;
                }
                match cands.iter_mut().find(|c| c.kind() == s.kind()) {
                    Some(c) => *c = s,
                    None => cands.push(s),
                }
            }
            if size >= hood.len() {
                break;
            }
        }
        let reference = facing[seed].unwrap_or([0.0, 0.0, 1.0]);
        // The seed's own plane: the nearest neighbours of a large flat triangle
        // can be the fillet strips beside it rather than the rest of its face.
        if !cands.iter().any(|c| c.kind() == Kind::Plane) {
            let [a, _, _] = mesh.tri(seed);
            cands.push(Surface::Plane {
                n: reference,
                d: dot(reference, a),
            });
        }
        let cands: Vec<Surface> = cands
            .into_iter()
            .map(|c| match c {
                Surface::Plane { n, d } if dot(n, reference) < 0.0 => Surface::Plane {
                    n: scale(n, -1.0),
                    d: -d,
                },
                c => c,
            })
            .collect();
        // The candidate that grows the largest region wins; simpler kinds win ties.
        let mut best: Option<(Surface, Vec<u32>)> = None;
        for c in cands {
            let (s, tris) = grow(mesh, topo, &region_of, seed, c, params, &facing, reference);
            let better = match &best {
                None => true,
                Some((bs, bt)) if params.robust => {
                    // Noise lets a richer surface absorb a few more triangles;
                    // each step up in kind must pay for itself.
                    score(tris.len(), s.kind()) > score(bt.len(), bs.kind())
                }
                Some((bs, bt)) => {
                    tris.len() > bt.len() || (tris.len() == bt.len() && s.kind() < bs.kind())
                }
            };
            if better {
                best = Some((s, tris));
            }
        }
        let Some((surface, tris)) = best else {
            continue;
        };
        let surface = simplest(mesh, &tris, surface, params);
        let id = regions.len() as u32;
        for &t in &tris {
            region_of[t as usize] = id;
            claimed += areas[t as usize];
        }
        let (pts, _) = samples(mesh, &tris);
        let max_res = max_residual(&surface, &pts);
        regions.push(Region {
            surface,
            tris,
            max_residual: max_res,
        });
    }

    merge_equivalent(mesh, topo, &mut regions, &mut region_of, params);
    let unfit_triangles = region_of.iter().filter(|&&r| r == u32::MAX).count();
    Segmentation {
        regions,
        region_of,
        unfit_triangles,
    }
}

/// Unassigned triangles reachable from `seed` across smooth edges, nearest
/// centroid first. Topological (BFS) order would run from a long fillet strip
/// into the finely tessellated corner at its end before reaching the strips
/// beside it, so the fit would never see enough of the fillet.
fn neighbourhood(
    mesh: &Mesh,
    topo: &Topology,
    region_of: &[u32],
    seed: usize,
    smooth: &dyn Fn(usize, usize) -> bool,
) -> Vec<u32> {
    use std::cmp::Reverse;
    use std::collections::BinaryHeap;
    let limit = *NEIGHBOURHOOD_SIZES.last().unwrap_or(&256);
    let centroid = |t: usize| {
        let [a, b, c] = mesh.tri(t);
        scale(add(add(a, b), c), 1.0 / 3.0)
    };
    let origin = centroid(seed);
    let key = |t: usize| {
        let d = dist(centroid(t), origin);
        Reverse((d.to_bits(), t))
    };
    let mut hood = Vec::new();
    let mut seen = std::collections::HashSet::new();
    seen.insert(seed);
    let mut heap = BinaryHeap::new();
    heap.push(key(seed));
    while let Some(Reverse((_, t))) = heap.pop() {
        hood.push(t as u32);
        if hood.len() >= limit {
            break;
        }
        for i in 0..3 {
            if let Some(nb) = topo.neighbor(t, i) {
                if region_of[nb] == u32::MAX && smooth(t, nb) && seen.insert(nb) {
                    heap.push(key(nb));
                }
            }
        }
    }
    hood
}

/// The simplest kind that still fits the grown region. On a CAD tessellation a
/// curved face often has vertices only on its boundary curves (a fillet's two
/// end arcs), which a cylinder and a degenerate torus fit equally well.
fn simplest(mesh: &Mesh, tris: &[u32], s: Surface, params: &Params) -> Surface {
    // Only the flexible kinds degenerate this way on a CAD mesh (a sphere
    // region on a cylinder would need its vertices on one circle); on a scan any
    // curved fit may be a simpler surface plus noise.
    let flexible = matches!(s.kind(), Kind::Torus | Kind::Cone);
    if s.kind() == Kind::Plane || !(flexible || params.robust) {
        return s;
    }
    let (pts, nrm) = samples(mesh, tris);
    let stride = pts.len().div_ceil(MAX_REFIT_SAMPLES).max(1);
    let sub_p: Vec<V3> = pts.iter().step_by(stride).copied().collect();
    let sub_n: Vec<V3> = nrm.iter().step_by(stride).copied().collect();
    let mut cands: Vec<Surface> = fit_candidates(&sub_p, &sub_n)
        .into_iter()
        .map(|(c, _)| c)
        .filter(|c| c.kind() < s.kind())
        .collect();
    cands.sort_by_key(|c| c.kind());
    // Planes elsewhere face the way their triangles do; a plane found here must too.
    let facing = tris.iter().fold([0.0; 3], |acc, &t| {
        let [a, b, c] = mesh.tri(t as usize);
        add(acc, tri_cross(a, b, c))
    });
    let facing_plane = Surface::Plane { n: facing, d: 0.0 };
    for c in cands {
        let c = if c.kind() == Kind::Plane {
            orient_like(c, facing_plane)
        } else {
            refine(c, &sub_p)
        };
        // On a scan the simpler kind wins when it fits about as well.
        let close = params.robust && p95(&c, &pts) <= 1.2 * p95(&s, &pts);
        if close || fits(&c, &pts, params.tol, params.robust) {
            return c;
        }
    }
    s
}

/// Keep a refit plane's normal pointing the way the hypothesis did.
fn orient_like(s: Surface, like: Surface) -> Surface {
    match (s, like) {
        (Surface::Plane { n, d }, Surface::Plane { n: n0, .. }) if dot(n, n0) < 0.0 => {
            Surface::Plane {
                n: scale(n, -1.0),
                d: -d,
            }
        }
        _ => s,
    }
}

/// Merge regions whose surfaces agree: adjacent pieces of one surface split by
/// growth order, and separate faces on the same surface (they must share one
/// patch, or the arrangement would get nearly coincident slivers).
/// How many tolerances a union fit may miss by when it joins two adjacent
/// curved regions (see `merge_equivalent`).
const LOOSE_MERGE: f64 = 2.0;

fn merge_equivalent(
    mesh: &Mesh,
    topo: &Topology,
    regions: &mut Vec<Region>,
    region_of: &mut [u32],
    params: &Params,
) {
    let (tol, robust) = (params.tol, params.robust);
    let mut parent: Vec<usize> = (0..regions.len()).collect();
    fn find(p: &mut [usize], x: usize) -> usize {
        let mut r = x;
        while p[r] != r {
            r = p[r];
        }
        let mut y = x;
        while p[y] != r {
            let nx = p[y];
            p[y] = r;
            y = nx;
        }
        r
    }
    let verts: Vec<Vec<V3>> = regions.iter().map(|r| samples(mesh, &r.tris).0).collect();
    let mut adjacent: std::collections::BTreeSet<(usize, usize)> = Default::default();
    for t in 0..mesh.triangles.len() {
        let a = region_of[t];
        for k in 0..3 {
            if let Some(nb) = topo.neighbor(t, k) {
                let b = region_of[nb];
                if a != u32::MAX && b != u32::MAX && a != b {
                    adjacent.insert((a.min(b) as usize, a.max(b) as usize));
                }
            }
        }
    }
    // Regions joined by a union fit within `LOOSE_MERGE` tolerances rather
    // than by each holding the other's vertices.
    let mut loose = vec![false; regions.len()];
    // On a scan a small fragment's own fit is tilted by noise, so the larger
    // region's surface carrying it is enough. Such a fragment only attaches to
    // one region and never links two: a rim sliver lies on both a face and the
    // hole wall beside it.
    let mut attach: Vec<Option<usize>> = vec![None; regions.len()];
    for i in 0..regions.len() {
        for j in i + 1..regions.len() {
            if regions[i].surface.kind() != regions[j].surface.kind() {
                continue;
            }
            let same_side = match (regions[i].surface, regions[j].surface) {
                (Surface::Plane { n: a, .. }, Surface::Plane { n: b, .. }) => dot(a, b) > 0.0,
                _ => true,
            };
            if !same_side {
                continue;
            }
            let fits_ij = fits(&regions[i].surface, &verts[j], tol, robust);
            let fits_ji = fits(&regions[j].surface, &verts[i], tol, robust);
            // A sliver that growth split off a fillet along its tangent seam has a
            // poorly conditioned fit of its own, and can hold a vertex of the
            // corner blend beside it: refit the union from the larger region and
            // allow that vertex twice the tolerance.
            let one_surface = || {
                regions[i].surface.kind() != Kind::Plane && adjacent.contains(&(i, j)) && {
                    let base = if verts[i].len() >= verts[j].len() {
                        i
                    } else {
                        j
                    };
                    let union = [verts[i].as_slice(), &verts[j]].concat();
                    let stride = union.len().div_ceil(MAX_REFIT_SAMPLES).max(1);
                    let sample: Vec<V3> = union.iter().step_by(stride).copied().collect();
                    fits(
                        &refine(regions[base].surface, &sample),
                        &union,
                        LOOSE_MERGE * tol,
                        robust,
                    )
                }
            };
            let mutual = fits_ij && fits_ji;
            if mutual || one_surface() {
                if !mutual {
                    loose[i] = true;
                    loose[j] = true;
                }
                let (a, b) = (find(&mut parent, i), find(&mut parent, j));
                if a != b {
                    parent[b] = a;
                }
                continue;
            }
            let (big, small, carried) = if verts[i].len() >= verts[j].len() {
                (i, j, fits_ij)
            } else {
                (j, i, fits_ji)
            };
            if robust && carried && verts[small].len() * 5 <= verts[big].len() {
                let better = attach[small].is_none_or(|b| verts[b].len() < verts[big].len());
                if better {
                    attach[small] = Some(big);
                }
            }
        }
    }
    let sizes: Vec<usize> = (0..regions.len())
        .map(|i| {
            let r = find(&mut parent, i);
            (0..regions.len())
                .filter(|&k| find(&mut parent, k) == r)
                .count()
        })
        .collect();
    for (small, big) in attach.iter().enumerate() {
        if let Some(big) = *big {
            if sizes[small] == 1 {
                let (a, b) = (find(&mut parent, big), find(&mut parent, small));
                if a != b {
                    parent[b] = a;
                }
            }
        }
    }
    let mut groups: std::collections::BTreeMap<usize, Vec<usize>> =
        std::collections::BTreeMap::new();
    for i in 0..regions.len() {
        let r = find(&mut parent, i);
        groups.entry(r).or_default().push(i);
    }
    let mut merged: Vec<Region> = Vec::with_capacity(groups.len());
    for (_, members) in groups {
        let mut tris: Vec<u32> = members
            .iter()
            .flat_map(|&m| regions[m].tris.iter().copied())
            .collect();
        tris.sort_unstable();
        // The largest member's fit is the best conditioned start for the group's.
        let lead = members
            .iter()
            .copied()
            .max_by_key(|&m| regions[m].tris.len())
            .unwrap_or(members[0]);
        let base = regions[lead].surface;
        let (pts, _) = samples(mesh, &tris);
        let joined_loosely = members.iter().any(|&m| loose[m]);
        let refit = if members.len() > 1 {
            let r = match base.kind() {
                Kind::Plane => crate::fit::plane(&pts)
                    .map(|p| orient_like(p, base))
                    .unwrap_or(base),
                _ => refine(base, &pts),
            };
            let bound = if joined_loosely {
                LOOSE_MERGE * tol
            } else {
                tol
            };
            if fits(&r, &pts, bound, robust) {
                r
            } else if joined_loosely {
                // No one surface holds the group within the bound its merge
                // allowed: its regions stay apart, each on its own fit.
                for &m in &members {
                    let id = merged.len() as u32;
                    for &t in &regions[m].tris {
                        region_of[t as usize] = id;
                    }
                    merged.push(regions[m].clone());
                }
                continue;
            } else {
                base
            }
        } else {
            base
        };
        let id = merged.len() as u32;
        for &t in &tris {
            region_of[t as usize] = id;
        }
        let max_res = max_residual(&refit, &pts);
        merged.push(Region {
            surface: refit,
            tris,
            max_residual: max_res,
        });
    }
    *regions = merged;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mesh::fixtures::{cube, sphere};

    fn cylinder_mesh(r: f64, h: f64, segs: usize) -> Mesh {
        let mut m = Mesh::default();
        for i in 0..segs {
            let a = 2.0 * std::f64::consts::PI * i as f64 / segs as f64;
            m.positions.push([r * a.cos(), r * a.sin(), 0.0]);
            m.positions.push([r * a.cos(), r * a.sin(), h]);
        }
        let bottom = m.positions.len() as u32;
        m.positions.push([0.0, 0.0, 0.0]);
        let top = bottom + 1;
        m.positions.push([0.0, 0.0, h]);
        for i in 0..segs as u32 {
            let j = (i + 1) % segs as u32;
            let (b0, t0, b1, t1) = (2 * i, 2 * i + 1, 2 * j, 2 * j + 1);
            m.triangles.push([b0, b1, t1]);
            m.triangles.push([b0, t1, t0]);
            m.triangles.push([bottom, b1, b0]);
            m.triangles.push([top, t0, t1]);
        }
        m
    }

    fn kinds(seg: &Segmentation) -> Vec<Kind> {
        let mut k: Vec<Kind> = seg.regions.iter().map(|r| r.surface.kind()).collect();
        k.sort();
        k
    }

    /// A surface of revolution about Z through `rings` (radius, height), open at both ends.
    fn revolved(rings: &[(f64, f64)], segments: usize) -> Mesh {
        let mut positions = Vec::new();
        for &(r, z) in rings {
            for k in 0..segments {
                let t = std::f64::consts::TAU * k as f64 / segments as f64;
                positions.push([20.0 + r * t.cos(), 15.0 + r * t.sin(), z]);
            }
        }
        let mut triangles = Vec::new();
        let s = segments as u32;
        for i in 0..rings.len() as u32 - 1 {
            for k in 0..s {
                let (a, b) = (i * s + k, i * s + (k + 1) % s);
                let (c, d) = (a + s, b + s);
                triangles.push([a, d, b]);
                triangles.push([a, c, d]);
            }
        }
        Mesh {
            positions,
            triangles,
        }
    }

    #[test]
    fn a_coarse_chord_rules_out_a_torus_through_three_rings() {
        // A hole tessellated with only its end rings, under a countersink cone:
        // a torus passes through the hole's two rings and the cone's first one.
        let mut rings = vec![(3.0, 0.0), (3.0, 5.0)];
        for i in 1..=5 {
            let z = 5.0 + 0.6 * i as f64;
            rings.push((3.0 + (z - 5.0), z));
        }
        let mesh = revolved(&rings, 48);
        let topo = Topology::build(&mesh);
        let params = Params {
            tol: 1e-6,
            max_sag: 0.05,
            crease_deg: 50.0,
            robust: false,
        };
        let seg = segment(&mesh, &topo, &params);
        assert_eq!(seg.unfit_triangles, 0);
        let mut kinds = kinds(&seg);
        kinds.sort();
        assert_eq!(kinds, vec![Kind::Cylinder, Kind::Cone]);
    }

    #[test]
    fn an_eight_sided_tube_stays_eight_planes() {
        // An eight-sided cylinder tessellation is the same mesh as an octagonal
        // prism. Read as planes it still rebuilds exactly; reading 45° facets
        // as curves would also turn a chamfered edge into a cylinder.
        let mesh = revolved(&[(10.0, 0.0), (10.0, 10.0)], 8);
        let topo = Topology::build(&mesh);
        let params = Params {
            tol: 1e-6,
            max_sag: 0.03,
            crease_deg: 50.0,
            robust: false,
        };
        let seg = segment(&mesh, &topo, &params);
        assert_eq!(seg.unfit_triangles, 0);
        assert_eq!(kinds(&seg), vec![Kind::Plane; 8]);
    }

    #[test]
    fn freeform_stops_seeding_early() {
        // A finely faceted ellipsoid: no primitive fits more than a few facets,
        // so seeding would otherwise go on once per facet.
        let mut mesh = sphere(10.0, 48, 96);
        for p in &mut mesh.positions {
            p[0] *= 1.6;
        }
        let topo = Topology::build(&mesh);
        let params = Params {
            tol: 1e-9,
            max_sag: f64::INFINITY,
            crease_deg: 50.0,
            robust: false,
        };
        let seg = segment(&mesh, &topo, &params);
        assert!(seg.regions.len() <= EARLY_REGIONS);
        assert!(seg.unfit_triangles > mesh.triangles.len() / 2);
    }

    #[test]
    fn cube_is_six_planes() {
        let m = cube(10.0);
        let seg = segment(
            &m,
            &Topology::build(&m),
            &Params {
                tol: 1e-6,
                max_sag: f64::INFINITY,
                crease_deg: 30.0,
                robust: false,
            },
        );
        assert_eq!(kinds(&seg), vec![Kind::Plane; 6]);
        assert_eq!(seg.unfit_triangles, 0);
    }

    #[test]
    fn capped_cylinder_is_two_planes_and_a_cylinder() {
        let m = cylinder_mesh(5.0, 12.0, 48);
        let seg = segment(
            &m,
            &Topology::build(&m),
            &Params {
                tol: 1e-6,
                max_sag: f64::INFINITY,
                crease_deg: 30.0,
                robust: false,
            },
        );
        assert_eq!(
            kinds(&seg),
            vec![Kind::Plane, Kind::Plane, Kind::Cylinder],
            "{:?}",
            seg.regions
                .iter()
                .map(|r| (r.surface, r.tris.len()))
                .collect::<Vec<_>>()
        );
        let cyl = seg
            .regions
            .iter()
            .find(|r| r.surface.kind() == Kind::Cylinder)
            .unwrap();
        assert_eq!(cyl.tris.len(), 96);
        if let Surface::Cylinder { r, .. } = cyl.surface {
            assert!((r - 5.0).abs() < 1e-9);
        }
    }

    #[test]
    fn tessellated_sphere_is_one_sphere() {
        let m = sphere(7.0, 16, 32);
        let seg = segment(
            &m,
            &Topology::build(&m),
            &Params {
                tol: 1e-6,
                max_sag: f64::INFINITY,
                crease_deg: 30.0,
                robust: false,
            },
        );
        assert_eq!(kinds(&seg), vec![Kind::Sphere]);
    }

    const FLAT: Surface = Surface::Plane {
        n: [0.0, 0.0, 1.0],
        d: 0.0,
    };

    #[test]
    fn a_robust_fit_tolerates_a_few_outliers() {
        let tol = 0.06;
        let mut pts: Vec<V3> = (0..100)
            .map(|i| [i as f64, 0.0, 0.5 * tol * ((i % 3) as f64 - 1.0)])
            .collect();
        for p in pts.iter_mut().take(4) {
            p[2] = 5.0 * tol;
        }
        assert!(fits(&FLAT, &pts, tol, true));
        assert!(!fits(&FLAT, &pts, tol, false));
        // Too few points for a percentile: each may stray two tolerances, no further.
        let few = [[0.0, 0.0, 1.9 * tol], [1.0, 0.0, 0.0], [2.0, 0.0, 0.0]];
        assert!(fits(&FLAT, &few, tol, true));
        assert!(!fits(&FLAT, &[[0.0, 0.0, 2.1 * tol]], tol, true));
    }

    #[test]
    fn min_altitude_is_the_shortest_height() {
        let right = [[0.0, 0.0, 0.0], [3.0, 0.0, 0.0], [0.0, 4.0, 0.0]];
        assert!((min_altitude(right) - 2.4).abs() < 1e-12);
        assert_eq!(min_altitude([[1.0, 1.0, 1.0]; 3]), 0.0);
    }

    /// `n` by `n` cells over a 10 mm square on z = 0, facing +Z.
    fn grid(n: u32) -> Mesh {
        let step = 10.0 / n as f64;
        let mut positions = Vec::new();
        for j in 0..=n {
            for i in 0..=n {
                positions.push([i as f64 * step, j as f64 * step, 0.0]);
            }
        }
        let at = |i: u32, j: u32| j * (n + 1) + i;
        let mut triangles = Vec::new();
        for j in 0..n {
            for i in 0..n {
                triangles.push([at(i, j), at(i + 1, j), at(i + 1, j + 1)]);
                triangles.push([at(i, j), at(i + 1, j + 1), at(i, j + 1)]);
            }
        }
        Mesh {
            positions,
            triangles,
        }
    }

    #[test]
    fn consolidate_folds_fragments_into_the_face_that_accepts_them() {
        let mut mesh = grid(30);
        // A spike no surface accepts: the six triangles around the centre vertex.
        let spike = 15 * 31 + 15;
        mesh.positions[spike as usize][2] = 1.0;
        let tris = mesh.triangles.len();
        let on_spike: Vec<bool> = mesh.triangles.iter().map(|t| t.contains(&spike)).collect();
        let fragment = [0u32, 1];
        let mut region_of = vec![0u32; tris];
        for t in fragment {
            region_of[t as usize] = 1;
        }
        for (t, &s) in on_spike.iter().enumerate() {
            if s {
                region_of[t] = u32::MAX;
            }
        }
        let collect = |k: u32| -> Vec<u32> {
            (0..tris as u32)
                .filter(|&t| region_of[t as usize] == k)
                .collect()
        };
        let mut seg = Segmentation {
            regions: vec![
                Region {
                    surface: FLAT,
                    tris: collect(0),
                    max_residual: 0.0,
                },
                // A noise fragment that fitted its two triangles to a tilted plane.
                Region {
                    surface: Surface::Plane {
                        n: normalize([0.1, 0.0, 1.0]).unwrap(),
                        d: 0.0,
                    },
                    tris: collect(1),
                    max_residual: 0.0,
                },
            ],
            region_of,
            unfit_triangles: 6,
        };
        let params = Params {
            tol: 0.06,
            max_sag: f64::INFINITY,
            crease_deg: 50.0,
            robust: true,
        };
        assert_eq!(consolidate(&mesh, &mut seg, &params, &vec![0; tris]), 1);
        assert_eq!(seg.regions.len(), 1);
        assert_eq!(seg.unfit_triangles, 6);
        assert_eq!(seg.regions[0].tris.len(), tris - 6);
        for (t, &s) in on_spike.iter().enumerate() {
            assert_eq!(seg.region_of[t] == u32::MAX, s);
        }
        let unfit: f64 = (0..tris)
            .filter(|&t| on_spike[t])
            .map(|t| mesh.area(t))
            .sum();
        let total: f64 = (0..tris).map(|t| mesh.area(t)).sum();
        assert!((unfit_area(&mesh, &seg) - unfit / total).abs() < 1e-12);
    }

    #[test]
    fn a_small_hole_is_kept_and_a_small_patch_is_not() {
        // A 400 mm sheet, the whole wall of a 6 mm hole, and a quarter of another.
        let mut mesh = grid(20);
        for p in &mut mesh.positions {
            *p = [40.0 * p[0], 40.0 * p[1], 0.0];
        }
        let sheet = mesh.triangles.len() as u32;
        let rings: Vec<(f64, f64)> = (0..=12).map(|i| (3.0, f64::from(i))).collect();
        let tube = revolved(&rings, 16);
        let mut add_tube = |dx: f64, keep: &dyn Fn(u32) -> bool| -> Vec<u32> {
            let base = mesh.positions.len() as u32;
            mesh.positions
                .extend(tube.positions.iter().map(|p| [p[0] + dx, p[1], p[2]]));
            let first = mesh.triangles.len() as u32;
            for (t, tri) in tube.triangles.iter().enumerate() {
                if keep((t as u32 / 2) % 16) {
                    mesh.triangles.push(tri.map(|v| v + base));
                }
            }
            (first..mesh.triangles.len() as u32).collect()
        };
        let whole = add_tube(0.0, &|_| true);
        let quarter = add_tube(100.0, &|segment| segment < 4);
        let wall = |x: f64| Surface::Cylinder {
            o: [x, 15.0, 0.0],
            a: [0.0, 0.0, 1.0],
            r: 3.0,
        };
        let mut seg = regions_from(
            &mesh,
            vec![
                (FLAT, (0..sheet).collect()),
                (wall(20.0), whole.clone()),
                (wall(120.0), quarter.clone()),
            ],
        );
        let tris = mesh.triangles.len();
        let total: f64 = (0..tris).map(|t| mesh.area(t)).sum();
        let hole: f64 = whole.iter().map(|&t| mesh.area(t as usize)).sum();
        assert!(hole < MAJOR_AREA * total, "the hole must be a minor region");
        let folded = consolidate(&mesh, &mut seg, &scan_params(), &vec![0; tris]);
        assert_eq!(folded, 1);
        assert_eq!(seg.regions.len(), 2);
        assert_eq!(seg.regions[1].surface, wall(20.0));
        assert_eq!(seg.regions[1].tris.len(), whole.len());
        assert!(quarter.iter().all(|&t| seg.region_of[t as usize] != 1));
    }

    #[test]
    fn a_small_body_keeps_its_faces() {
        // A 0.2 mm square plate beside a 10 mm one: 0.04% of the mesh area, but
        // all of its own body. Its triangles also lie on the big plate's plane
        // extended, and must not be handed across.
        let mut mesh = grid(30);
        let big = mesh.triangles.len() as u32;
        let small = grid(2);
        let base = mesh.positions.len() as u32;
        mesh.positions.extend(
            small
                .positions
                .iter()
                .map(|p| [20.0 + 0.02 * p[0], 0.02 * p[1], 0.0]),
        );
        mesh.triangles
            .extend(small.triangles.iter().map(|t| t.map(|v| v + base)));
        let total = mesh.triangles.len() as u32;
        let tri_body: Vec<u32> = (0..total).map(|t| u32::from(t >= big)).collect();
        let mut seg = Segmentation {
            regions: vec![
                Region {
                    surface: FLAT,
                    tris: (0..big).collect(),
                    max_residual: 0.0,
                },
                Region {
                    surface: FLAT,
                    tris: (big..total).collect(),
                    max_residual: 0.0,
                },
            ],
            region_of: (0..total).map(|t| u32::from(t >= big)).collect(),
            unfit_triangles: 0,
        };
        let params = Params {
            tol: 0.06,
            max_sag: f64::INFINITY,
            crease_deg: 50.0,
            robust: true,
        };
        assert_eq!(consolidate(&mesh, &mut seg, &params, &tri_body), 0);
        assert_eq!(seg.regions.len(), 2);
        assert_eq!(seg.regions[1].tris, (big..total).collect::<Vec<_>>());
    }

    /// A 100 mm floor at z = -50 (triangles `0..floor`) and, in the same body,
    /// a quarter-round fillet strip of radius 3 along Z (`floor..`): the floor
    /// keeps the strip small next to its body, as a fillet is next to a part.
    fn floor_and_fillet() -> (Mesh, u32) {
        let mut mesh = grid(10);
        for p in &mut mesh.positions {
            *p = [10.0 * p[0], 10.0 * p[1], -50.0];
        }
        let floor = mesh.triangles.len() as u32;
        let base = mesh.positions.len() as u32;
        let (arcs, rows) = (12u32, 20u32);
        for j in 0..=rows {
            for i in 0..=arcs {
                let t = std::f64::consts::FRAC_PI_2 * f64::from(i) / f64::from(arcs);
                mesh.positions
                    .push([3.0 * t.cos(), 3.0 * t.sin(), f64::from(j)]);
            }
        }
        let at = |i: u32, j: u32| base + j * (arcs + 1) + i;
        for j in 0..rows {
            for i in 0..arcs {
                mesh.triangles
                    .push([at(i, j), at(i + 1, j), at(i + 1, j + 1)]);
                mesh.triangles
                    .push([at(i, j), at(i + 1, j + 1), at(i, j + 1)]);
            }
        }
        (mesh, floor)
    }

    /// Each region's vertices with their exact normals (radial on the strip).
    fn measured_of(mesh: &Mesh, seg: &Segmentation) -> RegionPoints {
        let mut out = RegionPoints {
            pts: Vec::new(),
            nrm: Vec::new(),
        };
        for r in &seg.regions {
            let pts: Vec<V3> = unique_vertices(mesh, &r.tris)
                .into_iter()
                .map(|v| mesh.positions[v as usize])
                .collect();
            let nrm = pts
                .iter()
                .map(|p| {
                    if p[2] < -49.0 {
                        [0.0, 0.0, 1.0]
                    } else {
                        normalize([p[0], p[1], 0.0]).unwrap()
                    }
                })
                .collect();
            out.pts.push(pts);
            out.nrm.push(nrm);
        }
        out
    }

    fn scan_params() -> Params {
        Params {
            tol: 0.05,
            max_sag: f64::INFINITY,
            crease_deg: 50.0,
            robust: true,
        }
    }

    fn regions_from(mesh: &Mesh, parts: Vec<(Surface, Vec<u32>)>) -> Segmentation {
        let mut region_of = vec![u32::MAX; mesh.triangles.len()];
        let regions = parts
            .into_iter()
            .enumerate()
            .map(|(k, (surface, tris))| {
                for &t in &tris {
                    region_of[t as usize] = k as u32;
                }
                Region {
                    surface,
                    tris,
                    max_residual: 0.0,
                }
            })
            .collect();
        Segmentation {
            regions,
            region_of,
            unfit_triangles: 0,
        }
    }

    const FLOOR: Surface = Surface::Plane {
        n: [0.0, 0.0, 1.0],
        d: -50.0,
    };

    #[test]
    fn reassigning_every_triangle_away_drops_the_region() {
        // A fragment fitted 0.03 mm above a face it lies on: each of its
        // triangles is nearer the face, so it is left with none.
        let mesh = grid(10);
        let tris = mesh.triangles.len() as u32;
        let mut seg = regions_from(
            &mesh,
            vec![
                (FLAT, (4..tris).collect()),
                (
                    Surface::Plane {
                        n: [0.0, 0.0, 1.0],
                        d: 0.03,
                    },
                    (0..4).collect(),
                ),
            ],
        );
        let params = Params {
            tol: 0.06,
            ..scan_params()
        };
        assert_eq!(
            reassign(&mesh, &mut seg, &params, &vec![0; tris as usize]),
            4
        );
        assert_eq!(seg.regions.len(), 1);
        assert!(seg.region_of.iter().all(|&r| r == 0));
        assert_eq!(seg.regions[0].tris.len(), tris as usize);
    }

    #[test]
    fn strips_of_one_fillet_merge_into_its_cylinder() {
        let (mesh, floor) = floor_and_fillet();
        let total = mesh.triangles.len() as u32;
        // Split across the arc: each half fitted on its own as a chord plane.
        let half = |lo: bool| -> Vec<u32> {
            (floor..total)
                .filter(|&t| ((t - floor) % 24 < 12) == lo)
                .collect()
        };
        let chord = |tris: &[u32]| crate::fit::plane(&samples(&mesh, tris).0).unwrap();
        let (a, b) = (half(true), half(false));
        let mut seg = regions_from(
            &mesh,
            vec![
                (FLOOR, (0..floor).collect()),
                (chord(&a), a),
                (chord(&b), b),
            ],
        );
        let mut measured = measured_of(&mesh, &seg);
        let topo = Topology::build(&mesh);
        let tri_body = vec![0; mesh.triangles.len()];
        let merges = merge_adjacent(
            &mesh,
            &topo,
            &mut seg,
            &scan_params(),
            &tri_body,
            &mut measured,
        );
        assert_eq!(merges, 1);
        assert_eq!(seg.regions.len(), 2);
        let Surface::Cylinder { r, a, .. } = seg.regions[1].surface else {
            panic!("strips became {:?}", seg.regions[1].surface);
        };
        assert!((r - 3.0).abs() < 1e-6, "radius {r}");
        assert!(a[2].abs() > 1.0 - 1e-9);
    }

    #[test]
    fn a_cone_inside_a_fillet_dissolves_into_its_cylinder() {
        let (mesh, floor) = floor_and_fillet();
        let total = mesh.triangles.len() as u32;
        let cylinder = Surface::Cylinder {
            o: [0.0, 0.0, 0.0],
            a: [0.0, 0.0, 1.0],
            r: 3.0,
        };
        // A few rows in the middle of the strip, fitted as a wide cone.
        let middle: Vec<u32> = (floor + 8 * 24..floor + 12 * 24).collect();
        let rest: Vec<u32> = (floor..total).filter(|t| !middle.contains(t)).collect();
        let cone = Surface::Cone {
            apex: [0.0, 0.0, -40.0],
            a: [0.0, 0.0, 1.0],
            half_angle: 0.06,
        };
        let parts = |fragment: Surface, host: Surface| {
            vec![
                (FLOOR, (0..floor).collect()),
                (host, rest.clone()),
                (fragment, middle.clone()),
            ]
        };
        let topo = Topology::build(&mesh);
        let tri_body = vec![0; mesh.triangles.len()];

        let mut seg = regions_from(&mesh, parts(cone, cylinder));
        let measured = measured_of(&mesh, &seg);
        let dropped =
            dissolve_redundant(&mesh, &topo, &mut seg, &scan_params(), &tri_body, &measured);
        assert_eq!(dropped, 1);
        assert_eq!(seg.regions.len(), 2);
        assert_eq!(seg.regions[1].surface, cylinder);
        assert_eq!(seg.regions[1].tris.len(), (total - floor) as usize);

        // The other way round, the cone goes and the cylinder takes the strip:
        // a cone never explains a neighbour, so it can't swallow the fillet.
        let mut seg = regions_from(&mesh, parts(cylinder, cone));
        let measured = measured_of(&mesh, &seg);
        let dropped =
            dissolve_redundant(&mesh, &topo, &mut seg, &scan_params(), &tri_body, &measured);
        assert_eq!(dropped, 1);
        assert_eq!(seg.regions.len(), 2);
        assert_eq!(seg.regions[1].surface, cylinder);
        assert_eq!(seg.regions[1].tris.len(), (total - floor) as usize);
    }

    /// Which arc column (0..12) of `floor_and_fillet`'s strip a triangle is in.
    fn column(t: u32, floor: u32) -> u32 {
        ((t - floor) % 24) / 2
    }

    const FILLET: Surface = Surface::Cylinder {
        o: [0.0, 0.0, 0.0],
        a: [0.0, 0.0, 1.0],
        r: 3.0,
    };

    /// Two parts of the strip with a gap between them, the second fitted as `other`.
    fn split_strip(other: Surface) -> (Mesh, Segmentation, usize) {
        let (mesh, floor) = floor_and_fillet();
        let total = mesh.triangles.len() as u32;
        let part = |keep: &dyn Fn(u32) -> bool| -> Vec<u32> {
            (floor..total).filter(|&t| keep(column(t, floor))).collect()
        };
        let (a, b) = (part(&|c| c < 4), part(&|c| c >= 8));
        let both = a.len() + b.len();
        let seg = regions_from(
            &mesh,
            vec![(FLOOR, (0..floor).collect()), (FILLET, a), (other, b)],
        );
        (mesh, seg, both)
    }

    #[test]
    fn faces_of_one_surface_that_do_not_touch_merge() {
        // The second part's own fit is a little off, as noise leaves it.
        let (mesh, mut seg, both) = split_strip(Surface::Cylinder {
            o: [0.005, -0.005, 0.0],
            a: [0.0, 0.0, 1.0],
            r: 3.01,
        });
        let mut measured = measured_of(&mesh, &seg);
        let tri_body = vec![0; mesh.triangles.len()];
        let merges = merge_same_surface(&mesh, &mut seg, &scan_params(), &tri_body, &mut measured);
        assert_eq!(merges, 1);
        assert_eq!(seg.regions.len(), 2);
        assert_eq!(seg.regions[0].surface, FLOOR);
        let Surface::Cylinder { r, .. } = seg.regions[1].surface else {
            panic!("the parts became {:?}", seg.regions[1].surface);
        };
        assert!((r - 3.0).abs() < 1e-6, "radius {r}");
        assert_eq!(seg.regions[1].tris.len(), both);
        assert_eq!(measured.pts.len(), 2);
    }

    #[test]
    fn a_shallow_cone_strip_joins_the_cylinder_it_lies_on() {
        // Over 20 mm this cone is within 0.02 mm of the cylinder.
        let (mesh, mut seg, both) = split_strip(Surface::Cone {
            apex: [0.0, 0.0, 3.0 / 0.001f64.tan()],
            a: [0.0, 0.0, -1.0],
            half_angle: 0.001,
        });
        let mut measured = measured_of(&mesh, &seg);
        let tri_body = vec![0; mesh.triangles.len()];
        let merges = merge_same_surface(&mesh, &mut seg, &scan_params(), &tri_body, &mut measured);
        assert_eq!(merges, 1);
        assert_eq!(seg.regions[1].surface.kind(), Kind::Cylinder);
        assert_eq!(seg.regions[1].tris.len(), both);
    }

    #[test]
    fn part_of_a_flat_face_fitted_as_a_wide_cylinder_joins_the_plane() {
        // Half of a 10 mm sheet, fitted to a cylinder of 2 m radius that noise allows.
        let mesh = grid(10);
        let tris = mesh.triangles.len() as u32;
        let wide = Surface::Cylinder {
            o: [0.0, 0.0, -2000.0],
            a: [0.0, 1.0, 0.0],
            r: 2000.0,
        };
        let mut seg = regions_from(
            &mesh,
            vec![
                (FLAT, (0..tris / 2).collect()),
                (wide, (tris / 2..tris).collect()),
            ],
        );
        let pts = |r: &Region| -> Vec<V3> {
            unique_vertices(&mesh, &r.tris)
                .into_iter()
                .map(|v| mesh.positions[v as usize])
                .collect()
        };
        let mut measured = RegionPoints {
            pts: seg.regions.iter().map(pts).collect(),
            nrm: Vec::new(),
        };
        measured.nrm = measured
            .pts
            .iter()
            .map(|p| vec![[0.0, 0.0, 1.0]; p.len()])
            .collect();
        let tri_body = vec![0; mesh.triangles.len()];
        let merges = merge_same_surface(&mesh, &mut seg, &scan_params(), &tri_body, &mut measured);
        assert_eq!(merges, 1);
        assert_eq!(seg.regions.len(), 1);
        assert_eq!(seg.regions[0].surface.kind(), Kind::Plane);
        assert_eq!(seg.regions[0].tris.len(), tris as usize);
    }

    #[test]
    fn a_chord_across_a_crease_is_released_from_the_face_it_came_with() {
        // A sheet, and one triangle from it to a point 4 mm above it.
        let mut mesh = grid(10);
        let sheet = mesh.triangles.len() as u32;
        let apex = mesh.positions.len() as u32;
        mesh.positions.push([10.0, 5.0, 4.0]);
        mesh.triangles.push([10, 21, apex]);
        let mut seg = regions_from(&mesh, vec![(FLAT, (0..=sheet).collect())]);
        assert_eq!(release_misfits(&mesh, &mut seg, &scan_params()), 1);
        assert_eq!(seg.region_of[sheet as usize], u32::MAX);
        assert_eq!(seg.unfit_triangles, 1);
        assert_eq!(seg.regions[0].tris.len(), sheet as usize);
        assert!(seg.regions[0].max_residual < 1e-12);
        // Nothing more to release.
        assert_eq!(release_misfits(&mesh, &mut seg, &scan_params()), 0);
    }

    #[test]
    fn coaxial_cylinders_of_different_radius_stay_apart() {
        let (mesh, mut seg, _) = split_strip(Surface::Cylinder {
            o: [0.0, 0.0, 0.0],
            a: [0.0, 0.0, 1.0],
            r: 3.5,
        });
        // The second part's points lie on its own cylinder.
        let mut measured = measured_of(&mesh, &seg);
        for p in &mut measured.pts[2] {
            let k = 3.5 / 3.0;
            *p = [k * p[0], k * p[1], p[2]];
        }
        let tri_body = vec![0; mesh.triangles.len()];
        let merges = merge_same_surface(&mesh, &mut seg, &scan_params(), &tri_body, &mut measured);
        assert_eq!(merges, 0);
        assert_eq!(seg.regions.len(), 3);
    }

    /// A tube about Z with a flat ring across its top: wall rings every
    /// `step` mm up to `h`, then two rings of the cap. Returns the mesh, its
    /// first cap triangle, and the measured points of [wall, cap] regions
    /// split at that triangle.
    fn capped_tube(h: f64, step: f64, segments: usize) -> (Mesh, u32) {
        let n = (h / step).round() as usize;
        let mut rings: Vec<(f64, f64)> = (0..=n).map(|i| (6.0, i as f64 * step)).collect();
        rings.push((4.0, h));
        rings.push((2.0, h));
        let mesh = revolved(&rings, segments);
        (mesh, (n * segments * 2) as u32)
    }

    /// Each region's vertices: radial normals on a wall, +Z on the cap at `h`.
    fn tube_points(mesh: &Mesh, seg: &Segmentation) -> RegionPoints {
        let mut out = RegionPoints {
            pts: Vec::new(),
            nrm: Vec::new(),
        };
        for r in &seg.regions {
            let flat = r.surface.kind() == Kind::Plane;
            let pts: Vec<V3> = unique_vertices(mesh, &r.tris)
                .into_iter()
                .map(|v| mesh.positions[v as usize])
                .collect();
            let nrm = pts
                .iter()
                .map(|p| {
                    if flat {
                        [0.0, 0.0, 1.0]
                    } else {
                        normalize([p[0] - 20.0, p[1] - 15.0, 0.0]).unwrap()
                    }
                })
                .collect();
            out.pts.push(pts);
            out.nrm.push(nrm);
        }
        out
    }

    const TUBE: Surface = Surface::Cylinder {
        o: [20.0, 15.0, 0.0],
        a: [0.0, 0.0, 1.0],
        r: 6.0,
    };

    #[test]
    fn a_small_face_does_not_vanish_into_the_large_one_beside_it() {
        // The cap holds under 2% of the points, fewer than a robust fit lets miss.
        let (mesh, cap) = capped_tube(100.0, 0.5, 48);
        let total = mesh.triangles.len() as u32;
        let top = Surface::Plane {
            n: [0.0, 0.0, 1.0],
            d: 100.0,
        };
        let mut seg = regions_from(
            &mesh,
            vec![(TUBE, (0..cap).collect()), (top, (cap..total).collect())],
        );
        let mut measured = tube_points(&mesh, &seg);
        let topo = Topology::build(&mesh);
        let tri_body = vec![0; mesh.triangles.len()];
        let merges = merge_adjacent(
            &mesh,
            &topo,
            &mut seg,
            &scan_params(),
            &tri_body,
            &mut measured,
        );
        assert_eq!(merges, 0);
        assert_eq!(seg.regions.len(), 2);
    }

    #[test]
    fn a_face_another_region_explains_does_not_join_its_neighbour() {
        // A narrow patch of the wall and the rest of it, apart, both under the cap.
        let (mesh, cap) = capped_tube(20.0, 1.0, 48);
        let total = mesh.triangles.len() as u32;
        let seg_of = |t: u32| (t / 2) % 48;
        let patch: Vec<u32> = (0..cap).filter(|&t| seg_of(t) < 2).collect();
        let rest: Vec<u32> = (0..cap)
            .filter(|&t| (12..42).contains(&seg_of(t)))
            .collect();
        let top = Surface::Plane {
            n: [0.0, 0.0, 1.0],
            d: 20.0,
        };
        let mut seg = regions_from(
            &mesh,
            vec![(top, (cap..total).collect()), (TUBE, patch), (TUBE, rest)],
        );
        let mut measured = tube_points(&mesh, &seg);
        let topo = Topology::build(&mesh);
        let tri_body = vec![0; mesh.triangles.len()];
        let merges = merge_adjacent(
            &mesh,
            &topo,
            &mut seg,
            &scan_params(),
            &tri_body,
            &mut measured,
        );
        assert_eq!(merges, 0);
        assert_eq!(seg.regions.len(), 3);
    }
}
