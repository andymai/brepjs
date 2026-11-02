//! Tier 0: merge coplanar triangles into planar polygon regions.
//!
//! Regions grow across manifold edges while every vertex stays within `tol` of
//! the region plane. Vertices shared by merged regions are then snapped onto
//! the intersection of those planes so each polygon is planar to machine
//! precision, and vertices that only interrupt a straight edge between two
//! polygons are dropped from both. Each region carries a triangulation of its
//! final loops, so a consumer that can't build the polygon face still gets a
//! watertight result with identical geometry.

use std::collections::HashMap;

use crate::earcut;
use crate::math::{add, dist, dot, fit_plane, normalize, scale, sub, sym_eigen, tri_cross, V3};
use crate::mesh::{Mesh, Topology};
use crate::repair::Component;

#[derive(Clone, Debug)]
pub struct Region {
    /// Outer loop first (counter-clockwise about `normal`), then holes. Empty
    /// when the region must be built from `triangles` instead.
    pub loops: Vec<Vec<u32>>,
    /// Triangulation of `loops` (or the region's own triangles when `loops` is
    /// empty), wound counter-clockwise about `normal`.
    pub triangles: Vec<[u32; 3]>,
    pub normal: V3,
    pub body: u32,
    pub source_triangles: usize,
    pub max_deviation: f64,
    /// Lowest input triangle index in the region; regions are emitted in this
    /// order so the output keeps the input's spatial locality.
    pub first_source: u32,
}

pub struct RegionMesh {
    pub positions: Vec<V3>,
    pub regions: Vec<Region>,
    pub snapped_vertices: usize,
    pub max_snap: f64,
    pub dropped_vertices: usize,
    pub triangle_fallback_regions: usize,
    /// Triangles taken out of merged regions because snapping couldn't put
    /// their vertices on the region's plane.
    pub non_planar_triangles: usize,
    /// Vertices left unsnapped so a coplanar set's boundary wouldn't touch itself.
    pub unpinched_vertices: usize,
}

struct Grown {
    tris: Vec<u32>,
    normal: V3,
    offset: f64,
}

fn grow(mesh: &Mesh, topo: &Topology, tol: f64) -> (Vec<Grown>, Vec<u32>) {
    let n = mesh.triangles.len();
    let areas: Vec<f64> = (0..n).map(|t| mesh.area(t)).collect();
    let normals: Vec<Option<V3>> = (0..n)
        .map(|t| {
            let [a, b, c] = mesh.tri(t);
            normalize(tri_cross(a, b, c))
        })
        .collect();
    let mut order: Vec<usize> = (0..n).filter(|&t| normals[t].is_some()).collect();
    order.sort_by(|&a, &b| areas[b].total_cmp(&areas[a]));
    let mut region_of = vec![u32::MAX; n];
    let mut regions: Vec<Grown> = Vec::new();
    let mut queue = Vec::new();
    for seed in order {
        if region_of[seed] != u32::MAX {
            continue;
        }
        let id = regions.len() as u32;
        let Some(n0) = normals[seed] else { continue };
        let [a0, b0, c0] = mesh.tri(seed);
        let mut sum_n = scale(n0, areas[seed]);
        let mut sum_c = scale(add(add(a0, b0), c0), areas[seed] / 3.0);
        let mut sum_a = areas[seed];
        let mut normal = n0;
        let mut offset = dot(n0, a0);
        let mut tris = vec![seed as u32];
        region_of[seed] = id;
        queue.clear();
        queue.push(seed);
        while let Some(t) = queue.pop() {
            for i in 0..3 {
                let Some(nb) = topo.neighbor(t, i) else {
                    continue;
                };
                if region_of[nb] != u32::MAX {
                    continue;
                }
                let pts = mesh.tri(nb);
                let fits = pts.iter().all(|&p| (dot(normal, p) - offset).abs() <= tol);
                let facing = normals[nb].is_none_or(|nn| dot(nn, normal) > 0.0);
                if !(fits && facing) {
                    continue;
                }
                region_of[nb] = id;
                tris.push(nb as u32);
                queue.push(nb);
                if let Some(nn) = normals[nb] {
                    sum_n = add(sum_n, scale(nn, areas[nb]));
                    sum_c = add(
                        sum_c,
                        scale(add(add(pts[0], pts[1]), pts[2]), areas[nb] / 3.0),
                    );
                    sum_a += areas[nb];
                    if let Some(nrm) = normalize(sum_n) {
                        normal = nrm;
                        offset = dot(nrm, scale(sum_c, 1.0 / sum_a));
                    }
                }
            }
        }
        regions.push(Grown {
            tris,
            normal,
            offset,
        });
    }
    // Zero-area triangles join a neighboring region whose plane holds them, else stand alone.
    for t in 0..n {
        if region_of[t] != u32::MAX {
            continue;
        }
        let pts = mesh.tri(t);
        let host = (0..3).filter_map(|i| topo.neighbor(t, i)).find(|&nb| {
            let r = region_of[nb];
            r != u32::MAX && {
                let g = &regions[r as usize];
                pts.iter()
                    .all(|&p| (dot(g.normal, p) - g.offset).abs() <= tol)
            }
        });
        match host {
            Some(nb) => {
                let r = region_of[nb];
                region_of[t] = r;
                regions[r as usize].tris.push(t as u32);
            }
            None => {
                region_of[t] = regions.len() as u32;
                regions.push(Grown {
                    tris: vec![t as u32],
                    normal: [0.0, 0.0, 1.0],
                    offset: 0.0,
                });
            }
        }
    }
    (regions, region_of)
}

