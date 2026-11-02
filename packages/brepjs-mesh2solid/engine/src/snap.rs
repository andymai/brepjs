//! Make fitted surfaces meet the way the part's faces do. Fitting leaves a
//! fillet slightly off tangent to its planes (nanometres on a float32 CAD
//! export), which the exact arrangement turns into two crossings or a gap. Tangency is read from the
//! mesh (neighbouring regions whose surface normals agree along their shared
//! boundary) and then enforced exactly: radii shared, axes and centers placed
//! by offset planes.

use std::collections::{BTreeMap, BTreeSet};

use crate::fit::{max_residual, solve, Surface};
use crate::math::{add, cross, dot, normalize, scale, sub, V3};
use crate::mesh::{Mesh, Topology};
use crate::segment::{unique_vertices, Segmentation, APEX_REACH};

/// Surface normals within about a degree along a shared boundary mark a tangent pair.
const TANGENT_COS: f64 = 0.99985;
/// Planes closer to parallel than this cannot fix a cylinder axis together.
const PARALLEL_COS: f64 = 0.999;

#[derive(Debug, Default, Clone)]
pub struct SnapReport {
    /// Region pairs that meet tangentially, lower id first.
    pub tangent_pairs: Vec<(usize, usize)>,
    pub snapped: usize,
}

fn side(x: f64) -> f64 {
    if x < 0.0 {
        -1.0
    } else {
        1.0
    }
}

fn with_sign(v: V3, like: V3) -> V3 {
    if dot(v, like) < 0.0 {
        scale(v, -1.0)
    } else {
        v
    }
}

/// Region pairs that share mesh edges, with the shared vertices.
fn shared_boundaries(
    mesh: &Mesh,
    topo: &Topology,
    seg: &Segmentation,
) -> BTreeMap<(usize, usize), Vec<u32>> {
    let mut out: BTreeMap<(usize, usize), BTreeSet<u32>> = BTreeMap::new();
    for t in 0..mesh.triangles.len() {
        let rt = seg.region_of[t];
        if rt == u32::MAX {
            continue;
        }
        for i in 0..3 {
            let Some(nb) = topo.neighbor(t, i) else {
                continue;
            };
            let rn = seg.region_of[nb];
            if rn == u32::MAX || rn <= rt {
                continue;
            }
            let tri = mesh.triangles[t];
            let e = out.entry((rt as usize, rn as usize)).or_default();
            e.insert(tri[i]);
            e.insert(tri[(i + 1) % 3]);
        }
    }
    out.into_iter()
        .map(|(k, v)| (k, v.into_iter().collect()))
        .collect()
}

fn tangent(a: &Surface, b: &Surface, pts: &[V3]) -> bool {
    !pts.is_empty()
        && pts.iter().all(|&p| match (a.normal(p), b.normal(p)) {
            (Some(na), Some(nb)) => dot(na, nb).abs() >= TANGENT_COS,
            _ => false,
        })
}

fn radius(s: &Surface) -> Option<f64> {
    match *s {
        Surface::Cylinder { r, .. } | Surface::Sphere { r, .. } => Some(r),
        _ => None,
    }
}

fn with_radius(s: Surface, r: f64) -> Surface {
    match s {
        Surface::Cylinder { o, a, .. } => Surface::Cylinder { o, a, r },
        Surface::Sphere { c, .. } => Surface::Sphere { c, r },
        s => s,
    }
}

/// Place a cylinder's axis at distance `r` from its tangent planes.
fn snap_cylinder(o: V3, a: V3, r: f64, planes: &[(V3, f64)]) -> Option<Surface> {
    let &(n1, d1) = planes.first()?;
    let s1 = side(dot(n1, o) - d1);
    if let Some(&(n2, d2)) = planes
        .iter()
        .find(|(n, _)| dot(*n, n1).abs() < PARALLEL_COS)
    {
        let s2 = side(dot(n2, o) - d2);
        let axis = with_sign(normalize(cross(n1, n2))?, a);
        let x = solve(
            vec![n1.to_vec(), n2.to_vec(), axis.to_vec()],
            vec![d1 + s1 * r, d2 + s2 * r, dot(axis, o)],
        )?;
        return Some(Surface::Cylinder {
            o: [x[0], x[1], x[2]],
            a: axis,
            r,
        });
    }
    let axis = with_sign(normalize(sub(a, scale(n1, dot(a, n1))))?, a);
    // A wall on each side (a slot end): the axis sits midway, the radius is half the gap.
    if let Some(&(n2, d2)) = planes
        .iter()
        .find(|(n, d)| side(dot(*n, o) - d) * dot(*n, n1) * s1 < 0.0)
    {
        let d2 = if dot(n2, n1) < 0.0 { -d2 } else { d2 };
        let mid = 0.5 * (d1 + d2);
        let half = 0.5 * (d1 - d2).abs();
        let o = add(o, scale(n1, mid - dot(n1, o)));
        return Some(Surface::Cylinder {
            o,
            a: axis,
            r: half,
        });
    }
    let o = add(o, scale(n1, d1 + s1 * r - dot(n1, o)));
    Some(Surface::Cylinder { o, a: axis, r })
}

