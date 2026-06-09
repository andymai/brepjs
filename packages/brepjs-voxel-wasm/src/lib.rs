//! brepjs-voxel-wasm — voxel/SDF geometry engine (ADR-0013).
//!
//! v1 surface is the repair-slice keystone: the Generalized Winding Number sign,
//! exposed across the wasm boundary as flat typed-array calls (no zero-copy; the
//! TS loader passes Float32Array/Uint32Array in and gets a typed array back).

mod bvh;
mod tpms;

// Public so the criterion bench (an external harness built against the rlib)
// can reach `Mesh`, `Grid`, `SparseGrid`, the contourers, and the
// `voxelize_mesh_*_pub` bench shims. The wasm surface is unchanged — none of
// these carry #[wasm_bindgen].
pub mod contour;
pub mod fwn;
pub mod grid;
pub mod ops;
pub mod sdf;
pub mod sparse;

use wasm_bindgen::prelude::*;

use crate::grid::{Grid, GridError, GridGeom};
use crate::sparse::SparseGrid;
use crate::tpms::LatticeType;

/// Dense-vs-sparse routing threshold on the would-be dense voxel count. Set well
/// above every current vitest fixture (all res <= 32, far under 4M) so they stay
/// byte-for-byte on the proven dense path; only larger grids route to the sparse
/// tiled path. Overflowing dims (`usize::MAX`) also route sparse.
const DENSE_THRESHOLD: usize = 4_000_000;

/// Which voxel pipeline a bridge call routes to. Internal — no wasm-bindgen.
enum Pipeline {
    Dense,
    Sparse,
}

/// Choose the pipeline from the would-be dense voxel count for these bounds.
fn route(min: [f32; 3], max: [f32; 3], resolution: u32, padding: u32) -> Pipeline {
    let (_, voxels) = GridGeom::for_bounds(min, max, resolution as usize, padding as usize);
    if voxels <= DENSE_THRESHOLD {
        Pipeline::Dense
    } else {
        Pipeline::Sparse
    }
}

/// Map a [`GridError`] to a JS exception, matching the dense path's wording.
fn grid_err(e: GridError) -> JsError {
    JsError::new(&format!("voxel grid allocation failed: {e:?}"))
}

/// Build a sparse grid over `(min,max,res,pad)` and voxelize `mesh` with `band`.
/// Returns the populated grid or a `TooLarge` JS error if the active band would
/// exceed the sparse budget.
fn sparse_voxelized(
    mesh: &fwn::Mesh,
    min: [f32; 3],
    max: [f32; 3],
    resolution: u32,
    padding: u32,
    band: f64,
) -> Result<SparseGrid, JsError> {
    let (geom, _) = GridGeom::for_bounds(min, max, resolution as usize, padding as usize);
    let mut sparse = SparseGrid::new(geom, band as f32).map_err(grid_err)?;
    ops::voxelize_mesh_sparse(&mut sparse, mesh, band).map_err(grid_err)?;
    Ok(sparse)
}

/// The dense band radius for a grid sized like `(min,max,res,pad)`, computed from
/// geometry alone (no allocation) so the sparse path sizes its band identically.
fn band_for(min: [f32; 3], max: [f32; 3], resolution: u32, padding: u32, extra: f32) -> f64 {
    let (geom, _) = GridGeom::for_bounds(min, max, resolution as usize, padding as usize);
    (extra + 2.0 * geom.spacing) as f64
}

/// Repaired triangle mesh handed back across the wasm boundary. wasm-bindgen
/// exposes the `Vec` getters as typed arrays (flat xyz positions/normals,
/// triangle-list indices). World-space coords; the bridge does not re-scale.
#[wasm_bindgen]
pub struct RepairResult {
    positions: Vec<f32>,
    normals: Vec<f32>,
    indices: Vec<u32>,
}