/// Boundary loops of one region by walking the triangle fan around each
/// boundary vertex, so pinch vertices yield separate loops.
fn region_loops(
    mesh: &Mesh,
    topo: &Topology,
    region_of: &[u32],
    rid: u32,
    tris: &[u32],
) -> Option<Vec<Vec<u32>>> {
    set_loops(mesh, topo, &|t: usize| region_of[t] == rid, tris)
}

/// Boundary loops of the triangle set `tris` (membership by `in_region`).
fn set_loops(
    mesh: &Mesh,
    topo: &Topology,
    in_region: &dyn Fn(usize) -> bool,
    tris: &[u32],
) -> Option<Vec<Vec<u32>>> {
    let is_boundary = |t: usize, i: usize| topo.neighbor(t, i).is_none_or(|nb| !in_region(nb));
    let mut used: HashMap<(u32, u8), bool> = HashMap::new();
    for &t in tris {
        for i in 0..3 {
            if is_boundary(t as usize, i) {
                used.insert((t, i as u8), false);
            }
        }
    }
    let mut starts: Vec<(u32, u8)> = used.keys().copied().collect();
    starts.sort_unstable();
    let mut loops = Vec::new();
    for start in starts {
        if used[&start] {
            continue;
        }
        let mut lp = Vec::new();
        let (mut t, mut i) = (start.0 as usize, start.1 as usize);
        let limit = used.len() + 1;
        loop {
            used.insert((t as u32, i as u8), true);
            lp.push(mesh.triangles[t][i]);
            if lp.len() > limit {
                return None;
            }
            // Advance to the next boundary half-edge leaving this half-edge's end vertex.
            let mut ct = t;
            let mut ci = (i + 1) % 3;
            let mut spins = 0;
            while !is_boundary(ct, ci) {
                let nb = topo.neighbor(ct, ci)?;
                let b = mesh.triangles[ct][ci];
                let j = (0..3).find(|&j| mesh.triangles[nb][j] == b)?;
                ct = nb;
                ci = j;
                spins += 1;
                if spins > 4096 {
                    return None;
                }
            }
            t = ct;
            i = ci;
            if (t as u32, i as u8) == start {
                break;
            }
            if used.get(&(t as u32, i as u8)) != Some(&false) {
                return None;
            }
        }
        loops.push(lp);
    }
    Some(loops)
}

fn loop_area(pts: &[V3], normal: V3) -> f64 {
    let mut s = [0.0; 3];
    for i in 0..pts.len() {
        s = add(s, crate::math::cross(pts[i], pts[(i + 1) % pts.len()]));
    }
    0.5 * dot(s, normal)
}

/// Move `x0` onto the given planes as far as possible while moving at most
/// `cap`. Planes come with a weight; of several planes whose normals agree
/// within `distinct_cos` only the heaviest constrains the vertex, because their
/// intersection is ill-conditioned and would throw the vertex far away.
fn snap(x0: V3, planes: &[(V3, f64, usize)], cap: f64, distinct_cos: f64) -> V3 {
    let mut order: Vec<&(V3, f64, usize)> = planes.iter().collect();
    order.sort_by_key(|p| std::cmp::Reverse(p.2));
    let mut kept: Vec<(V3, f64)> = Vec::with_capacity(3);
    for &&(n, d, _) in &order {
        if kept.iter().all(|&(k, _)| dot(k, n).abs() < distinct_cos) {
            kept.push((n, d));
        }
    }
    let mut a = [[0.0; 3]; 3];
    let mut b = [0.0; 3];
    for &(n, d) in &kept {
        for r in 0..3 {
            for c in 0..3 {
                a[r][c] += n[r] * n[c];
            }
            b[r] += n[r] * d;
        }
    }
    let ax0 = [dot(a[0], x0), dot(a[1], x0), dot(a[2], x0)];
    let rhs = sub(b, ax0);
    let (vals, vecs) = sym_eigen(a);
    let lmax = vals[2].max(f64::MIN_POSITIVE);
    let mut tau = 1e-12;
    while tau <= 1.0 {
        let mut delta = [0.0; 3];
        for k in 0..3 {
            if vals[k] > tau * lmax {
                delta = add(delta, scale(vecs[k], dot(vecs[k], rhs) / vals[k]));
            }
        }
        if crate::math::norm(delta) <= cap {
            return add(x0, delta);
        }
        tau *= 100.0;
    }
    x0
}

/// Un-snap the vertices of every triangle in `suspects` that `bad` flags, then
/// re-check their neighbors, until nothing folds. Returns whether any moved.
fn revert_folds(
    mesh: &Mesh,
    vtris: &[Vec<u32>],
    bad: &dyn Fn(usize, &[V3]) -> bool,
    positions: &mut [V3],
    mut suspects: Vec<usize>,
) -> bool {
    let mut changed = false;
    for _round in 0..16 {
        let folded: Vec<usize> = suspects
            .iter()
            .copied()
            .filter(|&t| bad(t, positions))
            .collect();
        if folded.is_empty() {
            break;
        }
        let mut next = Vec::new();
        for t in folded {
            for v in mesh.triangles[t] {
                let vi = v as usize;
                if positions[vi] != mesh.positions[vi] {
                    positions[vi] = mesh.positions[vi];
                    changed = true;
                    next.extend(vtris[vi].iter().map(|&x| x as usize));
                }
            }
        }
        next.sort_unstable();
        next.dedup();
        suspects = next;
    }
    changed
}

