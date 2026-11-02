use std::collections::HashMap;

use crate::earcut;
use crate::math::{add, cross, dot, norm, normalize, scale, sub, Bbox, V3};
use crate::mesh::{Mesh, Topology, NO_NEIGHBOR};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum HoleFill {
    None,
    /// Fill boundary loops with at most this many edges.
    UpTo(usize),
    All,
}

#[derive(Debug, Default, Clone)]
pub struct RepairReport {
    pub degenerate_removed: usize,
    pub duplicates_removed: usize,
    pub flipped: usize,
    pub non_orientable_components: usize,
    pub holes_filled: usize,
    pub hole_triangles_added: usize,
    pub holes_remaining: usize,
    /// Holes left open because their outline is too long to triangulate.
    pub holes_too_large: usize,
    pub non_manifold_edges: usize,
    pub zero_area_triangles: usize,
}

#[derive(Debug, Clone)]
pub struct Component {
    pub triangles: Vec<u32>,
    /// No open boundary edge.
    pub closed: bool,
    /// Every edge joins exactly two triangles.
    pub manifold: bool,
    pub volume: f64,
    /// For an internal cavity, the component whose interior it bounds.
    pub parent: Option<usize>,
}

pub fn repair(mesh: &mut Mesh, fill: HoleFill) -> (RepairReport, Vec<Component>) {
    let mut report = RepairReport::default();

    let before = mesh.triangles.len();
    mesh.triangles
        .retain(|t| t[0] != t[1] && t[1] != t[2] && t[2] != t[0]);
    report.degenerate_removed = before - mesh.triangles.len();

    report.duplicates_removed = remove_duplicates(mesh);

    let topo = Topology::build(mesh);
    let (flipped, non_orientable) = orient_consistently(mesh, &topo);
    report.flipped = flipped;
    report.non_orientable_components = non_orientable;

    if fill != HoleFill::None {
        let topo = Topology::build(mesh);
        let out = fill_holes(mesh, &topo, fill);
        report.holes_filled = out.filled;
        report.hole_triangles_added = out.added;
        report.holes_remaining = out.remaining;
        report.holes_too_large = out.too_large;
    } else {
        let topo = Topology::build(mesh);
        let (loops, broken) = boundary_loops(mesh, &topo);
        report.holes_remaining = loops.len() + broken;
    }

    mesh.compact();
    let topo = Topology::build(mesh);
    report.non_manifold_edges = topo.non_manifold_edges;
    let scale_ref = mesh.bbox().diag().max(f64::MIN_POSITIVE);
    let tiny = (scale_ref * 1e-12).powi(2);
    report.zero_area_triangles = (0..mesh.triangles.len())
        .filter(|&t| mesh.area(t) <= tiny)
        .count();

    let components = classify_components(mesh, &topo);
    (report, components)
}

fn remove_duplicates(mesh: &mut Mesh) -> usize {
    let mut groups: HashMap<[u32; 3], Vec<usize>> = HashMap::new();
    for (i, t) in mesh.triangles.iter().enumerate() {
        let mut k = *t;
        k.sort_unstable();
        groups.entry(k).or_default().push(i);
    }
    let mut drop = vec![false; mesh.triangles.len()];
    let mut removed = 0;
    for idxs in groups.values() {
        if idxs.len() < 2 {
            continue;
        }
        let parity = |t: [u32; 3]| {
            let m = if t[0] < t[1] && t[0] < t[2] {
                0
            } else if t[1] < t[2] {
                1
            } else {
                2
            };
            t[(m + 1) % 3] < t[(m + 2) % 3]
        };
        // Opposite copies cancel in pairs (a zero-thickness wall, or two bodies
        // touching face to face); one copy of any surplus orientation stays.
        let forward: Vec<usize> = idxs
            .iter()
            .copied()
            .filter(|&i| parity(mesh.triangles[i]))
            .collect();
        let backward: Vec<usize> = idxs
            .iter()
            .copied()
            .filter(|&i| !parity(mesh.triangles[i]))
            .collect();
        let keep = match forward.len().cmp(&backward.len()) {
            std::cmp::Ordering::Greater => forward.first().copied(),
            std::cmp::Ordering::Less => backward.first().copied(),
            std::cmp::Ordering::Equal => None,
        };
        for &i in idxs {
            if Some(i) != keep {
                drop[i] = true;
                removed += 1;
            }
        }
    }
    let mut i = 0;
    mesh.triangles.retain(|_| {
        let keep = !drop[i];
        i += 1;
        keep
    });
    removed
}

