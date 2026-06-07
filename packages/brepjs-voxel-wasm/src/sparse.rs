//! Sparse tiled SDF grid (ADR-0013 voxel domain, PR4).
//!
//! After narrow-band voxelization the far field is uniformly `sign * band`, so a
//! dense `Vec<f32>` over the whole volume is mostly redundant. The sparse grid
//! stores only NEAR-SURFACE tiles (dense `T^3` blocks) and answers every other
//! cell from a per-tile far-sign oracle, giving O(surface) memory instead of
//! O(volume). It mirrors [`Grid`](crate::grid::Grid)'s geometry exactly via the
//! shared [`GridGeom`], so `world_pos`/`at` agree cell-for-cell with the dense
//! grid — the parity gate in `contour.rs` proves the contour matches bit-for-bit.
//
// Consumed by the sparse voxelize/contour seams and the bridge router; the cdylib
// can see those, but the native-only bench/instrumentation helpers can't.
#![allow(dead_code)]

use std::collections::HashMap;
use std::hash::{BuildHasherDefault, Hasher};

use crate::grid::{GridError, GridGeom, MAX_VOXELS};

/// A minimal multiply-shift hasher over integer keys, used for the tile/cell
/// maps. It avoids pulling SipHash's monomorphization into the cdylib (keeping
/// wasm size down) without adding an fxhash/ahash dependency. Only `write_u32`,
/// `write_u64`, and `write` (for the integer paths) are needed; the keys are
/// already well-mixed linear ids, so a single Fibonacci multiply suffices.
#[derive(Default)]
pub struct IntHasher(u64);

impl Hasher for IntHasher {
    fn finish(&self) -> u64 {
        self.0
    }
    fn write(&mut self, bytes: &[u8]) {
        // Fallback for any non-integer write: fold bytes in. Not used on the hot
        // integer paths, but required to satisfy the trait.
        for &b in bytes {
            self.0 = (self.0 ^ b as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15);
        }
    }
    fn write_u32(&mut self, i: u32) {
        self.0 = (i as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    }
    fn write_u64(&mut self, i: u64) {
        self.0 = i.wrapping_mul(0x9E37_79B9_7F4A_7C15);
    }
}

/// `HashMap`/`HashSet` builder over [`IntHasher`].
pub type IntBuildHasher = BuildHasherDefault<IntHasher>;
pub type IntHashMap<K, V> = HashMap<K, V, IntBuildHasher>;

/// Tile edge length in voxels. `16^3 = 4096` f32 = 16 KB per block: small enough
/// that one near-surface band tile is cheap, large enough that the tile map stays
/// small and per-tile contour loops amortize. `8` or `32` are drop-in.
pub const TILE: usize = 16;
/// Voxels per tile block (`TILE^3`).
pub const TILE3: usize = TILE * TILE * TILE;

/// Per-tile budget mirroring the dense [`MAX_VOXELS`] OOM ceiling, but counted
/// against ALLOCATED (band) voxels rather than the dense volume. `64M` voxels is
/// the same 256 MB f32 ceiling; on the sparse path it caps surface*band memory
/// (~N^2) not the volume (~N^3), so a far higher resolution is reachable.
pub const MAX_ACTIVE_TILES: usize = MAX_VOXELS / TILE3;

/// Number of tiles spanning `n` voxels: `ceil(n / TILE)`.
fn tiles_for(n: usize) -> usize {
    n.div_ceil(TILE)
}

/// A sparse, uniformly spaced SDF grid: dense `T^3` blocks for near-surface tiles,
/// a per-tile uniform far value for everything else.
pub struct SparseGrid {
    geom: GridGeom,
    /// Tile-grid dims: `[ceil(nx/T), ceil(ny/T), ceil(nz/T)]`.
    tile_dims: [usize; 3],
    /// Far-value magnitude (the clamp band). An absent tile reads
    /// `far_sign[tile] * far_band`.
    far_band: f32,
    /// Per-tile far sign (`-1` interior, `+1` exterior), length `tn*`. Filled by
    /// the voxelizer's Phase-3 FWN center query; an unset entry defaults to `+1`
    /// (exterior air), the correct far value before any classification runs.
    far_sign: Vec<i8>,
    /// Allocated near-surface blocks, keyed by linear tile id.
    blocks: IntHashMap<u32, Box<[f32; TILE3]>>,
}

impl SparseGrid {
    /// A sparse grid matching `geom`, every cell implicitly `+far_band` (exterior
    /// air) until a tile is activated or its far sign is set.
    ///
    /// Refuses with [`GridError::TooLarge`] when the total tile count exceeds
    /// `u32::MAX`: `tile_key` packs (tx,ty,tz) into a u32 and `far_sign` is a dense
    /// `Vec` indexed by it, so an overflow would wrap two tile coords onto one key
    /// and silently corrupt blocks. `checked_mul` catches it even on wasm32 where
    /// `usize` is 32-bit (so the product itself would wrap).
    pub fn new(geom: GridGeom, far_band: f32) -> Result<SparseGrid, GridError> {
        let [nx, ny, nz] = geom.dims;
        let tile_dims = [tiles_for(nx), tiles_for(ny), tiles_for(nz)];
        let ntiles = match tile_dims[0]
            .checked_mul(tile_dims[1])
            .and_then(|v| v.checked_mul(tile_dims[2]))
        {
            Some(n) if n <= u32::MAX as usize => n,
            Some(n) => return Err(GridError::TooLarge { requested: n }),
            None => return Err(GridError::TooLarge { requested: usize::MAX }),
        };
        Ok(SparseGrid {
            geom,
            tile_dims,
            far_band,
            far_sign: vec![1i8; ntiles],
            blocks: IntHashMap::default(),
        })
    }

