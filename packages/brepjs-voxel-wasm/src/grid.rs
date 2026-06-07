//! Dense SDF grid behind an accessor abstraction (ADR-0013 voxel domain).
//!
//! v1 is a flat dense `Vec<f32>`, one signed-distance value per voxel. Callers
//! reach cells only through the accessor methods (`at`/`set`/`world_pos`), never
//! by indexing the raw `Vec`, so a sparse grid can swap in behind the same seam
//! without touching the contourer or ops.
//!
// The accessor seam is wired but not yet consumed by a wasm export; the cdylib
// build therefore can't see the callers that the contourer/ops seams will add.
#![allow(dead_code)]

/// Sentinel SDF value for an uninitialized voxel: far outside the surface.
/// `f32::MAX / 4` leaves headroom so downstream subtraction can't overflow.
const FAR_OUTSIDE: f32 = f32::MAX / 4.0;

/// Hard cap on total voxel count, refused before allocation to avoid OOM.
pub const MAX_VOXELS: usize = 64_000_000;

/// Padded grid geometry: the dims/origin/spacing triple shared identically by
/// the dense [`Grid`] and the sparse grid, so `world_pos` math is defined once.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GridGeom {
    pub dims: [usize; 3],
    pub origin: [f32; 3],
    pub spacing: f32,
}

impl GridGeom {
    /// Size geometry so the LONGEST bbox axis spans `resolution` voxels at uniform
    /// spacing, expanded by `padding_voxels` on every side. Pure dims math, no
    /// allocation — used to threshold dense-vs-sparse without touching memory.
    /// Returns the geometry plus the would-be dense voxel count (saturating, so an
    /// overflowing product reads as `usize::MAX` rather than wrapping).
    pub fn for_bounds(
        min: [f32; 3],
        max: [f32; 3],
        resolution: usize,
        padding_voxels: usize,
    ) -> (GridGeom, usize) {
        let res = resolution.max(1);
        let extent = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
        let longest = extent[0].max(extent[1]).max(extent[2]).max(f32::MIN_POSITIVE);
        let spacing = longest / res as f32;

        let pad = padding_voxels;
        let dims = [
            (extent[0] / spacing).ceil() as usize + 1 + 2 * pad,
            (extent[1] / spacing).ceil() as usize + 1 + 2 * pad,
            (extent[2] / spacing).ceil() as usize + 1 + 2 * pad,
        ];

        let requested = dims[0]
            .checked_mul(dims[1])
            .and_then(|v| v.checked_mul(dims[2]))
            .unwrap_or(usize::MAX);

        let origin = [
            min[0] - pad as f32 * spacing,
            min[1] - pad as f32 * spacing,
            min[2] - pad as f32 * spacing,
        ];

        (
            GridGeom {
                dims,
                origin,
                spacing,
            },
            requested,
        )
    }

