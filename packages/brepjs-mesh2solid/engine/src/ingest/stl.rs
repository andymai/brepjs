use super::Ingested;
use crate::mesh::Mesh;

/// A binary STL's size is exactly 84 + 50·n. ASCII files that happen to start
/// with "solid" fail this check unless their length lines up by coincidence, so
/// the triangle count must also be plausible.
pub fn looks_binary(bytes: &[u8]) -> bool {
    if bytes.len() < 84 {
        return false;
    }
    let n = u32::from_le_bytes([bytes[80], bytes[81], bytes[82], bytes[83]]) as usize;
    let expected = 84usize.saturating_add(n.saturating_mul(50));
    if expected == bytes.len() {
        return n > 0 || !bytes.starts_with(b"solid");
    }
    // Some exporters append padding after the last facet. A header that starts
    // with "solid" is only binary if the text keywords are absent.
    if expected >= bytes.len() || n == 0 {
        return false;
    }
    if bytes.starts_with(b"solid") {
        let head = &bytes[..bytes.len().min(1024)];
        return !head.windows(5).any(|w| w == b"facet");
    }
    true
}

pub fn parse(bytes: &[u8]) -> Result<Ingested, String> {
    if looks_binary(bytes) {
        parse_binary(bytes)
    } else {
        parse_ascii(bytes)
    }
}

fn parse_binary(bytes: &[u8]) -> Result<Ingested, String> {
    let n = u32::from_le_bytes([bytes[80], bytes[81], bytes[82], bytes[83]]) as usize;
    if n.checked_mul(50)
        .and_then(|x| x.checked_add(84))
        .is_none_or(|need| need > bytes.len())
    {
        return Err("binary STL is truncated".into());
    }
    let mut mesh = Mesh {
        positions: Vec::with_capacity(n * 3),
        triangles: Vec::with_capacity(n),
    };
    let f =
        |o: usize| f32::from_le_bytes([bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]]) as f64;
    for i in 0..n {
        let base = 84 + i * 50 + 12;
        let idx = mesh.positions.len() as u32;
        for k in 0..3 {
            let o = base + k * 12;
            mesh.positions.push([f(o), f(o + 4), f(o + 8)]);
        }
        mesh.triangles.push([idx, idx + 1, idx + 2]);
    }
    Ok(Ingested {
        mesh,
        unit: None,
        storage: super::Storage::F32,
        warnings: Vec::new(),
    })
}

fn parse_ascii(bytes: &[u8]) -> Result<Ingested, String> {
    let text = String::from_utf8_lossy(bytes);
    let mut mesh = Mesh::default();
    let mut corner: Vec<[f64; 3]> = Vec::with_capacity(3);
    let mut warnings = Vec::new();
    let mut skipped = 0usize;
    let mut decimals = super::DecimalTracker::default();
    for line in text.lines() {
        let mut it = line.split_ascii_whitespace();
        match it.next() {
            Some("vertex") => {
                let toks: Vec<&str> = it.take(3).collect();
                toks.iter().for_each(|t| decimals.observe(t));
                let xs: Vec<f64> = toks.iter().filter_map(|s| s.parse().ok()).collect();
                if xs.len() != 3 {
                    return Err(format!("malformed STL vertex line: {}", line.trim()));
                }
                corner.push([xs[0], xs[1], xs[2]]);
            }
            Some("endloop") => {
                if corner.len() >= 3 {
                    let base = mesh.positions.len() as u32;
                    mesh.positions.extend_from_slice(&corner);
                    let face: Vec<u32> = (0..corner.len() as u32).map(|k| base + k).collect();
                    super::push_polygon(&mut mesh, &face);
                } else {
                    skipped += 1;
                }
                corner.clear();
            }
            _ => {}
        }
    }
    if skipped > 0 {
        warnings.push(format!(
            "skipped {skipped} STL facets with fewer than 3 vertices"
        ));
    }
    if !corner.is_empty() {
        warnings.push("the STL text ends inside an unfinished facet, which was dropped".into());
    }
    Ok(Ingested {
        mesh,
        unit: None,
        storage: decimals.finish(),
        warnings,
    })
}

#[cfg(test)]
pub(crate) fn write_binary(mesh: &Mesh) -> Vec<u8> {
    let mut out = vec![0u8; 80];
    out.extend_from_slice(&(mesh.triangles.len() as u32).to_le_bytes());
    for tri in &mesh.triangles {
        out.extend_from_slice(&[0u8; 12]);
        for &v in tri {
            for k in 0..3 {
                out.extend_from_slice(&(mesh.positions[v as usize][k] as f32).to_le_bytes());
            }
        }
        out.extend_from_slice(&[0u8; 2]);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mesh::fixtures::cube;

    #[test]
    fn binary_round_trip() {
        let bytes = write_binary(&cube(10.0));
        assert!(looks_binary(&bytes));
        let got = parse(&bytes).unwrap();
        assert_eq!(got.mesh.triangles.len(), 12);
        assert_eq!(got.mesh.positions.len(), 36);
        assert_eq!(got.mesh.positions[2], [10.0, 0.0, 0.0]);
    }

    #[test]
    fn binary_header_starting_with_solid() {
        let mut bytes = write_binary(&cube(1.0));
        bytes[..5].copy_from_slice(b"solid");
        assert!(looks_binary(&bytes));
        assert_eq!(parse(&bytes).unwrap().mesh.triangles.len(), 12);
    }

    #[test]
    fn ascii_parses_facets() {
        let src = "solid t\n facet normal 0 0 1\n  outer loop\n   vertex 0 0 0\n   vertex 1 0 0\n   vertex 0 1 0\n  endloop\n endfacet\nendsolid t\n";
        let got = parse(src.as_bytes()).unwrap();
        assert_eq!(got.mesh.triangles.len(), 1);
        assert_eq!(got.mesh.positions[1], [1.0, 0.0, 0.0]);
    }

    #[test]
    fn padded_binary_with_solid_header() {
        let mut bytes = write_binary(&cube(1.0));
        bytes[..5].copy_from_slice(b"solid");
        bytes.extend_from_slice(&[0u8; 7]);
        assert!(looks_binary(&bytes));
        assert_eq!(parse(&bytes).unwrap().mesh.triangles.len(), 12);
    }

    #[test]
    fn unfinished_ascii_facet_warns() {
        let src = "solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\n";
        let got = parse(src.as_bytes()).unwrap();
        assert_eq!(got.mesh.triangles.len(), 1);
        assert!(got.warnings.iter().any(|w| w.contains("unfinished facet")));
    }

    #[test]
    fn truncated_binary_errors() {
        let mut bytes = write_binary(&cube(1.0));
        bytes[80] = 200;
        bytes.truncate(84 + 50 * 12 - 1);
        assert!(parse_binary(&bytes).is_err());
    }
}
