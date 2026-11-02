//! Classify a mesh as a CAD tessellation or a scan and derive tolerances from it.
//!
//! Two signals decide. CAD exports have large exactly coplanar areas: the far
//! vertex of a triangle sits on its neighbor's plane to within the coordinate
//! quantization. And CAD vertices lie on smooth surfaces, so a local quadric
//! explains their neighborhood almost perfectly, while a scan leaves the
//! measurement noise in the quadric's residual.

use crate::earcut::plane_basis;
use crate::math::{dist, dot, fit_plane, normalize, sub, tri_cross, tri_quality, V3};
use crate::mesh::{Mesh, Topology};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum MeshKind {
    Cad,
    Scan,
}

impl MeshKind {
    pub fn name(self) -> &'static str {
        match self {
            MeshKind::Cad => "cad",
            MeshKind::Scan => "scan",
        }
    }
}

#[derive(Clone, Debug)]
pub struct Estimate {
    pub kind: MeshKind,
    pub flat_fraction: f64,
    pub quantization: f64,
    /// Measurement noise: median residual of local quadric fits.
    pub noise_sigma: f64,
    /// Median residual of local plane fits (noise plus curvature).
    pub plane_residual: f64,
    pub chord_error: f64,
    pub median_edge: f64,
    pub tolerance: f64,
}

const CAD_FLAT_FRACTION: f64 = 0.25;
const FLAT_FACTOR: f64 = 16.0;
const MIN_QUALITY: f64 = 0.005;
const MAX_VERTEX_SAMPLES: usize = 50_000;

fn percentile(v: &mut [f64], q: f64) -> f64 {
    if v.is_empty() {
        return 0.0;
    }
    let k = ((v.len() - 1) as f64 * q).round() as usize;
    let (_, x, _) = v.select_nth_unstable_by(k, |a, b| a.total_cmp(b));
    *x
}

/// `quantization` is the coordinate step of the source (see `Storage::resolution`), in mesh units.
pub fn estimate(mesh: &Mesh, topo: &Topology, quantization: f64) -> Estimate {
    let diag = mesh.bbox().diag().max(f64::MIN_POSITIVE);
    let q = quantization.max(diag * 1e-12);
    let n = mesh.triangles.len();
    let normals: Vec<Option<V3>> = (0..n)
        .map(|t| {
            let [a, b, c] = mesh.tri(t);
            normalize(tri_cross(a, b, c))
        })
        .collect();
    let quality: Vec<f64> = (0..n)
        .map(|t| {
            let [a, b, c] = mesh.tri(t);
            tri_quality(a, b, c)
        })
        .collect();
    let areas: Vec<f64> = (0..n).map(|t| mesh.area(t)).collect();
    let total_area: f64 = areas.iter().sum();

    let mut in_flat_pair = vec![false; n];
    let mut chords = Vec::new();
    let mut edges = Vec::new();
    for t in 0..n {
        let tri = mesh.triangles[t];
        for i in 0..3 {
            let (a, b) = (
                mesh.positions[tri[i] as usize],
                mesh.positions[tri[(i + 1) % 3] as usize],
            );
            let len = dist(a, b);
            let Some(nb) = topo.neighbor(t, i) else {
                edges.push(len);
                continue;
            };
            if nb < t {
                continue;
            }
            edges.push(len);
            let opp_t = mesh.positions[tri[(i + 2) % 3] as usize];
            let opp_nb = mesh.triangles[nb]
                .iter()
                .map(|&v| mesh.positions[v as usize])
                .find(|&p| p != a && p != b)
                .unwrap_or(opp_t);
            // Measure against the better-conditioned plane: a sliver's own normal is noise.
            let (base, far, qb) = if quality[t] >= quality[nb] {
                (t, opp_nb, quality[t])
            } else {
                (nb, opp_t, quality[nb])
            };
            if qb < MIN_QUALITY {
                continue;
            }
            let Some(nbase) = normals[base] else { continue };
            let d = dot(nbase, sub(far, a)).abs();
            if d <= FLAT_FACTOR * q / qb {
                in_flat_pair[t] = true;
                in_flat_pair[nb] = true;
                continue;
            }
            if let (Some(na), Some(nn)) = (normals[t], normals[nb]) {
                let theta = dot(na, nn).clamp(-1.0, 1.0).acos();
                if theta > 0.5f64.to_radians() && theta < 30f64.to_radians() && len > 0.0 {
                    let h = (areas[t] + areas[nb]) / len;
                    chords.push(h * theta / 8.0);
                }
            }
        }
    }
    let flat_area: f64 = (0..n).filter(|&t| in_flat_pair[t]).map(|t| areas[t]).sum();
    let flat_fraction = if total_area > 0.0 {
        flat_area / total_area
    } else {
        0.0
    };
    let chord_error = percentile(&mut chords, 0.9);
    let median_edge = percentile(&mut edges, 0.5);
    let (noise, plane_residual) = local_residuals(mesh);
    // No usable quadric fit is no evidence of smoothness.
    let smooth = noise.is_some_and(|n| n <= (FLAT_FACTOR * q).max(0.25 * plane_residual));
    let noise_sigma = noise.unwrap_or(plane_residual);
    let kind = if flat_fraction >= CAD_FLAT_FRACTION || smooth {
        MeshKind::Cad
    } else {
        MeshKind::Scan
    };
    let tolerance = match kind {
        MeshKind::Cad => 8.0 * q,
        MeshKind::Scan => 3.0 * noise_sigma,
    }
    .clamp(diag * 1e-9, diag * 1e-2);
    Estimate {
        kind,
        flat_fraction,
        quantization: q,
        noise_sigma,
        plane_residual,
        chord_error,
        median_edge,
        tolerance,
    }
}