/// What `unpinch_once` needs to see the coplanar sets the kernel will unify.
struct SnapView<'a> {
    planes: &'a [(V3, f64)],
    merged: &'a [bool],
    region_of: &'a [u32],
    vregions: &'a [Vec<u32>],
    planar_eps: f64,
}

/// The kernel later unifies every edge-connected set of exactly coplanar
/// triangles into one face, including loose triangles whose vertices all
/// landed on a region's plane. Where such a set's boundary touches itself at a
/// vertex the face would be pinched (invalid), so un-snap that vertex. Returns
/// the vertices un-snapped this round.
fn unpinch_once(mesh: &Mesh, topo: &Topology, view: &SnapView, positions: &mut [V3]) -> Vec<u32> {
    let on = |r: usize, t: usize, positions: &[V3]| {
        let (n, d) = view.planes[r];
        mesh.triangles[t]
            .iter()
            .all(|&v| (dot(n, positions[v as usize]) - d).abs() <= view.planar_eps)
    };
    let plane_of: Vec<u32> = (0..mesh.triangles.len())
        .map(|t| {
            let own = view.region_of[t] as usize;
            if view.merged[own] && on(own, t, positions) {
                return own as u32;
            }
            mesh.triangles[t]
                .iter()
                .flat_map(|&v| view.vregions[v as usize].iter().copied())
                .find(|&r| view.merged[r as usize] && on(r as usize, t, positions))
                .unwrap_or(u32::MAX)
        })
        .collect();
    let mut visited = vec![false; mesh.triangles.len()];
    let mut pinches: Vec<u32> = Vec::new();
    for s in 0..mesh.triangles.len() {
        if visited[s] || plane_of[s] == u32::MAX {
            continue;
        }
        let key = plane_of[s];
        visited[s] = true;
        let mut set = vec![s as u32];
        let mut k = 0;
        while k < set.len() {
            let t = set[k] as usize;
            k += 1;
            for i in 0..3 {
                if let Some(nb) = topo.neighbor(t, i) {
                    if !visited[nb] && plane_of[nb] == key {
                        visited[nb] = true;
                        set.push(nb as u32);
                    }
                }
            }
        }
        if set.len() < 2 {
            continue;
        }
        let member = |t: usize| plane_of[t] == key && visited[t];
        match set_loops(mesh, topo, &member, &set) {
            Some(lps) => {
                let mut count: HashMap<u32, u32> = HashMap::new();
                for &v in lps.iter().flatten() {
                    *count.entry(v).or_default() += 1;
                }
                pinches.extend(count.into_iter().filter(|&(_, c)| c > 1).map(|(v, _)| v));
            }
            None => pinches.extend(set.iter().flat_map(|&t| mesh.triangles[t as usize])),
        }
    }
    pinches.sort_unstable();
    pinches.dedup();
    pinches.retain(|&v| {
        let vi = v as usize;
        if positions[vi] != mesh.positions[vi] {
            positions[vi] = mesh.positions[vi];
            true
        } else {
            false
        }
    });
    pinches
}

/// Regions whose loops total more vertices than this keep their own triangles.
const MAX_EARCUT_REGION: usize = 8192;

/// Each failed triangulation restores that region's vertices and retriangulates
/// every region; past this many rounds all polygons fall back to triangles.
const MAX_TRIANGULATION_ROUNDS: usize = 16;

/// Douglas-Peucker over `chain[lo..=hi]`, marking kept interior points.
fn dp(pts: &[V3], lo: usize, hi: usize, tol: f64, keep: &mut [bool]) {
    if hi <= lo + 1 {
        return;
    }
    let (a, b) = (pts[lo], pts[hi]);
    let ab = sub(b, a);
    let len2 = dot(ab, ab);
    let mut best = (0.0, lo);
    for (k, &p) in pts.iter().enumerate().take(hi).skip(lo + 1) {
        let ap = sub(p, a);
        let d = if len2 > 0.0 {
            let t = (dot(ap, ab) / len2).clamp(0.0, 1.0);
            dist(p, add(a, scale(ab, t)))
        } else {
            crate::math::norm(ap)
        };
        if d > best.0 {
            best = (d, k);
        }
    }
    if best.0 > tol {
        keep[best.1] = true;
        dp(pts, lo, best.1, tol, keep);
        dp(pts, best.1, hi, tol, keep);
    }
}

/// Decide which interior vertices of one loop chain survive. A chain shared by
/// two regions is decided once, by whichever region reaches it first.
fn simplify_chain(
    lp: &[u32],
    chain: &[usize],
    positions: &[V3],
    tol: f64,
    keep: &mut [bool],
    decided: &mut [bool],
) {
    let interior = &chain[1..chain.len() - 1];
    if interior.iter().all(|&k| decided[lp[k] as usize]) {
        return;
    }
    let pts: Vec<V3> = chain.iter().map(|&k| positions[lp[k] as usize]).collect();
    let last = pts.len() - 1;
    let mut kp = vec![false; pts.len()];
    kp[0] = true;
    kp[last] = true;
    dp(&pts, 0, last, tol, &mut kp);
    for (j, &k) in chain.iter().enumerate() {
        let v = lp[k] as usize;
        if !decided[v] {
            decided[v] = true;
            if kp[j] {
                keep[v] = true;
            }
        }
    }
}