/// Flip triangles so every manifold edge is traversed in opposite directions by
/// its two triangles. Returns (triangles flipped, components that can't be oriented).
fn orient_consistently(mesh: &mut Mesh, topo: &Topology) -> (usize, usize) {
    let n = mesh.triangles.len();
    let mut state = vec![0u8; n];
    let mut flip = vec![false; n];
    let mut non_orientable = 0;
    let mut stack = Vec::new();
    for seed in 0..n {
        if state[seed] != 0 {
            continue;
        }
        state[seed] = 1;
        stack.push(seed);
        let mut conflict = false;
        while let Some(t) = stack.pop() {
            let tri = mesh.triangles[t];
            for i in 0..3 {
                let Some(nb) = topo.neighbor(t, i) else {
                    continue;
                };
                let a = tri[i];
                let b = tri[(i + 1) % 3];
                let nt = mesh.triangles[nb];
                let same_dir = (0..3).any(|j| nt[j] == a && nt[(j + 1) % 3] == b);
                let want = flip[t] ^ same_dir;
                if state[nb] == 0 {
                    state[nb] = 1;
                    flip[nb] = want;
                    stack.push(nb);
                } else if flip[nb] != want {
                    conflict = true;
                }
            }
        }
        if conflict {
            non_orientable += 1;
        }
    }
    let mut count = 0;
    for (t, &f) in flip.iter().enumerate() {
        if f {
            mesh.triangles[t].swap(1, 2);
            count += 1;
        }
    }
    (count, non_orientable)
}

/// Boundary loops, each as vertex ids in the direction a filling triangle
/// traverses them. Also returns the count of chains that never closed.
fn boundary_loops(mesh: &Mesh, topo: &Topology) -> (Vec<Vec<u32>>, usize) {
    let mut out_edges: HashMap<u32, Vec<u32>> = HashMap::new();
    for (t, tri) in mesh.triangles.iter().enumerate() {
        for i in 0..3 {
            if topo.neighbors[t][i] == NO_NEIGHBOR {
                out_edges.entry(tri[(i + 1) % 3]).or_default().push(tri[i]);
            }
        }
    }
    let mut starts: Vec<u32> = out_edges.keys().copied().collect();
    starts.sort_unstable();
    let mut loops = Vec::new();
    let mut broken = 0;
    for s in starts {
        while let Some(first) = out_edges.get_mut(&s).and_then(|v| v.pop()) {
            let mut lp = vec![s];
            let mut cur = first;
            let mut closed = false;
            while lp.len() <= mesh.positions.len() {
                if cur == s {
                    closed = true;
                    break;
                }
                lp.push(cur);
                match out_edges.get_mut(&cur).and_then(|v| v.pop()) {
                    Some(nx) => cur = nx,
                    None => break,
                }
            }
            if closed && lp.len() >= 3 {
                loops.push(lp);
            } else {
                broken += 1;
            }
        }
    }
    (loops, broken)
}

/// Ear clipping is quadratic in the loop length (about 0.4 s natively at this
/// size). Longer holes stay open: a centroid fan would overlap itself across a
/// concave opening.
const MAX_EARCUT_HOLE: usize = 8192;

struct HoleFillOutcome {
    filled: usize,
    added: usize,
    remaining: usize,
    too_large: usize,
}