/// Least-squares center on the tangent cylinders' axes and at distance `r`
/// from the tangent planes, pulled weakly toward the fitted center.
fn snap_center(c: V3, r: f64, axes: &[(V3, V3)], planes: &[(V3, f64)]) -> Option<V3> {
    if axes.is_empty() && planes.is_empty() {
        return None;
    }
    let prior = 1e-9;
    let mut m = vec![vec![0.0; 3]; 3];
    let mut rhs = vec![0.0; 3];
    for i in 0..3 {
        m[i][i] += prior;
        rhs[i] += prior * c[i];
    }
    for &(o, a) in axes {
        for i in 0..3 {
            for j in 0..3 {
                let p = f64::from(u8::from(i == j)) - a[i] * a[j];
                m[i][j] += p;
                rhs[i] += p * o[j];
            }
        }
    }
    for &(n, d) in planes {
        let target = d + side(dot(n, c) - d) * r;
        for i in 0..3 {
            for j in 0..3 {
                m[i][j] += n[i] * n[j];
            }
            rhs[i] += n[i] * target;
        }
    }
    let x = solve(m, rhs)?;
    Some([x[0], x[1], x[2]])
}

/// A torus tangent to a coaxial cylinder and to a plane square to its axis
/// (a fillet where a boss meets a face).
fn snap_torus(s: Surface, cylinders: &[(V3, V3, f64)], planes: &[(V3, f64)]) -> Surface {
    let Surface::Torus {
        mut c,
        mut a,
        mut major,
        minor,
    } = s
    else {
        return s;
    };
    if let Some(&(o, ca, r)) = cylinders
        .iter()
        .find(|(_, ca, _)| dot(*ca, a).abs() >= PARALLEL_COS)
    {
        a = with_sign(ca, a);
        c = add(o, scale(a, dot(sub(c, o), a)));
        major = r + side(major - r) * minor;
    }
    if let Some(&(n, d)) = planes
        .iter()
        .find(|(n, _)| dot(*n, a).abs() >= PARALLEL_COS)
    {
        a = with_sign(n, a);
        let target = d + side(dot(n, c) - d) * minor;
        c = add(c, scale(n, target - dot(n, c)));
    }
    Surface::Torus { c, a, major, minor }
}

/// Neighbouring faces of a CAD model meet tangentially or at a real crease.
/// Fitted surfaces that meet at a shallow kink all along their boundary are
/// facets of a freeform surface that happened to fit locally; their triangles
/// go back to unfit. Returns how many regions were dissolved.
pub fn dissolve_kinks(mesh: &Mesh, topo: &Topology, seg: &mut Segmentation, tol: f64) -> usize {
    let mut doomed = vec![false; seg.regions.len()];
    for ((i, j), vs) in shared_boundaries(mesh, topo, seg) {
        let (a, b) = (&seg.regions[i].surface, &seg.regions[j].surface);
        let mut lo = 1.0f64;
        let mut hi = -1.0f64;
        for &v in &vs {
            let p = mesh.positions[v as usize];
            let reach = APEX_REACH * tol;
            if a.near_singular(p, reach) || b.near_singular(p, reach) {
                continue;
            }
            if let (Some(na), Some(nb)) = (a.normal(p), b.normal(p)) {
                let c = dot(na, nb).abs();
                lo = lo.min(c);
                hi = hi.max(c);
            }
        }
        if hi < TANGENT_COS && lo > KINK_COS {
            // A fragment beside a much larger surface is the fragment's fault;
            // two similar ones are both facets of something freeform.
            let (ni, nj) = (seg.regions[i].tris.len(), seg.regions[j].tris.len());
            doomed[i] |= nj < 4 * ni;
            doomed[j] |= ni < 4 * nj;
        }
    }
    let dissolved = doomed.iter().filter(|&&d| d).count();
    if dissolved == 0 {
        return 0;
    }
    let old = std::mem::take(&mut seg.regions);
    seg.region_of.fill(u32::MAX);
    for (k, region) in old.into_iter().enumerate() {
        if doomed[k] {
            continue;
        }
        let id = seg.regions.len() as u32;
        for &t in &region.tris {
            seg.region_of[t as usize] = id;
        }
        seg.regions.push(region);
    }
    seg.unfit_triangles = seg.region_of.iter().filter(|&&r| r == u32::MAX).count();
    dissolved
}

