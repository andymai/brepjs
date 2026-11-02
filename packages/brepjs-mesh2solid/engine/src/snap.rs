//! Make fitted surfaces meet the way the part's faces do. Fitting leaves a
//! fillet slightly off tangent to its planes (nanometres on a float32 CAD
//! export), which the exact arrangement turns into two crossings or a gap. Tangency is read from the
//! mesh (neighbouring regions whose surface normals agree along their shared
//! boundary) and then enforced exactly: radii shared, axes and centers placed
//! by offset planes.

use std::collections::{BTreeMap, BTreeSet};

use crate::fit::{max_residual, solve, Kind, Surface};
use crate::math::{add, cross, dot, norm, normalize, scale, sub, V3};
use crate::mesh::{Mesh, Topology};
use crate::segment::{fits, region_bodies, unique_vertices, Segmentation, APEX_REACH};

/// Surface normals within about a degree along a shared boundary mark a tangent pair.
const TANGENT_COS: f64 = 0.99985;
/// On a scan, surfaces fitted to noisy neighbours agree to a few degrees (4°).
const NOISY_TANGENT_COS: f64 = 0.99756;

fn tangent_cos(robust: bool) -> f64 {
    if robust {
        NOISY_TANGENT_COS
    } else {
        TANGENT_COS
    }
}
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

/// On a scan the boundary between two regions wanders up the fillet, so
/// tangency is read off the fitted surfaces instead: an axis parallel to a
/// plane at one radius from it, a center one radius from a plane, a center on
/// an axis with equal radii. `None` for pairs this doesn't cover.
fn tangent_by_fit(a: &Surface, b: &Surface, tol: f64) -> Option<bool> {
    let near = 3.0 * tol;
    let parallel = 0.035; // about 2°
    let plane_dist = |n: V3, d: f64, p: V3| (dot(n, p) - d).abs();
    let axis_dist = |o: V3, a: V3, p: V3| {
        let v = sub(p, o);
        norm(sub(v, scale(a, dot(v, a))))
    };
    let pair = match (*a, *b) {
        (x @ Surface::Plane { .. }, y) | (y, x @ Surface::Plane { .. }) => (x, y),
        (x @ Surface::Cylinder { .. }, y @ Surface::Sphere { .. })
        | (y @ Surface::Sphere { .. }, x @ Surface::Cylinder { .. }) => (x, y),
        _ => return None,
    };
    match pair {
        (Surface::Plane { n, d }, Surface::Cylinder { o, a, r }) => {
            Some(dot(n, a).abs() <= parallel && (plane_dist(n, d, o) - r).abs() <= near)
        }
        (Surface::Plane { n, d }, Surface::Sphere { c, r }) => {
            Some((plane_dist(n, d, c) - r).abs() <= near)
        }
        (Surface::Cylinder { o, a, r: rc }, Surface::Sphere { c, r }) => {
            Some(axis_dist(o, a, c) <= near && (rc - r).abs() <= near)
        }
        _ => None,
    }
}

fn boxes_near(a: &crate::math::Bbox, b: &crate::math::Bbox, gap: f64) -> bool {
    (0..3).all(|k| a.min[k] - gap <= b.max[k] && b.min[k] - gap <= a.max[k])
}

