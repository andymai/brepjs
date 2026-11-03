//! Freeform charts. Triangles no analytic surface fits are split into charts,
//! each smooth and disc-shaped enough to become one B-spline face: a surface
//! fitted to the chart, trimmed along its boundary. Neighbouring charts meet
//! along runs, polylines from corner to corner that both faces are trimmed
//! along, so they meet within their fit errors and sew.
//!
//! The split is variational shape approximation (Cohen-Steiner et al. 2004)
//! on normals: charts flood from seed triangles, ordered by how far each
//! triangle's normal is from the chart's mean, then re-seed at their most
//! typical triangle. A chart too curved, too large or not a disc gets a new
//! seed and the flood runs again.

use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap};

use crate::deviation::{closest_on_triangle, Bvh};
use crate::math::{add, cross, dist, dot, normalize, scale, sub, tri_area, tri_cross, Bbox, V3};
use crate::mesh::{edge_key, Mesh, Topology};

const NONE: u32 = u32::MAX;
/// Neighbouring triangles within this multiple of the chart cone of a chart's
/// mean normal lend it their points.
const RING_CONE: f64 = 1.5;
/// Weight of distance from the seed against normal error when charts grow.
const COMPACTNESS: f64 = 0.5;
/// Flood and re-seed passes between checks.
const LLOYD: usize = 4;
/// Checks (each adding seeds where a chart fails one) before giving up.
const MAX_ROUNDS: usize = 16;
/// Smoothing passes over each run before it is fitted with a curve.
const SMOOTH_PASSES: usize = 6;
/// Chart surfaces extend this share of the chart's extent past its points.
const SURFACE_MARGIN: f64 = 0.03;
/// Input vertices per chart fitted for its surface, at most.
const SURFACE_SAMPLES: usize = 4000;

pub struct ChartParams {
    /// Largest angle between a chart's mean normal and its triangles'.
    pub cone_deg: f64,
    /// Share of a chart's area allowed outside the cone (scan noise).
    pub cone_slack: f64,
    /// Mesh edges sharper than this bound charts.
    pub crease_deg: f64,
    /// How far noise may have moved a vertex (0 for an exact mesh). A
    /// triangle no taller than twice this off its longest edge has a normal
    /// the noise set: it takes its neighbours' instead.
    pub noise: f64,
    /// Largest chart extent as a share of its body's diagonal.
    pub max_extent: f64,
    /// Longest run as a share of its body's diagonal: laid onto a surface as
    /// one curve, a longer boundary can stray from it (the corpus peanut's
    /// did by 3 mm).
    pub max_run: f64,
    pub max_charts: usize,
}

/// What charts are cut from.
pub struct ChartInput<'a> {
    /// The mesh charts follow (decimated for a scan) and its adjacency.
    pub mesh: &'a Mesh,
    pub topo: &'a Topology,
    /// The triangles to chart.
    pub mask: &'a [bool],
    /// Body of each triangle.
    pub tri_body: &'a [u32],
    /// Over `mesh`'s triangles, to put points back on it.
    pub bvh: &'a Bvh,
    /// The full-resolution mesh whose vertices (every `stride`-th) the
    /// charts' surfaces are fitted to.
    pub input: &'a Mesh,
    pub stride: usize,
}

/// A chart split under way: its input, the limits it works to, and each
/// body's diagonal (the scale those limits are relative to).
struct Ctx<'a> {
    src: &'a ChartInput<'a>,
    p: &'a ChartParams,
    body_diag: Vec<f64>,
}

pub struct Run {
    /// From one corner to the next, smoothed along the mesh.
    pub pts: Vec<V3>,
    /// The charts on either side: the one it was traced for first, then the other.
    pub charts: [u32; 2],
    /// No crease along it: the faces meet tangentially.
    pub smooth: bool,
}

pub struct Chart {
    pub body: u32,
    /// The boundary loop, as (run, traversed backwards) in order.
    pub sides: Vec<(u32, bool)>,
    /// Poles of the surface fitted to the chart and a margin around it, which
    /// its face is cut from: a uniform cubic B-spline, k × k poles row by row
    /// (rows along the first direction), knots -3..=k.
    pub poles: Vec<V3>,
    /// Largest height of a fitted point off that surface.
    pub fit_error: f64,
}

pub struct Charts {
    /// Chart of each mesh triangle, or `u32::MAX` when not charted.
    pub tri_chart: Vec<u32>,
    pub charts: Vec<Chart>,
    pub runs: Vec<Run>,
}

struct Geo {
    normal: Vec<V3>,
    area: Vec<f64>,
    centroid: Vec<V3>,
    /// Neighbour across each edge when a chart may grow across it.
    pass: Vec<[u32; 3]>,
    /// 1 / (largest chart extent)² for each triangle's body.
    inv_reach2: Vec<f64>,
}

impl Geo {
    fn new(mesh: &Mesh, topo: &Topology, mask: &[bool], crease_deg: f64, noise: f64) -> Geo {
        let n = mesh.triangles.len();
        let mut normal = Vec::with_capacity(n);
        let mut area = Vec::with_capacity(n);
        let mut centroid = Vec::with_capacity(n);
        let mut unsure = Vec::with_capacity(n);
        for t in 0..n {
            let [a, b, c] = mesh.tri(t);
            normal.push(normalize(tri_cross(a, b, c)).unwrap_or([0.0; 3]));
            let ar = tri_area(a, b, c);
            area.push(ar);
            centroid.push(scale(add(add(a, b), c), 1.0 / 3.0));
            let longest = dist(a, b).max(dist(b, c)).max(dist(c, a));
            unsure.push(longest > 0.0 && 2.0 * ar / longest <= 2.0 * noise);
        }
        // Decimating a scan leaves flaps standing on the surface within the
        // noise: every edge of one reads as a crease, and it becomes a chart
        // of its own that no face can be trimmed to.
        for _ in 0..4 {
            let mut left = false;
            for t in 0..n {
                if !unsure[t] {
                    continue;
                }
                let mut acc = [0.0; 3];
                for i in 0..3 {
                    if let Some(nb) = topo.neighbor(t, i).filter(|&nb| !unsure[nb]) {
                        acc = add(acc, scale(normal[nb], area[nb]));
                    }
                }
                match normalize(acc) {
                    Some(nrm) => {
                        normal[t] = nrm;
                        unsure[t] = false;
                    }
                    None => left = true,
                }
            }
            if !left {
                break;
            }
        }
        let cos_crease = crease_deg.to_radians().cos();
        let mut pass = vec![[NONE; 3]; n];
        for t in 0..n {
            if !mask[t] {
                continue;
            }
            for (i, slot) in pass[t].iter_mut().enumerate() {
                if let Some(nb) = topo.neighbor(t, i) {
                    if mask[nb] && dot(normal[t], normal[nb]) >= cos_crease {
                        *slot = nb as u32;
                    }
                }
            }
        }
        Geo {
            normal,
            area,
            centroid,
            pass,
            inv_reach2: vec![0.0; n],
        }
    }

