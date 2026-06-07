//! Voxelize benchmark: each accelerated pass isolated, plus end-to-end.
//!
//! `distance_pass` isolates PR1 (BVH nearest-distance vs brute min over tris);
//! `sign_pass` isolates PR2 (hierarchical Barnes-Hut FWN vs exact O(N) FWN) —
//! this is where the PR2 win is read. `end_to_end` runs the full `voxelize_mesh`
//! and so reflects PR1+PR2 COMBINED (BVH distance + hierarchical sign vs brute
//! distance + exact sign); attribute the per-pass deltas from the isolated
//! groups, not from end_to_end. No absolute-time assertions — criterion's
//! regression report is the artifact.

use std::collections::HashMap;

use brepjs_voxel_wasm::fwn::Mesh;
use brepjs_voxel_wasm::grid::Grid;
use brepjs_voxel_wasm::ops::{
    distance_field_brute_pub, distance_field_bvh_pub, sign_field_exact_pub, sign_field_fast_pub,
    voxelize_mesh_brute_pub, voxelize_mesh_bvh_pub,
};
use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};

/// Deterministic unit icosphere: a 12/20 icosahedron loop-subdivided `subdiv`
/// times, midpoints deduped and projected back onto the unit sphere.
/// subdiv 2 -> 320 tris, 3 -> 1280, 4 -> 5120.
fn icosphere(subdiv: u32) -> (Vec<f32>, Vec<u32>) {
    let t = (1.0_f32 + 5.0_f32.sqrt()) / 2.0;
    let mut verts: Vec<[f32; 3]> = vec![
        [-1.0, t, 0.0],
        [1.0, t, 0.0],
        [-1.0, -t, 0.0],
        [1.0, -t, 0.0],
        [0.0, -1.0, t],
        [0.0, 1.0, t],
        [0.0, -1.0, -t],
        [0.0, 1.0, -t],
        [t, 0.0, -1.0],
        [t, 0.0, 1.0],
        [-t, 0.0, -1.0],
        [-t, 0.0, 1.0],
    ];
    for v in verts.iter_mut() {
        normalize(v);
    }
    let mut faces: Vec<[u32; 3]> = vec![
        [0, 11, 5],
        [0, 5, 1],
        [0, 1, 7],
        [0, 7, 10],
        [0, 10, 11],
        [1, 5, 9],
        [5, 11, 4],
        [11, 10, 2],
        [10, 7, 6],
        [7, 1, 8],
        [3, 9, 4],
        [3, 4, 2],
        [3, 2, 6],
        [3, 6, 8],
        [3, 8, 9],
        [4, 9, 5],
        [2, 4, 11],
        [6, 2, 10],
        [8, 6, 7],
        [9, 8, 1],
    ];

    for _ in 0..subdiv {
        let mut midpoints: HashMap<(u32, u32), u32> = HashMap::new();
        let mut next: Vec<[u32; 3]> = Vec::with_capacity(faces.len() * 4);
        for f in &faces {
            let a = midpoint(f[0], f[1], &mut verts, &mut midpoints);
            let b = midpoint(f[1], f[2], &mut verts, &mut midpoints);
            let c = midpoint(f[2], f[0], &mut verts, &mut midpoints);
            next.push([f[0], a, c]);
            next.push([f[1], b, a]);
            next.push([f[2], c, b]);
            next.push([a, b, c]);
        }
        faces = next;
    }

    let flat_verts: Vec<f32> = verts.iter().flat_map(|v| [v[0], v[1], v[2]]).collect();
    let flat_tris: Vec<u32> = faces.iter().flat_map(|f| [f[0], f[1], f[2]]).collect();
    (flat_verts, flat_tris)
}

fn normalize(v: &mut [f32; 3]) {
    let len = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    v[0] /= len;
    v[1] /= len;
    v[2] /= len;
}

