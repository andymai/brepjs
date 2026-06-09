//! Manifold Dual Contouring over a dense [`Grid`] (brepjs-implicit Phase 3a).
//!
//! Surface Nets places ONE vertex per cell, which pinches non-manifold wherever a
//! cell straddles two disconnected surface sheets (high-genus TPMS jackets, thin
//! plates, off-axis sharp features). DC fixes sharp-feature rounding via a QEF
//! solve; the MANIFOLD variant additionally splits a cell's vertex into one per
//! edge-connected sign-change component, so a multi-sheet cell contributes
//! distinct vertices and the dual quad routes each incident corner to the
//! component owning the shared grid edge — never a shared pinch.
//!
//! Shipped ALONGSIDE Surface Nets (the fast preview path), not replacing it.

use crate::contour::ContourMesh;
use crate::grid::Grid;

type V3 = [f64; 3];

fn sub(a: V3, b: V3) -> V3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
fn add(a: V3, b: V3) -> V3 {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
fn scale(a: V3, s: f64) -> V3 {
    [a[0] * s, a[1] * s, a[2] * s]
}
fn dot(a: V3, b: V3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn norm(a: V3) -> f64 {
    dot(a, a).sqrt()
}
fn normalize(a: V3) -> V3 {
    let n = norm(a);
    if n < 1e-12 {
        [0.0, 0.0, 0.0]
    } else {
        scale(a, 1.0 / n)
    }
}

// Local corner offsets; corner index = i + 2*j + 4*k.
const CORNER: [[usize; 3]; 8] = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
];

// 12 cell edges as pairs of corner indices.
const EDGES: [[usize; 2]; 12] = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7], // x-dir
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7], // y-dir
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7], // z-dir
];

// Per-corner cube-edge neighbours (the 12 edges over corner indices 0..8). Used to
// cluster same-sign corners into connected runs for the manifold component split.
const FACE_CUBE_EDGES: [[usize; 3]; 8] = [
    [1, 2, 4],
    [0, 3, 5],
    [0, 3, 6],
    [1, 2, 7],
    [0, 5, 6],
    [1, 4, 7],
    [2, 4, 7],
    [3, 5, 6],
];

/// Linear interpolation of the zero crossing along an edge between two corners.
fn edge_zero(p0: V3, d0: f64, p1: V3, d1: f64) -> V3 {
    let t = d0 / (d0 - d1); // opposite signs guaranteed by the caller
    add(p0, scale(sub(p1, p0), t))
}

/// Central-difference gradient of the grid field at WORLD position `wp`, sampled
/// by trilinear interpolation. This is the Hermite normal feeding the QEF; the
/// step is a fraction of the cell so the difference stays local to the crossing.
fn grad(grid: &Grid, wp: V3) -> V3 {
    let h = grid.spacing() as f64 * 0.5;
    let dx = sample(grid, [wp[0] + h, wp[1], wp[2]]) - sample(grid, [wp[0] - h, wp[1], wp[2]]);
    let dy = sample(grid, [wp[0], wp[1] + h, wp[2]]) - sample(grid, [wp[0], wp[1] - h, wp[2]]);
    let dz = sample(grid, [wp[0], wp[1], wp[2] + h]) - sample(grid, [wp[0], wp[1], wp[2] - h]);
    normalize([dx, dy, dz])
}

/// Trilinear sample of the grid field at a WORLD position, clamped to the grid.
fn sample(grid: &Grid, wp: V3) -> f64 {
    let [nx, ny, nz] = grid.dims();
    let origin = grid.origin();
    let inv = 1.0 / grid.spacing() as f64;
    let gx = (wp[0] - origin[0] as f64) * inv;
    let gy = (wp[1] - origin[1] as f64) * inv;
    let gz = (wp[2] - origin[2] as f64) * inv;
    let clamp_idx = |g: f64, n: usize| -> (usize, f64) {
        if n < 2 {
            return (0, 0.0);
        }
        let g = g.clamp(0.0, (n - 1) as f64);
        let i0 = (g.floor() as usize).min(n - 2);
        (i0, g - i0 as f64)
    };
    let (x0, fx) = clamp_idx(gx, nx);
    let (y0, fy) = clamp_idx(gy, ny);
    let (z0, fz) = clamp_idx(gz, nz);
    let (x1, y1, z1) = (x0 + 1, y0 + 1, z0 + 1);
    let c = |x: usize, y: usize, z: usize| grid.at(x, y, z) as f64;
    let c00 = c(x0, y0, z0) * (1.0 - fx) + c(x1, y0, z0) * fx;
    let c10 = c(x0, y1, z0) * (1.0 - fx) + c(x1, y1, z0) * fx;
    let c01 = c(x0, y0, z1) * (1.0 - fx) + c(x1, y0, z1) * fx;
    let c11 = c(x0, y1, z1) * (1.0 - fx) + c(x1, y1, z1) * fx;
    let c0 = c00 * (1.0 - fy) + c10 * fy;
    let c1 = c01 * (1.0 - fy) + c11 * fy;
    c0 * (1.0 - fz) + c1 * fz
}