/// Shallowest crease a CAD model plausibly has between two faces (20°).
const KINK_COS: f64 = 0.9397;

pub fn snap(mesh: &Mesh, topo: &Topology, seg: &mut Segmentation, tol: f64) -> SnapReport {
    let n = seg.regions.len();
    let verts: Vec<Vec<V3>> = seg
        .regions
        .iter()
        .map(|r| {
            unique_vertices(mesh, &r.tris)
                .into_iter()
                .map(|v| mesh.positions[v as usize])
                .collect()
        })
        .collect();
    let mut pairs: Vec<(usize, usize)> = Vec::new();
    for ((i, j), vs) in shared_boundaries(mesh, topo, seg) {
        let pts: Vec<V3> = vs.iter().map(|&v| mesh.positions[v as usize]).collect();
        if tangent(&seg.regions[i].surface, &seg.regions[j].surface, &pts) {
            pairs.push((i, j));
        }
    }
    let original: Vec<Surface> = seg.regions.iter().map(|r| r.surface).collect();
    let mut s = original.clone();

    // A sphere tangent to a cylinder along a curve has the cylinder's radius.
    let mut group: Vec<usize> = (0..n).collect();
    fn find(g: &mut [usize], x: usize) -> usize {
        let mut r = x;
        while g[r] != r {
            r = g[r];
        }
        g[x] = r;
        r
    }
    for &(i, j) in &pairs {
        let linked = matches!(
            (&s[i], &s[j]),
            (Surface::Sphere { .. }, Surface::Cylinder { .. })
                | (Surface::Cylinder { .. }, Surface::Sphere { .. })
        );
        if linked {
            let (a, b) = (find(&mut group, i), find(&mut group, j));
            group[b] = a;
        }
    }
    let mut sums: BTreeMap<usize, (f64, f64, usize)> = BTreeMap::new();
    for (i, si) in s.iter().enumerate() {
        if let Some(r) = radius(si) {
            let w = seg.regions[i].tris.len() as f64;
            let e = sums.entry(find(&mut group, i)).or_insert((0.0, 0.0, 0));
            e.0 += w * r;
            e.1 += w;
            e.2 += 1;
        }
    }
    for (i, si) in s.iter_mut().enumerate() {
        let g = find(&mut group, i);
        if let Some(&(wr, w, count)) = sums.get(&g) {
            if count > 1 && w > 0.0 {
                *si = with_radius(*si, wr / w);
            }
        }
    }

    let tangent_of = |i: usize| -> Vec<usize> {
        pairs
            .iter()
            .filter_map(|&(a, b)| {
                if a == i {
                    Some(b)
                } else if b == i {
                    Some(a)
                } else {
                    None
                }
            })
            .collect()
    };
    let planes_of = |i: usize, s: &[Surface]| -> Vec<(V3, f64)> {
        tangent_of(i)
            .into_iter()
            .filter_map(|j| match s[j] {
                Surface::Plane { n, d } => Some((n, d)),
                _ => None,
            })
            .collect()
    };

    for i in 0..n {
        if let Surface::Cylinder { o, a, r } = s[i] {
            if let Some(c) = snap_cylinder(o, a, r, &planes_of(i, &s)) {
                s[i] = c;
            }
        }
    }
    for i in 0..n {
        if matches!(s[i], Surface::Torus { .. }) {
            let cylinders: Vec<(V3, V3, f64)> = tangent_of(i)
                .into_iter()
                .filter_map(|j| match s[j] {
                    Surface::Cylinder { o, a, r } => Some((o, a, r)),
                    _ => None,
                })
                .collect();
            s[i] = snap_torus(s[i], &cylinders, &planes_of(i, &s));
        }
    }
    for i in 0..n {
        if let Surface::Sphere { c, r } = s[i] {
            let axes: Vec<(V3, V3)> = tangent_of(i)
                .into_iter()
                .filter_map(|j| match s[j] {
                    Surface::Cylinder { o, a, .. } => Some((o, a)),
                    _ => None,
                })
                .collect();
            if let Some(c) = snap_center(c, r, &axes, &planes_of(i, &s)) {
                s[i] = Surface::Sphere { c, r };
            }
        }
    }

    // Keep a snap only where the region still lies on the surface.
    let limit = 4.0 * tol;
    let mut snapped = 0;
    for i in 0..n {
        if s[i] == original[i] {
            continue;
        }
        let res = max_residual(&s[i], &verts[i]);
        if res <= limit.max(seg.regions[i].max_residual) {
            seg.regions[i].surface = s[i];
            seg.regions[i].max_residual = res;
            snapped += 1;
        }
    }
    SnapReport {
        tangent_pairs: pairs,
        snapped,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::segment::{segment, Params};

    /// Closed prism over a convex counter-clockwise profile, caps fanned from the centroid.
    fn prism(profile: &[[f64; 2]], h: f64) -> Mesh {
        let n = profile.len() as u32;
        let mut positions: Vec<V3> = Vec::new();
        for &[x, y] in profile {
            positions.push([x, y, 0.0]);
        }
        for &[x, y] in profile {
            positions.push([x, y, h]);
        }
        let cx = profile.iter().map(|p| p[0]).sum::<f64>() / n as f64;
        let cy = profile.iter().map(|p| p[1]).sum::<f64>() / n as f64;
        positions.push([cx, cy, 0.0]);
        positions.push([cx, cy, h]);
        let (bc, tc) = (2 * n, 2 * n + 1);
        let mut triangles = Vec::new();
        for i in 0..n {
            let j = (i + 1) % n;
            triangles.push([i, j, n + j]);
            triangles.push([i, n + j, n + i]);
            triangles.push([bc, j, i]);
            triangles.push([tc, n + i, n + j]);
        }
        Mesh {
            positions,
            triangles,
        }
    }

    fn rounded_rect(w: f64, d: f64, r: f64, k: usize) -> Vec<[f64; 2]> {
        let corners = [
            (w - r, r, -90.0),
            (w - r, d - r, 0.0),
            (r, d - r, 90.0),
            (r, r, 180.0),
        ];
        let mut out = Vec::new();
        for (cx, cy, start) in corners {
            for s in 0..=k {
                let t = (start + 90.0 * s as f64 / k as f64).to_radians();
                out.push([cx + r * t.cos(), cy + r * t.sin()]);
            }
        }
        out
    }

    fn run(mesh: &Mesh, tol: f64) -> (Segmentation, usize, SnapReport) {
        let topo = Topology::build(mesh);
        let mut seg = segment(
            mesh,
            &topo,
            &Params {
                tol,
                crease_deg: 50.0,
            },
        );
        let dissolved = dissolve_kinks(mesh, &topo, &mut seg, tol);
        let report = snap(mesh, &topo, &mut seg, tol);
        (seg, dissolved, report)
    }

    #[test]
    fn fillets_snap_exactly_tangent_to_their_planes() {
        let r = 2.0;
        let mesh = prism(&rounded_rect(20.0, 12.0, r, 6), 5.0);
        let (seg, dissolved, report) = run(&mesh, 1e-6);
        assert_eq!(dissolved, 0);
        assert_eq!(seg.unfit_triangles, 0);
        let cylinders: Vec<_> = seg
            .regions
            .iter()
            .filter_map(|reg| match reg.surface {
                Surface::Cylinder { o, a, r } => Some((o, a, r)),
                _ => None,
            })
            .collect();
        assert_eq!(cylinders.len(), 4);
        assert_eq!(seg.regions.len(), 10);
        assert_eq!(report.tangent_pairs.len(), 8);
        let planes: Vec<(V3, f64)> = seg
            .regions
            .iter()
            .filter_map(|reg| match reg.surface {
                Surface::Plane { n, d } if n[2].abs() < 0.5 => Some((n, d)),
                _ => None,
            })
            .collect();
        for (o, a, rr) in cylinders {
            assert!((rr - r).abs() < 1e-6, "radius {rr}");
            assert!(a[2].abs() > 1.0 - 1e-15, "axis {a:?}");
            // Each fillet axis sits exactly one radius from its two side planes.
            let tangent = planes
                .iter()
                .filter(|(n, d)| ((dot(*n, o) - d).abs() - rr).abs() < 1e-12)
                .count();
            assert_eq!(tangent, 2, "axis {o:?}");
        }
    }

    #[test]
    fn faceted_freeform_dissolves_to_unfit() {
        let profile: Vec<[f64; 2]> = (0..64)
            .map(|i| {
                let t = std::f64::consts::TAU * i as f64 / 64.0;
                [20.0 * t.cos(), 8.0 * t.sin()]
            })
            .collect();
        let mesh = prism(&profile, 5.0);
        let (seg, dissolved, _) = run(&mesh, 1e-6);
        assert!(dissolved > 0);
        assert!(seg.unfit_triangles > 0);
        // The flat caps are real faces and stay.
        let caps = seg
            .regions
            .iter()
            .filter(|reg| matches!(reg.surface, Surface::Plane { n, .. } if n[2].abs() > 0.99))
            .count();
        assert_eq!(caps, 2);
    }
}