    /// Normal error, plus distance from the seed in units of the chart size
    /// limit: where normals barely vary (a torus's crown) only the distance
    /// keeps charts compact.
    fn err(&self, t: usize, proxy: V3, seed: usize) -> f64 {
        let d = sub(self.normal[t], proxy);
        let r = sub(self.centroid[t], self.centroid[seed]);
        self.area[t] * (dot(d, d) + COMPACTNESS * dot(r, r) * self.inv_reach2[seed])
    }
}

#[derive(PartialEq)]
struct Item {
    err: f64,
    tri: u32,
    chart: u32,
}

impl Eq for Item {}

impl Ord for Item {
    // Smallest error first from the max-heap; ties by triangle for determinism.
    fn cmp(&self, o: &Self) -> Ordering {
        o.err
            .total_cmp(&self.err)
            .then_with(|| o.tri.cmp(&self.tri))
    }
}

impl PartialOrd for Item {
    fn partial_cmp(&self, o: &Self) -> Option<Ordering> {
        Some(self.cmp(o))
    }
}

/// Grow every chart from its seed at once, each triangle going to the chart
/// that reaches it with the least normal error.
fn flood(g: &Geo, seeds: &[u32], proxies: &[V3]) -> Vec<u32> {
    let mut chart = vec![NONE; g.normal.len()];
    let mut heap = BinaryHeap::new();
    for (c, &s) in seeds.iter().enumerate() {
        heap.push(Item {
            err: 0.0,
            tri: s,
            chart: c as u32,
        });
    }
    while let Some(Item { tri, chart: c, .. }) = heap.pop() {
        if chart[tri as usize] != NONE {
            continue;
        }
        chart[tri as usize] = c;
        for nb in g.pass[tri as usize] {
            if nb != NONE && chart[nb as usize] == NONE {
                heap.push(Item {
                    err: g.err(nb as usize, proxies[c as usize], seeds[c as usize] as usize),
                    tri: nb,
                    chart: c,
                });
            }
        }
    }
    chart
}

/// Flood, then seed each crease-bounded patch no chart reached, until every
/// masked triangle has a chart.
fn partition(g: &Geo, mask: &[bool], seeds: &mut Vec<u32>, proxies: &mut Vec<V3>) -> Vec<u32> {
    loop {
        let chart = flood(g, seeds, proxies);
        let mut seen = vec![false; chart.len()];
        let mut added = false;
        let mut stack = Vec::new();
        for t in 0..chart.len() {
            if !mask[t] || chart[t] != NONE || seen[t] {
                continue;
            }
            seeds.push(t as u32);
            proxies.push(g.normal[t]);
            added = true;
            seen[t] = true;
            stack.push(t);
            while let Some(u) = stack.pop() {
                for nb in g.pass[u] {
                    if nb != NONE && chart[nb as usize] == NONE && !seen[nb as usize] {
                        seen[nb as usize] = true;
                        stack.push(nb as usize);
                    }
                }
            }
        }
        if !added {
            return chart;
        }
    }
}

fn members(chart: &[u32], count: usize) -> Vec<Vec<u32>> {
    let mut out = vec![Vec::new(); count];
    for (t, &c) in chart.iter().enumerate() {
        if c != NONE {
            out[c as usize].push(t as u32);
        }
    }
    out
}

/// Passes of `tidy` at most; each one only shortens chart boundaries, so it
/// settles well before this on any real mesh.
const TIDY_PASSES: usize = 32;

/// Hand every triangle that juts out of its chart (one neighbour in it at
/// most) to the neighbouring chart it shares more boundary length with, when
/// that chart's cone admits it. Decimation leaves sliver triangles, and a
/// chart reaching across one leaves two of its boundary runs within the
/// noise of each other, which no sewing tolerance tells apart. Each move
/// strictly shortens the total boundary, so this terminates; a leaf leaving
/// never disconnects its chart.
fn tidy(mesh: &Mesh, g: &Geo, chart: &mut [u32], proxies: &[V3], cos_cone: f64) {
    let edge_len = |t: usize, i: usize| {
        let tri = mesh.triangles[t];
        dist(
            mesh.positions[tri[i] as usize],
            mesh.positions[tri[(i + 1) % 3] as usize],
        )
    };
    for _ in 0..TIDY_PASSES {
        let mut moved = false;
        for t in 0..chart.len() {
            let c = chart[t];
            if c == NONE {
                continue;
            }
            let mut own = (0, 0.0);
            let mut other = [(NONE, 0.0); 3];
            for (i, &nb) in g.pass[t].iter().enumerate() {
                let nc = if nb == NONE { NONE } else { chart[nb as usize] };
                if nc == NONE {
                    continue;
                }
                let len = edge_len(t, i);
                if nc == c {
                    own = (own.0 + 1, own.1 + len);
                } else if let Some(slot) = other.iter_mut().find(|s| s.0 == nc || s.0 == NONE) {
                    *slot = (nc, slot.1 + len);
                }
            }
            if own.0 > 1 {
                continue;
            }
            let best = other
                .iter()
                .filter(|&&(nc, len)| {
                    nc != NONE
                        && len > own.1 * (1.0 + 1e-9)
                        && dot(g.normal[t], proxies[nc as usize]) >= cos_cone
                })
                .max_by(|a, b| a.1.total_cmp(&b.1).then(b.0.cmp(&a.0)));
            if let Some(&(nc, _)) = best {
                chart[t] = nc;
                moved = true;
            }
        }
        if !moved {
            break;
        }
    }
}