// ---------------------------------------------------------------------------
// QEF solve via symmetric-eigendecomposition pseudo-inverse with singular-value
// truncation. Minimize Σ (n_i · (x − p_i))² = ‖A(x − c) − b'‖² around the mass
// point `c`: solve AtA·(x−c) = Atb' where AtA = Σ n nᵀ. Diagonalize the
// symmetric AtA, invert only the eigenvalues above a relative epsilon (drop the
// flat/under-determined directions → no crease fold), then clamp into the cell.
// ---------------------------------------------------------------------------

/// Solve the QEF for one component's hermite planes. `mass` is the centroid of
/// the component's crossings (the regularization point and degenerate fallback).
fn solve_qef(planes: &[(V3, V3)], mass: V3, cell_min: V3, cell_max: V3) -> V3 {
    if planes.is_empty() {
        return clamp_cell(mass, cell_min, cell_max);
    }
    // AtA = Σ n nᵀ (symmetric); Atb measured RELATIVE to the mass point so the
    // pseudo-inverse only resolves the well-constrained offset from the centroid.
    let mut ata = [[0.0f64; 3]; 3];
    let mut atb = [0.0f64; 3];
    for (n, p) in planes {
        let d = dot(*n, sub(*p, mass));
        for r in 0..3 {
            for c in 0..3 {
                ata[r][c] += n[r] * n[c];
            }
            atb[r] += n[r] * d;
        }
    }

    let (eigvecs, eigvals) = jacobi_eigen(ata);
    // Truncate singular values below a relative epsilon of the largest.
    let max_ev = eigvals.iter().cloned().fold(0.0f64, f64::max);
    let cutoff = max_ev * 1e-3;
    // x − mass = V · diag(1/λ truncated) · Vᵀ · atb.
    let mut vt_atb = [0.0f64; 3];
    for i in 0..3 {
        vt_atb[i] = eigvecs[0][i] * atb[0] + eigvecs[1][i] * atb[1] + eigvecs[2][i] * atb[2];
    }
    let mut inv = [0.0f64; 3];
    for i in 0..3 {
        if eigvals[i] > cutoff {
            inv[i] = vt_atb[i] / eigvals[i];
        }
    }
    let mut delta = [0.0f64; 3];
    for r in 0..3 {
        delta[r] = eigvecs[r][0] * inv[0] + eigvecs[r][1] * inv[1] + eigvecs[r][2] * inv[2];
    }
    let x = add(mass, delta);
    clamp_cell(x, cell_min, cell_max)
}

fn clamp_cell(x: V3, lo: V3, hi: V3) -> V3 {
    [
        x[0].clamp(lo[0], hi[0]),
        x[1].clamp(lo[1], hi[1]),
        x[2].clamp(lo[2], hi[2]),
    ]
}

/// Cyclic Jacobi eigendecomposition of a symmetric 3×3 matrix. Returns the
/// eigenvector matrix `V` (columns are eigenvectors) and the eigenvalues. A
/// symmetric AtA always has a real orthonormal eigenbasis, so this is an exact
/// SVD for the QEF (singular values = eigenvalues; left/right vectors = V).
#[allow(clippy::needless_range_loop)] // explicit (k,p,q) indices are the clearest form of a Givens rotation
fn jacobi_eigen(mut a: [[f64; 3]; 3]) -> ([[f64; 3]; 3], [f64; 3]) {
    let mut v = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
    for _ in 0..16 {
        // Largest off-diagonal magnitude.
        let off = a[0][1].abs() + a[0][2].abs() + a[1][2].abs();
        if off < 1e-15 {
            break;
        }
        for &(p, q) in &[(0usize, 1usize), (0, 2), (1, 2)] {
            let apq = a[p][q];
            if apq.abs() < 1e-18 {
                continue;
            }
            let app = a[p][p];
            let aqq = a[q][q];
            let phi = 0.5 * (aqq - app).atan2(2.0 * apq);
            // atan2 form is robust when app == aqq (the 45° rotation).
            let (s, c) = phi.sin_cos();
            // Apply the rotation G(p,q,phi) on both sides: a' = Gᵀ a G.
            for k in 0..3 {
                let akp = a[k][p];
                let akq = a[k][q];
                a[k][p] = c * akp - s * akq;
                a[k][q] = s * akp + c * akq;
            }
            for k in 0..3 {
                let apk = a[p][k];
                let aqk = a[q][k];
                a[p][k] = c * apk - s * aqk;
                a[q][k] = s * apk + c * aqk;
            }
            for k in 0..3 {
                let vkp = v[k][p];
                let vkq = v[k][q];
                v[k][p] = c * vkp - s * vkq;
                v[k][q] = s * vkp + c * vkq;
            }
        }
    }
    ([v[0], v[1], v[2]], [a[0][0], a[1][1], a[2][2]])
}