#[wasm_bindgen]
impl RepairResult {
    #[wasm_bindgen(getter)]
    pub fn positions(&self) -> Vec<f32> {
        self.positions.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn normals(&self) -> Vec<f32> {
        self.normals.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn indices(&self) -> Vec<u32> {
        self.indices.clone()
    }
}

/// Axis-aligned bounding box of flat xyz vertices. `verts` must be non-empty and
/// a multiple of 3 (the TS bridge validates this before crossing the boundary).
// Guard the lattice scalar params at the wasm boundary. The TS layer already
// validates these, but this artifact is also consumed directly, and period == 0
// makes the 2*PI/period scale non-finite (NaN field).
fn check_lattice_params(period: f32, thickness: f32) -> Result<(), JsError> {
    if !(period.is_finite() && period > 0.0) {
        return Err(JsError::new("lattice period must be a positive finite number"));
    }
    if !(thickness.is_finite() && thickness > 0.0) {
        return Err(JsError::new("lattice thickness must be a positive finite number"));
    }
    Ok(())
}

fn bbox(verts: &[f32]) -> ([f32; 3], [f32; 3]) {
    let mut min = [f32::INFINITY; 3];
    let mut max = [f32::NEG_INFINITY; 3];
    for p in verts.chunks_exact(3) {
        for axis in 0..3 {
            if p[axis] < min[axis] {
                min[axis] = p[axis];
            }
            if p[axis] > max[axis] {
                max[axis] = p[axis];
            }
        }
    }
    (min, max)
}

/// Repair a (possibly non-watertight) mesh into a closed surface: voxelize the
/// FWN-signed SDF over a grid sized to the mesh bbox, then Surface-Nets contour
/// it back to triangles (world-space). `resolution` sizes the longest bbox axis;
/// `padding` is the positive air margin Surface Nets needs (>= 1 to avoid clip).
///
/// `verts`: flat xyz, length 3·V. `tris`: flat vertex indices, length 3·T.
/// Errors (as a JS exception) if the grid exceeds the voxel cap.
#[wasm_bindgen]
pub fn repair_mesh(
    verts: &[f32],
    tris: &[u32],
    resolution: u32,
    padding: u32,
) -> Result<RepairResult, JsError> {
    let mesh = fwn::Mesh::from_flat(verts, tris);
    let (min, max) = bbox(verts);

    let out = match route(min, max, resolution, padding) {
        Pipeline::Dense => {
            let mut grid = Grid::for_bounds(min, max, resolution as usize, padding as usize)
                .map_err(grid_err)?;
            let band = ops::band_radius(&grid, 0.0);
            ops::voxelize_mesh_banded(&mut grid, &mesh, band);
            contour::surface_nets_mesh(&grid)
        }
        Pipeline::Sparse => {
            let band = band_for(min, max, resolution, padding, 0.0);
            let sparse = sparse_voxelized(&mesh, min, max, resolution, padding, band)?;
            contour::surface_nets_mesh_sparse(&sparse)
        }
    };

    Ok(RepairResult {
        positions: out.positions,
        normals: out.normals,
        indices: out.indices,
    })
}

/// Fill a mesh with a TPMS lattice infill: voxelize the FWN-signed solid over a
/// grid sized to the mesh bbox, build a shell field of the chosen lattice over the
/// same grid, intersect them (keep voxels both inside the solid AND in strut
/// material), then Surface-Nets contour back to triangles (world-space).
///
/// `verts`: flat xyz, length 3·V. `tris`: flat vertex indices, length 3·T.
/// `lattice_type`: 0=Gyroid, 1=SchwarzP, 2=Diamond. `period` is the unit-cell size
/// (world units); `thickness` is the strut wall width in field units.
/// Errors (as a JS exception) on a bad lattice tag or a grid over the voxel cap.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn lattice_infill(
    verts: &[f32],
    tris: &[u32],
    resolution: u32,
    padding: u32,
    lattice_type: u32,
    period: f32,
    thickness: f32,
) -> Result<RepairResult, JsError> {
    let kind = LatticeType::from_u32(lattice_type)
        .ok_or_else(|| JsError::new(&format!("unknown lattice type: {lattice_type}")))?;
    check_lattice_params(period, thickness)?;

    let mesh = fwn::Mesh::from_flat(verts, tris);
    let (min, max) = bbox(verts);

    let mut solid = Grid::for_bounds(min, max, resolution as usize, padding as usize)
        .map_err(|e| JsError::new(&format!("voxel grid allocation failed: {e:?}")))?;
    ops::voxelize_mesh(&mut solid, &mesh);

    let mut shell = solid.same_shape();
    tpms::fill_tpms_shell(&mut shell, kind, period, thickness);

    let infill = ops::voxel_intersection(&solid, &shell)
        .map_err(|e| JsError::new(&format!("voxel intersection failed: {e:?}")))?;

    let out = contour::surface_nets_mesh(&infill);

    Ok(RepairResult {
        positions: out.positions,
        normals: out.normals,
        indices: out.indices,
    })
}

/// The infinite TPMS lattice clipped to an axis-aligned box. Build a grid over
/// `[min..max]`, fill the chosen lattice shell field, Surface-Nets contour it.
///
/// `lattice_type`: 0=Gyroid, 1=SchwarzP, 2=Diamond. `period` is the unit-cell size
/// (world units); `thickness` is the strut wall width in field units.
/// Errors (as a JS exception) on a bad lattice tag or a grid over the voxel cap.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn tpms_box(
    min_x: f32,
    min_y: f32,
    min_z: f32,
    max_x: f32,
    max_y: f32,
    max_z: f32,
    resolution: u32,
    padding: u32,
    lattice_type: u32,
    period: f32,
    thickness: f32,
) -> Result<RepairResult, JsError> {
    let kind = LatticeType::from_u32(lattice_type)
        .ok_or_else(|| JsError::new(&format!("unknown lattice type: {lattice_type}")))?;
    check_lattice_params(period, thickness)?;

    let mut grid = Grid::for_bounds(
        [min_x, min_y, min_z],
        [max_x, max_y, max_z],
        resolution as usize,
        padding as usize,
    )
    .map_err(|e| JsError::new(&format!("voxel grid allocation failed: {e:?}")))?;
    tpms::fill_tpms_shell(&mut grid, kind, period, thickness);

    // Clip the (periodic) lattice to the requested box: intersect with the box
    // SDF so struts are bounded at [min..max] and the padding ring stays air.
    let mut clip = grid.same_shape();
    ops::fill_box_sdf(&mut clip, [min_x, min_y, min_z], [max_x, max_y, max_z]);
    let bounded = ops::voxel_intersection(&grid, &clip)
        .map_err(|e| JsError::new(&format!("voxel intersection failed: {e:?}")))?;

    let out = contour::surface_nets_mesh(&bounded);

    Ok(RepairResult {
        positions: out.positions,
        normals: out.normals,
        indices: out.indices,
    })
}

/// Offset (grow/shrink) a mesh by an exact SDF iso-shift. Voxelize the mesh into
/// a true SDF, subtract `distance` from every voxel (so `distance > 0` grows
/// outward, `< 0` shrinks inward), then Surface-Nets contour back to triangles.
/// Because the field is a true SDF this is an exact offset — no reinitialization.
///
/// `verts`: flat xyz, length 3·V. `tris`: flat vertex indices, length 3·T.
/// An outward offset surface extends past the input bbox, so the grid bounds are
/// expanded by `distance.max(0)` on every side before allocation.
/// Errors (as a JS exception) on a non-finite `distance` or a grid over the cap.
#[wasm_bindgen]
pub fn offset_mesh(
    verts: &[f32],
    tris: &[u32],
    distance: f32,
    resolution: u32,
    padding: u32,
) -> Result<RepairResult, JsError> {
    if !distance.is_finite() {
        return Err(JsError::new("offset distance must be a finite number"));
    }

    let mesh = fwn::Mesh::from_flat(verts, tris);
    let (min, max) = bbox(verts);

    let grow = distance.max(0.0);
    let emin = [min[0] - grow, min[1] - grow, min[2] - grow];
    let emax = [max[0] + grow, max[1] + grow, max[2] + grow];

    let out = match route(emin, emax, resolution, padding) {
        Pipeline::Dense => {
            let mut grid = Grid::for_bounds(emin, emax, resolution as usize, padding as usize)
                .map_err(grid_err)?;
            let band = ops::band_radius(&grid, distance.abs());
            ops::voxelize_mesh_banded(&mut grid, &mesh, band);
            ops::offset_sdf(&mut grid, distance);
            contour::surface_nets_mesh(&grid)
        }
        Pipeline::Sparse => {
            let band = band_for(emin, emax, resolution, padding, distance.abs());
            let mut sparse = sparse_voxelized(&mesh, emin, emax, resolution, padding, band)?;
            sparse.map_active_cells(|v| v - distance);
            sparse.offset_far(distance);
            contour::surface_nets_mesh_sparse(&sparse)
        }
    };

    Ok(RepairResult {
        positions: out.positions,
        normals: out.normals,
        indices: out.indices,
    })
}