    pub fn dims(&self) -> [usize; 3] {
        self.geom.dims
    }

    pub fn spacing(&self) -> f32 {
        self.geom.spacing
    }

    pub fn origin(&self) -> [f32; 3] {
        self.geom.origin
    }

    pub fn geom(&self) -> GridGeom {
        self.geom
    }

    pub fn tile_dims(&self) -> [usize; 3] {
        self.tile_dims
    }

    pub fn far_band(&self) -> f32 {
        self.far_band
    }

    pub fn world_pos(&self, x: usize, y: usize, z: usize) -> [f32; 3] {
        self.geom.world_pos(x, y, z)
    }

    /// Total tile count `tnx*tny*tnz`.
    pub fn total_tiles(&self) -> usize {
        self.tile_dims[0] * self.tile_dims[1] * self.tile_dims[2]
    }

    /// Count of allocated (near-surface) blocks.
    pub fn allocated_tiles(&self) -> usize {
        self.blocks.len()
    }

    /// Allocated voxel count (`allocated_tiles * T^3`): the memory witness.
    pub fn allocated_voxels(&self) -> usize {
        self.blocks.len() * TILE3
    }

    /// Linear tile id of tile coord (tx,ty,tz): `tx + ty*tnx + tz*tnx*tny`.
    pub fn tile_key(&self, tx: usize, ty: usize, tz: usize) -> u32 {
        let [tnx, tny, _] = self.tile_dims;
        (tx + ty * tnx + tz * tnx * tny) as u32
    }

    /// Inverse of [`tile_key`](Self::tile_key): linear id back to (tx,ty,tz).
    fn tile_coord(&self, key: u32) -> [usize; 3] {
        let [tnx, tny, _] = self.tile_dims;
        let k = key as usize;
        let tx = k % tnx;
        let ty = (k / tnx) % tny;
        let tz = k / (tnx * tny);
        [tx, ty, tz]
    }

    /// Local block index of voxel local coord (lx,ly,lz): `lx + ly*T + lz*T*T`.
    fn local_index(lx: usize, ly: usize, lz: usize) -> usize {
        lx + ly * TILE + lz * TILE * TILE
    }

    /// The far value an absent tile reads: `far_sign[tile] * far_band`.
    fn far_value_for(&self, tx: usize, ty: usize, tz: usize) -> f32 {
        let id = self.tile_key(tx, ty, tz) as usize;
        self.far_sign[id] as f32 * self.far_band
    }