// ---------------------------------------------------------------------------
// Manifold component split
// ---------------------------------------------------------------------------

/// Group the cell's 12 edges into surface-sheet components and label each crossing
/// edge with its component id (`usize::MAX` for a non-crossing edge). A crossing
/// edge belongs to the component of its INSIDE endpoint corner, where corners are
/// clustered by SIGN over the cube's 12 edges (a connected run of inside corners is
/// one solid lobe = one sheet). A cell whose inside corners fragment into >1 run
/// carries >1 sheet, so DC emits one QEF vertex per run and routing keeps them
/// apart — the manifold split. Returns the per-edge labels and component count.
fn edge_components(cd: &[f64; 8]) -> ([usize; 12], usize) {
    // Cluster the 8 corners by sign over cube edges → one component per same-sign
    // run. corner_comp[c] is c's component id; sheets are the INSIDE runs.
    let mut corner_comp = [usize::MAX; 8];
    let mut ncomp = 0;
    for start in 0..8 {
        if corner_comp[start] != usize::MAX {
            continue;
        }
        let inside = cd[start] < 0.0;
        let id = ncomp;
        ncomp += 1;
        let mut stack = vec![start];
        while let Some(c) = stack.pop() {
            if corner_comp[c] != usize::MAX {
                continue;
            }
            corner_comp[c] = id;
            for &nb in &FACE_CUBE_EDGES[c] {
                if corner_comp[nb] == usize::MAX && (cd[nb] < 0.0) == inside {
                    stack.push(nb);
                }
            }
        }
    }

    // Label each crossing edge by the component of its inside endpoint corner.
    let mut comp = [usize::MAX; 12];
    for (e, [a, b]) in EDGES.iter().enumerate() {
        let (da, db) = (cd[*a], cd[*b]);
        if (da < 0.0) != (db < 0.0) {
            let inside_corner = if da < 0.0 { *a } else { *b };
            comp[e] = corner_comp[inside_corner];
        }
    }
    (comp, ncomp)
}

/// A cell's emitted vertices, indexed so a dual-quad lookup routes a crossing edge
/// to its surface sheet's vertex. `edge_comp[e]` is the component id of local cell
/// edge `e` (`usize::MAX` if it doesn't cross); `comp_vert[id]` is that component's
/// global vertex index.
struct CellRecord {
    comp_vert: Vec<usize>,
    edge_comp: [usize; 12],
}

const NO_VERT: usize = usize::MAX;