/// Renumber charts densely, dropping any `tidy` emptied, with their seeds and
/// mean normals.
fn compact(chart: &mut [u32], seeds: &mut Vec<u32>, proxies: &mut Vec<V3>) {
    let mut used = vec![false; seeds.len()];
    for &c in chart.iter() {
        if c != NONE {
            used[c as usize] = true;
        }
    }
    let mut map = vec![NONE; seeds.len()];
    let mut next = 0u32;
    for (c, &u) in used.iter().enumerate() {
        if u {
            map[c] = next;
            seeds[next as usize] = seeds[c];
            proxies[next as usize] = proxies[c];
            next += 1;
        }
    }
    seeds.truncate(next as usize);
    proxies.truncate(next as usize);
    for c in chart.iter_mut() {
        if *c != NONE {
            *c = map[*c as usize];
        }
    }
}

/// Re-fit each chart's mean normal and move its seed to its most typical triangle.
fn relax(g: &Geo, chart: &[u32], seeds: &mut [u32], proxies: &mut [V3]) {
    let groups = members(chart, seeds.len());
    for (c, tris) in groups.iter().enumerate() {
        let mut acc = [0.0; 3];
        for &t in tris {
            acc = add(acc, scale(g.normal[t as usize], g.area[t as usize]));
        }
        if let Some(n) = normalize(acc) {
            proxies[c] = n;
        }
        let best = tris.iter().copied().min_by(|&a, &b| {
            let ea = dot(
                sub(g.normal[a as usize], proxies[c]),
                sub(g.normal[a as usize], proxies[c]),
            );
            let eb = dot(
                sub(g.normal[b as usize], proxies[c]),
                sub(g.normal[b as usize], proxies[c]),
            );
            ea.total_cmp(&eb).then(a.cmp(&b))
        });
        if let Some(b) = best {
            seeds[c] = b;
        }
    }
}

/// Boundary of one chart: directed edges (triangle, edge) with the chart on
/// their left, chained into loops. `None` when a vertex is pinched (the chart
/// touches itself there) or an edge is open.
fn loops_of(
    mesh: &Mesh,
    topo: &Topology,
    chart: &[u32],
    tris: &[u32],
) -> Option<Vec<Vec<(u32, u8)>>> {
    let c = chart[tris[0] as usize];
    let mut next: HashMap<u32, (u32, u8)> = HashMap::new();
    for &t in tris {
        for i in 0..3u8 {
            let nb = topo.neighbor(t as usize, i as usize)?;
            if chart[nb] == c {
                continue;
            }
            let from = mesh.triangles[t as usize][i as usize];
            if next.insert(from, (t, i)).is_some() {
                return None;
            }
        }
    }
    let mut loops = Vec::new();
    while let Some((&start, _)) = next.iter().next() {
        let mut lp = Vec::new();
        let mut v = start;
        while let Some((t, i)) = next.remove(&v) {
            lp.push((t, i));
            v = mesh.triangles[t as usize][(i as usize + 1) % 3];
        }
        if v != start {
            return None;
        }
        loops.push(lp);
    }
    Some(loops)
}

struct Check {
    /// One new seed per failing chart.
    splits: Vec<u32>,
}

fn check(cx: &Ctx, g: &Geo, chart: &[u32], seeds: &[u32], proxies: &[V3]) -> Check {
    let (mesh, topo, tri_body, p) = (cx.src.mesh, cx.src.topo, cx.src.tri_body, cx.p);
    let body_diag = &cx.body_diag;
    let cos_cone = p.cone_deg.to_radians().cos();
    let groups = members(chart, seeds.len());
    let mut splits = Vec::new();
    for (c, tris) in groups.iter().enumerate() {
        let Some(&first) = tris.first() else { continue };
        let proxy = proxies[c];
        let mut total = 0.0;
        let mut outside = 0.0;
        let mut worst = (f64::INFINITY, first);
        let mut bb = Bbox::empty();
        for &t in tris {
            let cos = dot(g.normal[t as usize], proxy);
            total += g.area[t as usize];
            if cos < cos_cone {
                outside += g.area[t as usize];
            }
            if cos < worst.0 {
                worst = (cos, t);
            }
            for v in mesh.triangles[t as usize] {
                bb.expand(mesh.positions[v as usize]);
            }
        }
        let curved =
            outside > p.cone_slack * total || worst.0 < (2.0 * p.cone_deg).to_radians().cos();
        if curved && tris.len() > 1 {
            splits.push(worst.1);
            continue;
        }
        let body = tri_body[first as usize] as usize;
        // A flat chart fills exactly at any size.
        let flat = worst.0 >= (0.25 * p.cone_deg).to_radians().cos();
        let large = !flat && bb.diag() > p.max_extent * body_diag[body];
        let disc = is_disc(mesh, topo, chart, tris);
        if (large || !disc) && tris.len() > 1 {
            let from = g.centroid[seeds[c] as usize];
            let far = tris
                .iter()
                .copied()
                .max_by(|&a, &b| {
                    dist(g.centroid[a as usize], from)
                        .total_cmp(&dist(g.centroid[b as usize], from))
                        .then(b.cmp(&a))
                })
                .unwrap_or(first);
            if far != seeds[c] {
                splits.push(far);
            }
        }
    }
    Check { splits }
}