/// Hollow a mesh into a shell of wall `thickness` inward from the surface.
/// Voxelize the mesh into a solid SDF, build the shell field
/// `max(solid, -(solid + thickness))` (the solid intersected with the complement
/// of its inward erosion), then Surface-Nets contour back to triangles.
///
/// `verts`: flat xyz, length 3·V. `tris`: flat vertex indices, length 3·T. The
/// shell grows inward only, so the grid is sized to the mesh bbox (no expansion).
/// Errors (as a JS exception) on a non-positive/non-finite `thickness` or a grid
/// over the voxel cap.
#[wasm_bindgen]
pub fn shell_mesh(
    verts: &[f32],
    tris: &[u32],
    thickness: f32,
    resolution: u32,
    padding: u32,
) -> Result<RepairResult, JsError> {
    if !(thickness.is_finite() && thickness > 0.0) {
        return Err(JsError::new("shell thickness must be a positive finite number"));
    }

    let mesh = fwn::Mesh::from_flat(verts, tris);
    let (min, max) = bbox(verts);

    let out = match route(min, max, resolution, padding) {
        Pipeline::Dense => {
            let mut solid = Grid::for_bounds(min, max, resolution as usize, padding as usize)
                .map_err(grid_err)?;
            let band = ops::band_radius(&solid, thickness);
            ops::voxelize_mesh_banded(&mut solid, &mesh, band);
            let shell = ops::shell_sdf(&solid, thickness);
            contour::surface_nets_mesh(&shell)
        }
        Pipeline::Sparse => {
            let band = band_for(min, max, resolution, padding, thickness);
            let mut sparse = sparse_voxelized(&mesh, min, max, resolution, padding, band)?;
            sparse.map_active_cells(|s| s.max(-(s + thickness)));
            sparse.shell_far(thickness);
            contour::surface_nets_mesh_sparse(&sparse)
        }
    };

    Ok(RepairResult {
        positions: out.positions,
        normals: out.normals,
        indices: out.indices,
    })
}

/// Co-register two meshes onto ONE shared grid sized to their UNION bbox and
/// combine by `op` (0=union, 1=intersection, 2=difference A−B). This is the only
/// correct way to boolean two independently-described meshes: a single grid means
/// one origin/spacing/dims, so the elementwise SDF blend operates in a single
/// coordinate frame. Returns the combined dense [`Grid`]. Rejects `op > 2`; a
/// grid over the dense voxel cap surfaces as the `Grid::for_bounds` error.
fn voxel_boolean_grid(
    verts_a: &[f32],
    tris_a: &[u32],
    verts_b: &[f32],
    tris_b: &[u32],
    op: u32,
    resolution: u32,
    padding: u32,
) -> Result<Grid, JsError> {
    if op > 2 {
        return Err(JsError::new(&format!("unknown boolean op: {op}")));
    }

    let mesh_a = fwn::Mesh::from_flat(verts_a, tris_a);
    let mesh_b = fwn::Mesh::from_flat(verts_b, tris_b);
    let (min_a, max_a) = bbox(verts_a);
    let (min_b, max_b) = bbox(verts_b);

    let umin = [
        min_a[0].min(min_b[0]),
        min_a[1].min(min_b[1]),
        min_a[2].min(min_b[2]),
    ];
    let umax = [
        max_a[0].max(max_b[0]),
        max_a[1].max(max_b[1]),
        max_a[2].max(max_b[2]),
    ];

    let mut grid_a = Grid::for_bounds(umin, umax, resolution as usize, padding as usize)
        .map_err(|e| JsError::new(&format!("voxel grid allocation failed: {e:?}")))?;
    ops::voxelize_mesh(&mut grid_a, &mesh_a);

    let mut grid_b = grid_a.same_shape();
    ops::voxelize_mesh(&mut grid_b, &mesh_b);

    match op {
        0 => ops::voxel_union(&grid_a, &grid_b),
        1 => ops::voxel_intersection(&grid_a, &grid_b),
        _ => ops::voxel_difference(&grid_a, &grid_b),
    }
    .map_err(|e| JsError::new(&format!("voxel boolean failed: {e:?}")))
}

/// Robust CSG boolean of two meshes via voxelized SDFs. Voxelize both meshes over
/// a shared grid sized to their UNION bbox, combine by `op`
/// (0=union, 1=intersection, 2=difference A−B), then Surface-Nets contour.
///
/// `verts_a`/`verts_b`: flat xyz; `tris_a`/`tris_b`: flat vertex indices.
/// Errors (as a JS exception) on an unknown `op` tag, a dim mismatch, or a grid
/// over the voxel cap.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn voxel_boolean(
    verts_a: &[f32],
    tris_a: &[u32],
    verts_b: &[f32],
    tris_b: &[u32],
    op: u32,
    resolution: u32,
    padding: u32,
) -> Result<RepairResult, JsError> {
    let combined = voxel_boolean_grid(
        verts_a, tris_a, verts_b, tris_b, op, resolution, padding,
    )?;

    let out = contour::surface_nets_mesh(&combined);

    Ok(RepairResult {
        positions: out.positions,
        normals: out.normals,
        indices: out.indices,
    })
}