/// Tangent along their shared boundary: every vertex agrees, or on a scan
/// nine in ten (a few boundary vertices always sit in the noise).
fn tangent(a: &Surface, b: &Surface, pts: &[V3], cos: f64, robust: bool) -> bool {
    let agree = pts
        .iter()
        .filter(|&&p| match (a.normal(p), b.normal(p)) {
            (Some(na), Some(nb)) => dot(na, nb).abs() >= cos,
            _ => false,
        })
        .count();
    let need = if robust {
        (pts.len() * 9).div_ceil(10)
    } else {
        pts.len()
    };
    !pts.is_empty() && agree >= need
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
    // Three planes that meet at a corner fix the center exactly, and the
    // fillet axes were placed from the same planes, so they stay consistent.
    for (i, &(n1, d1)) in planes.iter().enumerate() {
        for (j, &(n2, d2)) in planes.iter().enumerate().skip(i + 1) {
            for &(n3, d3) in planes.iter().skip(j + 1) {
                let det = dot(n1, cross(n2, n3));
                if det.abs() < 0.5 {
                    continue;
                }
                let offset = |n: V3, d: f64| d + side(dot(n, c) - d) * r;
                let x = solve(
                    vec![n1.to_vec(), n2.to_vec(), n3.to_vec()],
                    vec![offset(n1, d1), offset(n2, d2), offset(n3, d3)],
                )?;
                return Some([x[0], x[1], x[2]]);
            }
        }
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
        // lo > hi: no vertex gave both normals, so nothing is known about the pair.
        if lo <= hi && hi < TANGENT_COS && lo > KINK_COS {
            let (di, dj) = kink_doom(seg.regions[i].tris.len(), seg.regions[j].tris.len());
            doomed[i] |= di;
            doomed[j] |= dj;
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

/// Which of two kinked regions (by triangle count) to dissolve. A fragment
/// beside a surface at least four times its size is the fragment's fault; two
/// similar ones are both facets of something freeform.
fn kink_doom(ni: usize, nj: usize) -> (bool, bool) {
    (ni < 4 * nj, nj < 4 * ni)
}

/// On a scan, a corner where fillets meet comes back as whatever curved
/// surface fits its noisy patch best (a torus, a cone). Bordered by two or more
/// fillet cylinders of one radius, it is the ball rolling between them:
/// centered where their axes meet, with their radius, if that fits the patch.
fn corner_spheres(
    seg: &mut Segmentation,
    boundaries: &BTreeMap<(usize, usize), Vec<u32>>,
    verts: &[Vec<V3>],
    tol: f64,
) {
    for (i, pts) in verts.iter().enumerate() {
        if !matches!(
            seg.regions[i].surface.kind(),
            Kind::Torus | Kind::Cone | Kind::Sphere
        ) {
            continue;
        }
        let cyls: Vec<(V3, V3, f64)> = boundaries
            .keys()
            .filter_map(|&(a, b)| {
                let j = if a == i {
                    b
                } else if b == i {
                    a
                } else {
                    return None;
                };
                match seg.regions[j].surface {
                    Surface::Cylinder { o, a, r } => Some((o, a, r)),
                    _ => None,
                }
            })
            .collect();
        if cyls.len() < 2 {
            continue;
        }
        let r = cyls.iter().map(|c| c.2).sum::<f64>() / cyls.len() as f64;
        if cyls.iter().any(|c| (c.2 - r).abs() > 0.1 * r) {
            continue;
        }
        let n = pts.len().max(1) as f64;
        let start = pts
            .iter()
            .fold([0.0; 3], |acc, &p| add(acc, scale(p, 1.0 / n)));
        let axes: Vec<(V3, V3)> = cyls.iter().map(|c| (c.0, c.1)).collect();
        let Some(c) = snap_center(start, r, &axes, &[]) else {
            continue;
        };
        let ball = Surface::Sphere { c, r };
        if fits(&ball, pts, tol, true) {
            seg.regions[i].surface = ball;
        }
    }
}

/// A surface of revolution's axis: a point on it and its direction.
fn axis_of(s: &Surface) -> Option<(V3, V3)> {
    match *s {
        Surface::Cylinder { o, a, .. } => Some((o, a)),
        Surface::Cone { apex, a, .. } => Some((apex, a)),
        Surface::Torus { c, a, .. } => Some((c, a)),
        _ => None,
    }
}

/// `p` moved onto the line through `foot` along `d`.
fn onto(p: V3, foot: V3, d: V3) -> V3 {
    add(foot, scale(d, dot(sub(p, foot), d)))
}

/// Surfaces of revolution whose axes nearly coincide share one exact axis (a
/// countersink and its hole, a boss and its fillet), so their intersections
/// are exact circles instead of near-circle splines. Sphere centers on that
/// axis move onto it.
/// Surfaces `coaxial` put on one exact axis (spheres centred on it included),
/// and that axis's direction.
struct CoaxialGroup {
    members: Vec<usize>,
    d: V3,
}

fn coaxial(s: &mut [Surface], weights: &[f64], tol: f64, max_angle: f64) -> Vec<CoaxialGroup> {
    let min_cos = max_angle.cos();
    let n = s.len();
    let near = 10.0 * tol;
    let mut group: Vec<usize> = (0..n).collect();
    fn find(g: &mut [usize], x: usize) -> usize {
        let mut r = x;
        while g[r] != r {
            r = g[r];
        }
        g[x] = r;
        r
    }
    let axes: Vec<Option<(V3, V3)>> = s.iter().map(axis_of).collect();
    for (i, ax) in axes.iter().enumerate() {
        let Some((pi, ai)) = *ax else {
            continue;
        };
        for (j, other) in axes.iter().enumerate().skip(i + 1) {
            let Some((pj, aj)) = *other else {
                continue;
            };
            let v = sub(pj, pi);
            let off = norm(sub(v, scale(ai, dot(v, ai))));
            if dot(ai, aj).abs() >= min_cos && off <= near {
                let (a, b) = (find(&mut group, i), find(&mut group, j));
                group[b] = a;
            }
        }
    }
    let mut members: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    for (i, ax) in axes.iter().enumerate() {
        if ax.is_some() {
            members.entry(find(&mut group, i)).or_default().push(i);
        }
    }
    let mut out = Vec::new();
    for list in members.values().filter(|l| l.len() > 1) {
        let Some(&(_, a0)) = list.first().and_then(|&i| axis_of(&s[i])).as_ref() else {
            continue;
        };
        let mut d = [0.0; 3];
        for &i in list {
            if let Some((_, a)) = axis_of(&s[i]) {
                d = add(d, scale(with_sign(a, a0), weights[i]));
            }
        }
        let Some(d) = normalize(d) else {
            continue;
        };
        let (mut foot, mut w) = ([0.0; 3], 0.0);
        for &i in list {
            if let Some((p, _)) = axis_of(&s[i]) {
                foot = add(foot, scale(sub(p, scale(d, dot(p, d))), weights[i]));
                w += weights[i];
            }
        }
        if w <= 0.0 {
            continue;
        }
        let foot = scale(foot, 1.0 / w);
        for &i in list {
            s[i] = match s[i] {
                Surface::Cylinder { o, a, r } => Surface::Cylinder {
                    o: onto(o, foot, d),
                    a: with_sign(d, a),
                    r,
                },
                Surface::Cone {
                    apex,
                    a,
                    half_angle,
                } => Surface::Cone {
                    apex: onto(apex, foot, d),
                    a: with_sign(d, a),
                    half_angle,
                },
                Surface::Torus { c, a, major, minor } => Surface::Torus {
                    c: onto(c, foot, d),
                    a: with_sign(d, a),
                    major,
                    minor,
                },
                other => other,
            };
        }
        let mut group = list.clone();
        for (k, sph) in s.iter_mut().enumerate() {
            if let Surface::Sphere { c, r } = *sph {
                let on = onto(c, foot, d);
                if norm(sub(c, on)) <= near {
                    *sph = Surface::Sphere { c: on, r };
                    group.push(k);
                }
            }
        }
        out.push(CoaxialGroup { members: group, d });
    }
    out
}

/// Turn every direction within `within` of a world axis onto it. A surface
/// turns about the point of it nearest its region's centroid (`anchors`); a
/// coaxial group turns as one, about its members' weighted centroid, so its
/// surfaces keep one axis rather than ending up parallel but apart.
fn align_to_world(
    s: &mut [Surface],
    groups: &[CoaxialGroup],
    anchors: &[V3],
    weights: &[f64],
    within: f64,
) {
    let mut grouped = vec![false; s.len()];
    for g in groups {
        let b = to_world(g.d, within);
        let (mut sum, mut w) = ([0.0; 3], 0.0);
        for &i in &g.members {
            sum = add(sum, scale(anchors[i], weights[i]));
            w += weights[i];
            grouped[i] = true;
        }
        if w <= 0.0 {
            continue;
        }
        let anchor = scale(sum, 1.0 / w);
        let d = g.d;
        // A point on the shared line turned about the anchor's foot on it.
        let turn = |x: V3| {
            let pivot = add(x, scale(d, dot(sub(anchor, x), d)));
            add(pivot, scale(b, dot(sub(x, pivot), d)))
        };
        for &i in &g.members {
            s[i] = match s[i] {
                Surface::Cylinder { o, a, r } => Surface::Cylinder {
                    o: turn(o),
                    a: with_sign(b, a),
                    r,
                },
                Surface::Cone {
                    apex,
                    a,
                    half_angle,
                } => Surface::Cone {
                    apex: turn(apex),
                    a: with_sign(b, a),
                    half_angle,
                },
                Surface::Torus { c, a, major, minor } => Surface::Torus {
                    c: turn(c),
                    a: with_sign(b, a),
                    major,
                    minor,
                },
                Surface::Sphere { c, r } => Surface::Sphere { c: turn(c), r },
                other => other,
            };
        }
    }
    for (i, si) in s.iter_mut().enumerate() {
        if !grouped[i] {
            *si = world_aligned(*si, within, anchors[i]);
        }
    }
}

/// A unit direction within a microradian of a world axis, as that axis.
fn to_world(d: V3, within: f64) -> V3 {
    let i = (0..3)
        .max_by(|&x, &y| d[x].abs().total_cmp(&d[y].abs()))
        .unwrap_or(2);
    let off: f64 = (0..3)
        .filter(|&k| k != i)
        .map(|k| d[k] * d[k])
        .sum::<f64>()
        .sqrt();
    if off > within {
        return d;
    }
    let mut out = [0.0; 3];
    out[i] = d[i].signum();
    out
}

/// Parts are drawn on world axes; fitted directions come back a few
/// nanoradians off, which is enough for the kernel to intersect two coaxial
/// surfaces as a spline instead of a circle.
/// Turn a surface's direction onto a world axis about the point of it nearest
/// `anchor` (its region's centroid), so the surface stays where the mesh is.
/// Turning about the origin instead would move a face by the angle times its
/// distance from the origin: a tenth of a millimetre for 0.7° at 10 mm.
fn world_aligned(s: Surface, within: f64, anchor: V3) -> Surface {
    let on_axis = |o: V3, a: V3| add(o, scale(a, dot(sub(anchor, o), a)));
    match s {
        Surface::Plane { n, d } => {
            let m = to_world(n, within);
            let foot = sub(anchor, scale(n, dot(n, anchor) - d));
            Surface::Plane {
                n: m,
                d: dot(m, foot),
            }
        }
        Surface::Cylinder { o, a, r } => Surface::Cylinder {
            o: on_axis(o, a),
            a: to_world(a, within),
            r,
        },
        Surface::Cone {
            apex,
            a,
            half_angle,
        } => {
            let pivot = on_axis(apex, a);
            let b = to_world(a, within);
            Surface::Cone {
                apex: sub(pivot, scale(b, dot(sub(pivot, apex), a))),
                a: b,
                half_angle,
            }
        }
        Surface::Torus { c, a, major, minor } => Surface::Torus {
            c,
            a: to_world(a, within),
            major,
            minor,
        },
        s => s,
    }
}

/// Axes within a milliradian count as the same direction.
const COAXIAL_ANGLE: f64 = 1e-3;

/// Shallowest crease a CAD model plausibly has between two faces (20°).
const KINK_COS: f64 = 0.9397;

pub fn snap(
    mesh: &Mesh,
    topo: &Topology,
    seg: &mut Segmentation,
    tol: f64,
    robust: bool,
    tri_body: &[u32],
) -> SnapReport {
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
    let boundaries = shared_boundaries(mesh, topo, seg);
    if robust {
        corner_spheres(seg, &boundaries, &verts, tol);
    }
    let mut pairs: Vec<(usize, usize)> = Vec::new();
    for (&(i, j), vs) in &boundaries {
        let pts: Vec<V3> = vs.iter().map(|&v| mesh.positions[v as usize]).collect();
        let cos = tangent_cos(robust);
        let (a, b) = (&seg.regions[i].surface, &seg.regions[j].surface);
        let geometric = if robust {
            tangent_by_fit(a, b, tol)
        } else {
            None
        };
        if geometric.unwrap_or_else(|| tangent(a, b, &pts, cos, robust)) {
            pairs.push((i, j));
        }
    }
    if robust {
        // A scan's regions can be eroded apart by noise along a tangent seam;
        // neighbours close in space whose fits are tangent count as well. Only
        // within one body: a part resting a hair above another stays apart.
        let boxes: Vec<crate::math::Bbox> =
            verts.iter().map(|v| crate::math::Bbox::of(v)).collect();
        let homes = region_bodies(&seg.regions, tri_body);
        let gap = 10.0 * tol;
        for i in 0..boxes.len() {
            for j in i + 1..boxes.len() {
                if pairs.contains(&(i, j)) || !boxes_near(&boxes[i], &boxes[j], gap) {
                    continue;
                }
                if !homes[i].iter().any(|b| homes[j].binary_search(b).is_ok()) {
                    continue;
                }
                let (a, b) = (&seg.regions[i].surface, &seg.regions[j].surface);
                if tangent_by_fit(a, b, tol) == Some(true) {
                    pairs.push((i, j));
                }
            }
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

    let weights: Vec<f64> = seg.regions.iter().map(|r| r.tris.len() as f64).collect();
    // A scan's fitted axes come back milliradians off; a CAD export's, nanoradians.
    let within = if robust { 1e-2 } else { 1e-6 };
    let coaxial_angle = if robust { 1e-2 } else { COAXIAL_ANGLE };
    let groups = coaxial(&mut s, &weights, tol, coaxial_angle);
    let anchors: Vec<V3> = verts
        .iter()
        .map(|pts| {
            let k = pts.len().max(1) as f64;
            pts.iter().fold([0.0; 3], |c, &p| add(c, scale(p, 1.0 / k)))
        })
        .collect();
    align_to_world(&mut s, &groups, &anchors, &weights, within);
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

    // Keep a snap only where the region still lies on the surface. A scan's
    // regions keep a few vertices of the chords across their seams, so there
    // the bulk of the region decides.
    let limit = 4.0 * tol;
    let mut snapped = 0;
    for i in 0..n {
        if s[i] == original[i] {
            continue;
        }
        let res = max_residual(&s[i], &verts[i]);
        let on = res <= limit.max(seg.regions[i].max_residual)
            || (robust && fits(&s[i], &verts[i], limit, true));
        if on {
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
    use crate::segment::{segment, Params, Region};

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
                max_sag: f64::INFINITY,
                crease_deg: 50.0,
                robust: false,
            },
        );
        let dissolved = dissolve_kinks(mesh, &topo, &mut seg, tol);
        let one_body = vec![0; mesh.triangles.len()];
        let report = snap(mesh, &topo, &mut seg, tol, false, &one_body);
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
    fn near_axis_directions_snap_onto_world_axes() {
        assert_eq!(to_world([1e-8, 0.0, 1.0], 1e-6), [0.0, 0.0, 1.0]);
        assert_eq!(to_world([0.0, -1.0, 2e-7], 1e-6), [0.0, -1.0, 0.0]);
        assert_eq!(to_world([0.6, 0.8, 0.0], 1e-6), [0.6, 0.8, 0.0]);
    }

    #[test]
    fn a_face_turned_onto_an_axis_stays_where_its_region_is() {
        // The +X face of a 30 mm part, fitted 0.4° off X; its region is
        // centred 10 mm off the X axis.
        let n = normalize([1.0, -0.007, 0.0]).unwrap();
        let anchor = [30.0, 10.0, 7.5];
        let fitted = Surface::Plane {
            n,
            d: dot(n, anchor),
        };
        let Surface::Plane { n: m, d } = world_aligned(fitted, 1e-2, anchor) else {
            panic!("kind changed");
        };
        assert_eq!(m, [1.0, 0.0, 0.0]);
        assert!((d - 30.0).abs() < 1e-12, "face moved to x = {d}");

        let tilted = normalize([0.01, 0.0, 1.0]).unwrap();
        let axis = Surface::Cylinder {
            o: [0.0, 0.0, 0.0],
            a: tilted,
            r: 2.0,
        };
        let centre = add([0.0, 0.0, 0.0], scale(tilted, 40.0));
        let Surface::Cylinder { o, a, .. } = world_aligned(axis, 1e-2, centre) else {
            panic!("kind changed");
        };
        assert_eq!(a, [0.0, 0.0, 1.0]);
        assert!(lineish(centre, o, a) < 1e-12, "axis left its region");
    }

    #[test]
    fn a_coaxial_group_turns_onto_an_axis_as_one() {
        // Two steps of a scanned shaft on one axis 0.005 rad off Z, their
        // regions 40 mm apart along it: turning each about its own region
        // would leave the axes 0.2 mm apart.
        let d = normalize([0.005, 0.0, 1.0]).unwrap();
        let mut s = vec![
            Surface::Cylinder {
                o: [10.0, 10.0, 0.0],
                a: d,
                r: 5.0,
            },
            Surface::Cylinder {
                o: add([10.0, 10.0, 0.0], scale(d, 40.0)),
                a: d,
                r: 8.0,
            },
        ];
        let groups = coaxial(&mut s, &[1.0, 1.0], 1e-3, 1e-2);
        assert_eq!(groups.len(), 1);
        let anchors = [
            add([10.0, 10.0, 0.0], scale(d, 5.0)),
            add([10.0, 10.0, 0.0], scale(d, 45.0)),
        ];
        align_to_world(&mut s, &groups, &anchors, &[1.0, 1.0], 1e-2);
        let (Surface::Cylinder { o: o1, a: a1, .. }, Surface::Cylinder { o: o2, a: a2, .. }) =
            (s[0], s[1])
        else {
            panic!("kinds changed");
        };
        assert_eq!(a1, [0.0, 0.0, 1.0]);
        assert_eq!(a2, [0.0, 0.0, 1.0]);
        assert!(lineish(o2, o1, a1) < 1e-12, "axes {o1:?} and {o2:?} apart");
    }

    #[test]
    fn nearly_coaxial_surfaces_share_one_axis() {
        let tilt = normalize([2e-8, -1e-8, 1.0]).unwrap();
        let mut s = vec![
            Surface::Cylinder {
                o: [20.0, 15.0, 0.1],
                a: tilt,
                r: 3.0,
            },
            Surface::Cone {
                apex: [20.0 + 3e-7, 15.0 - 2e-7, 2.0],
                a: [0.0, 0.0, 1.0],
                half_angle: 0.785,
            },
            Surface::Cylinder {
                o: [0.0, 0.0, 0.0],
                a: [0.0, 0.0, 1.0],
                r: 1.0,
            },
        ];
        coaxial(&mut s, &[10.0, 30.0, 10.0], 1e-4, COAXIAL_ANGLE);
        let (Surface::Cylinder { o, a, .. }, Surface::Cone { apex, a: b, .. }) = (s[0], s[1])
        else {
            panic!("kinds changed");
        };
        assert!(dot(a, b) > 1.0 - 1e-15);
        assert!(lineish(apex, o, a) < 1e-12, "apex off the cylinder axis");
        assert_eq!(
            s[2],
            Surface::Cylinder {
                o: [0.0, 0.0, 0.0],
                a: [0.0, 0.0, 1.0],
                r: 1.0
            }
        );
    }

    fn lineish(p: V3, o: V3, a: V3) -> f64 {
        let v = sub(p, o);
        norm(sub(v, scale(a, dot(v, a))))
    }

    #[test]
    fn a_kink_dissolves_the_fragment_not_the_surface() {
        assert_eq!(kink_doom(1000, 10), (false, true));
        assert_eq!(kink_doom(10, 1000), (true, false));
        assert_eq!(kink_doom(12, 10), (true, true));
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

    #[test]
    fn tangency_on_a_scan_reads_off_the_fitted_surfaces() {
        let tol = 0.06;
        let floor = Surface::Plane {
            n: [0.0, 0.0, 1.0],
            d: 0.0,
        };
        let fillet = |z: f64, a: V3, r: f64| Surface::Cylinder {
            o: [0.0, 5.0, z],
            a,
            r,
        };
        let x = [1.0, 0.0, 0.0];
        assert_eq!(
            tangent_by_fit(&floor, &fillet(2.1, x, 2.0), tol),
            Some(true)
        );
        assert_eq!(
            tangent_by_fit(&fillet(2.1, x, 2.0), &floor, tol),
            Some(true)
        );
        assert_eq!(
            tangent_by_fit(&floor, &fillet(2.5, x, 2.0), tol),
            Some(false)
        );
        let tilted = normalize([1.0, 0.0, 0.09]).unwrap(); // about 5°
        assert_eq!(
            tangent_by_fit(&floor, &fillet(2.0, tilted, 2.0), tol),
            Some(false)
        );
        let ball = Surface::Sphere {
            c: [3.0, 5.0, 2.05],
            r: 2.0,
        };
        assert_eq!(tangent_by_fit(&floor, &ball, tol), Some(true));
        assert_eq!(tangent_by_fit(&fillet(2.0, x, 2.0), &ball, tol), Some(true));
        assert_eq!(
            tangent_by_fit(&fillet(2.0, x, 2.5), &ball, tol),
            Some(false)
        );
        let cone = Surface::Cone {
            apex: [0.0; 3],
            a: [0.0, 0.0, 1.0],
            half_angle: 0.5,
        };
        assert_eq!(tangent_by_fit(&floor, &cone, tol), None);
    }

    type Corner = (
        Segmentation,
        BTreeMap<(usize, usize), Vec<u32>>,
        Vec<Vec<V3>>,
    );

    /// A corner region bordered by fillets along X and Y meeting at (5, 5, 5).
    fn corner(r: f64, ry: f64) -> Corner {
        let c = [5.0, 5.0, 5.0];
        let patch: Vec<V3> = (0..6)
            .flat_map(|i| {
                (0..6).map(move |j| {
                    let (th, ph) = (0.1 + 0.25 * i as f64, 0.1 + 0.25 * j as f64);
                    add(
                        c,
                        scale([th.cos() * ph.sin(), th.sin() * ph.sin(), ph.cos()], r),
                    )
                })
            })
            .collect();
        let region = |surface| Region {
            surface,
            tris: Vec::new(),
            max_residual: 0.0,
        };
        let seg = Segmentation {
            regions: vec![
                region(Surface::Torus {
                    c: [5.0, 5.0, 4.0],
                    a: [0.0, 0.0, 1.0],
                    major: 0.5,
                    minor: 1.8,
                }),
                region(Surface::Cylinder {
                    o: [0.0, 5.0, 5.0],
                    a: [1.0, 0.0, 0.0],
                    r,
                }),
                region(Surface::Cylinder {
                    o: [5.0, 0.0, 5.0],
                    a: [0.0, 1.0, 0.0],
                    r: ry,
                }),
            ],
            region_of: Vec::new(),
            unfit_triangles: 0,
        };
        let boundaries = BTreeMap::from([((0, 1), Vec::new()), ((0, 2), Vec::new())]);
        (seg, boundaries, vec![patch, Vec::new(), Vec::new()])
    }

    #[test]
    fn a_corner_between_equal_fillets_becomes_their_ball() {
        let (mut seg, boundaries, verts) = corner(2.0, 2.0);
        corner_spheres(&mut seg, &boundaries, &verts, 0.06);
        let Surface::Sphere { c, r } = seg.regions[0].surface else {
            panic!("corner stayed {:?}", seg.regions[0].surface);
        };
        assert!((r - 2.0).abs() < 1e-12);
        assert!(norm(sub(c, [5.0, 5.0, 5.0])) < 1e-6, "center {c:?}");

        // Fillets of different radii have no single ball between them.
        let (mut seg, boundaries, verts) = corner(2.0, 3.0);
        corner_spheres(&mut seg, &boundaries, &verts, 0.06);
        assert_eq!(seg.regions[0].surface.kind(), Kind::Torus);
    }

    #[test]
    fn a_separate_part_resting_just_above_another_stays_apart() {
        // A ball 0.1 mm above a slab: within three scan tolerances of tangent,
        // but a different body, so nothing may close the gap.
        let mut mesh = crate::mesh::fixtures::sphere(2.0, 12, 24);
        for p in &mut mesh.positions {
            *p = add(*p, [5.0, 5.0, 2.1]);
        }
        let ball_tris = mesh.triangles.len() as u32;
        let base = mesh.positions.len() as u32;
        mesh.positions.extend([
            [0.0, 0.0, 0.0],
            [10.0, 0.0, 0.0],
            [10.0, 10.0, 0.0],
            [0.0, 10.0, 0.0],
        ]);
        mesh.triangles
            .extend([[base, base + 1, base + 2], [base, base + 2, base + 3]]);
        let region = |surface, tris: std::ops::Range<u32>| Region {
            surface,
            tris: tris.collect(),
            max_residual: 0.0,
        };
        let ball = Surface::Sphere {
            c: [5.0, 5.0, 2.1],
            r: 2.0,
        };
        let total = mesh.triangles.len() as u32;
        let mut region_of = vec![0; ball_tris as usize];
        region_of.extend([1, 1]);
        let mut seg = Segmentation {
            regions: vec![
                region(ball, 0..ball_tris),
                region(
                    Surface::Plane {
                        n: [0.0, 0.0, 1.0],
                        d: 0.0,
                    },
                    ball_tris..total,
                ),
            ],
            region_of,
            unfit_triangles: 0,
        };
        let tri_body: Vec<u32> = (0..total).map(|t| u32::from(t >= ball_tris)).collect();
        let topo = Topology::build(&mesh);
        let report = snap(&mesh, &topo, &mut seg, 0.06, true, &tri_body);
        assert!(
            report.tangent_pairs.is_empty(),
            "{:?}",
            report.tangent_pairs
        );
        assert_eq!(seg.regions[0].surface, ball);
    }
}