/// One boundary loop and Euler characteristic 1.
fn is_disc(mesh: &Mesh, topo: &Topology, chart: &[u32], tris: &[u32]) -> bool {
    let Some(loops) = loops_of(mesh, topo, chart, tris) else {
        return false;
    };
    if loops.len() != 1 {
        return false;
    }
    let boundary = loops[0].len();
    let mut verts: Vec<u32> = tris
        .iter()
        .flat_map(|&t| mesh.triangles[t as usize])
        .collect();
    verts.sort_unstable();
    verts.dedup();
    let f = tris.len();
    let e = (3 * f + boundary) / 2;
    verts.len() as i64 - e as i64 + f as i64 == 1
}

/// Split the masked triangles into charts, or `None` when they can't be split
/// into few enough discs.
pub fn build(src: &ChartInput, p: &ChartParams) -> Option<Charts> {
    let (mesh, mask, tri_body) = (src.mesh, src.mask, src.tri_body);
    let mut g = Geo::new(mesh, src.topo, mask, p.crease_deg, p.noise);
    let bodies = tri_body.iter().map(|&b| b as usize + 1).max().unwrap_or(0);
    let mut body_box = vec![Bbox::empty(); bodies];
    for (t, tri) in mesh.triangles.iter().enumerate() {
        for &v in tri {
            body_box[tri_body[t] as usize].expand(mesh.positions[v as usize]);
        }
    }
    let cx = Ctx {
        src,
        p,
        body_diag: body_box.iter().map(Bbox::diag).collect(),
    };
    for (t, r) in g.inv_reach2.iter_mut().enumerate() {
        let reach = p.max_extent * cx.body_diag[tri_body[t] as usize];
        *r = if reach > 0.0 {
            1.0 / (reach * reach)
        } else {
            0.0
        };
    }
    let cos_cone = p.cone_deg.to_radians().cos();
    let settle = |seeds: &[u32], proxies: &[V3]| {
        let mut chart = flood(&g, seeds, proxies);
        tidy(mesh, &g, &mut chart, proxies, cos_cone);
        chart
    };
    let mut seeds = Vec::new();
    let mut proxies = Vec::new();
    let mut chart = partition(&g, mask, &mut seeds, &mut proxies);
    if seeds.len() > p.max_charts {
        return None;
    }
    tidy(mesh, &g, &mut chart, &proxies, cos_cone);
    let mut done = false;
    for _ in 0..MAX_ROUNDS {
        for _ in 0..LLOYD {
            relax(&g, &chart, &mut seeds, &mut proxies);
            chart = settle(&seeds, &proxies);
        }
        let c = check(&cx, &g, &chart, &seeds, &proxies);
        if c.splits.is_empty() {
            done = true;
            break;
        }
        if seeds.len() + c.splits.len() > p.max_charts {
            return None;
        }
        for t in c.splits {
            seeds.push(t);
            proxies.push(g.normal[t as usize]);
        }
        chart = settle(&seeds, &proxies);
    }
    if !done {
        return None;
    }
    compact(&mut chart, &mut seeds, &mut proxies);
    let (mut charts, runs) = trace(&cx, &g, &chart, &proxies)?;
    fit_surfaces(&cx, &g, &chart, &mut charts, &runs, &proxies);
    Some(Charts {
        tri_chart: chart,
        charts,
        runs,
    })
}

/// Charts around each vertex, sorted and deduplicated.
fn vertex_charts(mesh: &Mesh, chart: &[u32]) -> Vec<Vec<u32>> {
    let mut out = vec![Vec::new(); mesh.positions.len()];
    for (t, tri) in mesh.triangles.iter().enumerate() {
        if chart[t] == NONE {
            continue;
        }
        for &v in tri {
            let list = &mut out[v as usize];
            if !list.contains(&chart[t]) {
                list.push(chart[t]);
            }
        }
    }
    out
}

fn trace(cx: &Ctx, g: &Geo, chart: &[u32], proxies: &[V3]) -> Option<(Vec<Chart>, Vec<Run>)> {
    let (mesh, topo, tri_body, bvh) = (cx.src.mesh, cx.src.topo, cx.src.tri_body, cx.src.bvh);
    let count = proxies.len();
    let groups = members(chart, count);
    let around = vertex_charts(mesh, chart);
    let mut corner: Vec<bool> = around.iter().map(|c| c.len() >= 3).collect();
    let crease = |t: u32, i: u8| g.pass[t as usize][i as usize] == NONE;
    let mut loops = Vec::with_capacity(count);
    for tris in &groups {
        let lp = loops_of(mesh, topo, chart, tris)?;
        let [one] = <[_; 1]>::try_from(lp).ok()?;
        loops.push(one);
    }
    // A run is all crease or all smooth: its faces meet one way along it.
    for lp in &loops {
        for k in 0..lp.len() {
            let (t0, i0) = lp[k];
            let (t1, i1) = lp[(k + 1) % lp.len()];
            if crease(t0, i0) != crease(t1, i1) {
                corner[mesh.triangles[t1 as usize][i1 as usize] as usize] = true;
            }
        }
    }
    // Three sides at least, so no face is bounded by one or two curves.
    for lp in &loops {
        add_corners(mesh, lp, &mut corner);
    }
    // Each corner-to-corner stretch is cut into runs no longer than this.
    let piece_len: Vec<f64> = cx.body_diag.iter().map(|d| cx.p.max_run * d).collect();
    let mut edge_stretch: HashMap<u64, usize> = HashMap::new();
    let mut stretches: Vec<Vec<u32>> = Vec::new();
    let mut runs: Vec<Run> = Vec::new();
    let mut charts = Vec::with_capacity(count);
    for (c, lp) in loops.iter().enumerate() {
        let start_of = |k: usize| mesh.triangles[lp[k].0 as usize][lp[k].1 as usize];
        let first = (0..lp.len()).find(|&k| corner[start_of(k) as usize])?;
        let mut sides = Vec::new();
        let mut k = 0;
        while k < lp.len() {
            let mut seg = vec![lp[(first + k) % lp.len()]];
            k += 1;
            while k < lp.len() && !corner[start_of((first + k) % lp.len()) as usize] {
                seg.push(lp[(first + k) % lp.len()]);
                k += 1;
            }
            let (t, i) = seg[0];
            let tri = mesh.triangles[t as usize];
            let key = edge_key(tri[i as usize], tri[(i as usize + 1) % 3]);
            if let Some(&st) = edge_stretch.get(&key) {
                sides.extend(stretches[st].iter().rev().map(|&r| (r, true)));
                continue;
            }
            let id = stretches.len();
            let mut verts = Vec::with_capacity(seg.len() + 1);
            let mut smooth = true;
            for &(t, i) in &seg {
                let tri = mesh.triangles[t as usize];
                let (a, b) = (tri[i as usize], tri[(i as usize + 1) % 3]);
                verts.push(a);
                edge_stretch.insert(edge_key(a, b), id);
                smooth &= !crease(t, i);
            }
            let (t, i) = seg[seg.len() - 1];
            verts.push(mesh.triangles[t as usize][(i as usize + 1) % 3]);
            let nb = topo.neighbor(t as usize, i as usize)?;
            let mut pts: Vec<V3> = verts.iter().map(|&v| mesh.positions[v as usize]).collect();
            if smooth {
                smooth_run(&mut pts, mesh, bvh);
            }
            let body = tri_body[groups[c][0] as usize] as usize;
            let mut ids = Vec::new();
            for piece in split_by_length(&pts, piece_len[body]) {
                ids.push(runs.len() as u32);
                runs.push(Run {
                    pts: piece,
                    charts: [c as u32, chart[nb]],
                    smooth,
                });
            }
            sides.extend(ids.iter().map(|&r| (r, false)));
            stretches.push(ids);
        }
        charts.push(Chart {
            body: tri_body[groups[c][0] as usize],
            sides,
            poles: Vec::new(),
            fit_error: f64::INFINITY,
        });
    }
    Some((charts, runs))
}