/// A persistent dense voxel field for same-grid op chains: voxelize a mesh once,
/// then boolean / offset / shell / reinit IN PLACE on the kept grid, and contour
/// it once at the end. The value-returning free functions above re-voxelize and
/// re-contour on every call; this handle keeps one grid so an offset/shell after
/// a boolean is both cheaper AND correct (it reinitializes the drifted gradient).
///
/// Dense-only (v1): the persistent path wraps the dense [`Grid`] only, matching
/// boolean's dense-only scope. A grid whose bounds exceed the dense budget is
/// rejected at construction. wasm-bindgen auto-generates `.free()` (the struct
/// owns the grid's `Vec<f32>`).
#[wasm_bindgen]
pub struct VoxelField {
    grid: Grid,
    /// Whether φ has drifted off a true SDF (|∇φ| != 1 away from the surface).
    /// A boolean sets it; offset/shell auto-reinitialize when it is set, then
    /// clear it. A fresh voxelization is a true banded SDF, so it starts clean.
    dirty: bool,
}

impl VoxelField {
    /// Wrap an already-built [`Grid`] as a field. Lets the field-first `Sdf`
    /// rasterizer hand its grid to the same chainable surface the mesh-first
    /// constructor produces. A freshly rasterized banded SDF is clean (`dirty:
    /// false`); a blended/derived grid passes `dirty: true`.
    pub(crate) fn from_grid(grid: Grid, dirty: bool) -> VoxelField {
        VoxelField { grid, dirty }
    }
}

#[wasm_bindgen]
impl VoxelField {
    /// Voxelize a mesh into a persistent dense field sized to its bbox. Mirrors
    /// `offset_mesh`'s voxelize path (bbox → `Grid::for_bounds` → banded SDF) but
    /// stops before contour and keeps the grid. The result IS a true banded SDF,
    /// so `dirty` starts false.
    ///
    /// `verts`: flat xyz, length 3·V. `tris`: flat vertex indices, length 3·T.
    /// `resolution` sizes the longest bbox axis; `padding` is the air-margin ring.
    /// Errors if the grid would exceed the dense budget (the persistent path is
    /// dense-only) or the voxel cap.
    #[wasm_bindgen(constructor)]
    pub fn new(
        verts: &[f32],
        tris: &[u32],
        resolution: u32,
        padding: u32,
    ) -> Result<VoxelField, JsError> {
        let mesh = fwn::Mesh::from_flat(verts, tris);
        let (min, max) = bbox(verts);

        if let Pipeline::Sparse = route(min, max, resolution, padding) {
            return Err(JsError::new(
                "voxel field requires a dense grid; resolution/bounds exceed the dense budget",
            ));
        }

        let mut grid =
            Grid::for_bounds(min, max, resolution as usize, padding as usize).map_err(grid_err)?;
        let band = ops::band_radius(&grid, 0.0);
        ops::voxelize_mesh_banded(&mut grid, &mesh, band);

        Ok(VoxelField { grid, dirty: false })
    }

    /// Boolean two meshes onto ONE co-registered field, ready to chain. Mirrors
    /// `voxel_boolean` (union bbox → voxelize BOTH onto one shared dense grid →
    /// combine by `op`) but keeps the combined grid instead of contouring it, so
    /// the result is directly chainable (`.offset()`, `.shell()`, `.contour()`).
    ///
    /// This is THE correct way to "boolean then chain offset/shell" two
    /// independently-described meshes: a single shared grid means a single
    /// coordinate frame, where the per-field `boolean` method requires the caller
    /// to have already co-registered both operands onto matching grid geometry.
    ///
    /// `op`: 0=union, 1=intersection, 2=difference A−B. The combined field is
    /// `dirty` (the min/max blend drifts the gradient), so a subsequent
    /// offset/shell auto-reinitializes. Rejects `op > 2` and a grid over the
    /// dense voxel cap (the persistent path is dense-only, like `new`).
    #[wasm_bindgen]
    #[allow(clippy::too_many_arguments)]
    pub fn boolean_of(
        verts_a: &[f32],
        tris_a: &[u32],
        verts_b: &[f32],
        tris_b: &[u32],
        op: u32,
        resolution: u32,
        padding: u32,
    ) -> Result<VoxelField, JsError> {
        let (min_a, max_a) = bbox(verts_a);
        let (min_b, max_b) = bbox(verts_b);
        let umin = [
            min_a[0].min(min_b[0]),
            min_a[1].min(min_b[1]),
            min_a[2].min(min_b[2]),
        ];
        let umax = [
            max_a[0].max(max_b[0]),
            max_a[1].max(max_b[1]),
            max_a[2].max(max_b[2]),
        ];
        if let Pipeline::Sparse = route(umin, umax, resolution, padding) {
            return Err(JsError::new(
                "voxel field requires a dense grid; resolution/bounds exceed the dense budget",
            ));
        }

        let grid = voxel_boolean_grid(
            verts_a, tris_a, verts_b, tris_b, op, resolution, padding,
        )?;
        Ok(VoxelField { grid, dirty: true })
    }

    /// CSG-combine this field with `other` IN PLACE (0=union, 1=intersection,
    /// 2=difference self−other). Both operands MUST share grid geometry — same
    /// origin, spacing, AND dims — or this errors (`GeometryMismatch`) rather than
    /// silently blending mismatched coordinate frames. Two fields built by `new`
    /// from DIFFERENT meshes generally do NOT share geometry (each sizes its grid
    /// to its own bbox); use [`VoxelField::boolean_of`] for the easy co-registered
    /// path. The min/max blend keeps the zero set exact but drifts the gradient
    /// near the join, so this marks the field dirty (a subsequent offset/shell
    /// auto-reinitializes).
    pub fn boolean(&mut self, other: &VoxelField, op: u32) -> Result<(), JsError> {
        if op > 2 {
            return Err(JsError::new(&format!("unknown boolean op: {op}")));
        }
        let combined = match op {
            0 => ops::voxel_union(&self.grid, &other.grid),
            1 => ops::voxel_intersection(&self.grid, &other.grid),
            _ => ops::voxel_difference(&self.grid, &other.grid),
        }
        .map_err(|e| JsError::new(&format!("voxel boolean failed: {e:?}")))?;
        self.grid = combined;
        self.dirty = true;
        Ok(())
    }

