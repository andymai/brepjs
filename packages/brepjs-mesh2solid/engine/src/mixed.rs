//! Mixed parts: a mesh most of whose faces are analytic, with freeform
//! regions between them. The analytic regions keep their fitted surfaces;
//! each freeform region is split into charts (see `charts`) whose boundary
//! runs know the analytic region on their other side, so the faces fitted to
//! the charts fill the holes the freeform regions leave in the analytic
//! rebuild.
//!
//! A freeform region starts from the triangles no surface fits. Around them
//! the segmentation leaves fragments: every triangle is a plane and every
//! short strip some cylinder or torus. A fragment joins the freeform region
//! it touches when it is the smaller of the two and meets it without a
//! crease along a good part of its boundary; a face meets a freeform
//! neighbour that way only where it runs into it smoothly, and then it is
//! the larger one in all but contrived parts.

use crate::charts::{self, ChartInput, ChartParams, Charts, Geo};
use crate::estimate::MeshKind;
use crate::fit::Kind;
use crate::math::{add, dist, dot, scale, V3};
use crate::mesh::{Mesh, Topology};
use crate::pipeline::MAX_DEVIATION_SAMPLES;
use crate::tier1::Tier1;

const NONE: u32 = u32::MAX;

/// A fragment joins a freeform region when at least this share of its
/// boundary meets the region without a crease. A decimated scan triangle
/// that bridges a crease reads as smooth to both sides, so a few such edges
/// must not hand a whole face to the freeform region beside it.
const JOIN_BOUNDARY: f64 = 0.25;
/// On a scan, unfit triangles in patches under this share of the mesh area
/// are the chords decimation leaves across creases, not freeform regions.
const SCAN_SPECK_AREA: f64 = 0.005;
/// A freeform region's boundary is laid onto its analytic neighbour as one
/// curve per run, which holds at any length there; runs stay whole.
const RUN: f64 = f64::INFINITY;
const MAX_CHARTS: usize = 256;

/// One connected patch of freeform triangles.
pub struct FreeformRegion {
    pub body: u32,
    pub triangles: usize,
    /// Share of the mesh area.
    pub area: f64,
    pub charts: usize,
    /// Largest fit error and sag among its charts.
    pub fit_error: f64,
    pub sag: f64,
}

pub struct Mixed {
    /// The analytic region each triangle lies on, or `u32::MAX` in a freeform region.
    pub label: Vec<u32>,
    /// Per analytic region of the segmentation: kept as an exact face.
    pub kept: Vec<bool>,
    pub charts: Charts,
    /// Freeform region of each chart.
    pub chart_region: Vec<u32>,
    pub regions: Vec<FreeformRegion>,
    /// Largest gap between a triangle and the surface it is rebuilt from,
    /// over the kept regions and the charts.
    pub sag: f64,
}

/// Connected components of the triangles `member` holds, across the edges
/// `joined` allows: component per triangle (`u32::MAX` outside) and count.
fn components(
    topo: &Topology,
    member: &[bool],
    joined: impl Fn(usize, usize) -> bool,
) -> (Vec<u32>, usize) {
    let mut comp = vec![NONE; member.len()];
    let mut count = 0;
    let mut stack = Vec::new();
    for seed in 0..member.len() {
        if !member[seed] || comp[seed] != NONE {
            continue;
        }
        comp[seed] = count as u32;
        stack.push(seed);
        while let Some(t) = stack.pop() {
            for i in 0..3 {
                if let Some(nb) = topo.neighbor(t, i) {
                    if member[nb] && comp[nb] == NONE && joined(t, i) {
                        comp[nb] = count as u32;
                        stack.push(nb);
                    }
                }
            }
        }
        count += 1;
    }
    (comp, count)
}

fn edge_len(mesh: &Mesh, t: usize, i: usize) -> f64 {
    let tri = mesh.triangles[t];
    dist(
        mesh.positions[tri[i] as usize],
        mesh.positions[tri[(i + 1) % 3] as usize],
    )
}