fn fill_holes(mesh: &mut Mesh, topo: &Topology, fill: HoleFill) -> HoleFillOutcome {
    let (loops, broken) = boundary_loops(mesh, topo);
    let mut filled = 0;
    let mut added = 0;
    let mut remaining = broken;
    let mut too_large = 0;
    for lp in loops {
        if let HoleFill::UpTo(max) = fill {
            if lp.len() > max {
                remaining += 1;
                continue;
            }
        }
        if lp.len() > MAX_EARCUT_HOLE {
            remaining += 1;
            too_large += 1;
            continue;
        }
        let pts: Vec<V3> = lp.iter().map(|&v| mesh.positions[v as usize]).collect();
        if lp.len() == 3 {
            mesh.triangles.push([lp[0], lp[1], lp[2]]);
            filled += 1;
            added += 1;
            continue;
        }
        let tris = normalize(crate::math::newell_normal(&pts))
            .and_then(|n| earcut::triangulate_3d(std::slice::from_ref(&pts), n));
        match tris {
            Some(ts) if ts.len() == lp.len() - 2 => {
                for t in ts {
                    mesh.triangles.push([lp[t[0]], lp[t[1]], lp[t[2]]]);
                }
                added += lp.len() - 2;
            }
            _ => {
                let c = scale(
                    pts.iter().fold([0.0; 3], |acc, &p| add(acc, p)),
                    1.0 / pts.len() as f64,
                );
                let ci = mesh.positions.len() as u32;
                mesh.positions.push(c);
                for k in 0..lp.len() {
                    mesh.triangles.push([ci, lp[k], lp[(k + 1) % lp.len()]]);
                }
                added += lp.len();
            }
        }
        filled += 1;
    }
    HoleFillOutcome {
        filled,
        added,
        remaining,
        too_large,
    }
}

/// Triangles below this quality (altitude over longest edge, squared scale) are
/// degenerate for B-Rep purposes: their plane is numerically undefined.
pub const DEGENERATE_QUALITY: f64 = 1e-6;

/// Remove zero-area triangles without opening the surface: a "cap" (a vertex on
/// the opposite edge) is flipped against its neighbor across that edge, a
/// "needle" (one edge near zero) has that edge collapsed. Returns how many
/// triangles were fixed.
pub fn cleanup_degenerate(mesh: &mut Mesh) -> usize {
    let mut fixed = 0;
    for _pass in 0..8 {
        let topo = Topology::build(mesh);
        let n = mesh.triangles.len();
        let mut touched = vec![false; n];
        let mut dead = vec![false; n];
        let mut changed = 0;
        let mut collapse: Vec<(u32, u32)> = Vec::new();
        for t in 0..n {
            if touched[t] {
                continue;
            }
            let [a, b, c] = mesh.tri(t);
            if crate::math::tri_quality(a, b, c) >= DEGENERATE_QUALITY {
                continue;
            }
            let tri = mesh.triangles[t];
            let pts = [a, b, c];
            let lens: Vec<f64> = (0..3)
                .map(|i| crate::math::dist(pts[i], pts[(i + 1) % 3]))
                .collect();
            let longest = (0..3)
                .max_by(|&i, &j| lens[i].total_cmp(&lens[j]))
                .unwrap_or(0);
            let shortest = (0..3)
                .min_by(|&i, &j| lens[i].total_cmp(&lens[j]))
                .unwrap_or(0);
            if lens[shortest] <= 1e-3 * lens[longest] {
                let (u, v) = (tri[shortest], tri[(shortest + 1) % 3]);
                collapse.push((u, v));
                touched[t] = true;
                for i in 0..3 {
                    if let Some(nb) = topo.neighbor(t, i) {
                        touched[nb] = true;
                    }
                }
                continue;
            }
            let Some(nb) = topo.neighbor(t, longest) else {
                continue;
            };
            if touched[nb] {
                continue;
            }
            let (ea, eb) = (tri[longest], tri[(longest + 1) % 3]);
            let cv = tri[(longest + 2) % 3];
            let ntri = mesh.triangles[nb];
            let Some(dv) = ntri.iter().copied().find(|&v| v != ea && v != eb) else {
                continue;
            };
            if dv == cv {
                continue;
            }
            mesh.triangles[t] = [eb, cv, dv];
            mesh.triangles[nb] = [cv, ea, dv];
            touched[t] = true;
            touched[nb] = true;
            changed += 1;
        }
        if !collapse.is_empty() {
            let mut remap: Vec<u32> = (0..mesh.positions.len() as u32).collect();
            let find = |remap: &Vec<u32>, mut x: u32| {
                while remap[x as usize] != x {
                    x = remap[x as usize];
                }
                x
            };
            for &(u, v) in &collapse {
                let (ru, rv) = (find(&remap, u), find(&remap, v));
                if ru != rv {
                    remap[ru as usize] = rv;
                    changed += 1;
                }
            }
            for (t, tri) in mesh.triangles.iter_mut().enumerate() {
                for v in tri.iter_mut() {
                    *v = find(&remap, *v);
                }
                if tri[0] == tri[1] || tri[1] == tri[2] || tri[2] == tri[0] {
                    dead[t] = true;
                }
            }
            let mut i = 0;
            mesh.triangles.retain(|_| {
                let keep = !dead[i];
                i += 1;
                keep
            });
            remove_duplicates(mesh);
        }
        if changed == 0 {
            break;
        }
        fixed += changed;
    }
    mesh.compact();
    fixed
}