/// Return regions smaller than `min_merge` triangles to single-triangle regions.
fn split_small(mesh: &Mesh, grown: &mut Vec<Grown>, region_of: &mut [u32], min_merge: usize) {
    let mut extra = Vec::new();
    for g in grown.iter_mut() {
        if g.tris.len() < 2 || g.tris.len() >= min_merge {
            continue;
        }
        let rest = g.tris.split_off(1);
        let single = |t: u32| {
            let [a, b, c] = mesh.tri(t as usize);
            let n = normalize(tri_cross(a, b, c)).unwrap_or([0.0, 0.0, 1.0]);
            Grown {
                tris: vec![t],
                normal: n,
                offset: dot(n, a),
            }
        };
        let first = single(g.tris[0]);
        g.normal = first.normal;
        g.offset = first.offset;
        extra.extend(rest.into_iter().map(single));
    }
    for g in extra {
        region_of[g.tris[0] as usize] = grown.len() as u32;
        grown.push(g);
    }
}

/// Region-building knobs that differ between CAD tessellations and scans.
#[derive(Clone, Copy, Debug)]
pub struct RegionParams {
    pub tol: f64,
    /// Merged regions smaller than this return to single triangles.
    pub min_merge: usize,
    /// Planes whose normals agree within this cosine snap as one.
    pub distinct_cos: f64,
}

impl RegionParams {
    pub fn cad(tol: f64) -> RegionParams {
        RegionParams {
            tol,
            min_merge: 2,
            distinct_cos: 0.5f64.to_radians().cos(),
        }
    }

    /// On scans a handful of triangles that agree within the noise isn't a
    /// planar feature; only regions with real support become polygons.
    pub fn scan(tol: f64) -> RegionParams {
        RegionParams {
            tol,
            min_merge: 12,
            distinct_cos: 20f64.to_radians().cos(),
        }
    }
}