/// Which triangles are freeform (`true`), and the analytic region of every
/// other one.
fn classify(t1: &Tier1, topo: &Topology, g: &Geo) -> Result<(Vec<bool>, Vec<u32>), String> {
    let mesh = &t1.t0.mesh;
    let seg = &t1.seg;
    let n = mesh.triangles.len();
    let scan = matches!(t1.t0.kind, MeshKind::Scan);
    let total: f64 = g.area.iter().sum();
    let smooth = |t: usize, i: usize| g.pass[t][i] != NONE;

    let mut label = seg.region_of.clone();
    let mut free: Vec<bool> = label.iter().map(|&r| r == NONE).collect();
    let mut speck = vec![false; n];
    if scan {
        let (comp, count) = components(topo, &free, |_, _| true);
        let mut area = vec![0.0; count];
        for t in 0..n {
            if comp[t] != NONE {
                area[comp[t] as usize] += g.area[t];
            }
        }
        for t in 0..n {
            if comp[t] != NONE && area[comp[t] as usize] < SCAN_SPECK_AREA * total {
                free[t] = false;
                speck[t] = true;
            }
        }
        // Within noise a torus or a cone fits a stretch of any curved
        // surface, so on a part that has no analytic rebuild they are the
        // freeform surface in pieces.
        for region in &seg.regions {
            if matches!(region.surface.kind(), Kind::Torus | Kind::Cone) {
                for &t in &region.tris {
                    free[t as usize] = true;
                    label[t as usize] = NONE;
                }
            }
        }
    }

    let mut region_area = vec![0.0; seg.regions.len()];
    for (r, region) in seg.regions.iter().enumerate() {
        region_area[r] = region.tris.iter().map(|&t| g.area[t as usize]).sum();
    }
    let mut alive: Vec<bool> = seg
        .regions
        .iter()
        .map(|r| r.tris.first().is_some_and(|&t| !free[t as usize]))
        .collect();
    loop {
        let (comp, count) = components(topo, &free, smooth);
        let mut comp_area = vec![0.0; count];
        for t in 0..n {
            if comp[t] != NONE {
                comp_area[comp[t] as usize] += g.area[t];
            }
        }
        let mut joining = Vec::new();
        for (r, region) in seg.regions.iter().enumerate() {
            if !alive[r] {
                continue;
            }
            let (mut boundary, mut shared) = (0.0, 0.0);
            let mut touched: Vec<u32> = Vec::new();
            for &t in &region.tris {
                let t = t as usize;
                for i in 0..3 {
                    let Some(nb) = topo.neighbor(t, i) else {
                        continue;
                    };
                    if label[nb] == r as u32 {
                        continue;
                    }
                    let len = edge_len(mesh, t, i);
                    boundary += len;
                    if free[nb] && smooth(t, i) {
                        shared += len;
                        if !touched.contains(&comp[nb]) {
                            touched.push(comp[nb]);
                        }
                    }
                }
            }
            let beside: f64 = touched.iter().map(|&c| comp_area[c as usize]).sum();
            if shared >= JOIN_BOUNDARY * boundary && shared > 0.0 && region_area[r] < beside {
                joining.push(r);
            }
        }
        if joining.is_empty() {
            break;
        }
        for r in joining {
            alive[r] = false;
            for &t in &seg.regions[r].tris {
                free[t as usize] = true;
                label[t as usize] = NONE;
            }
        }
    }

    if scan {
        // A facet that bridges a crease can come along with a freeform
        // fragment and stand apart from the region's other triangles.
        let (comp, count) = components(topo, &free, smooth);
        let mut area = vec![0.0; count];
        for t in 0..n {
            if comp[t] != NONE {
                area[comp[t] as usize] += g.area[t];
            }
        }
        for t in 0..n {
            if comp[t] != NONE && area[comp[t] as usize] < SCAN_SPECK_AREA * total {
                free[t] = false;
                speck[t] = true;
            }
        }
    }
    // A speck takes the side its facet leans to, so the regions tile the mesh.
    loop {
        let mut moved = false;
        let mut left = false;
        for t in 0..n {
            if !speck[t] {
                continue;
            }
            let mut best: Option<(f64, usize)> = None;
            for i in 0..3 {
                if let Some(nb) = topo.neighbor(t, i).filter(|&nb| !speck[nb]) {
                    let lean = dot(g.normal[t], g.normal[nb]);
                    if best.is_none_or(|b| lean > b.0) {
                        best = Some((lean, nb));
                    }
                }
            }
            match best {
                Some((_, nb)) => {
                    speck[t] = false;
                    free[t] = free[nb];
                    label[t] = label[nb];
                    moved = true;
                }
                None => left = true,
            }
        }
        if !left {
            break;
        }
        if !moved {
            return Err("unfit triangles border no fitted surface".into());
        }
    }

    if !free.iter().any(|&f| f) {
        return Err("no freeform region: the unfit triangles are scattered".into());
    }
    if !alive.iter().any(|&a| a) {
        return Err("no analytic surface is left beside the freeform regions".into());
    }
    Ok((free, label))
}