/// Solve the 6×6 system `m · x = r` by Gaussian elimination with partial pivoting.
fn solve6(mut m: [[f64; 6]; 6], mut r: [f64; 6]) -> Option<[f64; 6]> {
    let scale = (0..6).map(|i| m[i][i].abs()).fold(0.0, f64::max);
    if scale <= 0.0 {
        return None;
    }
    for col in 0..6 {
        let piv = (col..6).max_by(|&a, &b| m[a][col].abs().total_cmp(&m[b][col].abs()))?;
        if m[piv][col].abs() < 1e-12 * scale {
            return None;
        }
        m.swap(col, piv);
        r.swap(col, piv);
        let pivot_row = m[col];
        for row in col + 1..6 {
            let f = m[row][col] / pivot_row[col];
            for (cell, &p) in m[row].iter_mut().zip(pivot_row.iter()).skip(col) {
                *cell -= f * p;
            }
            r[row] -= f * r[col];
        }
    }
    let mut x = [0.0; 6];
    for row in (0..6).rev() {
        let s: f64 = (row + 1..6).map(|k| m[row][k] * x[k]).sum();
        x[row] = (r[row] - s) / m[row][row];
    }
    Some(x)
}

/// (median quadric-fit noise over 2-rings when any fit succeeded, median
/// plane-fit residual over 1-rings).
fn local_residuals(mesh: &Mesh) -> (Option<f64>, f64) {
    let nv = mesh.positions.len();
    let mut ring: Vec<Vec<u32>> = vec![Vec::new(); nv];
    for t in &mesh.triangles {
        for i in 0..3 {
            let (a, b) = (t[i], t[(i + 1) % 3]);
            ring[a as usize].push(b);
            ring[b as usize].push(a);
        }
    }
    for r in ring.iter_mut() {
        r.sort_unstable();
        r.dedup();
    }
    let stride = nv.div_ceil(MAX_VERTEX_SAMPLES).max(1);
    let mut quadric = Vec::new();
    let mut planar = Vec::new();
    let mut hood: Vec<u32> = Vec::new();
    for v in (0..nv).step_by(stride) {
        let one = &ring[v];
        if one.len() < 3 {
            continue;
        }
        let c = mesh.positions[v];
        let pts1: Vec<V3> = std::iter::once(c)
            .chain(one.iter().map(|&k| mesh.positions[k as usize]))
            .collect();
        if let Some((nrm, d)) = fit_plane(pts1.iter().map(|&p| (p, 1.0))) {
            let ss: f64 = pts1.iter().map(|&p| (dot(nrm, p) - d).powi(2)).sum();
            planar.push((ss / pts1.len() as f64).sqrt());
        }

        hood.clear();
        hood.push(v as u32);
        hood.extend_from_slice(one);
        for &w in one {
            hood.extend_from_slice(&ring[w as usize]);
        }
        hood.sort_unstable();
        hood.dedup();
        if hood.len() < 10 {
            continue;
        }
        let pts: Vec<V3> = hood.iter().map(|&k| mesh.positions[k as usize]).collect();
        let Some((nrm, _)) = fit_plane(pts.iter().map(|&p| (p, 1.0))) else {
            continue;
        };
        let (u, w) = plane_basis(nrm);
        let local: Vec<[f64; 3]> = pts
            .iter()
            .map(|&p| {
                let d = sub(p, c);
                [dot(d, u), dot(d, w), dot(d, nrm)]
            })
            .collect();
        let radius = local.iter().map(|l| l[0].hypot(l[1])).fold(0.0, f64::max);
        if radius <= 0.0 {
            continue;
        }
        let mut ata = [[0.0; 6]; 6];
        let mut atz = [0.0; 6];
        let row = |l: &[f64; 3]| {
            let (x, y) = (l[0] / radius, l[1] / radius);
            [x * x, x * y, y * y, x, y, 1.0]
        };
        for l in &local {
            let a = row(l);
            for i in 0..6 {
                for j in 0..6 {
                    ata[i][j] += a[i] * a[j];
                }
                atz[i] += a[i] * l[2];
            }
        }
        let Some(beta) = solve6(ata, atz) else {
            continue;
        };
        let ss: f64 = local
            .iter()
            .map(|l| {
                let a = row(l);
                let fit: f64 = (0..6).map(|i| a[i] * beta[i]).sum();
                (l[2] - fit).powi(2)
            })
            .sum();
        quadric.push((ss / (local.len() - 6) as f64).sqrt());
    }
    let noise = (!quadric.is_empty()).then(|| percentile(&mut quadric, 0.5));
    (noise, percentile(&mut planar, 0.5))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mesh::fixtures::{cube, sphere};

    fn f32_q(m: &Mesh) -> f64 {
        let max_abs = m
            .positions
            .iter()
            .flat_map(|p| p.iter())
            .fold(0.0f64, |a, &b| a.max(b.abs()));
        crate::ingest::Storage::F32.resolution(max_abs)
    }

    #[test]
    fn cube_is_cad() {
        let m = cube(10.0);
        let e = estimate(&m, &Topology::build(&m), f32_q(&m));
        assert_eq!(e.kind, MeshKind::Cad);
        assert!(e.flat_fraction > 0.99);
        assert!(e.tolerance < 1e-4);
    }

    #[test]
    fn clean_sphere_is_cad_despite_no_flats() {
        let m = sphere(10.0, 24, 48);
        let e = estimate(&m, &Topology::build(&m), f32_q(&m));
        assert_eq!(e.kind, MeshKind::Cad, "{e:?}");
        let expected = 10.0 * (1.0 - (std::f64::consts::PI / 48.0).cos());
        assert!(
            e.chord_error > expected * 0.2 && e.chord_error < expected * 3.0,
            "chord {} vs {}",
            e.chord_error,
            expected
        );
    }

    #[test]
    fn noisy_sphere_is_scan_with_sigma() {
        let mut m = sphere(20.0, 60, 120);
        let mut state = 12345u64;
        let mut rnd = || {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            (state >> 11) as f64 / (1u64 << 53) as f64
        };
        let sigma = 0.02;
        for p in m.positions.iter_mut() {
            let n = normalize(*p).unwrap();
            let g = (rnd() + rnd() + rnd() + rnd() - 2.0) * 3f64.sqrt() * sigma;
            *p = crate::math::add(*p, crate::math::scale(n, g));
        }
        let e = estimate(&m, &Topology::build(&m), f32_q(&m));
        assert_eq!(e.kind, MeshKind::Scan);
        assert!(
            e.noise_sigma > 0.6 * sigma && e.noise_sigma < 1.4 * sigma,
            "sigma {}",
            e.noise_sigma
        );
    }

    #[test]
    fn solve6_identity() {
        let mut m = [[0.0; 6]; 6];
        for (i, row) in m.iter_mut().enumerate() {
            row[i] = 2.0;
        }
        let x = solve6(m, [2.0, 4.0, 6.0, 8.0, 10.0, 12.0]).unwrap();
        assert_eq!(x, [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
    }
}