    /// Offset (grow/shrink) the surface by `distance` via an iso-level shift
    /// (`> 0` outward, `< 0` inward), IN PLACE. AUTO-REINITIALIZES first if the
    /// field is dirty, so an iso-shift always rides a true SDF — this is what
    /// makes offset-after-boolean correct without the caller intervening.
    ///
    /// The grid bounds are fixed at voxelize time, so a large outward offset can
    /// clip at the padding ring; size resolution/padding for the intended offset.
    pub fn offset(&mut self, distance: f32) -> Result<(), JsError> {
        if !distance.is_finite() {
            return Err(JsError::new("offset distance must be a finite number"));
        }
        if self.dirty {
            ops::reinit_sdf(&mut self.grid);
            self.dirty = false;
        }
        ops::offset_sdf(&mut self.grid, distance);
        Ok(())
    }

    /// Hollow the field into an inward shell of wall `thickness`, IN PLACE.
    /// AUTO-REINITIALIZES first if dirty. The `max(s, -(s + t))` re-introduces a
    /// kink, so the field is dirty again afterwards.
    pub fn shell(&mut self, thickness: f32) -> Result<(), JsError> {
        if !(thickness.is_finite() && thickness > 0.0) {
            return Err(JsError::new("shell thickness must be a positive finite number"));
        }
        if self.dirty {
            ops::reinit_sdf(&mut self.grid);
            self.dirty = false;
        }
        self.grid = ops::shell_sdf(&self.grid, thickness);
        self.dirty = true;
        Ok(())
    }

    /// Explicitly reinitialize φ to a true SDF (|∇φ| = 1) while preserving the
    /// zero set (Fast Sweeping). Idempotent on a clean field; clears `dirty`.
    pub fn reinit(&mut self) {
        ops::reinit_sdf(&mut self.grid);
        self.dirty = false;
    }

    /// Surface-Nets contour the current field to a triangle mesh. Borrows `&self`
    /// so the field stays alive and chainable afterwards. Does NOT reinitialize:
    /// the zero set is exact (boolean preserves it), and reinit only matters for a
    /// SUBSEQUENT offset/shell.
    pub fn contour(&self) -> RepairResult {
        let out = contour::surface_nets_mesh(&self.grid);
        RepairResult {
            positions: out.positions,
            normals: out.normals,
            indices: out.indices,
        }
    }
}

/// An opaque analytic SDF expression (the field-first authoring path, ADR-0013).
/// Wraps an immutable [`sdf::Expr`] tree built by the static primitive
/// constructors and grown by the combinator methods. Every method CLONES into a
/// fresh node and returns a new `Sdf` (wasm-bindgen has no shared borrow across
/// calls), so an `Sdf` is a value, not a mutable builder.
#[wasm_bindgen]
pub struct Sdf {
    expr: sdf::Expr,
}

impl Sdf {
    fn of(expr: sdf::Expr) -> Sdf {
        Sdf { expr }
    }
}

#[wasm_bindgen]
impl Sdf {
    // ── Primitive constructors (centered at the origin unless noted) ──

    pub fn sphere(r: f64) -> Sdf {
        Sdf::of(sdf::Expr::Sphere { r })
    }

    #[wasm_bindgen(js_name = box_)]
    pub fn box_(hx: f64, hy: f64, hz: f64) -> Sdf {
        Sdf::of(sdf::Expr::Box { half: [hx, hy, hz] })
    }

    pub fn rounded_box(hx: f64, hy: f64, hz: f64, r: f64) -> Sdf {
        Sdf::of(sdf::Expr::RoundBox {
            half: [hx, hy, hz],
            r,
        })
    }

    pub fn cylinder(r: f64, h: f64) -> Sdf {
        Sdf::of(sdf::Expr::Cylinder { r, h })
    }

    pub fn cone(r: f64, h: f64) -> Sdf {
        Sdf::of(sdf::Expr::Cone { r, h })
    }

    #[allow(clippy::too_many_arguments)]
    pub fn capsule(ax: f64, ay: f64, az: f64, bx: f64, by: f64, bz: f64, r: f64) -> Sdf {
        Sdf::of(sdf::Expr::Capsule {
            a: [ax, ay, az],
            b: [bx, by, bz],
            r,
        })
    }

    pub fn torus(major: f64, minor: f64) -> Sdf {
        Sdf::of(sdf::Expr::Torus { major, minor })
    }

    pub fn plane(nx: f64, ny: f64, nz: f64, h: f64) -> Sdf {
        Sdf::of(sdf::Expr::Plane { n: [nx, ny, nz], h })
    }

