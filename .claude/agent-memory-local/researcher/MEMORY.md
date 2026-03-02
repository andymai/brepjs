# Researcher Agent Memory

## brepkit Project Structure

- Location: /var/home/andy/Git/brepkit
- Rust workspace, strict layered architecture: L0 math -> L1 topology -> L2 operations/io -> L3 wasm
- Math crate: /var/home/andy/Git/brepkit/crates/math/
- Has vec, mat, nurbs (curve+surface), predicates, tolerance modules
- NurbsCurve has De Boor evaluation; NurbsSurface::evaluate() is todo!()
- Uses `robust` crate for Shewchuk predicates (orient2d, incircle)
- Strict lints: no unsafe, no unwrap, no panic, clippy pedantic
- CLAUDE.md at repo root has full project guidelines