pub fn build(
    mesh: &Mesh,
    topo: &Topology,
    params: RegionParams,
    components: &[Component],
) -> RegionMesh {
    let RegionParams {
        tol,
        min_merge,
        distinct_cos,
    } = params;
    let (mut grown, mut region_of) = grow(mesh, topo, tol);
    if min_merge > 2 {
        split_small(mesh, &mut grown, &mut region_of, min_merge);
    }
    let nv = mesh.positions.len();
    let mut tri_body = vec![0u32; mesh.triangles.len()];
    for (ci, c) in components.iter().enumerate() {
        for &t in &c.triangles {
            tri_body[t as usize] = ci as u32;
        }
    }

    // Final planes: least squares over merged regions, exact for single triangles.
    let mut planes: Vec<(V3, f64)> = Vec::with_capacity(grown.len());
    let mut merged: Vec<bool> = Vec::with_capacity(grown.len());
    let mut deviation: Vec<f64> = Vec::with_capacity(grown.len());
    for g in &grown {
        let mut verts: Vec<u32> = g
            .tris
            .iter()
            .flat_map(|&t| mesh.triangles[t as usize])
            .collect();
        verts.sort_unstable();
        verts.dedup();
        let is_merged = g.tris.len() > 1;
        let plane = if is_merged {
            fit_plane(verts.iter().map(|&v| (mesh.positions[v as usize], 1.0)))
                .map(|(n, d)| {
                    if dot(n, g.normal) < 0.0 {
                        (scale(n, -1.0), -d)
                    } else {
                        (n, d)
                    }
                })
                .unwrap_or((g.normal, g.offset))
        } else {
            (g.normal, g.offset)
        };
        let dev = if is_merged {
            verts
                .iter()
                .map(|&v| (dot(plane.0, mesh.positions[v as usize]) - plane.1).abs())
                .fold(0.0, f64::max)
        } else {
            0.0
        };
        planes.push(plane);
        merged.push(is_merged);
        deviation.push(dev);
    }

    // Regions touching each vertex.
    let mut vregions: Vec<Vec<u32>> = vec![Vec::new(); nv];
    let mut vopen = vec![false; nv];
    for (t, tri) in mesh.triangles.iter().enumerate() {
        for i in 0..3 {
            let r = region_of[t];
            let v = tri[i] as usize;
            if !vregions[v].contains(&r) {
                vregions[v].push(r);
            }
            if topo.neighbor(t, i).is_none() {
                vopen[tri[i] as usize] = true;
                vopen[tri[(i + 1) % 3] as usize] = true;
            }
        }
    }

    let mut vtris: Vec<Vec<u32>> = vec![Vec::new(); nv];
    for (t, tri) in mesh.triangles.iter().enumerate() {
        for &v in tri {
            vtris[v as usize].push(t as u32);
        }
    }
    let orig_normals: Vec<Option<V3>> = (0..mesh.triangles.len())
        .map(|t| {
            let [a, b, c] = mesh.tri(t);
            if crate::math::tri_quality(a, b, c) < crate::repair::DEGENERATE_QUALITY {
                None
            } else {
                normalize(tri_cross(a, b, c))
            }
        })
        .collect();

    // Snap every vertex at once, then undo snaps around any triangle the move
    // inverted or flattened, until none is left. Judging the final state (not a
    // half-snapped one) keeps noisy flats from rejecting legitimate moves.
    let mut positions = mesh.positions.clone();
    let cap = 4.0 * tol + 1e-12 * mesh.bbox().diag();
    for v in 0..nv {
        let ps: Vec<(V3, f64, usize)> = vregions[v]
            .iter()
            .filter(|&&r| merged[r as usize])
            .map(|&r| {
                (
                    planes[r as usize].0,
                    planes[r as usize].1,
                    grown[r as usize].tris.len(),
                )
            })
            .collect();
        if !ps.is_empty() {
            positions[v] = snap(mesh.positions[v], &ps, cap, distinct_cos);
        }
    }
    let reference: Vec<Option<V3>> = (0..mesh.triangles.len())
        .map(|t| {
            let r = region_of[t] as usize;
            if merged[r] {
                Some(planes[r].0)
            } else {
                orig_normals[t]
            }
        })
        .collect();
    let bad = |t: usize, positions: &[V3]| {
        let [a, b, c] = mesh.triangles[t].map(|v| positions[v as usize]);
        if crate::math::tri_quality(a, b, c) < 1e-4 {
            return reference[t].is_some();
        }
        match (reference[t], normalize(tri_cross(a, b, c))) {
            (Some(n0), Some(n1)) => dot(n0, n1) < 0.0,
            _ => false,
        }
    };
    // Un-snapping a vertex can fold a neighbor or pinch a coplanar set; both
    // passes only ever un-snap, so alternating them converges.
    let max_abs = positions
        .iter()
        .flat_map(|p| p.iter())
        .fold(1.0f64, |a, &b| a.max(b.abs()));
    let planar_eps = 1e-9 * max_abs;
    let mut unpinched = 0;
    let mut fold_suspects: Vec<usize> = (0..mesh.triangles.len()).collect();
    for _round in 0..16 {
        let folds_changed = revert_folds(mesh, &vtris, &bad, &mut positions, fold_suspects);
        let pinched = unpinch_once(
            mesh,
            topo,
            &SnapView {
                planes: &planes,
                merged: &merged,
                region_of: &region_of,
                vregions: &vregions,
                planar_eps,
            },
            &mut positions,
        );
        unpinched += pinched.len();
        if !folds_changed && pinched.is_empty() {
            break;
        }
        fold_suspects = pinched
            .iter()
            .flat_map(|&v| vtris[v as usize].iter().map(|&t| t as usize))
            .collect();
        fold_suspects.sort_unstable();
        fold_suspects.dedup();
    }
    // A merged region is a polygon only where snapping put its vertices on its
    // plane to machine precision. Triangles touching an off-plane vertex leave
    // as singles; the rest splits into connected pieces, and pieces that still
    // have support keep the plane.
    let mut non_planar = 0;
    let mut member = vec![false; mesh.triangles.len()];
    let mut seen = vec![false; mesh.triangles.len()];
    let single = |t: u32, positions: &[V3]| {
        let tri = mesh.triangles[t as usize];
        let [a, b, c] = tri.map(|v| positions[v as usize]);
        let n = normalize(tri_cross(a, b, c)).unwrap_or([0.0, 0.0, 1.0]);
        (n, dot(n, a))
    };
    for rid in 0..grown.len() {
        if !merged[rid] {
            continue;
        }
        let (n, d) = planes[rid];
        let tris = std::mem::take(&mut grown[rid].tris);
        let (keep, drop): (Vec<u32>, Vec<u32>) = tris.iter().partition(|&&t| {
            mesh.triangles[t as usize]
                .iter()
                .all(|&v| (dot(n, positions[v as usize]) - d).abs() <= planar_eps)
        });
        non_planar += drop.len();
        for &t in &keep {
            member[t as usize] = true;
        }
        let mut pieces: Vec<Vec<u32>> = Vec::new();
        for &s in &keep {
            if seen[s as usize] {
                continue;
            }
            seen[s as usize] = true;
            let mut piece = vec![s];
            let mut k = 0;
            while k < piece.len() {
                let t = piece[k] as usize;
                k += 1;
                for i in 0..3 {
                    if let Some(nb) = topo.neighbor(t, i) {
                        if member[nb] && !seen[nb] {
                            seen[nb] = true;
                            piece.push(nb as u32);
                        }
                    }
                }
            }
            pieces.push(piece);
        }
        for &t in &keep {
            member[t as usize] = false;
            seen[t as usize] = false;
        }
        pieces.sort_by_key(|p| std::cmp::Reverse(p.len()));
        let mut loose: Vec<u32> = drop;
        let mut first = true;
        for piece in pieces {
            if piece.len() < min_merge.max(2) {
                loose.extend(piece);
                continue;
            }
            if first {
                grown[rid].tris = piece;
                first = false;
            } else {
                let id = grown.len() as u32;
                for &t in &piece {
                    region_of[t as usize] = id;
                }
                grown.push(Grown {
                    tris: piece,
                    normal: n,
                    offset: d,
                });
                planes.push((n, d));
                merged.push(true);
                deviation.push(deviation[rid]);
            }
        }
        if first {
            let t0 = loose.pop().or_else(|| tris.first().copied()).unwrap_or(0);
            grown[rid].tris = vec![t0];
            planes[rid] = single(t0, &positions);
            merged[rid] = false;
            region_of[t0 as usize] = rid as u32;
        }
        for t in loose {
            let id = grown.len() as u32;
            region_of[t as usize] = id;
            let (sn, sd) = single(t, &positions);
            grown.push(Grown {
                tris: vec![t],
                normal: sn,
                offset: sd,
            });
            planes.push((sn, sd));
            merged.push(false);
            deviation.push(0.0);
        }
    }
    // Keep a snap only where a surviving planar region needs it. A moved vertex
    // that no merged triangle uses goes back to where the mesh had it: the move
    // buys nothing, and the kernel's mesh importer is far slower on the result.
    // Restoring next to snapped neighbors can fold a triangle; resolving that
    // un-snaps more, so any region left off its plane loses those triangles.
    for _round in 0..16 {
        let mut needed = vec![false; nv];
        for (t, tri) in mesh.triangles.iter().enumerate() {
            if merged[region_of[t] as usize] {
                for &v in tri {
                    needed[v as usize] = true;
                }
            }
        }
        let mut suspects = Vec::new();
        for v in 0..nv {
            if !needed[v] && positions[v] != mesh.positions[v] {
                positions[v] = mesh.positions[v];
                suspects.extend(vtris[v].iter().map(|&t| t as usize));
            }
        }
        if suspects.is_empty() {
            break;
        }
        suspects.sort_unstable();
        suspects.dedup();
        if !revert_folds(mesh, &vtris, &bad, &mut positions, suspects) {
            break;
        }
        for (t, tri) in mesh.triangles.iter().enumerate() {
            let rid = region_of[t] as usize;
            if !merged[rid] {
                continue;
            }
            let (n, d) = planes[rid];
            let off = tri
                .iter()
                .any(|&v| (dot(n, positions[v as usize]) - d).abs() > planar_eps);
            if off {
                grown[rid].tris.retain(|&x| x as usize != t);
                non_planar += 1;
                let id = grown.len() as u32;
                region_of[t] = id;
                let (sn, sd) = single(t as u32, &positions);
                grown.push(Grown {
                    tris: vec![t as u32],
                    normal: sn,
                    offset: sd,
                });
                planes.push((sn, sd));
                merged.push(false);
                deviation.push(0.0);
            }
        }
        for rid in 0..grown.len() {
            if merged[rid] && grown[rid].tris.len() < min_merge.max(2) {
                merged[rid] = false;
            }
        }
    }

    let mut snapped = 0;
    let mut max_snap: f64 = 0.0;
    for (p, q) in positions.iter().zip(mesh.positions.iter()) {
        let moved = dist(*p, *q);
        if moved > 0.0 {
            snapped += 1;
            max_snap = max_snap.max(moved);
        }
    }

    for v in vregions.iter_mut() {
        v.clear();
    }
    for (t, tri) in mesh.triangles.iter().enumerate() {
        for &v in tri {
            let r = region_of[t];
            if !vregions[v as usize].contains(&r) {
                vregions[v as usize].push(r);
            }
        }
    }

    // Loops, with regions that can't be a single polygon face falling back to triangles.
    let mut raw_loops: Vec<Option<Vec<Vec<u32>>>> = Vec::with_capacity(grown.len());
    for (rid, g) in grown.iter().enumerate() {
        if !merged[rid] {
            raw_loops.push(None);
            continue;
        }
        let lps = region_loops(mesh, topo, &region_of, rid as u32, &g.tris).and_then(|lps| {
            let mut seen = std::collections::HashSet::new();
            if lps.iter().flatten().any(|v| !seen.insert(*v)) {
                return None;
            }
            let normal = planes[rid].0;
            let mut outer = None;
            let mut holes = Vec::new();
            for lp in lps {
                let pts: Vec<V3> = lp.iter().map(|&v| positions[v as usize]).collect();
                if loop_area(&pts, normal) > 0.0 {
                    if outer.is_some() {
                        return None;
                    }
                    outer = Some(lp);
                } else {
                    holes.push(lp);
                }
            }
            let mut out = vec![outer?];
            out.extend(holes);
            Some(out)
        });
        raw_loops.push(lps);
    }

    // Candidates for dropping: interior to exactly two polygon regions.
    let polygonal = |r: u32| raw_loops[r as usize].is_some();
    let mut keep = vec![true; nv];
    for v in 0..nv {
        let rs = &vregions[v];
        if rs.len() == 2 && !vopen[v] && rs.iter().all(|&r| polygonal(r)) {
            keep[v] = false;
        }
    }
    let mut decided = vec![false; nv];
    for lps in raw_loops.iter().flatten() {
        for lp in lps {
            let m = lp.len();
            let anchors: Vec<usize> = (0..m).filter(|&k| keep[lp[k] as usize]).collect();
            if anchors.is_empty() {
                let p0 = positions[lp[0] as usize];
                let far = (0..m)
                    .max_by(|&a, &b| {
                        dist(positions[lp[a] as usize], p0)
                            .total_cmp(&dist(positions[lp[b] as usize], p0))
                    })
                    .unwrap_or(0);
                for k in [0, far] {
                    keep[lp[k] as usize] = true;
                    decided[lp[k] as usize] = true;
                }
                if far > 0 {
                    let first: Vec<usize> = (0..=far).collect();
                    let second: Vec<usize> = (far..=m).map(|k| k % m).collect();
                    simplify_chain(lp, &first, &positions, tol, &mut keep, &mut decided);
                    simplify_chain(lp, &second, &positions, tol, &mut keep, &mut decided);
                }
                continue;
            }
            for w in 0..anchors.len() {
                let a = anchors[w];
                let b = anchors[(w + 1) % anchors.len()];
                let chain: Vec<usize> = if b > a {
                    (a..=b).collect()
                } else {
                    (a..=b + m).map(|k| k % m).collect()
                };
                if chain.len() > 2 {
                    simplify_chain(lp, &chain, &positions, tol, &mut keep, &mut decided);
                }
            }
        }
    }

    // Build final loops and triangulations; any region that degenerates or fails to
    // triangulate restores its vertices (always safe for neighbors) and retries.
    let mut fallback_to_tris = vec![false; grown.len()];
    let mut regions: Vec<Region> = Vec::new();
    for round in 0.. {
        if round == MAX_TRIANGULATION_ROUNDS {
            // Give up on polygons that keep cascading: own triangles always close.
            for (rid, lps) in raw_loops.iter().enumerate() {
                if let Some(lps) = lps {
                    fallback_to_tris[rid] = true;
                    for &v in lps.iter().flatten() {
                        keep[v as usize] = true;
                    }
                }
            }
        }
        let mut failed = Vec::new();
        regions.clear();
        for (rid, g) in grown.iter().enumerate() {
            let Some(&first_tri) = g.tris.first() else {
                continue;
            };
            let first_source = g.tris.iter().copied().min().unwrap_or(first_tri);
            let normal = planes[rid].0;
            let body = tri_body[first_tri as usize];
            let own_tris = || -> Vec<[u32; 3]> {
                g.tris.iter().map(|&t| mesh.triangles[t as usize]).collect()
            };
            let lps = match (&raw_loops[rid], fallback_to_tris[rid]) {
                (Some(l), false) => l,
                _ => {
                    regions.push(Region {
                        loops: Vec::new(),
                        triangles: own_tris(),
                        normal,
                        body,
                        source_triangles: g.tris.len(),
                        max_deviation: deviation[rid],
                        first_source,
                    });
                    continue;
                }
            };
            let filtered: Vec<Vec<u32>> = lps
                .iter()
                .map(|lp| lp.iter().copied().filter(|&v| keep[v as usize]).collect())
                .collect();
            let pts: Vec<Vec<V3>> = filtered
                .iter()
                .map(|lp: &Vec<u32>| lp.iter().map(|&v| positions[v as usize]).collect())
                .collect();
            let vertex_count: usize = filtered.iter().map(|l| l.len()).sum();
            // Ear clipping is quadratic: very long outlines keep their own triangles.
            let ok_loops =
                filtered.iter().all(|l| l.len() >= 3) && vertex_count <= MAX_EARCUT_REGION;
            let tri = if ok_loops {
                earcut::triangulate_3d(&pts, normal)
            } else {
                None
            };
            let expected: f64 = pts.iter().map(|p| loop_area(p, normal)).sum();
            // n vertices and h holes triangulate into exactly n + 2h - 2 triangles;
            // fewer means a loop vertex fell out (a T-junction against the neighbor).
            let expected_count = vertex_count + 2 * (filtered.len() - 1) - 2;
            let tris = tri.filter(|ts| {
                if ts.len() != expected_count {
                    return false;
                }
                let flat: Vec<V3> = pts.iter().flatten().copied().collect();
                let got: f64 = ts
                    .iter()
                    .map(|t| 0.5 * dot(tri_cross(flat[t[0]], flat[t[1]], flat[t[2]]), normal))
                    .sum();
                expected > 0.0 && (got - expected).abs() <= 1e-6 * expected.max(f64::MIN_POSITIVE)
            });
            match tris {
                Some(ts) => {
                    let ids: Vec<u32> = filtered.iter().flatten().copied().collect();
                    regions.push(Region {
                        loops: filtered,
                        triangles: ts
                            .iter()
                            .map(|t| [ids[t[0]], ids[t[1]], ids[t[2]]])
                            .collect(),
                        normal,
                        body,
                        source_triangles: g.tris.len(),
                        max_deviation: deviation[rid],
                        first_source,
                    });
                }
                None => failed.push(rid),
            }
        }
        if failed.is_empty() {
            break;
        }
        for rid in failed {
            fallback_to_tris[rid] = true;
            if let Some(lps) = &raw_loops[rid] {
                for &v in lps.iter().flatten() {
                    keep[v as usize] = true;
                }
            }
        }
    }

    // The kernel's sewing is much faster on spatially coherent face order, which
    // the input usually has and seed-ordered regions scatter.
    regions.sort_by_key(|r| r.first_source);

    let referenced = {
        let mut r = vec![false; nv];
        for reg in &regions {
            for t in &reg.triangles {
                for &v in t {
                    r[v as usize] = true;
                }
            }
        }
        r
    };
    let dropped = (0..nv)
        .filter(|&v| !keep[v] && !referenced[v] && !vregions[v].is_empty())
        .count();
    let triangle_fallback_regions = regions
        .iter()
        .filter(|r| r.loops.is_empty() && r.source_triangles > 1)
        .count();
    RegionMesh {
        positions,
        regions,
        snapped_vertices: snapped,
        max_snap,
        dropped_vertices: dropped,
        triangle_fallback_regions,
        non_planar_triangles: non_planar,
        unpinched_vertices: unpinched,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mesh::fixtures::{cube, sphere};
    use crate::repair::{repair, HoleFill};

    fn run(mut m: Mesh, tol: f64) -> (Mesh, RegionMesh) {
        let (_, comps) = repair(&mut m, HoleFill::All);
        let topo = Topology::build(&m);
        let rm = build(&m, &topo, RegionParams::cad(tol), &comps);
        (m, rm)
    }

    fn total_area(rm: &RegionMesh) -> f64 {
        rm.regions
            .iter()
            .flat_map(|r| r.triangles.iter())
            .map(|t| {
                crate::math::tri_area(
                    rm.positions[t[0] as usize],
                    rm.positions[t[1] as usize],
                    rm.positions[t[2] as usize],
                )
            })
            .sum()
    }

    #[test]
    fn cube_becomes_six_quads() {
        let (_, rm) = run(cube(2.0), 1e-9);
        assert_eq!(rm.regions.len(), 6);
        for r in &rm.regions {
            assert_eq!(r.loops.len(), 1);
            assert_eq!(r.loops[0].len(), 4);
            assert_eq!(r.triangles.len(), 2);
        }
        assert!((total_area(&rm) - 24.0).abs() < 1e-9);
    }

    /// Top face fanned around a center vertex, with a midpoint on its front edge
    /// that the front face shares: the center vanishes, the midpoint drops from
    /// both loops, and both faces stay quads.
    #[test]
    fn interior_and_collinear_vertices_drop() {
        let mut m = cube(4.0);
        m.triangles
            .retain(|t| !(t.contains(&4) && t.contains(&6)) && !(t.contains(&0) && t.contains(&5)));
        m.positions.push([2.0, 2.0, 4.0]);
        m.positions.push([2.0, 0.0, 4.0]);
        let (c, mid) = (8, 9);
        m.triangles.extend([[0, 1, 5], [0, 5, mid], [0, mid, 4]]);
        m.triangles
            .extend([[c, 4, mid], [c, mid, 5], [c, 5, 6], [c, 6, 7], [c, 7, 4]]);
        let (_, rm) = run(m, 1e-9);
        assert_eq!(rm.regions.len(), 6);
        for r in &rm.regions {
            assert_eq!(r.loops[0].len(), 4, "loop {:?}", r.loops[0]);
            assert!(!r.loops[0].contains(&mid));
        }
        assert!((total_area(&rm) - 96.0).abs() < 1e-9);
    }

    #[test]
    fn sphere_regions_are_single_triangles_or_quads() {
        let m = sphere(5.0, 8, 16);
        let tris = m.triangles.len();
        let (_, rm) = run(m, 1e-9);
        let srcs: usize = rm.regions.iter().map(|r| r.source_triangles).sum();
        assert_eq!(srcs, tris);
        assert!(rm.regions.iter().all(|r| r.source_triangles <= 2));
    }

    #[test]
    fn noisy_plane_snaps_within_cap() {
        let mut m = cube(10.0);
        m.positions[6][2] += 1e-4;
        let (_, rm) = run(m, 1e-3);
        let top = rm.regions.iter().find(|r| r.normal[2] > 0.99).unwrap();
        let d: Vec<f64> = top.loops[0]
            .iter()
            .map(|&v| dot(top.normal, rm.positions[v as usize]))
            .collect();
        let spread =
            d.iter().cloned().fold(f64::MIN, f64::max) - d.iter().cloned().fold(f64::MAX, f64::min);
        assert!(spread < 1e-9, "off-plane spread {spread}");
        assert!(rm.max_snap < 4e-3);
    }

    #[test]
    fn snap_projects_onto_planes() {
        let p = snap([1.0, 2.0, 3.0], &[([0.0, 0.0, 1.0], 0.0, 1)], 10.0, 0.94);
        assert!((p[2]).abs() < 1e-12 && (p[0] - 1.0).abs() < 1e-12);
        let p = snap([1.0, 2.0, 3.0], &[([0.0, 0.0, 1.0], 0.0, 1)], 1.0, 0.94);
        assert_eq!(p, [1.0, 2.0, 3.0]);
        let p = snap(
            [0.1, 0.2, 0.3],
            &[
                ([1.0, 0.0, 0.0], 0.0, 1),
                ([0.0, 1.0, 0.0], 0.0, 1),
                ([0.0, 0.0, 1.0], 0.0, 1),
            ],
            1.0,
            0.94,
        );
        assert!(crate::math::norm(p) < 1e-12);
        let tilt = normalize([0.0, 0.05, 1.0]).unwrap();
        let p = snap(
            [0.0, 0.0, 0.01],
            &[([0.0, 0.0, 1.0], 0.0, 9), (tilt, 0.0, 2)],
            1.0,
            0.94,
        );
        assert!(
            p[1].abs() < 1e-12 && p[2].abs() < 1e-12,
            "nearly parallel planes collapse to the heavier one: {p:?}"
        );
    }
}