/// Manifold Dual Contouring of `grid`'s dense SDF. World-space positions; the
/// mesh is watertight and 2-manifold on the fixtures the phase gate proves.
pub fn dual_contour_mesh(grid: &Grid) -> ContourMesh {
    let [nx, ny, nz] = grid.dims();
    if nx < 2 || ny < 2 || nz < 2 {
        return ContourMesh::default();
    }
    let cx = nx - 1;
    let cy = ny - 1;
    let cz = nz - 1;
    let cidx = |i: usize, j: usize, k: usize| i + j * cx + k * cx * cy;

    let mut records: Vec<Option<CellRecord>> = (0..cx * cy * cz).map(|_| None).collect();
    let mut positions: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();

    // Pass 1 — per cell: split into sign-change components, one QEF vertex each.
    for k in 0..cz {
        for j in 0..cy {
            for i in 0..cx {
                let mut cd = [0.0f64; 8];
                let mut cp = [[0.0f64; 3]; 8];
                for (ci, off) in CORNER.iter().enumerate() {
                    let (ii, jj, kk) = (i + off[0], j + off[1], k + off[2]);
                    cd[ci] = grid.at(ii, jj, kk) as f64;
                    let wp = grid.world_pos(ii, jj, kk);
                    cp[ci] = [wp[0] as f64, wp[1] as f64, wp[2] as f64];
                }
                let any_in = cd.iter().any(|&v| v < 0.0);
                let any_out = cd.iter().any(|&v| v >= 0.0);
                if !(any_in && any_out) {
                    continue;
                }

                let (edge_comp, ncomp) = edge_components(&cd);
                let cell_min = cp[0];
                let cell_max = cp[7];

                // Per MC component: gather its crossing edges' points + hermite
                // planes. An edge routes to `edge_comp[e]`, the same id Pass 2 uses,
                // so a quad's edge and the cell's vertex always agree on the sheet.
                let mut comp_pts: Vec<Vec<V3>> = vec![Vec::new(); ncomp];
                let mut comp_planes: Vec<Vec<(V3, V3)>> = vec![Vec::new(); ncomp];
                for (e, [a, b]) in EDGES.iter().enumerate() {
                    let comp = edge_comp[e];
                    if comp == usize::MAX {
                        continue;
                    }
                    let (da, db) = (cd[*a], cd[*b]);
                    let zp = edge_zero(cp[*a], da, cp[*b], db);
                    let nrm = grad(grid, zp);
                    comp_pts[comp].push(zp);
                    comp_planes[comp].push((nrm, zp));
                }

                let mut comp_vert = vec![NO_VERT; ncomp];
                for c in 0..ncomp {
                    if comp_pts[c].is_empty() {
                        continue;
                    }
                    let mut mass = [0.0; 3];
                    for p in &comp_pts[c] {
                        mass = add(mass, *p);
                    }
                    mass = scale(mass, 1.0 / comp_pts[c].len() as f64);
                    let v = solve_qef(&comp_planes[c], mass, cell_min, cell_max);
                    comp_vert[c] = positions.len() / 3;
                    positions.push(v[0] as f32);
                    positions.push(v[1] as f32);
                    positions.push(v[2] as f32);
                    let nrm = grad(grid, v);
                    normals.push(nrm[0] as f32);
                    normals.push(nrm[1] as f32);
                    normals.push(nrm[2] as f32);
                }

                records[cidx(i, j, k)] = Some(CellRecord {
                    comp_vert,
                    edge_comp,
                });
            }
        }
    }

    let mut indices: Vec<u32> = Vec::new();

    // Pass 2 — one dual quad per interior sign-changing grid edge. The 4 cells
    // sharing the edge each contribute the vertex of the COMPONENT containing
    // that edge's local corner — multi-sheet cells route to distinct vertices.
    //
    // For each cell sharing the edge we know the edge's two endpoint corners in
    // THAT cell's local frame; the inside endpoint's component owns the sheet.
    let emit_quad = |indices: &mut Vec<u32>, vs: [usize; 4], flip: bool| {
        if vs.contains(&NO_VERT) {
            return;
        }
        let [va, vb, vc, vd] = [vs[0] as u32, vs[1] as u32, vs[2] as u32, vs[3] as u32];
        if flip {
            indices.extend_from_slice(&[va, vb, vc, va, vc, vd]);
        } else {
            indices.extend_from_slice(&[va, vd, vc, va, vc, vb]);
        }
    };

    // Resolve the vertex of the cell at (ci,cj,ck) for the sheet that owns LOCAL
    // cell edge `local_edge` (one of the 12). All 4 cells around a grid edge map it
    // to the local edge collinear with the grid edge, so they share a component.
    let resolve = |records: &Vec<Option<CellRecord>>,
                   ci: usize,
                   cj: usize,
                   ck: usize,
                   local_edge: usize|
     -> usize {
        match &records[cidx(ci, cj, ck)] {
            Some(r) => {
                let comp = r.edge_comp[local_edge];
                if comp == usize::MAX {
                    NO_VERT
                } else {
                    r.comp_vert.get(comp).copied().unwrap_or(NO_VERT)
                }
            }
            None => NO_VERT,
        }
    };

    // The 4 cells sharing a grid edge differ in the two axes ORTHOGONAL to the
    // edge; within each the grid edge IS one of the 4 parallel local cell edges.
    // Route each cell's quad corner to the component owning that local edge — the
    // MC split guarantees all 4 cells agree, so multi-sheet cells never pinch.
    //
    // X grid-edges: parallel local edges are E0..E3 = (ly,lz) (0,0),(1,0),(0,1),(1,1)
    // → index ly + 2*lz.
    for k in 1..cz {
        for j in 1..cy {
            for i in 0..cx {
                let d0 = grid.at(i, j, k) as f64;
                let d1 = grid.at(i + 1, j, k) as f64;
                if (d0 < 0.0) != (d1 < 0.0) {
                    let le = |ly: usize, lz: usize| ly + 2 * lz;
                    let vs = [
                        resolve(&records, i, j, k, le(0, 0)),
                        resolve(&records, i, j - 1, k, le(1, 0)),
                        resolve(&records, i, j - 1, k - 1, le(1, 1)),
                        resolve(&records, i, j, k - 1, le(0, 1)),
                    ];
                    emit_quad(&mut indices, vs, d0 < 0.0);
                }
            }
        }
    }
    // Y grid-edges: parallel local edges E4..E7 = (lx,lz) → index 4 + lx + 2*lz.
    for k in 1..cz {
        for j in 0..cy {
            for i in 1..cx {
                let d0 = grid.at(i, j, k) as f64;
                let d1 = grid.at(i, j + 1, k) as f64;
                if (d0 < 0.0) != (d1 < 0.0) {
                    let le = |lx: usize, lz: usize| 4 + lx + 2 * lz;
                    // The right-handed in-plane order for the +y edge axis is (z,x),
                    // but this gather walks (x,z) like the X and Z loops, so it
                    // circulates with the OPPOSITE signed-area handedness. The flip
                    // flag must therefore key on the −y corner being inside (`d0<0`)
                    // — the negation of the +y-corner test the other handedness would
                    // need — so all three axis quads share one coherent global winding.
                    let vs = [
                        resolve(&records, i, j, k, le(0, 0)),
                        resolve(&records, i, j, k - 1, le(0, 1)),
                        resolve(&records, i - 1, j, k - 1, le(1, 1)),
                        resolve(&records, i - 1, j, k, le(1, 0)),
                    ];
                    emit_quad(&mut indices, vs, d0 < 0.0);
                }
            }
        }
    }
    // Z grid-edges: parallel local edges E8..E11 = (lx,ly) → index 8 + lx + 2*ly.
    for k in 0..cz {
        for j in 1..cy {
            for i in 1..cx {
                let d0 = grid.at(i, j, k) as f64;
                let d1 = grid.at(i, j, k + 1) as f64;
                if (d0 < 0.0) != (d1 < 0.0) {
                    let le = |lx: usize, ly: usize| 8 + lx + 2 * ly;
                    let vs = [
                        resolve(&records, i, j, k, le(0, 0)),
                        resolve(&records, i - 1, j, k, le(1, 0)),
                        resolve(&records, i - 1, j - 1, k, le(1, 1)),
                        resolve(&records, i, j - 1, k, le(0, 1)),
                    ];
                    emit_quad(&mut indices, vs, d0 < 0.0);
                }
            }
        }
    }

    let mut out = ContourMesh {
        positions,
        normals,
        indices,
    };
    // The MC component split removes nearly all non-manifoldness at emission, but a
    // handful of ambiguous high-genus configurations still leave non-manifold
    // vertices/edges (two surface sheets that touch at a shared cell vertex). The
    // vertex-fan split below separates them into a true 2-manifold WITHOUT opening
    // boundary edges: it only relabels vertex references, fan by fan.
    split_nonmanifold_vertices(&mut out);
    out
}