    /// Sweep an in-plane `profile` along `spine` (flat xyz, length 3·N, N >= 2)
    /// using rotation-minimizing frames. `closed` skips the end caps. The profile's
    /// expression is cloned in-plane (sampled at `[u, v, 0]` per station). Errors on
    /// fewer than two stations, a non-`3·N` length, a non-finite coordinate, or a
    /// degenerate (zero-length) spine.
    pub fn sweep(spine: &[f64], profile: &Sdf, closed: bool) -> Result<Sdf, JsError> {
        if spine.len() < 6 || !spine.len().is_multiple_of(3) {
            return Err(JsError::new(
                "sweep spine must be flat xyz with at least 2 stations (length 3·N, N >= 2)",
            ));
        }
        let pts: Vec<[f64; 3]> = spine.chunks_exact(3).map(|c| [c[0], c[1], c[2]]).collect();
        if !pts.iter().all(|p| p.iter().all(|c| c.is_finite())) {
            return Err(JsError::new("sweep spine coordinates must be finite"));
        }
        // A zero-length spine (all stations coincident) has no tangent direction.
        let total: f64 = pts
            .windows(2)
            .map(|w| {
                let d = [w[1][0] - w[0][0], w[1][1] - w[0][1], w[1][2] - w[0][2]];
                (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt()
            })
            .sum();
        if total <= 1e-9 {
            return Err(JsError::new("sweep spine is degenerate (zero length)"));
        }
        Ok(Sdf::of(sdf::Expr::Sweep {
            curve: sdf::SweptCurve::new(&pts, closed),
            profile: Box::new(profile.expr.clone()),
        }))
    }

    // ── Binary operators ──

    pub fn union(&self, other: &Sdf) -> Sdf {
        Sdf::of(sdf::Expr::Union(
            Box::new(self.expr.clone()),
            Box::new(other.expr.clone()),
        ))
    }

    pub fn intersection(&self, other: &Sdf) -> Sdf {
        Sdf::of(sdf::Expr::Intersection(
            Box::new(self.expr.clone()),
            Box::new(other.expr.clone()),
        ))
    }

    pub fn difference(&self, other: &Sdf) -> Sdf {
        Sdf::of(sdf::Expr::Difference(
            Box::new(self.expr.clone()),
            Box::new(other.expr.clone()),
        ))
    }

    pub fn smooth_union(&self, other: &Sdf, k: f64) -> Sdf {
        Sdf::of(sdf::Expr::SmoothUnion {
            a: Box::new(self.expr.clone()),
            b: Box::new(other.expr.clone()),
            k,
        })
    }

    pub fn smooth_intersection(&self, other: &Sdf, k: f64) -> Sdf {
        Sdf::of(sdf::Expr::SmoothIntersection {
            a: Box::new(self.expr.clone()),
            b: Box::new(other.expr.clone()),
            k,
        })
    }

    pub fn smooth_difference(&self, other: &Sdf, k: f64) -> Sdf {
        Sdf::of(sdf::Expr::SmoothDifference {
            a: Box::new(self.expr.clone()),
            b: Box::new(other.expr.clone()),
            k,
        })
    }

    // ── Position-modulated field operators (brepjs-implicit Phase 2b) ──

    /// Offset by a per-position distance field. NOTE: a modulated offset/blend yields
    /// a Lipschitz field (`|∇| < 1`), not a true SDF — a downstream true-distance op
    /// (`VoxelField::offset`/`shell`) must reinit first; `rasterize` returns it clean
    /// but a chained op after a SECOND modulation should reinit.
    pub fn offset_field(&self, f: &ScalarField) -> Sdf {
        Sdf::of(sdf::Expr::OffsetField {
            e: Box::new(self.expr.clone()),
            d: f.field.clone(),
        })
    }

    pub fn round_field(&self, f: &ScalarField) -> Sdf {
        Sdf::of(sdf::Expr::RoundField {
            e: Box::new(self.expr.clone()),
            r: f.field.clone(),
        })
    }

    pub fn shell_field(&self, f: &ScalarField) -> Sdf {
        Sdf::of(sdf::Expr::ShellField {
            e: Box::new(self.expr.clone()),
            t: f.field.clone(),
        })
    }

    pub fn smooth_union_field(&self, other: &Sdf, k: &ScalarField) -> Sdf {
        Sdf::of(sdf::Expr::SmoothUnionField {
            a: Box::new(self.expr.clone()),
            b: Box::new(other.expr.clone()),
            k: k.field.clone(),
        })
    }

    // ── Unary field operators ──

    pub fn offset(&self, d: f64) -> Sdf {
        Sdf::of(sdf::Expr::Offset {
            e: Box::new(self.expr.clone()),
            d,
        })
    }

    pub fn round(&self, r: f64) -> Sdf {
        Sdf::of(sdf::Expr::Round {
            e: Box::new(self.expr.clone()),
            r,
        })
    }

    pub fn shell(&self, t: f64) -> Sdf {
        Sdf::of(sdf::Expr::Shell {
            e: Box::new(self.expr.clone()),
            t,
        })
    }

    pub fn onion(&self, t: f64) -> Sdf {
        Sdf::of(sdf::Expr::Onion {
            e: Box::new(self.expr.clone()),
            t,
        })
    }

    // ── Domain transforms ──

    pub fn translate(&self, x: f64, y: f64, z: f64) -> Sdf {
        Sdf::of(sdf::Expr::Translate {
            e: Box::new(self.expr.clone()),
            t: [x, y, z],
        })
    }

    pub fn rotate(&self, ax: f64, ay: f64, az: f64, angle: f64) -> Sdf {
        Sdf::of(sdf::Expr::Rotate {
            e: Box::new(self.expr.clone()),
            axis: [ax, ay, az],
            angle,
        })
    }

    pub fn scale(&self, s: f64) -> Sdf {
        Sdf::of(sdf::Expr::Scale {
            e: Box::new(self.expr.clone()),
            s,
        })
    }

    // ── Rasterization ──

    /// Rasterize this expression into a persistent dense [`VoxelField`] using its
    /// analytic bounds. The result is a true banded SDF, so the field starts clean
    /// (`dirty: false`). Rejects a grid over the dense voxel cap with a clear
    /// JsError, mirroring `VoxelField::new`.
    pub fn rasterize(&self, resolution: u32, padding: u32) -> Result<VoxelField, JsError> {
        let grid = sdf::rasterize(
            &self.expr,
            self.expr.bounds(),
            resolution as usize,
            padding as usize,
        )
        .map_err(grid_err)?;
        Ok(VoxelField::from_grid(grid, false))
    }

    /// Rasterize this expression into a dense [`VoxelField`] over EXPLICIT bounds
    /// `[min..max]`, for clipping unbounded primitives (a half-space) or framing a
    /// custom region. Same banded SDF semantics as [`Sdf::rasterize`].
    #[allow(clippy::too_many_arguments)]
    pub fn rasterize_in(
        &self,
        min_x: f64,
        min_y: f64,
        min_z: f64,
        max_x: f64,
        max_y: f64,
        max_z: f64,
        resolution: u32,
        padding: u32,
    ) -> Result<VoxelField, JsError> {
        let bounds = sdf::Aabb::new([min_x, min_y, min_z], [max_x, max_y, max_z]);
        let grid = sdf::rasterize(&self.expr, bounds, resolution as usize, padding as usize)
            .map_err(grid_err)?;
        Ok(VoxelField::from_grid(grid, false))
    }
}

/// An opaque position-varying scalar field (brepjs-implicit Phase 2b). Wraps an
/// immutable [`sdf::ScalarField`] built by the static constructors below and fed to
/// the `Sdf` modulated operators (`offset_field`, `shell_field`, …) to vary an
/// operator parameter per voxel. Like [`Sdf`], it is a value: each constructor
/// returns a fresh field. wasm-bindgen auto-generates `.free()`.
#[wasm_bindgen]
pub struct ScalarField {
    field: sdf::ScalarField,
}

impl ScalarField {
    fn of(field: sdf::ScalarField) -> ScalarField {
        ScalarField { field }
    }
}

#[wasm_bindgen]
impl ScalarField {
    /// A spatially constant value — reproduces a constant operator parameter exactly.
    pub fn constant(c: f64) -> ScalarField {
        ScalarField::of(sdf::ScalarField::Const(c))
    }

