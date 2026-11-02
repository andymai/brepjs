use super::Ingested;
use crate::mesh::Mesh;

pub fn parse(bytes: &[u8]) -> Result<Ingested, String> {
    let text = String::from_utf8_lossy(bytes);
    let mut mesh = Mesh::default();
    let mut warnings = Vec::new();
    let mut bad_refs = 0usize;
    let mut face: Vec<u32> = Vec::new();
    let mut decimals = super::DecimalTracker::default();
    for (lineno, line) in text.lines().enumerate() {
        let line = line.split('#').next().unwrap_or("").trim();
        let mut it = line.split_ascii_whitespace();
        match it.next() {
            Some("v") => {
                let toks: Vec<&str> = it.take(3).collect();
                toks.iter().for_each(|t| decimals.observe(t));
                let xs: Vec<f64> = toks.iter().filter_map(|s| s.parse().ok()).collect();
                if xs.len() != 3 {
                    return Err(format!("malformed OBJ vertex on line {}", lineno + 1));
                }
                mesh.positions.push([xs[0], xs[1], xs[2]]);
            }
            Some("f") => {
                face.clear();
                let count = mesh.positions.len() as i64;
                let mut ok = true;
                for tok in it {
                    let head = tok.split('/').next().unwrap_or("");
                    let Ok(raw) = head.parse::<i64>() else {
                        ok = false;
                        break;
                    };
                    let idx = if raw > 0 { raw - 1 } else { count + raw };
                    if idx < 0 || idx >= count {
                        ok = false;
                        break;
                    }
                    face.push(idx as u32);
                }
                if ok && face.len() >= 3 {
                    super::push_polygon(&mut mesh, &face);
                } else {
                    bad_refs += 1;
                }
            }
            _ => {}
        }
    }
    if bad_refs > 0 {
        warnings.push(format!(
            "skipped {bad_refs} OBJ faces with invalid vertex references"
        ));
    }
    Ok(Ingested {
        mesh,
        unit: None,
        storage: decimals.finish(),
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quads_and_negative_indices() {
        let src = "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1/1/1 2/2/2 3/3/3 4/4/4\nf -4 -2 -1\n";
        let got = parse(src.as_bytes()).unwrap();
        let m = &got.mesh;
        assert_eq!(m.positions.len(), 4);
        assert_eq!(m.triangles.len(), 3);
        assert_eq!(m.triangles[2], [0, 2, 3]);
        let quad_area: f64 = (0..2).map(|t| m.area(t)).sum();
        assert!((quad_area - 1.0).abs() < 1e-12);
        assert!((0..2).all(|t| {
            let [a, b, c] = m.tri(t);
            crate::math::tri_cross(a, b, c)[2] > 0.0
        }));
    }

    #[test]
    fn concave_face_stays_inside_its_outline() {
        let src = "v 0 0 0\nv 3 0 0\nv 3 3 0\nv 2 3 0\nv 2 1 0\nv 1 1 0\nv 1 3 0\nv 0 3 0\nf 1 2 3 4 5 6 7 8\n";
        let got = parse(src.as_bytes()).unwrap();
        let m = &got.mesh;
        assert_eq!(m.triangles.len(), 6);
        let area: f64 = (0..m.triangles.len()).map(|t| m.area(t)).sum();
        assert!((area - 7.0).abs() < 1e-12, "area {area}");
        for t in 0..m.triangles.len() {
            let [a, b, c] = m.tri(t);
            assert!(crate::math::tri_cross(a, b, c)[2] > 0.0, "winding flipped");
        }
    }

    #[test]
    fn trailing_comments_keep_the_face() {
        let src = "v 0 0 0 # origin\nv 1 0 0\nv 0 1 0\nf 1 2 3 # the only face\n";
        let got = parse(src.as_bytes()).unwrap();
        assert_eq!(got.mesh.triangles, vec![[0, 1, 2]]);
        assert!(got.warnings.is_empty());
    }

    #[test]
    fn out_of_range_face_is_skipped_with_warning() {
        let src = "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 9\nf 1 2 3\n";
        let got = parse(src.as_bytes()).unwrap();
        assert_eq!(got.mesh.triangles.len(), 1);
        assert_eq!(got.warnings.len(), 1);
    }
}