/// Generalized winding number of `p` with respect to the given triangles.
pub fn winding_number(mesh: &Mesh, tris: &[u32], p: V3) -> f64 {
    let mut total = 0.0;
    for &t in tris {
        let [a, b, c] = mesh.tri(t as usize);
        let (a, b, c) = (sub(a, p), sub(b, p), sub(c, p));
        let (la, lb, lc) = (norm(a), norm(b), norm(c));
        let num = dot(a, cross(b, c));
        let den = la * lb * lc + dot(a, b) * lc + dot(b, c) * la + dot(c, a) * lb;
        total += 2.0 * num.atan2(den);
    }
    total / (4.0 * std::f64::consts::PI)
}

pub fn classify_components(mesh: &mut Mesh, topo: &Topology) -> Vec<Component> {
    let mut comps: Vec<Component> = topo
        .components()
        .into_iter()
        .map(|tris| {
            let closed = tris
                .iter()
                .all(|&t| topo.neighbors[t as usize].iter().all(|&n| n != NO_NEIGHBOR));
            let manifold = tris.iter().all(|&t| {
                topo.neighbors[t as usize]
                    .iter()
                    .all(|&n| n != NO_NEIGHBOR && n != crate::mesh::NON_MANIFOLD)
            });
            Component {
                triangles: tris,
                manifold,
                closed,
                volume: 0.0,
                parent: None,
            }
        })
        .collect();

    for c in comps.iter_mut() {
        if !c.closed {
            continue;
        }
        let v = mesh.signed_volume_of(&c.triangles);
        if v < 0.0 {
            for &t in &c.triangles {
                mesh.triangles[t as usize].swap(1, 2);
            }
        }
        c.volume = v.abs();
    }

    let closed: Vec<usize> = (0..comps.len()).filter(|&i| comps[i].closed).collect();
    if closed.len() < 2 || closed.len() > 512 {
        return comps;
    }
    let boxes: Vec<Bbox> = comps
        .iter()
        .map(|c| {
            let mut b = Bbox::empty();
            for &t in &c.triangles {
                for p in mesh.tri(t as usize) {
                    b.expand(p);
                }
            }
            b
        })
        .collect();
    let probe = |c: &Component| -> V3 {
        let t = *c
            .triangles
            .iter()
            .max_by(|&&a, &&b| mesh.area(a as usize).total_cmp(&mesh.area(b as usize)))
            .unwrap_or(&c.triangles[0]);
        let [a, b, cc] = mesh.tri(t as usize);
        scale(add(add(a, b), cc), 1.0 / 3.0)
    };
    let mut containers: Vec<Vec<usize>> = vec![Vec::new(); comps.len()];
    for &a in &closed {
        let p = probe(&comps[a]);
        for &b in &closed {
            if a == b || !boxes[b].contains_box(&boxes[a]) {
                continue;
            }
            if winding_number(mesh, &comps[b].triangles, p) > 0.5 {
                containers[a].push(b);
            }
        }
    }
    for &a in &closed {
        if containers[a].len() % 2 == 1 {
            let parent = containers[a]
                .iter()
                .copied()
                .min_by(|&x, &y| boxes[x].volume().total_cmp(&boxes[y].volume()));
            comps[a].parent = parent;
            for &t in &comps[a].triangles {
                mesh.triangles[t as usize].swap(1, 2);
            }
        }
    }
    comps
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mesh::fixtures::{cube, soup};
    use crate::mesh::weld;

    fn all(m: &Mesh) -> Vec<u32> {
        (0..m.triangles.len() as u32).collect()
    }

    #[test]
    fn clean_cube_untouched() {
        let mut m = cube(1.0);
        let (r, comps) = repair(&mut m, HoleFill::All);
        assert_eq!(r.flipped, 0);
        assert_eq!(r.holes_filled, 0);
        assert_eq!(comps.len(), 1);
        assert!(comps[0].closed);
        assert!((comps[0].volume - 1.0).abs() < 1e-12);
    }

    #[test]
    fn inverted_and_mixed_winding_fixed() {
        let mut m = cube(1.0);
        for t in m.triangles.iter_mut().step_by(3) {
            t.swap(1, 2);
        }
        let (r, comps) = repair(&mut m, HoleFill::All);
        assert!(r.flipped > 0);
        assert!(comps[0].closed);
        assert!((m.signed_volume_of(&all(&m)) - 1.0).abs() < 1e-12);

        let mut inv = cube(2.0);
        for t in inv.triangles.iter_mut() {
            t.swap(1, 2);
        }
        repair(&mut inv, HoleFill::All);
        assert!((inv.signed_volume_of(&all(&inv)) - 8.0).abs() < 1e-12);
    }

    #[test]
    fn missing_face_is_filled() {
        let mut m = cube(1.0);
        m.triangles.truncate(10);
        let (r, comps) = repair(&mut m, HoleFill::All);
        assert_eq!(r.holes_filled, 1);
        assert_eq!(r.hole_triangles_added, 2);
        assert!(comps[0].closed);
        assert!((m.signed_volume_of(&all(&m)) - 1.0).abs() < 1e-12);
    }

    #[test]
    fn oversized_hole_stays_open_instead_of_fanned() {
        let n = MAX_EARCUT_HOLE + 2;
        let mut m = Mesh::default();
        m.positions.push([0.0, 0.0, -1.0]);
        for i in 0..n {
            let a = 2.0 * std::f64::consts::PI * i as f64 / n as f64;
            let r = if i % 2 == 0 { 10.0 } else { 9.0 };
            m.positions.push([r * a.cos(), r * a.sin(), 0.0]);
        }
        for i in 0..n as u32 {
            m.triangles.push([0, 1 + (i + 1) % n as u32, 1 + i]);
        }
        let (r, comps) = repair(&mut m, HoleFill::All);
        assert_eq!(r.holes_too_large, 1);
        assert_eq!(r.holes_filled, 0);
        assert!(!comps[0].closed);
    }

    #[test]
    fn small_hole_limit_respected() {
        let mut m = cube(1.0);
        m.triangles.truncate(10);
        let (r, comps) = repair(&mut m, HoleFill::UpTo(3));
        assert_eq!(r.holes_filled, 0);
        assert_eq!(r.holes_remaining, 1);
        assert!(!comps[0].closed);
    }

    #[test]
    fn opposite_duplicates_cancel_in_pairs() {
        let mut m = cube(1.0);
        let mut back = m.triangles[3];
        back.swap(1, 2);
        let fwd = m.triangles[3];
        m.triangles.push(fwd);
        m.triangles.push(back);
        let (r, comps) = repair(&mut m, HoleFill::None);
        assert_eq!(r.duplicates_removed, 2);
        assert!(comps[0].closed);
        assert!(
            (m.signed_volume_of(&(0..m.triangles.len() as u32).collect::<Vec<_>>()) - 1.0).abs()
                < 1e-12
        );
    }

    #[test]
    fn duplicates_and_degenerates_removed() {
        let mut m = cube(1.0);
        m.triangles.push(m.triangles[0]);
        m.triangles.push([0, 0, 1]);
        let mut back = m.triangles[3];
        back.swap(1, 2);
        let dup = m.triangles[3];
        m.triangles.push(dup);
        m.triangles.push(back);
        let (r, _) = repair(&mut m, HoleFill::None);
        assert_eq!(r.degenerate_removed, 1);
        assert!(r.duplicates_removed >= 2);
    }

    #[test]
    fn nested_cube_becomes_cavity() {
        let mut outer = cube(10.0);
        let inner = cube(2.0);
        let base = outer.positions.len() as u32;
        outer.positions.extend(
            inner
                .positions
                .iter()
                .map(|p| [p[0] + 4.0, p[1] + 4.0, p[2] + 4.0]),
        );
        outer.triangles.extend(
            inner
                .triangles
                .iter()
                .map(|t| [t[0] + base, t[1] + base, t[2] + base]),
        );
        let mut m = soup(&outer);
        weld(&mut m, 0.0);
        let (_, comps) = repair(&mut m, HoleFill::All);
        assert_eq!(comps.len(), 2);
        let cavity = comps.iter().position(|c| c.parent.is_some()).unwrap();
        assert_eq!(comps[cavity].parent, Some(1 - cavity));
        assert!((m.signed_volume_of(&all(&m)) - (1000.0 - 8.0)).abs() < 1e-9);
    }

    #[test]
    fn cap_triangle_is_flipped_away() {
        let mut m = Mesh {
            positions: vec![
                [0.0, 0.0, 0.0],
                [2.0, 0.0, 0.0],
                [1.0, 0.0, 0.0],
                [1.0, -1.0, 0.0],
                [1.0, 1.0, 0.0],
            ],
            triangles: vec![[0, 1, 2], [1, 0, 3], [0, 2, 4], [2, 1, 4]],
        };
        let before: f64 = (0..m.triangles.len()).map(|t| m.area(t)).sum();
        assert!(cleanup_degenerate(&mut m) >= 1);
        for t in 0..m.triangles.len() {
            let [a, b, c] = m.tri(t);
            assert!(crate::math::tri_quality(a, b, c) > 1e-3);
        }
        let after: f64 = (0..m.triangles.len()).map(|t| m.area(t)).sum();
        assert!((before - after).abs() < 1e-12);
    }

    #[test]
    fn needle_is_collapsed() {
        let mut m = cube(1.0);
        m.positions.push([1.0, 1.0, 1.0 + 1e-9]);
        let t = m
            .triangles
            .iter()
            .position(|t| t.contains(&6) && t.contains(&4))
            .unwrap();
        let tri = m.triangles[t];
        let k = tri.iter().position(|&v| v == 6).unwrap();
        let mut a = tri;
        a[k] = 8;
        m.triangles[t] = a;
        m.triangles.push([6, 8, tri[(k + 1) % 3]]);
        m.triangles.push([8, 6, tri[(k + 2) % 3]]);
        cleanup_degenerate(&mut m);
        for t in 0..m.triangles.len() {
            let [a, b, c] = m.tri(t);
            assert!(crate::math::tri_quality(a, b, c) > 1e-3);
        }
    }

    #[test]
    fn winding_number_inside_outside() {
        let m = cube(1.0);
        let t = all(&m);
        assert!((winding_number(&m, &t, [0.5, 0.5, 0.5]) - 1.0).abs() < 1e-9);
        assert!(winding_number(&m, &t, [2.0, 0.5, 0.5]).abs() < 1e-9);
    }
}
