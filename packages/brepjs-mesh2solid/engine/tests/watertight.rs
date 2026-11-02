//! The tier 0 output must be a closed, consistently oriented triangle surface:
//! every directed edge appears exactly once and its reverse exactly once. A
//! polygon region whose triangulation loses a loop vertex breaks this with a
//! T-junction against the neighbor that still uses the vertex.

use std::collections::HashMap;

use mesh2solid_engine::earcut;
use mesh2solid_engine::pipeline::{run_tier0, Options, Tier0};

fn unmatched_edges(out: &Tier0) -> usize {
    let triangles: usize = out.regions.regions.iter().map(|r| r.triangles.len()).sum();
    assert!(
        triangles >= 4,
        "conversion produced only {triangles} triangles"
    );
    let mut edges: HashMap<(u32, u32), i32> = HashMap::new();
    for r in &out.regions.regions {
        for t in &r.triangles {
            for i in 0..3 {
                *edges.entry((t[i], t[(i + 1) % 3])).or_default() += 1;
            }
        }
    }
    edges
        .iter()
        .filter(|(&(a, b), &c)| c != 1 || edges.get(&(b, a)).copied().unwrap_or(0) != 1)
        .count()
}

fn every_loop_vertex_triangulated(out: &Tier0) -> bool {
    out.regions
        .regions
        .iter()
        .filter(|r| !r.loops.is_empty())
        .all(|r| {
            let used: std::collections::HashSet<u32> =
                r.triangles.iter().flatten().copied().collect();
            r.loops.iter().flatten().all(|v| used.contains(v))
        })
}

fn convert_obj(src: &str) -> Tier0 {
    run_tier0(
        src.as_bytes(),
        &Options {
            format_hint: "part.obj".into(),
            ..Options::default()
        },
    )
    .expect("conversion succeeds")
}

#[test]
fn collinear_loop_vertex_is_kept() {
    let out = convert_obj(include_str!("fixtures/tjunction_prism.obj"));
    assert_eq!(unmatched_edges(&out), 0);
    assert!(every_loop_vertex_triangulated(&out));
}

#[test]
fn zero_area_ear_does_not_open_the_surface() {
    let out = convert_obj(include_str!("fixtures/zero_area_ear_prism.obj"));
    assert_eq!(unmatched_edges(&out), 0);
    assert!(every_loop_vertex_triangulated(&out));
}

fn rng(s: &mut u64) -> f64 {
    *s ^= *s << 13;
    *s ^= *s >> 7;
    *s ^= *s << 17;
    ((*s >> 11) as f64) / ((1u64 << 53) as f64)
}

fn signed_area(p: &[[f64; 2]]) -> f64 {
    let n = p.len();
    (0..n)
        .map(|i| p[i][0] * p[(i + 1) % n][1] - p[(i + 1) % n][0] * p[i][1])
        .sum::<f64>()
        * 0.5
}

/// Star-shaped prisms with extra points along straight top edges and non-planar
/// sides, so collinear top vertices stay junctions of the top polygon.
#[test]
fn random_prisms_stay_watertight() {
    let mut s = 4242u64;
    let mut tried = 0;
    for _ in 0..2000 {
        let k = 3 + (rng(&mut s) * 7.0) as usize;
        let mut base: Vec<[f64; 2]> = (0..k)
            .map(|i| {
                let a = 2.0 * std::f64::consts::PI * (i as f64) / (k as f64);
                let r = if rng(&mut s) < 0.5 {
                    10.0
                } else {
                    3.0 + 7.0 * rng(&mut s)
                };
                [(r * a.cos()).round(), (r * a.sin()).round()]
            })
            .collect();
        base.dedup();
        if base.len() < 3 || signed_area(&base) <= 0.0 {
            continue;
        }
        let mut poly = Vec::new();
        for i in 0..base.len() {
            let (a, b) = (base[i], base[(i + 1) % base.len()]);
            poly.push(a);
            let m = (rng(&mut s) * 3.0) as usize;
            for j in 1..=m {
                let t = j as f64 / (m as f64 + 1.0);
                poly.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
            }
        }
        let n = poly.len();
        let shrink: Vec<f64> = (0..n).map(|_| 0.6 + 0.3 * rng(&mut s)).collect();
        let bottom: Vec<[f64; 2]> = (0..n)
            .map(|i| [poly[i][0] * shrink[i], poly[i][1] * shrink[i]])
            .collect();
        let (Some(top_t), Some(bot_t)) = (
            earcut::triangulate_2d(&poly, &[]),
            earcut::triangulate_2d(&bottom, &[]),
        ) else {
            continue;
        };
        if top_t.len() != n - 2 || bot_t.len() != n - 2 {
            continue;
        }
        let mut obj = String::new();
        for p in &poly {
            obj += &format!("v {:.17} {:.17} 5\n", p[0], p[1]);
        }
        for p in &bottom {
            obj += &format!("v {:.17} {:.17} -5\n", p[0], p[1]);
        }
        for t in &top_t {
            obj += &format!("f {} {} {}\n", t[0] + 1, t[1] + 1, t[2] + 1);
        }
        for t in &bot_t {
            obj += &format!("f {} {} {}\n", t[0] + 1 + n, t[2] + 1 + n, t[1] + 1 + n);
        }
        for i in 0..n {
            let j = (i + 1) % n;
            obj += &format!(
                "f {} {} {}\nf {} {} {}\n",
                i + 1,
                n + i + 1,
                n + j + 1,
                i + 1,
                n + j + 1,
                j + 1
            );
        }
        tried += 1;
        let out = convert_obj(&obj);
        assert_eq!(unmatched_edges(&out), 0, "prism {tried} leaks:\n{obj}");
        assert!(
            every_loop_vertex_triangulated(&out),
            "prism {tried} drops a loop vertex"
        );
    }
    assert!(tried > 1000, "only {tried} prisms generated");
}
