//! Mesh extraction beyond Surface Nets (brepjs-implicit Phase 3a).
//!
//! Manifold Dual Contouring: a sharp-feature-preserving, 2-manifold contourer
//! shipped alongside the Surface-Nets preview path in [`crate::contour`].

pub mod dual_contour;

pub use dual_contour::{analyze, dual_contour_mesh, Quality};