    /// Set the far sign of tile (tx,ty,tz): `-1` interior, `+1` exterior.
    pub fn set_far_sign(&mut self, tx: usize, ty: usize, tz: usize, sign: i8) {
        let id = self.tile_key(tx, ty, tz) as usize;
        self.far_sign[id] = sign;
    }

    pub fn far_sign_at(&self, tx: usize, ty: usize, tz: usize) -> i8 {
        let id = self.tile_key(tx, ty, tz) as usize;
        self.far_sign[id]
    }

    /// SDF at cell (x,y,z): the block value if its tile is allocated, else the
    /// tile's implicit far value. OOB reads clamp to exterior air (`+far_band`),
    /// matching the dense grid's positive padding ring.
    pub fn at(&self, x: usize, y: usize, z: usize) -> f32 {
        let [nx, ny, nz] = self.geom.dims;
        if x >= nx || y >= ny || z >= nz {
            return self.far_band;
        }
        let (tx, ty, tz) = (x / TILE, y / TILE, z / TILE);
        let key = self.tile_key(tx, ty, tz);
        match self.blocks.get(&key) {
            Some(block) => {
                let (lx, ly, lz) = (x % TILE, y % TILE, z % TILE);
                block[Self::local_index(lx, ly, lz)]
            }
            None => self.far_value_for(tx, ty, tz),
        }
    }

    /// Ensure a tile's block is allocated, pre-filled with its implicit far value,
    /// and return a mutable reference to it.
    fn block_mut(&mut self, tx: usize, ty: usize, tz: usize) -> &mut [f32; TILE3] {
        let key = self.tile_key(tx, ty, tz);
        let fill = self.far_value_for(tx, ty, tz);
        self.blocks
            .entry(key)
            .or_insert_with(|| Box::new([fill; TILE3]))
    }

    /// Allocate tile (tx,ty,tz) if absent, pre-filled with its implicit far value.
    /// Called by Phase-2 voxelization before writing the tile's cells.
    pub fn activate_tile(&mut self, tx: usize, ty: usize, tz: usize) {
        let _ = self.block_mut(tx, ty, tz);
    }

    /// Set the SDF at cell (x,y,z), lazily allocating its tile (pre-filled with the
    /// tile's far value) on first write. OOB writes are dropped.
    pub fn set(&mut self, x: usize, y: usize, z: usize, v: f32) {
        let [nx, ny, nz] = self.geom.dims;
        if x >= nx || y >= ny || z >= nz {
            return;
        }
        let (tx, ty, tz) = (x / TILE, y / TILE, z / TILE);
        let (lx, ly, lz) = (x % TILE, y % TILE, z % TILE);
        let block = self.block_mut(tx, ty, tz);
        block[Self::local_index(lx, ly, lz)] = v;
    }

    /// Map a closure over every allocated cell in place (active tiles only). The
    /// far field is untouched — callers adjust it via [`shift_far_band`] or
    /// [`recompute_far_signs`].
    pub fn map_active_cells(&mut self, mut f: impl FnMut(f32) -> f32) {
        for block in self.blocks.values_mut() {
            for v in block.iter_mut() {
                *v = f(*v);
            }
        }
    }

    /// Iterate present tiles as `(tx, ty, tz)`. A tile is active iff allocated
    /// (band-overlapping); far/empty tiles never iterate.
    pub fn active_tiles(&self) -> impl Iterator<Item = [usize; 3]> + '_ {
        self.blocks.keys().map(|&key| self.tile_coord(key))
    }

    /// Whether tile (tx,ty,tz) is allocated.
    pub fn is_tile_active(&self, tx: usize, ty: usize, tz: usize) -> bool {
        self.blocks.contains_key(&self.tile_key(tx, ty, tz))
    }

    /// Offset the far field by `distance` (the offset op's iso-shift): each far
    /// value `sign*band` becomes `sign*band - distance`, so the far SIGN is
    /// recomputed from that. Far magnitudes never enter a contour crossing (a far
    /// cell is uniform-sign, far from any surface), so only the sign needs to be
    /// correct here; active-tile cells are shifted by the caller's elementwise op.
    pub fn offset_far(&mut self, distance: f32) {
        let band = self.far_band;
        for s in self.far_sign.iter_mut() {
            let v = *s as f32 * band - distance;
            *s = if v < 0.0 { -1 } else { 1 };
        }
    }