    /// World-space position of cell (x,y,z): `origin + [x,y,z]*spacing`.
    pub fn world_pos(&self, x: usize, y: usize, z: usize) -> [f32; 3] {
        [
            self.origin[0] + x as f32 * self.spacing,
            self.origin[1] + y as f32 * self.spacing,
            self.origin[2] + z as f32 * self.spacing,
        ]
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GridError {
    /// Requested voxel count exceeds [`MAX_VOXELS`]; nothing was allocated.
    TooLarge { requested: usize },
    /// Two grids (or a grid and a buffer) disagree on dimensions.
    DimMismatch { expected: [usize; 3], got: [usize; 3] },
}

/// A dense, uniformly spaced SDF grid.
#[derive(Debug)]
pub struct Grid {
    dims: [usize; 3],
    origin: [f32; 3],
    spacing: f32,
    data: Vec<f32>,
}

impl Grid {
    /// Size a grid so the LONGEST bbox axis spans `resolution` voxels at uniform
    /// spacing, then expand by `padding_voxels` on every side. Origin sits at the
    /// padded min corner; all cells start at the far-outside sentinel.
    pub fn for_bounds(
        min: [f32; 3],
        max: [f32; 3],
        resolution: usize,
        padding_voxels: usize,
    ) -> Result<Grid, GridError> {
        let (geom, requested) = GridGeom::for_bounds(min, max, resolution, padding_voxels);
        if requested > MAX_VOXELS {
            return Err(GridError::TooLarge { requested });
        }

        Ok(Grid {
            dims: geom.dims,
            origin: geom.origin,
            spacing: geom.spacing,
            data: vec![FAR_OUTSIDE; requested],
        })
    }

    /// A new grid with the same dims/origin/spacing, every cell at the
    /// far-outside sentinel. Used by the ops seam to allocate a result grid that
    /// matches an input's shape without re-deriving it from bounds.
    pub fn same_shape(&self) -> Grid {
        Grid {
            dims: self.dims,
            origin: self.origin,
            spacing: self.spacing,
            data: vec![FAR_OUTSIDE; self.data.len()],
        }
    }

    /// Flat index of cell (x,y,z): `x + y*nx + z*nx*ny`.
    pub fn index(&self, x: usize, y: usize, z: usize) -> usize {
        let [nx, ny, _] = self.dims;
        x + y * nx + z * nx * ny
    }

    /// SDF value at cell (x,y,z).
    pub fn at(&self, x: usize, y: usize, z: usize) -> f32 {
        self.data[self.index(x, y, z)]
    }

    /// Set the SDF value at cell (x,y,z).
    pub fn set(&mut self, x: usize, y: usize, z: usize, v: f32) {
        let i = self.index(x, y, z);
        self.data[i] = v;
    }

    /// World-space position of cell (x,y,z): `origin + [x,y,z]*spacing`.
    pub fn world_pos(&self, x: usize, y: usize, z: usize) -> [f32; 3] {
        [
            self.origin[0] + x as f32 * self.spacing,
            self.origin[1] + y as f32 * self.spacing,
            self.origin[2] + z as f32 * self.spacing,
        ]
    }

    pub fn dims(&self) -> [usize; 3] {
        self.dims
    }

    pub fn spacing(&self) -> f32 {
        self.spacing
    }

    pub fn origin(&self) -> [f32; 3] {
        self.origin
    }

    /// The shared geometry triple, for code that wants `world_pos` without a
    /// dense allocation (e.g. the sparse contour parity oracle).
    pub fn geom(&self) -> GridGeom {
        GridGeom {
            dims: self.dims,
            origin: self.origin,
            spacing: self.spacing,
        }
    }

    /// Total voxel count (== length of the backing data).
    pub fn len(&self) -> usize {
        self.data.len()
    }

    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    /// Read-only view of the backing SDF values, for the contourer.
    pub fn data(&self) -> &[f32] {
        &self.data
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn index_round_trips() {
        let g = Grid::for_bounds([0.0, 0.0, 0.0], [1.0, 1.0, 1.0], 4, 0).unwrap();
        let [nx, ny, nz] = g.dims();
        for z in 0..nz {
            for y in 0..ny {
                for x in 0..nx {
                    let i = g.index(x, y, z);
                    assert_eq!(i, x + y * nx + z * nx * ny);
                    assert!(i < g.len());
                }
            }
        }
        // Distinct cells map to distinct indices (spot check the corners).
        assert_eq!(g.index(0, 0, 0), 0);
        assert_eq!(g.index(nx - 1, ny - 1, nz - 1), g.len() - 1);
    }

    #[test]
    fn at_set_round_trip() {
        let mut g = Grid::for_bounds([0.0, 0.0, 0.0], [1.0, 1.0, 1.0], 4, 0).unwrap();
        assert_eq!(g.at(1, 2, 3), FAR_OUTSIDE);
        g.set(1, 2, 3, -0.25);
        assert_eq!(g.at(1, 2, 3), -0.25);
        // A neighbour stays at the sentinel.
        assert_eq!(g.at(0, 2, 3), FAR_OUTSIDE);
    }

    #[test]
    fn world_pos_is_origin_plus_step() {
        // Cube [0,2]^3 at resolution 4 -> spacing 0.5, no padding -> origin at min.
        let g = Grid::for_bounds([0.0, 0.0, 0.0], [2.0, 2.0, 2.0], 4, 0).unwrap();
        assert!((g.spacing() - 0.5).abs() < 1e-6);
        assert_eq!(g.origin(), [0.0, 0.0, 0.0]);

        let p0 = g.world_pos(0, 0, 0);
        assert!((p0[0]).abs() < 1e-6 && (p0[1]).abs() < 1e-6 && (p0[2]).abs() < 1e-6);

        let p = g.world_pos(2, 1, 4);
        assert!((p[0] - 1.0).abs() < 1e-6);
        assert!((p[1] - 0.5).abs() < 1e-6);
        assert!((p[2] - 2.0).abs() < 1e-6);
    }

    #[test]
    fn for_bounds_sizes_longest_axis() {
        // Longest axis (x) spans `resolution` voxels; spacing is uniform.
        let g = Grid::for_bounds([0.0, 0.0, 0.0], [4.0, 2.0, 1.0], 8, 0).unwrap();
        assert!((g.spacing() - 0.5).abs() < 1e-6);
        // x: 4.0/0.5 = 8 -> 9 samples; y: 2.0/0.5 = 4 -> 5; z: 1.0/0.5 = 2 -> 3.
        assert_eq!(g.dims(), [9, 5, 3]);
    }

    #[test]
    fn padding_expands_and_shifts_origin() {
        let g = Grid::for_bounds([0.0, 0.0, 0.0], [2.0, 2.0, 2.0], 4, 2).unwrap();
        // spacing 0.5; base dims 5 each, +2 padding per side -> +4 -> 9 each.
        assert_eq!(g.dims(), [9, 9, 9]);
        // origin shifts back by padding_voxels * spacing = 2 * 0.5 = 1.0.
        assert_eq!(g.origin(), [-1.0, -1.0, -1.0]);
    }

    #[test]
    fn max_voxels_cap_returns_err_without_allocating() {
        // resolution chosen so the longest axis alone blows past MAX_VOXELS.
        let err = Grid::for_bounds([0.0, 0.0, 0.0], [1.0, 1.0, 1.0], 1000, 0).unwrap_err();
        match err {
            GridError::TooLarge { requested } => assert!(requested > MAX_VOXELS),
            other => panic!("expected TooLarge, got {other:?}"),
        }
    }
}