/// Cut a polyline into equal-length pieces no longer than `max_len`, sharing
/// their ends.
fn split_by_length(pts: &[V3], max_len: f64) -> Vec<Vec<V3>> {
    let mut arc = vec![0.0];
    for w in pts.windows(2) {
        arc.push(arc[arc.len() - 1] + dist(w[0], w[1]));
    }
    let total = arc[arc.len() - 1];
    // A straight run fills the same in one piece.
    let (a, b) = (pts[0], pts[pts.len() - 1]);
    let chord = sub(b, a);
    let straight = pts.iter().all(|&p| {
        let ap = sub(p, a);
        let along = dot(ap, chord) / dot(chord, chord).max(f64::MIN_POSITIVE);
        dist(p, add(a, scale(chord, along))) <= 1e-3 * total
    });
    let pieces = if max_len > 0.0 && !straight {
        (total / max_len).ceil().max(1.0) as usize
    } else {
        1
    };
    if pieces <= 1 || pts.len() < 2 {
        return vec![pts.to_vec()];
    }
    let at = |s: f64| -> (usize, V3) {
        // Segment index and the point at arc length `s`.
        let k = arc.partition_point(|&a| a <= s).clamp(1, pts.len() - 1);
        let (a, b) = (arc[k - 1], arc[k]);
        let t = if b > a { (s - a) / (b - a) } else { 0.0 };
        (k, add(pts[k - 1], scale(sub(pts[k], pts[k - 1]), t)))
    };
    let mut out = Vec::with_capacity(pieces);
    let mut current = vec![pts[0]];
    let mut next_vertex = 1;
    for j in 1..pieces {
        let (k, cut) = at(total * j as f64 / pieces as f64);
        while next_vertex < k {
            current.push(pts[next_vertex]);
            next_vertex += 1;
        }
        current.push(cut);
        out.push(std::mem::replace(&mut current, vec![cut]));
    }
    current.extend_from_slice(&pts[next_vertex..]);
    out.push(current);
    out
}

/// Mark corners on a loop until it has three, at arc-length thirds or at the
/// vertex nearest the middle of its longest side with a vertex inside.
fn add_corners(mesh: &Mesh, lp: &[(u32, u8)], corner: &mut [bool]) {
    let vert = |k: usize| {
        let (t, i) = lp[k % lp.len()];
        mesh.triangles[t as usize][i as usize]
    };
    let n = lp.len();
    if n < 3 {
        return;
    }
    let mut arc = Vec::with_capacity(n + 1);
    arc.push(0.0);
    for k in 0..n {
        let a = mesh.positions[vert(k) as usize];
        let b = mesh.positions[vert(k + 1) as usize];
        arc.push(arc[k] + dist(a, b));
    }
    let total = arc[n];
    let at = |s: f64, from: usize| -> usize {
        // First vertex at or past arc length `s`, counting from vertex `from`.
        let base = arc[from];
        (0..n)
            .map(|j| (from + j) % n)
            .find(|&k| {
                let d = arc[k] - base;
                let d = if d < 0.0 { d + total } else { d };
                d >= s
            })
            .unwrap_or(from)
    };
    let corners = |corner: &[bool]| {
        (0..n)
            .filter(|&k| corner[vert(k) as usize])
            .collect::<Vec<_>>()
    };
    let mut have = corners(corner);
    if have.is_empty() {
        for s in [0.0, total / 3.0, 2.0 * total / 3.0] {
            corner[vert(at(s, 0)) as usize] = true;
        }
        return;
    }
    while have.len() < 3 {
        // (length, first vertex, segments) of the longest side that can split.
        let mut best: Option<(f64, usize, usize)> = None;
        for (j, &k) in have.iter().enumerate() {
            let next = have[(j + 1) % have.len()];
            let mut len = arc[next] - arc[k];
            if len <= 0.0 {
                len += total;
            }
            let segs = match (next + n - k) % n {
                0 => n,
                s => s,
            };
            if segs >= 2 && best.is_none_or(|b| len > b.0) {
                best = Some((len, k, segs));
            }
        }
        let Some((len, k, segs)) = best else { return };
        let off_middle = |j: usize| {
            let mut d = arc[(k + j) % n] - arc[k];
            if d < 0.0 {
                d += total;
            }
            (d - len / 2.0).abs()
        };
        let mid = (1..segs)
            .min_by(|&a, &b| off_middle(a).total_cmp(&off_middle(b)))
            .map_or(k, |j| (k + j) % n);
        corner[vert(mid) as usize] = true;
        have = corners(corner);
    }
}

