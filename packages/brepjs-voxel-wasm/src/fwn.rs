//! Generalized / Fast Winding Number sign (ADR-0013 §11 keystone).
//!
//! Gives a correct inside/outside classification on NON-watertight meshes — the
//! case where ray-parity and normal heuristics fail. This is the exact O(N·Q)
//! winding number: a sum of signed solid angles (Van Oosterom & Strackee 1983).
//! The production engine adds a BVH + Barnes–Hut aggregation (Barill 2018) for
//! large N; correctness lives entirely in the per-triangle term here.

type V3 = [f64; 3];

fn sub(a: V3, b: V3) -> V3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
fn dot(a: V3, b: V3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn cross(a: V3, b: V3) -> V3 {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
fn len(a: V3) -> f64 {
    dot(a, a).sqrt()
}

/// Signed solid angle (steradians) subtended by triangle (a,b,c) at point p.
/// Robust atan2 form so it stays accurate as the triangle shrinks in the view.
fn solid_angle(p: V3, a: V3, b: V3, c: V3) -> f64 {
    let a = sub(a, p);
    let b = sub(b, p);
    let c = sub(c, p);
    let (la, lb, lc) = (len(a), len(b), len(c));
    let num = dot(a, cross(b, c));
    let den = la * lb * lc + dot(a, b) * lc + dot(b, c) * la + dot(c, a) * lb;
    2.0 * num.atan2(den)
}

/// A triangle soup. Vertices are flat xyz; triangles index into them.
pub struct Mesh {
    pub verts: Vec<V3>,
    pub tris: Vec<[usize; 3]>,
}

impl Mesh {
    /// Build from the flat f32 buffers crossing the wasm boundary.
    pub fn from_flat(verts: &[f32], tris: &[u32]) -> Self {
        let verts = verts
            .chunks_exact(3)
            .map(|c| [c[0] as f64, c[1] as f64, c[2] as f64])
            .collect();
        let tris = tris
            .chunks_exact(3)
            .map(|c| [c[0] as usize, c[1] as usize, c[2] as usize])
            .collect();
        Mesh { verts, tris }
    }

    /// Generalized winding number at p: ~1 inside, ~0 outside for a closed,
    /// outward-oriented mesh; degrades gracefully for holes.
    pub fn winding_number(&self, p: V3) -> f64 {
        let total: f64 = self
            .tris
            .iter()
            .map(|t| solid_angle(p, self.verts[t[0]], self.verts[t[1]], self.verts[t[2]]))
            .sum();
        total / (4.0 * core::f64::consts::PI)
    }

    /// The sign decision the repair pipeline makes: inside iff w > 0.5.
    pub fn is_inside(&self, p: V3) -> bool {
        self.winding_number(p) > 0.5
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const INSIDE: V3 = [0.5, 0.5, 0.5];
    const OUTSIDE_ABOVE: V3 = [0.5, 0.5, 2.0];
    const OUTSIDE_SIDE: V3 = [2.0, 0.5, 0.5];

    /// Unit cube [0,1]^3 with consistent OUTWARD-facing (CCW-from-outside) triangles.
    fn unit_cube() -> Mesh {
        let verts = vec![
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [1.0, 1.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0, 0.0, 1.0],
            [1.0, 0.0, 1.0],
            [1.0, 1.0, 1.0],
            [0.0, 1.0, 1.0],
        ];
        let tris = vec![
            [0, 2, 1],
            [0, 3, 2], // bottom z=0 (-z)
            [4, 5, 6],
            [4, 6, 7], // top    z=1 (+z)
            [0, 1, 5],
            [0, 5, 4], // front  y=0 (-y)
            [3, 7, 6],
            [3, 6, 2], // back   y=1 (+y)
            [0, 4, 7],
            [0, 7, 3], // left   x=0 (-x)
            [1, 2, 6],
            [1, 6, 5], // right  x=1 (+x)
        ];
        Mesh { verts, tris }
    }

    #[test]
    fn watertight_cube_is_exact() {
        let m = unit_cube();
        assert!((m.winding_number(INSIDE) - 1.0).abs() < 1e-9);
        assert!(m.winding_number(OUTSIDE_ABOVE).abs() < 1e-9);
        assert!(m.winding_number(OUTSIDE_SIDE).abs() < 1e-9);
        assert!(m.is_inside(INSIDE) && !m.is_inside(OUTSIDE_ABOVE));
    }

    #[test]
    fn holey_cube_still_classifies_correctly() {
        // Remove the ENTIRE top face (2 triangles) -> non-watertight.
        let mut m = unit_cube();
        m.tris.retain(|t| *t != [4, 5, 6] && *t != [4, 6, 7]);
        assert_eq!(m.tris.len(), 10);

        let wi = m.winding_number(INSIDE);
        // From the cube center each face subtends 4π/6, so a missing face drops w by ~1/6.
        assert!(
            (wi - (1.0 - 1.0 / 6.0)).abs() < 1e-3,
            "expected ~0.8333, got {wi}"
        );
        // The keystone result: still correctly inside despite a whole missing face,
        // where a ray cast up through the hole would misclassify.
        assert!(
            m.is_inside(INSIDE),
            "GWN must still classify inside (w={wi})"
        );
        assert!(!m.is_inside(OUTSIDE_ABOVE));
    }

    #[test]
    fn reversed_orientation_flips_sign() {
        let m = unit_cube();
        let flipped = Mesh {
            verts: m.verts.clone(),
            tris: m.tris.iter().map(|t| [t[0], t[2], t[1]]).collect(),
        };
        assert!((flipped.winding_number(INSIDE) + 1.0).abs() < 1e-9);
    }

    #[test]
    fn from_flat_matches_structured() {
        let verts: Vec<f32> = vec![
            0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0,
            1.0, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0,
        ];
        let tris: Vec<u32> = vec![
            0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7,
            3, 1, 2, 6, 1, 6, 5,
        ];
        let m = Mesh::from_flat(&verts, &tris);
        assert_eq!(m.verts.len(), 8);
        assert_eq!(m.tris.len(), 12);
        assert!((m.winding_number(INSIDE) - 1.0).abs() < 1e-9);
    }
}