    /// Linear `lo → hi` as `coord[axis]` goes `a → b`, clamped outside `[a, b]`.
    /// Errors if `axis` is not 0, 1, or 2.
    pub fn axial_ramp(axis: u32, a: f64, b: f64, lo: f64, hi: f64) -> Result<ScalarField, JsError> {
        let axis = check_axis(axis)?;
        Ok(ScalarField::of(sdf::ScalarField::AxialRamp { axis, a, b, lo, hi }))
    }

    /// Value by radial distance from the line through `(cx, cy, cz)` along `axis`:
    /// `lo → hi` as that distance goes `r0 → r1`, clamped. Errors on a bad `axis`.
    #[allow(clippy::too_many_arguments)]
    pub fn radial_ramp(
        cx: f64,
        cy: f64,
        cz: f64,
        axis: u32,
        r0: f64,
        r1: f64,
        lo: f64,
        hi: f64,
    ) -> Result<ScalarField, JsError> {
        let axis = check_axis(axis)?;
        Ok(ScalarField::of(sdf::ScalarField::RadialRamp {
            center: [cx, cy, cz],
            axis,
            r0,
            r1,
            lo,
            hi,
        }))
    }

    /// An `Sdf`'s signed distance affinely remapped: `sdf.eval(p) * scale + offset`.
    /// UNBOUNDED — drive a bounds-affecting op with this only via `rasterize_in` or
    /// wrapped in [`ScalarField::clamp`].
    pub fn from_sdf(sdf: &Sdf, scale: f64, offset: f64) -> ScalarField {
        ScalarField::of(sdf::ScalarField::FromSdf {
            e: Box::new(sdf.expr.clone()),
            scale,
            offset,
        })
    }

    /// Clamp another field's value to `[min, max]` — bounds an otherwise unbounded
    /// [`ScalarField::from_sdf`] so it can safely drive offset/shell. Errors if
    /// `min > max` or either bound is NaN (the `!(min <= max)` form rejects both).
    pub fn clamp(field: &ScalarField, min: f64, max: f64) -> Result<ScalarField, JsError> {
        // Reject `min > max` AND either bound being NaN (partial_cmp returns None on NaN).
        if !matches!(
            min.partial_cmp(&max),
            Some(std::cmp::Ordering::Less | std::cmp::Ordering::Equal)
        ) {
            return Err(JsError::new("clamp min must be <= max"));
        }
        Ok(ScalarField::of(sdf::ScalarField::Clamp {
            f: Box::new(field.field.clone()),
            min,
            max,
        }))
    }
}

/// Validate a wasm-supplied axis index (0=x, 1=y, 2=z).
fn check_axis(axis: u32) -> Result<usize, JsError> {
    if axis < 3 {
        Ok(axis as usize)
    } else {
        Err(JsError::new("axis must be 0 (x), 1 (y), or 2 (z)"))
    }
}

/// Winding number at each query point, against a triangle-soup mesh.
///
/// `verts`: flat xyz, length 3·V. `tris`: flat vertex indices, length 3·T.
/// `queries`: flat xyz, length 3·Q. Returns length Q (winding number per query).
#[wasm_bindgen]
pub fn winding_numbers(verts: &[f32], tris: &[u32], queries: &[f32]) -> Vec<f32> {
    let mesh = fwn::Mesh::from_flat(verts, tris);
    queries
        .chunks_exact(3)
        .map(|q| mesh.winding_number([q[0] as f64, q[1] as f64, q[2] as f64]) as f32)
        .collect()
}

/// Inside/outside classification per query point (winding number > 0.5).
///
/// Returns length Q: 1 = inside, 0 = outside. This is the sign decision the
/// repair pipeline makes on non-watertight input.
#[wasm_bindgen]
pub fn points_inside(verts: &[f32], tris: &[u32], queries: &[f32]) -> Vec<u8> {
    let mesh = fwn::Mesh::from_flat(verts, tris);
    queries
        .chunks_exact(3)
        .map(|q| u8::from(mesh.is_inside([q[0] as f64, q[1] as f64, q[2] as f64])))
        .collect()
}

/// Crate version, for the loader to assert artifact/loader compatibility.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Unit cube [0,1]^3, outward-facing triangles.
    fn unit_cube() -> (Vec<f32>, Vec<u32>) {
        let verts: Vec<f32> = vec![
            0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0,
            1.0, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0,
        ];
        let tris: Vec<u32> = vec![
            0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7,
            3, 1, 2, 6, 1, 6, 5,
        ];
        (verts, tris)
    }