/// A chart boundary follows mesh edges and zigzags across the triangles; relax
/// it along the mesh with its corners fixed.
fn smooth_run(pts: &mut [V3], mesh: &Mesh, bvh: &Bvh) {
    if pts.len() < 3 {
        return;
    }
    let mut stack = Vec::new();
    for _ in 0..SMOOTH_PASSES {
        let prev = pts.to_vec();
        for k in 1..pts.len() - 1 {
            let mid = scale(add(prev[k - 1], prev[k + 1]), 0.5);
            let p = scale(add(prev[k], mid), 0.5);
            let (_, t) = bvh.nearest(p, &mut stack);
            if (t as usize) < mesh.triangles.len() {
                let [a, b, c] = mesh.tri(t as usize);
                pts[k] = closest_on_triangle(p, a, b, c);
            }
        }
    }
}

/// Fit each chart's surface to the input vertices on it and on the
/// triangles around its edge, plus its boundary runs.
fn fit_surfaces(
    cx: &Ctx,
    g: &Geo,
    chart: &[u32],
    charts: &mut [Chart],
    runs: &[Run],
    proxies: &[V3],
) {
    let (mesh, input, bvh, stride) = (cx.src.mesh, cx.src.input, cx.src.bvh, cx.src.stride);
    let around = vertex_charts(mesh, chart);
    let n = charts.len();
    let mut bb = vec![Bbox::empty(); n];
    for (t, &c) in chart.iter().enumerate() {
        if c != NONE {
            for v in mesh.triangles[t] {
                bb[c as usize].expand(mesh.positions[v as usize]);
            }
        }
    }
    let mut stack = Vec::new();
    let mut fitted: Vec<Vec<V3>> = vec![Vec::new(); n];
    // A neighbour's triangle tilted past this from a chart's mean normal would
    // fold its height field; decimated scan triangles reach far past the edge.
    let cos_ring = (RING_CONE * cx.p.cone_deg).to_radians().cos();
    for &p in input.positions.iter().step_by(stride.max(1)) {
        let (_, t) = bvh.nearest(p, &mut stack);
        let Some(&own) = chart.get(t as usize).filter(|&&c| c != NONE) else {
            continue;
        };
        // Points around a chart's edge also fit it, so its surface holds up to
        // the boundary rather than swinging where its own data ends.
        let mut near: [u32; 9] = [NONE; 9];
        let mut k = 0;
        for &v in &mesh.triangles[t as usize] {
            for &nc in &around[v as usize] {
                if k < near.len() && !near[..k].contains(&nc) {
                    near[k] = nc;
                    k += 1;
                }
            }
        }
        for &nc in &near[..k] {
            if nc == own || dot(g.normal[t as usize], proxies[nc as usize]) >= cos_ring {
                fitted[nc as usize].push(p);
            }
        }
    }
    for (c, mut pts) in fitted.into_iter().enumerate() {
        if pts.len() > SURFACE_SAMPLES {
            let step = pts.len().div_ceil(SURFACE_SAMPLES);
            pts = pts.into_iter().step_by(step).collect();
        }
        for &(r, _) in &charts[c].sides {
            pts.extend_from_slice(&runs[r as usize].pts);
        }
        let nrm = proxies[c];
        let helper = if nrm[0].abs() < 0.9 {
            [1.0, 0.0, 0.0]
        } else {
            [0.0, 1.0, 0.0]
        };
        let u = normalize(cross(nrm, helper)).unwrap_or([1.0, 0.0, 0.0]);
        let v = cross(nrm, u);
        let o = scale(add(bb[c].min, bb[c].max), 0.5);
        (charts[c].poles, charts[c].fit_error) = fit_surface(&pts, o, u, v, nrm);
    }
}

/// Control points per side of a chart's surface: enough for the chart's detail,
/// few enough that every one has data near it.
const SURFACE_CONTROL: (usize, usize) = (5, 16);
/// Points per control point a chart's surface wants before adding resolution.
const SURFACE_POINTS_PER_CONTROL: f64 = 4.0;
/// Weight of bending against the data, per point per control point. It only
/// settles what the points leave free (control points with no data near them
/// extend the surface smoothly, where a polynomial swings); any more flattens
/// the chart, since it penalizes the control net's own second differences.
const SURFACE_SMOOTHING: f64 = 1e-6;

/// In-plane axes along the spread of the points: a rectangle around an
/// elongated chart then wastes less of itself.
fn principal_axes(pts: &[V3], o: V3, u: V3, v: V3) -> (V3, V3) {
    let (mut ss, mut st, mut tt, mut ms, mut mt) = (0.0, 0.0, 0.0, 0.0, 0.0);
    for &p in pts {
        let d = sub(p, o);
        let (s, t) = (dot(d, u), dot(d, v));
        ms += s;
        mt += t;
        ss += s * s;
        st += s * t;
        tt += t * t;
    }
    let n = pts.len().max(1) as f64;
    let (ms, mt) = (ms / n, mt / n);
    let (ss, st, tt) = (ss / n - ms * ms, st / n - ms * mt, tt / n - mt * mt);
    let angle = 0.5 * (2.0 * st).atan2(ss - tt);
    let (c, s) = (angle.cos(), angle.sin());
    (add(scale(u, c), scale(v, s)), sub(scale(v, c), scale(u, s)))
}