/// Make the mesh 2-manifold by splitting pinch vertices. A vertex whose incident
/// triangles form more than one fan (connected only through MANIFOLD edges — edges
/// shared by exactly two triangles) is where ≥2 surface sheets touch; give each fan
/// after the first its own copy of the vertex. Because the split reassigns WHOLE
/// fans (never a single triangle), two triangles across a manifold edge always keep
/// the same vertex id, so no edge is ever opened — watertightness is preserved and
/// every bowtie edge (>2 incident triangles) is resolved into separate sheet edges.
fn split_nonmanifold_vertices(mesh: &mut ContourMesh) {
    use std::collections::HashMap;
    let tri_count = mesh.indices.len() / 3;

    // Undirected edge -> incident triangles. Only incidence-2 edges link a fan.
    // Built ONCE over the original topology; the rewrite below is computed entirely
    // against this snapshot and applied at the end, so cross-vertex splits stay
    // consistent (a stale-during-mutation map would re-open edges).
    let mut edge_tris: HashMap<(u32, u32), Vec<usize>> = HashMap::new();
    let mut vert_tris: HashMap<u32, Vec<usize>> = HashMap::new();
    for ti in 0..tri_count {
        let t = tri(mesh, ti);
        for &(a, b) in &[(t[0], t[1]), (t[1], t[2]), (t[2], t[0])] {
            let k = if a < b { (a, b) } else { (b, a) };
            edge_tris.entry(k).or_default().push(ti);
        }
        for &v in &t {
            vert_tris.entry(v).or_default().push(ti);
        }
    }
    let manifold_neighbor = |a: u32, b: u32, ti: usize| -> Option<usize> {
        let k = if a < b { (a, b) } else { (b, a) };
        match edge_tris.get(&k) {
            Some(ts) if ts.len() == 2 => Some(if ts[0] == ti { ts[1] } else { ts[0] }),
            _ => None,
        }
    };

    // (triangle, slot) -> new vertex id, accumulated read-only, applied at the end.
    let mut rewrite: Vec<(usize, usize, u32)> = Vec::new();
    let mut verts: Vec<u32> = vert_tris.keys().copied().collect();
    verts.sort_unstable();
    for v in verts {
        let incident = &vert_tris[&v];
        if incident.len() < 2 {
            continue;
        }
        // Fan-cluster the incident triangles: two are linked iff they share a
        // MANIFOLD edge (v, other). Bowtie/boundary edges don't link, so distinct
        // sheets touching at v fall into separate fans.
        let mut comp: HashMap<usize, usize> = HashMap::new();
        let mut ncomp = 0;
        for &start in incident {
            if comp.contains_key(&start) {
                continue;
            }
            let id = ncomp;
            ncomp += 1;
            let mut stack = vec![start];
            while let Some(ti) = stack.pop() {
                if comp.contains_key(&ti) {
                    continue;
                }
                comp.insert(ti, id);
                for &other in tri(mesh, ti).iter().filter(|&&w| w != v) {
                    if let Some(nb) = manifold_neighbor(v, other, ti) {
                        if !comp.contains_key(&nb) {
                            stack.push(nb);
                        }
                    }
                }
            }
        }
        if ncomp < 2 {
            continue;
        }
        // Fan 0 keeps `v`; every later fan gets its own copy. Record the rewrites.
        let copies: Vec<u32> = (0..ncomp)
            .map(|c| if c == 0 { v } else { dup_vertex(mesh, v) })
            .collect();
        for &ti in incident {
            let c = comp[&ti];
            if c == 0 {
                continue;
            }
            let t = tri(mesh, ti);
            for (slot, &w) in t.iter().enumerate() {
                if w == v {
                    rewrite.push((ti, slot, copies[c]));
                }
            }
        }
    }
    for (ti, slot, nv) in rewrite {
        mesh.indices[ti * 3 + slot] = nv;
    }
}