/// Split the mesh into kept analytic regions and charted freeform regions.
/// `max_extent` is the largest curved chart as a share of its body's diagonal.
pub fn build(t1: &Tier1, max_extent: f64) -> Result<Mixed, String> {
    let mesh = &t1.t0.mesh;
    let topo = Topology::build(mesh);
    let n = mesh.triangles.len();
    let scan = matches!(t1.t0.kind, MeshKind::Scan);
    let noise = if scan { t1.t0.tolerance } else { 0.0 };
    let everything = vec![true; n];
    let g = Geo::new(mesh, &topo, &everything, crate::tier1::CREASE_DEG, noise);
    let (free, label) = classify(t1, &topo, &g)?;

    let params = ChartParams {
        cone_deg: crate::tier1::CHART_CONE_DEG,
        cone_slack: if scan { 0.05 } else { 0.0 },
        crease_deg: crate::tier1::CREASE_DEG,
        noise,
        max_extent,
        max_run: RUN,
        max_charts: MAX_CHARTS,
    };
    let supports: Vec<_> = t1.seg.regions.iter().map(|r| r.surface).collect();
    let input = &t1.t0.input;
    let src = ChartInput {
        mesh,
        topo: &topo,
        mask: &free,
        outside: &label,
        supports: &supports,
        tri_body: &t1.tri_body,
        bvh: &t1.bvh,
        input,
        stride: input.positions.len().div_ceil(MAX_DEVIATION_SAMPLES).max(1),
    };
    let charts = charts::build(&src, &params)
        .ok_or("the freeform regions do not split into few enough smooth charts")?;

    let (comp, count) = components(&topo, &free, |_, _| true);
    let total: f64 = g.area.iter().sum();
    let mut regions: Vec<FreeformRegion> = (0..count)
        .map(|_| FreeformRegion {
            body: 0,
            triangles: 0,
            area: 0.0,
            charts: 0,
            fit_error: 0.0,
            sag: 0.0,
        })
        .collect();
    let mut chart_region = vec![NONE; charts.charts.len()];
    for t in 0..n {
        if comp[t] == NONE {
            continue;
        }
        let r = &mut regions[comp[t] as usize];
        r.body = t1.tri_body[t];
        r.triangles += 1;
        r.area += g.area[t] / total;
        let c = charts.tri_chart[t];
        if c != NONE {
            chart_region[c as usize] = comp[t];
        }
    }
    for (c, chart) in charts.charts.iter().enumerate() {
        let r = &mut regions[chart_region[c] as usize];
        r.charts += 1;
        r.fit_error = r.fit_error.max(chart.fit_error);
        r.sag = r.sag.max(chart.sag);
    }

    let mut kept = vec![false; t1.seg.regions.len()];
    let mut sag = regions.iter().map(|r| r.sag).fold(0.0, f64::max);
    for (t, &r) in label.iter().enumerate() {
        // A speck handed to a region lies beside its surface, not on it.
        if r == NONE || t1.seg.region_of[t] != r {
            continue;
        }
        kept[r as usize] = true;
        let surface = &t1.seg.regions[r as usize].surface;
        let [a, b, c] = mesh.tri(t);
        let probes: [V3; 4] = [
            scale(add(add(a, b), c), 1.0 / 3.0),
            scale(add(a, b), 0.5),
            scale(add(b, c), 0.5),
            scale(add(c, a), 0.5),
        ];
        for p in probes {
            sag = sag.max(surface.distance(p));
        }
    }
    Ok(Mixed {
        label,
        kept,
        charts,
        chart_region,
        regions,
        sag,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::Options;
    use crate::tier1::run_tier1;

    /// A 40 x 30 block whose top is `z(x, y)` on an `n` x `n` grid, as ASCII STL.
    fn block(n: usize, z: impl Fn(f64, f64) -> f64) -> Vec<u8> {
        let at = |i: usize, j: usize| {
            let (x, y) = (40.0 * i as f64 / n as f64, 30.0 * j as f64 / n as f64);
            [x, y, z(x, y)]
        };
        let mut tris: Vec<[V3; 3]> = Vec::new();
        for i in 0..n {
            for j in 0..n {
                let (a, b, c, d) = (at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
                tris.push([a, b, c]);
                tris.push([a, c, d]);
            }
        }
        // The rim counter-clockwise from above; walls and floor hang from it.
        let mut rim: Vec<V3> = Vec::new();
        rim.extend((0..n).map(|i| at(i, 0)));
        rim.extend((0..n).map(|j| at(n, j)));
        rim.extend((0..n).map(|i| at(n - i, n)));
        rim.extend((0..n).map(|j| at(0, n - j)));
        let floor = |p: V3| [p[0], p[1], 0.0];
        for k in 0..rim.len() {
            let (a, b) = (rim[k], rim[(k + 1) % rim.len()]);
            tris.push([a, floor(a), floor(b)]);
            tris.push([a, floor(b), b]);
            tris.push([[20.0, 15.0, 0.0], floor(b), floor(a)]);
        }
        let mut out = String::from("solid block\n");
        for [a, b, c] in tris {
            out.push_str("facet normal 0 0 0\nouter loop\n");
            for p in [a, b, c] {
                out.push_str(&format!("vertex {} {} {}\n", p[0], p[1], p[2]));
            }
            out.push_str("endloop\nendfacet\n");
        }
        out.push_str("endsolid block\n");
        out.into_bytes()
    }

    fn sculpted(x: f64, y: f64) -> f64 {
        let (u, v) = ((x - 20.0) / 20.0, (y - 15.0) / 15.0);
        12.0 + 3.0 * (u * u - v * v) + 1.2 * u * v * v + 0.8 * (3.0 * u).sin() * (2.0 * v).cos()
    }

    #[test]
    fn a_sculpted_top_is_one_freeform_region_between_five_planes() {
        let t1 = run_tier1(&block(48, sculpted), &Options::default()).expect("tier 1");
        let m = build(&t1, 1.0).expect("a mixed part");
        let kept: Vec<_> = (0..m.kept.len()).filter(|&r| m.kept[r]).collect();
        assert_eq!(kept.len(), 5, "kept {kept:?}");
        for &r in &kept {
            assert_eq!(t1.seg.regions[r].surface.kind(), Kind::Plane);
        }
        assert_eq!(m.regions.len(), 1);
        assert_eq!(m.regions[0].triangles, 2 * 48 * 48);
        assert_eq!(m.charts.charts.len(), 1);
        // One creased run along each wall, on that wall's plane.
        assert_eq!(m.charts.runs.len(), 4);
        let mut walls: Vec<u32> = m.charts.runs.iter().map(|r| r.region).collect();
        walls.sort_unstable();
        walls.dedup();
        assert_eq!(walls.len(), 4);
        for run in &m.charts.runs {
            assert!(!run.smooth);
            assert!(m.kept[run.region as usize]);
            let wall = &t1.seg.regions[run.region as usize].surface;
            assert!(run.pts.iter().all(|&p| wall.distance(p) < 1e-6));
        }
        // The surface follows the grid within its own chord, and the freeform
        // triangles are labelled apart from the planes.
        assert!(
            m.regions[0].fit_error < 0.01,
            "fit {}",
            m.regions[0].fit_error
        );
        assert!(m.sag < 0.05, "sag {}", m.sag);
        let free = m.label.iter().filter(|&&l| l == NONE).count();
        assert_eq!(free, 2 * 48 * 48);
    }

    #[test]
    fn a_plain_box_is_not_a_mixed_part() {
        let t1 = run_tier1(&block(4, |_, _| 12.0), &Options::default()).expect("tier 1");
        assert!(build(&t1, 1.0).is_err());
    }
}