/// Uniform cubic B-spline weights at `x` in [0, k - 3] over `k` control
/// points: the first control point touched and the four weights.
fn cubic_weights(x: f64, k: usize) -> (usize, [f64; 4]) {
    let span = (x.floor().max(0.0) as usize).min(k - 4);
    let u = x - span as f64;
    let (u2, u3) = (u * u, u * u * u);
    (
        span,
        [
            (1.0 - u).powi(3) / 6.0,
            (3.0 * u3 - 6.0 * u2 + 4.0) / 6.0,
            (-3.0 * u3 + 3.0 * u2 + 3.0 * u + 1.0) / 6.0,
            u3 / 6.0,
        ],
    )
}

/// A height field over the plane (o; u, v), fitted to `pts` as a smoothed
/// least-squares uniform cubic B-spline over the points' extent plus a
/// margin, returned as its k × k poles (see `Chart::poles`) with the largest
/// height of a point off it. The surface's first direction runs along the
/// points' principal axis and the second across, so it faces along `n`.
/// Empty when the points span no area.
fn fit_surface(pts: &[V3], o: V3, u: V3, v: V3, n: V3) -> (Vec<V3>, f64) {
    let (u, v) = principal_axes(pts, o, u, v);
    let local: Vec<(f64, f64, f64)> = pts
        .iter()
        .map(|&p| {
            let d = sub(p, o);
            (dot(d, u), dot(d, v), dot(d, n))
        })
        .collect();
    let (mut s0, mut s1, mut t0, mut t1) = (
        f64::INFINITY,
        f64::NEG_INFINITY,
        f64::INFINITY,
        f64::NEG_INFINITY,
    );
    for &(s, t, _) in &local {
        s0 = s0.min(s);
        s1 = s1.max(s);
        t0 = t0.min(t);
        t1 = t1.max(t);
    }
    if !(s1 > s0 && t1 > t0) {
        return (Vec::new(), f64::INFINITY);
    }
    let (ms, mt) = (SURFACE_MARGIN * (s1 - s0), SURFACE_MARGIN * (t1 - t0));
    let (s0, s1, t0, t1) = (s0 - ms, s1 + ms, t0 - mt, t1 + mt);
    let k = ((local.len() as f64 / SURFACE_POINTS_PER_CONTROL)
        .sqrt()
        .round() as usize)
        .clamp(SURFACE_CONTROL.0, SURFACE_CONTROL.1);
    let spans = (k - 3) as f64;
    let xs = |s: f64| (s - s0) / (s1 - s0) * spans;
    let xt = |t: f64| (t - t0) / (t1 - t0) * spans;
    let m = k * k;
    let mut a = vec![vec![0.0; m]; m];
    let mut r = vec![0.0; m];
    for &(s, t, z) in &local {
        let (i0, ws) = cubic_weights(xs(s), k);
        let (j0, wt) = cubic_weights(xt(t), k);
        let mut idx = [0usize; 16];
        let mut w = [0.0; 16];
        for a_ in 0..4 {
            for b_ in 0..4 {
                idx[4 * a_ + b_] = (i0 + a_) * k + (j0 + b_);
                w[4 * a_ + b_] = ws[a_] * wt[b_];
            }
        }
        for x in 0..16 {
            r[idx[x]] += w[x] * z;
            for y in 0..16 {
                a[idx[x]][idx[y]] += w[x] * w[y];
            }
        }
    }
    // Second differences of the control net along each direction and across.
    let lambda = SURFACE_SMOOTHING * local.len() as f64 / m as f64;
    let mut bend = |terms: &[(usize, f64)], weight: f64| {
        for &(p, wp) in terms {
            for &(q, wq) in terms {
                a[p][q] += lambda * weight * wp * wq;
            }
        }
    };
    let at = |i: usize, j: usize| i * k + j;
    for i in 0..k {
        for j in 0..k {
            if i + 2 < k {
                bend(
                    &[(at(i, j), 1.0), (at(i + 1, j), -2.0), (at(i + 2, j), 1.0)],
                    1.0,
                );
            }
            if j + 2 < k {
                bend(
                    &[(at(i, j), 1.0), (at(i, j + 1), -2.0), (at(i, j + 2), 1.0)],
                    1.0,
                );
            }
            if i + 1 < k && j + 1 < k {
                bend(
                    &[
                        (at(i, j), 1.0),
                        (at(i + 1, j), -1.0),
                        (at(i, j + 1), -1.0),
                        (at(i + 1, j + 1), 1.0),
                    ],
                    2.0,
                );
            }
        }
    }
    let Some(c) = crate::fit::solve(a, r) else {
        return (Vec::new(), f64::INFINITY);
    };
    let height = |s: f64, t: f64| {
        let (i0, ws) = cubic_weights(xs(s), k);
        let (j0, wt) = cubic_weights(xt(t), k);
        let mut z = 0.0;
        for a_ in 0..4 {
            for b_ in 0..4 {
                z += ws[a_] * wt[b_] * c[(i0 + a_) * k + (j0 + b_)];
            }
        }
        z
    };
    // The spline exactly as a B-spline surface: uniform cubic in x and y, so
    // its poles are the control heights over their Greville points (control
    // point i peaks at x = i - 1), where s and t, being linear in x and y,
    // are reproduced by the same basis.
    let mut poles = Vec::with_capacity(m);
    for i in 0..k {
        let s = s0 + (i as f64 - 1.0) / spans * (s1 - s0);
        for j in 0..k {
            let t = t0 + (j as f64 - 1.0) / spans * (t1 - t0);
            poles.push(add(
                add(o, add(scale(u, s), scale(v, t))),
                scale(n, c[i * k + j]),
            ));
        }
    }
    let residual = local
        .iter()
        .map(|&(s, t, z)| (height(s, t) - z).abs())
        .fold(0.0, f64::max);
    (poles, residual)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mesh::fixtures::{cube, sphere};

    fn params() -> ChartParams {
        ChartParams {
            cone_deg: 40.0,
            cone_slack: 0.0,
            crease_deg: 50.0,
            noise: 0.0,
            max_extent: 0.5,
            max_run: 0.1,
            max_charts: 256,
        }
    }

    fn charts_of(mesh: &Mesh) -> Charts {
        charts_with(mesh, &params()).expect("charts")
    }

    fn charts_with(mesh: &Mesh, p: &ChartParams) -> Option<Charts> {
        let topo = Topology::build(mesh);
        let n = mesh.triangles.len();
        let bvh = Bvh::new((0..n).map(|t| mesh.tri(t)).collect());
        let (mask, tri_body) = (vec![true; n], vec![0; n]);
        let src = ChartInput {
            mesh,
            topo: &topo,
            mask: &mask,
            tri_body: &tri_body,
            bvh: &bvh,
            input: mesh,
            stride: 1,
        };
        build(&src, p)
    }

    /// Every side starts where the previous one ended, and every run is a side
    /// of exactly two charts, once each way.
    fn assert_closed(c: &Charts) {
        let mut uses = vec![(0, 0); c.runs.len()];
        for ch in &c.charts {
            assert!(ch.sides.len() >= 3, "a chart with {} sides", ch.sides.len());
            let ends = |&(r, back): &(u32, bool)| {
                let pts = &c.runs[r as usize].pts;
                let (a, b) = (pts[0], pts[pts.len() - 1]);
                if back {
                    (b, a)
                } else {
                    (a, b)
                }
            };
            for k in 0..ch.sides.len() {
                let (_, end) = ends(&ch.sides[k]);
                let (start, _) = ends(&ch.sides[(k + 1) % ch.sides.len()]);
                assert!(dist(end, start) < 1e-12);
            }
            for &(r, back) in &ch.sides {
                if back {
                    uses[r as usize].1 += 1;
                } else {
                    uses[r as usize].0 += 1;
                }
            }
        }
        assert!(uses.iter().all(|&u| u == (1, 1)), "{uses:?}");
    }

    /// Torus around z, outward-facing, `nu` × `nv` quads split into triangles.
    fn torus(major: f64, minor: f64, nu: usize, nv: usize) -> Mesh {
        let mut m = Mesh::default();
        for i in 0..nu {
            let u = 2.0 * std::f64::consts::PI * i as f64 / nu as f64;
            for j in 0..nv {
                let v = 2.0 * std::f64::consts::PI * j as f64 / nv as f64;
                let rho = major + minor * v.cos();
                m.positions
                    .push([rho * u.cos(), rho * u.sin(), minor * v.sin()]);
            }
        }
        let id = |i: usize, j: usize| ((i % nu) * nv + (j % nv)) as u32;
        for i in 0..nu {
            for j in 0..nv {
                let (a, b, c, d) = (id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1));
                m.triangles.push([a, b, c]);
                m.triangles.push([a, c, d]);
            }
        }
        m
    }

    /// The bumpy ring of the TS organic corpus.
    fn bumpy_ring(nu: usize, nv: usize) -> Mesh {
        let mut m = torus(1.0, 1.0, nu, nv);
        for (k, p) in m.positions.iter_mut().enumerate() {
            let (i, j) = (k / nv, k % nv);
            let u = 2.0 * std::f64::consts::PI * i as f64 / nu as f64;
            let v = 2.0 * std::f64::consts::PI * j as f64 / nv as f64;
            let minor = 7.0 * (1.0 + 0.2 * (3.0 * u).sin());
            let major = 25.0 + 2.0 * (2.0 * u).cos();
            let rho = major + minor * v.cos();
            *p = [
                rho * u.cos(),
                rho * u.sin(),
                minor * v.sin() + 2.0 * u.sin(),
            ];
        }
        m
    }

    #[test]
    #[ignore = "diagnostic: cargo test --release seed_residuals -- --ignored --nocapture"]
    fn seed_residuals() {
        for (name, m) in [
            ("ring", bumpy_ring(192, 64)),
            ("sphere", sphere(20.0, 64, 128)),
        ] {
            let c = charts_of(&m);
            let mut errs: Vec<f64> = c.charts.iter().map(|ch| ch.fit_error).collect();
            errs.sort_by(f64::total_cmp);
            eprintln!(
                "{name}: {} charts; fit error median {:.4}, worst {:.4}",
                c.charts.len(),
                errs[errs.len() / 2],
                errs[errs.len() - 1]
            );
        }
    }

    #[test]
    fn a_torus_charts_into_discs() {
        let c = charts_of(&torus(25.0, 7.0, 96, 32));
        assert!(c.charts.len() >= 8, "{} charts", c.charts.len());
        assert_closed(&c);
    }

    #[test]
    fn a_cube_charts_one_face_per_side() {
        let c = charts_of(&cube(10.0));
        assert_eq!(c.charts.len(), 6);
        assert_eq!(c.runs.len(), 12);
        assert!(c.runs.iter().all(|r| !r.smooth));
        assert_closed(&c);
    }

    #[test]
    fn sharp_regions_past_the_chart_budget_give_no_charts() {
        let p = ChartParams {
            max_charts: 5,
            ..params()
        };
        assert!(charts_with(&cube(10.0), &p).is_none());
    }

    #[test]
    fn a_sphere_charts_into_smooth_discs() {
        let m = sphere(10.0, 32, 64);
        let c = charts_of(&m);
        assert!(
            c.charts.len() >= 8 && c.charts.len() <= 64,
            "{} charts",
            c.charts.len()
        );
        assert!(c.runs.iter().all(|r| r.smooth));
        assert_closed(&c);
        // Smoothed runs stay on the mesh; each chart's surface follows it
        // within its own chord sag.
        for r in &c.runs {
            for &p in &r.pts {
                assert!((crate::math::norm(p) - 10.0).abs() < 0.05);
            }
        }
        for ch in &c.charts {
            let k = (ch.poles.len() as f64).sqrt() as usize;
            assert!(k >= SURFACE_CONTROL.0 && k * k == ch.poles.len());
            assert!(ch.fit_error < 0.05, "fit error {}", ch.fit_error);
        }
    }
}