    /// Carve the far field for a shell of `thickness`: `shell = max(s, -(s+t))`.
    /// A far INTERIOR cell (`-band`) becomes `max(-band, band - t)` = `band - t`
    /// (carved → exterior) once `t < 2*band`; a far EXTERIOR cell stays exterior.
    /// Recomputes far signs accordingly (magnitudes are never read at a crossing).
    pub fn shell_far(&mut self, thickness: f32) {
        let band = self.far_band;
        for s in self.far_sign.iter_mut() {
            let val = *s as f32 * band;
            let shelled = val.max(-(val + thickness));
            *s = if shelled < 0.0 { -1 } else { 1 };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn geom() -> GridGeom {
        // 40^3-ish span at unit spacing -> several tiles per axis.
        GridGeom::for_bounds([0.0, 0.0, 0.0], [40.0, 40.0, 40.0], 40, 0).0
    }

    /// The tile key is a u32 and far_sign is indexed by it, so a tile count past
    /// u32::MAX must be REFUSED (not silently wrapped onto an aliasing block). The
    /// check precedes any allocation, so this is cheap even though the would-be
    /// far_sign is enormous.
    #[test]
    fn new_refuses_tile_count_overflow() {
        // ~50000^3 voxels -> ~3125^3 tiles ~= 3.05e10 > u32::MAX (4.29e9).
        let huge = GridGeom::for_bounds([0.0, 0.0, 0.0], [50000.0, 50000.0, 50000.0], 50000, 0).0;
        assert!(
            SparseGrid::new(huge, 1.0).is_err(),
            "tile count beyond u32::MAX must refuse, not wrap"
        );
    }

    #[test]
    fn absent_tile_reads_far_value() {
        let mut g = SparseGrid::new(geom(), 2.0).unwrap();
        // Default far sign is +1 -> exterior air.
        assert_eq!(g.at(5, 5, 5), 2.0);
        // Mark a tile interior; its absent cells now read -band.
        g.set_far_sign(0, 0, 0, -1);
        assert_eq!(g.at(5, 5, 5), -2.0);
    }

    #[test]
    fn set_lazily_allocates_block_prefilled_with_far() {
        let mut g = SparseGrid::new(geom(), 2.0).unwrap();
        g.set_far_sign(0, 0, 0, -1);
        assert_eq!(g.allocated_tiles(), 0);
        g.set(1, 1, 1, 0.25);
        assert_eq!(g.allocated_tiles(), 1);
        // The written cell holds its value; a sibling in the same block reads the
        // tile's far value (the pre-fill), not the default.
        assert_eq!(g.at(1, 1, 1), 0.25);
        assert_eq!(g.at(2, 2, 2), -2.0);
    }

    #[test]
    fn tile_key_coord_round_trip() {
        let g = SparseGrid::new(geom(), 1.0).unwrap();
        let [tnx, tny, tnz] = g.tile_dims();
        for tz in 0..tnz {
            for ty in 0..tny {
                for tx in 0..tnx {
                    let key = g.tile_key(tx, ty, tz);
                    assert_eq!(g.tile_coord(key), [tx, ty, tz]);
                }
            }
        }
    }

    #[test]
    fn oob_reads_are_far_air() {
        let g = SparseGrid::new(geom(), 3.0).unwrap();
        let [nx, ny, nz] = g.dims();
        assert_eq!(g.at(nx, 0, 0), 3.0);
        assert_eq!(g.at(0, ny + 5, 0), 3.0);
        assert_eq!(g.at(0, 0, nz), 3.0);
    }

    #[test]
    fn world_pos_matches_geom() {
        let g = SparseGrid::new(geom(), 1.0).unwrap();
        let gm = g.geom();
        assert_eq!(g.world_pos(3, 7, 11), gm.world_pos(3, 7, 11));
    }
}