fn tri(mesh: &ContourMesh, ti: usize) -> [u32; 3] {
    [
        mesh.indices[ti * 3],
        mesh.indices[ti * 3 + 1],
        mesh.indices[ti * 3 + 2],
    ]
}

/// Append a positional + normal copy of vertex `v`, returning the new index.
fn dup_vertex(mesh: &mut ContourMesh, v: u32) -> u32 {
    let i = v as usize;
    let new = (mesh.positions.len() / 3) as u32;
    mesh.positions.extend_from_slice(&[
        mesh.positions[i * 3],
        mesh.positions[i * 3 + 1],
        mesh.positions[i * 3 + 2],
    ]);
    if mesh.normals.len() >= (i + 1) * 3 {
        mesh.normals.extend_from_slice(&[
            mesh.normals[i * 3],
            mesh.normals[i * 3 + 1],
            mesh.normals[i * 3 + 2],
        ]);
    }
    new
}

// ---------------------------------------------------------------------------
// Mesh quality analysis (watertight + 2-manifold)
// ---------------------------------------------------------------------------

/// Topological quality of a [`ContourMesh`]. Watertight ⇔ `boundary_edges == 0`;
/// 2-manifold ⇔ `nonmanifold_edges == 0` (every undirected edge shared by exactly
/// two triangles).
// analyze()/Quality are the meshing-regression oracle: consumed by tests now, and
// the runtime hook Phase 3b's print-readiness checks will call. Allow dead in a
// non-test cdylib build without masking the rest of the module.
#[cfg_attr(not(test), allow(dead_code))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Quality {
    pub tris: usize,
    pub verts: usize,
    pub boundary_edges: usize,
    pub nonmanifold_edges: usize,
}

#[cfg_attr(not(test), allow(dead_code))]
impl Quality {
    pub fn is_watertight(&self) -> bool {
        self.boundary_edges == 0
    }
    pub fn is_two_manifold(&self) -> bool {
        self.nonmanifold_edges == 0
    }
}