    #[test]
    fn lattice_infill_produces_a_mesh() {
        let (verts, tris) = unit_cube();
        let r = lattice_infill(&verts, &tris, 32, 2, 0, 0.4, 0.4).expect("infill must succeed");
        assert!(!r.positions.is_empty(), "infill mesh must have vertices");
        assert!(!r.indices.is_empty(), "infill mesh must have triangles");
    }

    /// Bounding box of flat xyz vertices, for asserting offset growth.
    fn flat_bbox(verts: &[f32]) -> ([f32; 3], [f32; 3]) {
        bbox(verts)
    }

    #[test]
    fn offset_mesh_grows_bbox_outward() {
        let (verts, tris) = unit_cube();
        let r = offset_mesh(&verts, &tris, 0.25, 24, 2).expect("offset must succeed");
        assert!(!r.positions.is_empty(), "offset mesh must have vertices");
        assert!(!r.indices.is_empty(), "offset mesh must have triangles");

        let (omin, omax) = flat_bbox(&r.positions);
        let (imin, imax) = flat_bbox(&verts);
        // An outward offset must push the surface past the input bbox on every axis.
        for axis in 0..3 {
            assert!(
                omin[axis] < imin[axis] && omax[axis] > imax[axis],
                "offset bbox must grow on axis {axis}: in [{},{}] out [{},{}]",
                imin[axis],
                imax[axis],
                omin[axis],
                omax[axis]
            );
        }
    }

    #[test]
    fn shell_mesh_produces_a_mesh() {
        let (verts, tris) = unit_cube();
        let r = shell_mesh(&verts, &tris, 0.2, 32, 2).expect("shell must succeed");
        assert!(!r.positions.is_empty(), "shell mesh must have vertices");
        assert!(!r.indices.is_empty(), "shell mesh must have triangles");
    }

    #[test]
    fn voxel_boolean_union_of_overlapping_cubes() {
        let (verts_a, tris_a) = unit_cube();
        // Second cube shifted +0.5 on x so the two overlap.
        let (mut verts_b, tris_b) = unit_cube();
        for p in verts_b.chunks_exact_mut(3) {
            p[0] += 0.5;
        }
        let r = voxel_boolean(&verts_a, &tris_a, &verts_b, &tris_b, 0, 24, 2)
            .expect("union must succeed");
        assert!(!r.positions.is_empty(), "union mesh must have vertices");
        assert!(!r.indices.is_empty(), "union mesh must have triangles");
    }

    #[test]
    fn tpms_box_produces_a_mesh() {
        let r = tpms_box(0.0, 0.0, 0.0, 3.0, 3.0, 3.0, 32, 1, 0, 1.0, 0.4)
            .expect("tpms_box must succeed");
        assert!(!r.positions.is_empty(), "tpms_box mesh must have vertices");
        assert!(!r.indices.is_empty(), "tpms_box mesh must have triangles");
    }

    /// A field built from two overlapping cubes via the co-registered constructor
    /// must contour to a non-empty mesh, and be `dirty` (boolean drifts gradient).
    #[test]
    fn boolean_of_co_registers_and_is_chainable() {
        let (verts_a, tris_a) = unit_cube();
        let (mut verts_b, tris_b) = unit_cube();
        for p in verts_b.chunks_exact_mut(3) {
            p[0] += 0.5;
        }
        let field = VoxelField::boolean_of(&verts_a, &tris_a, &verts_b, &tris_b, 0, 24, 2)
            .expect("boolean_of must succeed");
        assert!(field.dirty, "a boolean field must be dirty");
        let r = field.contour();
        assert!(!r.positions.is_empty(), "co-registered union must have vertices");
        assert!(!r.indices.is_empty(), "co-registered union must have triangles");
    }

    /// Handle wiring: an offset AFTER a union differs WITH the dirty-gated reinit
    /// vs WITHOUT it. The reinit math is proven in ops; this only pins that the
    /// `offset` method's auto-reinit actually fires when the field is dirty.
    /// Compares the contoured surfaces directly so it doesn't depend on a probe.
    ///
    /// Stays on the Ok path of the JsError-returning methods, because constructing
    /// a `JsError` panics on the native (non-wasm) test target — so the Err-path
    /// guards (op > 2, geometry mismatch) are covered at the ops level and in TS.
    #[test]
    fn offset_after_union_reinit_changes_surface() {
        let (verts_a, tris_a) = unit_cube();
        let (mut verts_b, tris_b) = unit_cube();
        for p in verts_b.chunks_exact_mut(3) {
            p[0] += 0.5;
        }
        let d = 0.2_f32;

        // WITH reinit: the offset method reinitializes because the field is dirty.
        let mut with = VoxelField::boolean_of(&verts_a, &tris_a, &verts_b, &tris_b, 0, 48, 4)
            .expect("union must succeed");
        with.offset(d).expect("offset must succeed");
        let with_mesh = with.contour();

        // WITHOUT reinit: clear dirty first so the offset rides the drifted field.
        let mut without = VoxelField::boolean_of(&verts_a, &tris_a, &verts_b, &tris_b, 0, 48, 4)
            .expect("union must succeed");
        without.dirty = false;
        without.offset(d).expect("offset must succeed");
        let without_mesh = without.contour();

        // The reinit shifts the min/max-blended join saddle, so the two contoured
        // surfaces are NOT identical: their max-extent differs near the join.
        let extent = |pos: &[f32]| {
            pos.chunks_exact(3)
                .fold(f32::NEG_INFINITY, |m, p| m.max(p[1]).max(p[0]).max(p[2]))
        };
        let e_with = extent(&with_mesh.positions);
        let e_without = extent(&without_mesh.positions);
        assert!(
            with_mesh.positions.len() != without_mesh.positions.len()
                || (e_with - e_without).abs() > 1e-4,
            "auto-reinit must change the offset surface: with extent {e_with} ({} verts) vs without {e_without} ({} verts)",
            with_mesh.positions.len(),
            without_mesh.positions.len()
        );
    }
}