fn midpoint(
    i: u32,
    j: u32,
    verts: &mut Vec<[f32; 3]>,
    cache: &mut HashMap<(u32, u32), u32>,
) -> u32 {
    let key = if i < j { (i, j) } else { (j, i) };
    if let Some(&m) = cache.get(&key) {
        return m;
    }
    let a = verts[i as usize];
    let b = verts[j as usize];
    let mut mid = [
        (a[0] + b[0]) * 0.5,
        (a[1] + b[1]) * 0.5,
        (a[2] + b[2]) * 0.5,
    ];
    normalize(&mut mid);
    let idx = verts.len() as u32;
    verts.push(mid);
    cache.insert(key, idx);
    idx
}

fn bench_voxelize(c: &mut Criterion) {
    let sizes = [(3u32, "1280_tris"), (4u32, "5120_tris")];

    // Isolated distance pass (no FWN sign) — the headline brute-vs-bvh number.
    // The bvh arm builds the BVH inside the timed region while brute has no setup,
    // so these ratios are a CONSERVATIVE lower bound: production (voxelize_mesh)
    // builds the BVH once and amortizes it across both the distance and sign passes.
    let mut distance = c.benchmark_group("distance_pass");
    distance.sample_size(20);
    for (subdiv, label) in sizes {
        let (verts, tris) = icosphere(subdiv);
        let mesh = Mesh::from_flat(&verts, &tris);

        distance.bench_with_input(BenchmarkId::new("brute", label), &mesh, |bench, mesh| {
            let mut grid =
                Grid::for_bounds([-1.0, -1.0, -1.0], [1.0, 1.0, 1.0], 32, 2).unwrap();
            bench.iter(|| distance_field_brute_pub(&mut grid, mesh));
        });
        distance.bench_with_input(BenchmarkId::new("bvh", label), &mesh, |bench, mesh| {
            let mut grid =
                Grid::for_bounds([-1.0, -1.0, -1.0], [1.0, 1.0, 1.0], 32, 2).unwrap();
            bench.iter(|| distance_field_bvh_pub(&mut grid, mesh));
        });
    }
    distance.finish();

    // Isolated FWN sign pass (no distance) — the apples-to-apples PR2 headline:
    // exact per-triangle winding vs hierarchical Barnes–Hut. As with distance_pass,
    // the fast arm builds the BVH inside the timed region while exact has no setup,
    // so the reported ratios UNDERSTATE the per-query traversal gain (production
    // builds the BVH once and shares it across both passes).
    let mut sign = c.benchmark_group("sign_pass");
    sign.sample_size(20);
    for (subdiv, label) in sizes {
        let (verts, tris) = icosphere(subdiv);
        let mesh = Mesh::from_flat(&verts, &tris);
        sign.bench_with_input(BenchmarkId::new("exact", label), &mesh, |bench, mesh| {
            let mut grid = Grid::for_bounds([-1.3, -1.3, -1.3], [1.3, 1.3, 1.3], 32, 2).unwrap();
            bench.iter(|| sign_field_exact_pub(&mut grid, mesh));
        });
        sign.bench_with_input(BenchmarkId::new("fast", label), &mesh, |bench, mesh| {
            let mut grid = Grid::for_bounds([-1.3, -1.3, -1.3], [1.3, 1.3, 1.3], 32, 2).unwrap();
            bench.iter(|| sign_field_fast_pub(&mut grid, mesh));
        });
    }
    sign.finish();

    let mut e2e = c.benchmark_group("end_to_end");
    e2e.sample_size(20);
    for (subdiv, label) in sizes {
        let (verts, tris) = icosphere(subdiv);
        let mesh = Mesh::from_flat(&verts, &tris);
        e2e.bench_with_input(BenchmarkId::new("brute", label), &mesh, |bench, mesh| {
            let mut grid =
                Grid::for_bounds([-1.0, -1.0, -1.0], [1.0, 1.0, 1.0], 32, 2).unwrap();
            bench.iter(|| voxelize_mesh_brute_pub(&mut grid, mesh));
        });
        e2e.bench_with_input(BenchmarkId::new("bvh", label), &mesh, |bench, mesh| {
            let mut grid =
                Grid::for_bounds([-1.0, -1.0, -1.0], [1.0, 1.0, 1.0], 32, 2).unwrap();
            bench.iter(|| voxelize_mesh_bvh_pub(&mut grid, mesh));
        });
    }
    e2e.finish();
}

criterion_group!(benches, bench_voxelize);
criterion_main!(benches);