/// Count boundary (1-incident) and non-manifold (>2-incident) undirected edges.
#[cfg_attr(not(test), allow(dead_code))]
pub fn analyze(mesh: &ContourMesh) -> Quality {
    use crate::sparse::IntHashMap;
    let mut edges: IntHashMap<u64, u32> = IntHashMap::default();
    for t in mesh.indices.chunks_exact(3) {
        for &(a, b) in &[(t[0], t[1]), (t[1], t[2]), (t[2], t[0])] {
            let (lo, hi) = if a < b { (a, b) } else { (b, a) };
            let key = (lo as u64) | ((hi as u64) << 32);
            *edges.entry(key).or_insert(0) += 1;
        }
    }
    let mut boundary = 0;
    let mut nonman = 0;
    for &count in edges.values() {
        match count {
            1 => boundary += 1,
            2 => {}
            _ => nonman += 1,
        }
    }
    Quality {
        tris: mesh.indices.len() / 3,
        verts: mesh.positions.len() / 3,
        boundary_edges: boundary,
        nonmanifold_edges: nonman,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contour::surface_nets_mesh;
    use crate::sdf::expr::{Aabb, Expr};
    use crate::sdf::fixtures::chamber_v1_expr;
    use crate::sdf::rasterize;

    /// Rasterize an [`Expr`] over an explicit padded box into a dense grid, so a
    /// rotated/off-axis feature's true extent is never clipped by a tight bound.
    fn raster(expr: &Expr, half: f64, res: usize) -> crate::grid::Grid {
        let b = Aabb::centered([half, half, half]);
        rasterize(expr, b, res, 2).unwrap()
    }

    /// Worst (largest) min-distance from any of the cube's 8 corners to the nearest
    /// mesh vertex. Surface Nets rounds the corner inward (a large gap); a sharp DC
    /// QEF vertex sits ON the corner (a tiny gap).
    fn worst_corner_gap(mesh: &ContourMesh, half: f64) -> f64 {
        let signs = [-1.0f32, 1.0];
        let mut worst = 0.0f64;
        for &sx in &signs {
            for &sy in &signs {
                for &sz in &signs {
                    let corner = [sx * half as f32, sy * half as f32, sz * half as f32];
                    let mut best = f64::MAX;
                    for p in mesh.positions.chunks_exact(3) {
                        let d = (((p[0] - corner[0]).powi(2)
                            + (p[1] - corner[1]).powi(2)
                            + (p[2] - corner[2]).powi(2)) as f64)
                            .sqrt();
                        if d < best {
                            best = d;
                        }
                    }
                    if best > worst {
                        worst = best;
                    }
                }
            }
        }
        worst
    }

    /// Count directed edges `a->b` that appear in more than one triangle. In a
    /// consistently-wound watertight 2-manifold, each undirected edge is shared by
    /// exactly two oppositely-wound triangles, so every directed edge is unique;
    /// any reuse means two adjacent triangles disagree on winding (the class of bug
    /// the undirected watertight + manifold checks in [`analyze`] cannot see).
    fn dup_directed_edges(mesh: &ContourMesh) -> usize {
        use crate::sparse::IntHashMap;
        let mut directed: IntHashMap<u64, u32> = IntHashMap::default();
        for t in mesh.indices.chunks_exact(3) {
            for &(a, b) in &[(t[0], t[1]), (t[1], t[2]), (t[2], t[0])] {
                let key = (a as u64) | ((b as u64) << 32);
                *directed.entry(key).or_insert(0) += 1;
            }
        }
        directed.values().filter(|&&c| c > 1).count()
    }

    #[test]
    fn dc_sphere_is_watertight_and_manifold() {
        let grid = raster(&Expr::Sphere { r: 0.72 }, 1.2, 48);
        let mesh = dual_contour_mesh(&grid);
        let q = analyze(&mesh);
        assert!(q.tris > 0, "sphere DC must produce triangles");
        assert!(q.is_watertight(), "sphere DC must be watertight: {q:?}");
        assert!(q.is_two_manifold(), "sphere DC must be 2-manifold: {q:?}");
        // Consistent winding: no directed edge is reused. The undirected checks
        // above pass even when ~1/3 of facets are wound inward, so this directed
        // check is what guards orientation coherence.
        assert_eq!(
            dup_directed_edges(&mesh),
            0,
            "sphere DC must be consistently wound (no reused directed edge)"
        );
    }

    #[test]
    fn dc_box_is_watertight_manifold_and_sharper_than_surface_nets() {
        let half = 0.6;
        let grid = raster(
            &Expr::Box {
                half: [half, half, half],
            },
            1.2,
            48,
        );
        let dc = dual_contour_mesh(&grid);
        let q = analyze(&dc);
        assert!(q.is_watertight(), "box DC must be watertight: {q:?}");
        assert!(q.is_two_manifold(), "box DC must be 2-manifold: {q:?}");

        let sn = surface_nets_mesh(&grid);
        let gap_dc = worst_corner_gap(&dc, half);
        let gap_sn = worst_corner_gap(&sn, half);
        // DC's QEF places vertices on the sharp corners; Surface Nets rounds them.
        assert!(
            gap_dc < gap_sn,
            "DC corner gap {gap_dc} must be tighter than surface-nets {gap_sn}"
        );
        assert_eq!(
            dup_directed_edges(&dc),
            0,
            "box DC must be consistently wound (no reused directed edge)"
        );
    }

    #[test]
    fn dc_rotated_box_is_two_manifold() {
        // A box rotated off the grid axes: its sharp edges cut cells diagonally,
        // the case where one-vertex-per-cell goes non-manifold. The component
        // split must keep it 2-manifold.
        let half = 0.6;
        let rot = Expr::Rotate {
            e: Box::new(Expr::Rotate {
                e: Box::new(Expr::Box {
                    half: [half, half, half],
                }),
                axis: [0.0, 1.0, 0.0],
                angle: 0.6,
            }),
            axis: [0.0, 0.0, 1.0],
            angle: 0.5,
        };
        let grid = raster(&rot, 1.3, 56);
        let mesh = dual_contour_mesh(&grid);
        let q = analyze(&mesh);
        assert!(q.tris > 0, "rotated box DC must produce triangles");
        assert!(
            q.nonmanifold_edges == 0,
            "rotated box DC must have 0 non-manifold edges (the component split): {q:?}"
        );
        assert!(
            q.is_watertight(),
            "rotated box DC must be watertight: {q:?}"
        );
        assert_eq!(
            dup_directed_edges(&mesh),
            0,
            "rotated box DC must be consistently wound (no reused directed edge)"
        );
    }

    #[test]
    fn dc_clipped_gyroid_block_is_watertight_and_manifold() {
        use crate::sdf::field::ScalarField;
        use crate::tpms::LatticeType;
        // A gyroid intersected with a box: Surface Nets is only watertight on the
        // axis-aligned box face and pinches on the high-genus lattice elsewhere.
        let gyroid = Expr::Lattice {
            kind: LatticeType::Gyroid,
            period: ScalarField::Const(1.0),
            thickness: ScalarField::Const(0.5),
        };
        let block = Expr::Intersection(
            Box::new(gyroid),
            Box::new(Expr::Box {
                half: [1.4, 1.4, 1.4],
            }),
        );
        let grid = raster(&block, 1.7, 64);
        let mesh = dual_contour_mesh(&grid);
        let q = analyze(&mesh);
        assert!(q.tris > 0, "clipped gyroid DC must produce triangles");
        assert!(
            q.is_two_manifold(),
            "clipped gyroid DC must be 2-manifold (the manifold split): {q:?}"
        );
        assert!(
            q.is_watertight(),
            "clipped gyroid DC must be watertight: {q:?}"
        );
        assert_eq!(
            dup_directed_edges(&mesh),
            0,
            "clipped gyroid DC must be consistently wound (no reused directed edge)"
        );
    }

    /// THE KEYSTONE: the chamber v1 jacket (a high-genus gyroid clipped to a curved
    /// conical band, the feature Surface Nets could NOT contour watertight) is
    /// WATERTIGHT and 2-MANIFOLD under Manifold Dual Contouring. This lifts the
    /// caveat documented on `chamber_v1_expr` from Phase 2c.
    #[test]
    fn dc_chamber_v1_is_watertight_and_manifold() {
        let chamber = chamber_v1_expr();
        for res in [48usize, 64] {
            let grid = rasterize(&chamber, chamber.bounds(), res, 3).unwrap();
            let mesh = dual_contour_mesh(&grid);
            let q = analyze(&mesh);
            assert!(q.tris > 0, "chamber v1 DC @res{res} must produce triangles");
            assert!(
                q.boundary_edges == 0,
                "chamber v1 DC @res{res} must be watertight (0 boundary edges): {q:?}"
            );
            assert!(
                q.nonmanifold_edges == 0,
                "chamber v1 DC @res{res} must be 2-manifold (0 non-manifold edges): {q:?}"
            );
            assert_eq!(
                dup_directed_edges(&mesh),
                0,
                "chamber v1 DC @res{res} must be consistently wound (no reused directed edge)"
            );
        }
    }
}
