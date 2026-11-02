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

use crate::fit::{fit_candidates, max_residual, refine, Kind, Surface};
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
    /// Edges sharper than this separate neighbourhoods.
    pub crease_deg: f64,
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

fn within(s: &Surface, pts: &[V3], tol: f64) -> bool {
    pts.iter().all(|&p| s.distance(p) <= tol)
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
    tol: f64,
    facing: &[Option<V3>],
    reference: V3,
) -> bool {
    let tri = mesh.tri(t);
    if !tri.iter().all(|&p| s.distance(p) <= tol) {
        return false;
    }
    match (s, facing[t]) {
        (Surface::Plane { .. }, Some(n)) => dot(n, reference) > 0.0,
        (_, Some(n)) => tri.iter().all(|&p| {
            s.near_singular(p, APEX_REACH * tol)
                || s.normal(p)
                    .is_none_or(|sn| dot(sn, n).abs() >= MIN_FACET_COS)
        }),
        _ => true,
    }
}

/// A tessellator never lets a facet turn more than this from the surface it
/// approximates (CAD exporters stay well under it). Without the limit, a large
/// flat face plus one fillet strip (three parallel lines) fits a cylinder.
const MIN_FACET_COS: f64 = std::f64::consts::FRAC_1_SQRT_2;

/// How close to a cone's apex (in fit tolerances) the facet normal check is skipped.
pub const APEX_REACH: f64 = 10.0;

/// Hand unfit triangles to a neighbouring region whose surface accepts them,
/// until none moves: fragments a dissolve removed beside a well-supported
/// surface usually belong to it. Returns how many were absorbed.
pub fn absorb(mesh: &Mesh, topo: &Topology, seg: &mut Segmentation, tol: f64) -> usize {
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
                if accepts(mesh, &s, t, tol, &facing, reference) {
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
fn refit(s: Surface, pts: &[V3], tol: f64) -> Surface {
    let stride = pts.len().div_ceil(MAX_REFIT_SAMPLES).max(1);
    let sub: Vec<V3> = pts.iter().step_by(stride).copied().collect();
    let r = match s.kind() {
        Kind::Plane => crate::fit::plane(pts)
            .map(|p| orient_like(p, s))
            .unwrap_or(s),
        _ => refine(s, &sub),
    };
    if max_residual(&r, pts) <= tol {
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
    tol: f64,
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
                if !accepts(mesh, &surface, nb, tol, facing, reference) {
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
        surface = refit(surface, &pts, tol);
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
            for (s, res) in fit_candidates(&pts, &nrm) {
                if res > params.tol {
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
            let (s, tris) = grow(
                mesh, topo, &region_of, seed, c, params.tol, &facing, reference,
            );
            let better = match &best {
                None => true,
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
        let surface = simplest(mesh, &tris, surface, params.tol);
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

    merge_equivalent(mesh, topo, &mut regions, &mut region_of, params.tol);
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
fn simplest(mesh: &Mesh, tris: &[u32], s: Surface, tol: f64) -> Surface {
    // Only the flexible kinds degenerate this way; a sphere region on a
    // cylinder would need its vertices on one circle.
    if !matches!(s.kind(), Kind::Torus | Kind::Cone) {
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
    for c in cands {
        let c = if c.kind() == Kind::Plane {
            c
        } else {
            refine(c, &sub_p)
        };
        if max_residual(&c, &pts) <= tol {
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
fn merge_equivalent(
    mesh: &Mesh,
    _topo: &Topology,
    regions: &mut Vec<Region>,
    region_of: &mut [u32],
    tol: f64,
) {
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
    for i in 0..regions.len() {
        for j in i + 1..regions.len() {
            if regions[i].surface.kind() != regions[j].surface.kind() {
                continue;
            }
            let fits_ij = within(&regions[i].surface, &verts[j], tol);
            let fits_ji = fits_ij && within(&regions[j].surface, &verts[i], tol);
            let same_side = match (regions[i].surface, regions[j].surface) {
                (Surface::Plane { n: a, .. }, Surface::Plane { n: b, .. }) => dot(a, b) > 0.0,
                _ => true,
            };
            if fits_ij && fits_ji && same_side {
                let (a, b) = (find(&mut parent, i), find(&mut parent, j));
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
        let base = regions[members[0]].surface;
        let (pts, _) = samples(mesh, &tris);
        let refit = if members.len() > 1 {
            let r = match base.kind() {
                Kind::Plane => crate::fit::plane(&pts)
                    .map(|p| orient_like(p, base))
                    .unwrap_or(base),
                _ => refine(base, &pts),
            };
            if max_residual(&r, &pts) <= tol {
                r
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
            crease_deg: 50.0,
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
                crease_deg: 30.0,
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
                crease_deg: 30.0,
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
                crease_deg: 30.0,
            },
        );
        assert_eq!(kinds(&seg), vec![Kind::Sphere]);
    }
}
