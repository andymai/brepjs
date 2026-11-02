use super::Ingested;
use crate::mesh::Mesh;

#[derive(Clone, Copy, PartialEq, Debug)]
enum Encoding {
    Ascii,
    LittleEndian,
    BigEndian,
}

#[derive(Clone, Copy, Debug)]
enum Scalar {
    I8,
    U8,
    I16,
    U16,
    I32,
    U32,
    F32,
    F64,
}

impl Scalar {
    fn parse(s: &str) -> Option<Scalar> {
        Some(match s {
            "char" | "int8" => Scalar::I8,
            "uchar" | "uint8" => Scalar::U8,
            "short" | "int16" => Scalar::I16,
            "ushort" | "uint16" => Scalar::U16,
            "int" | "int32" => Scalar::I32,
            "uint" | "uint32" => Scalar::U32,
            "float" | "float32" => Scalar::F32,
            "double" | "float64" => Scalar::F64,
            _ => return None,
        })
    }

    fn size(self) -> usize {
        match self {
            Scalar::I8 | Scalar::U8 => 1,
            Scalar::I16 | Scalar::U16 => 2,
            Scalar::I32 | Scalar::U32 | Scalar::F32 => 4,
            Scalar::F64 => 8,
        }
    }
}

#[derive(Debug)]
enum Property {
    Scalar {
        name: String,
        ty: Scalar,
    },
    List {
        name: String,
        count: Scalar,
        item: Scalar,
    },
}

#[derive(Debug)]
struct Element {
    name: String,
    count: usize,
    props: Vec<Property>,
}

struct Reader<'a> {
    data: &'a [u8],
    pos: usize,
    enc: Encoding,
    tokens: std::str::SplitAsciiWhitespace<'a>,
    decimals: super::DecimalTracker,
}

impl<'a> Reader<'a> {
    fn read_coord(&mut self, ty: Scalar) -> Result<f64, String> {
        if self.enc == Encoding::Ascii {
            let tok = self.tokens.clone().next().unwrap_or("");
            self.decimals.observe(tok);
        }
        self.read(ty)
    }

    fn read(&mut self, ty: Scalar) -> Result<f64, String> {
        if self.enc == Encoding::Ascii {
            let tok = self.tokens.next().ok_or("PLY data ended early")?;
            return tok
                .parse::<f64>()
                .map_err(|_| format!("bad PLY number: {tok}"));
        }
        let n = ty.size();
        if self.pos + n > self.data.len() {
            return Err("PLY data ended early".into());
        }
        let mut b = [0u8; 8];
        b[..n].copy_from_slice(&self.data[self.pos..self.pos + n]);
        if self.enc == Encoding::BigEndian {
            b[..n].reverse();
        }
        self.pos += n;
        Ok(match ty {
            Scalar::I8 => b[0] as i8 as f64,
            Scalar::U8 => b[0] as f64,
            Scalar::I16 => i16::from_le_bytes([b[0], b[1]]) as f64,
            Scalar::U16 => u16::from_le_bytes([b[0], b[1]]) as f64,
            Scalar::I32 => i32::from_le_bytes([b[0], b[1], b[2], b[3]]) as f64,
            Scalar::U32 => u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as f64,
            Scalar::F32 => f32::from_le_bytes([b[0], b[1], b[2], b[3]]) as f64,
            Scalar::F64 => f64::from_le_bytes(b),
        })
    }
}

pub fn parse(bytes: &[u8]) -> Result<Ingested, String> {
    let header_end = find_header_end(bytes).ok_or("PLY header has no end_header")?;
    let header =
        std::str::from_utf8(&bytes[..header_end.0]).map_err(|_| "PLY header is not text")?;
    let mut enc = None;
    let mut elements: Vec<Element> = Vec::new();
    for line in header.lines() {
        let mut it = line.split_ascii_whitespace();
        match it.next() {
            Some("format") => {
                enc = Some(match it.next() {
                    Some("ascii") => Encoding::Ascii,
                    Some("binary_little_endian") => Encoding::LittleEndian,
                    Some("binary_big_endian") => Encoding::BigEndian,
                    other => return Err(format!("unsupported PLY format {other:?}")),
                });
            }
            Some("element") => {
                let name = it.next().ok_or("PLY element without name")?.to_string();
                let count = it
                    .next()
                    .and_then(|s| s.parse().ok())
                    .ok_or("PLY element without count")?;
                elements.push(Element {
                    name,
                    count,
                    props: Vec::new(),
                });
            }
            Some("property") => {
                let el = elements.last_mut().ok_or("PLY property before element")?;
                let first = it.next().ok_or("PLY property without type")?;
                if first == "list" {
                    let count = it
                        .next()
                        .and_then(Scalar::parse)
                        .ok_or("bad PLY list count type")?;
                    let item = it
                        .next()
                        .and_then(Scalar::parse)
                        .ok_or("bad PLY list item type")?;
                    let name = it.next().unwrap_or("").to_string();
                    el.props.push(Property::List { name, count, item });
                } else {
                    let ty = Scalar::parse(first).ok_or(format!("bad PLY type {first}"))?;
                    let name = it.next().unwrap_or("").to_string();
                    el.props.push(Property::Scalar { name, ty });
                }
            }
            _ => {}
        }
    }
    let enc = enc.ok_or("PLY header has no format line")?;
    let body = &bytes[header_end.1..];
    let body_text = if enc == Encoding::Ascii {
        std::str::from_utf8(body).map_err(|_| "ASCII PLY body is not text")?
    } else {
        ""
    };
    let mut r = Reader {
        data: body,
        pos: 0,
        enc,
        tokens: body_text.split_ascii_whitespace(),
        decimals: super::DecimalTracker::default(),
    };
    let mut binary_storage = super::Storage::F64;
    let mut bad_faces = 0usize;

    let mut mesh = Mesh::default();
    let mut warnings = Vec::new();
    let mut saw_faces = false;
    for el in &elements {
        let is_vertex = el.name == "vertex";
        let is_face = el.name == "face";
        let axis: Vec<Option<usize>> = el
            .props
            .iter()
            .map(|p| match p {
                Property::Scalar { name, .. } => match name.as_str() {
                    "x" => Some(0),
                    "y" => Some(1),
                    "z" => Some(2),
                    _ => None,
                },
                Property::List { .. } => None,
            })
            .collect();
        if is_vertex && (0..3).any(|k| !axis.contains(&Some(k))) {
            return Err("PLY vertex element lacks x/y/z".into());
        }
        if el.props.is_empty() {
            continue;
        }
        if enc != Encoding::Ascii {
            let min_size: usize = el
                .props
                .iter()
                .map(|p| match p {
                    Property::Scalar { ty, .. } => ty.size(),
                    Property::List { count, .. } => count.size(),
                })
                .sum();
            if el.count.saturating_mul(min_size) > body.len().saturating_sub(r.pos) {
                return Err("PLY data ended early".into());
            }
        }
        let mut face: Vec<u32> = Vec::new();
        for _ in 0..el.count {
            let mut p = [0.0; 3];
            for (pi, prop) in el.props.iter().enumerate() {
                match prop {
                    Property::Scalar { ty, .. } => {
                        if let (true, Some(k)) = (is_vertex, axis[pi]) {
                            p[k] = r.read_coord(*ty)?;
                            // The coarsest coordinate type bounds the precision.
                            let this = match ty {
                                Scalar::F32 => super::Storage::F32,
                                Scalar::F64 => super::Storage::F64,
                                _ => super::Storage::Text(Some(1.0)),
                            };
                            binary_storage = match (binary_storage, this) {
                                (super::Storage::Text(_), _) | (_, super::Storage::Text(_)) => {
                                    super::Storage::Text(Some(1.0))
                                }
                                (super::Storage::F32, _) | (_, super::Storage::F32) => {
                                    super::Storage::F32
                                }
                                _ => super::Storage::F64,
                            };
                        } else {
                            r.read(*ty)?;
                        }
                    }
                    Property::List { name, count, item } => {
                        let n = r.read(*count)? as usize;
                        let take = is_face && (name == "vertex_indices" || name == "vertex_index");
                        face.clear();
                        let mut valid = true;
                        for _ in 0..n {
                            let v = r.read(*item)?;
                            if take {
                                if v.is_finite()
                                    && v >= 0.0
                                    && v.fract() == 0.0
                                    && v <= u32::MAX as f64
                                {
                                    face.push(v as u32);
                                } else {
                                    valid = false;
                                }
                            }
                        }
                        if take {
                            saw_faces = true;
                            if valid && face.len() >= 3 {
                                super::push_polygon(&mut mesh, &face);
                            } else {
                                bad_faces += 1;
                            }
                        }
                    }
                }
            }
            if is_vertex {
                mesh.positions.push(p);
            }
        }
    }
    if !saw_faces {
        return Err("PLY file has no faces (point clouds are not supported)".into());
    }
    let n = mesh.positions.len() as u32;
    let before = mesh.triangles.len();
    mesh.triangles.retain(|t| t.iter().all(|&v| v < n));
    if mesh.triangles.len() < before {
        warnings.push(format!(
            "skipped {} PLY triangles with out-of-range vertex references",
            before - mesh.triangles.len()
        ));
    }
    if bad_faces > 0 {
        warnings.push(format!(
            "skipped {bad_faces} PLY faces with fewer than 3 vertices or invalid indices"
        ));
    }
    let storage = if enc == Encoding::Ascii {
        r.decimals.finish()
    } else {
        binary_storage
    };
    Ok(Ingested {
        mesh,
        unit: None,
        storage,
        warnings,
    })
}

/// (end of header text, start of body). The body begins after the newline that
/// ends the `end_header` line.
fn find_header_end(bytes: &[u8]) -> Option<(usize, usize)> {
    let mut start = 0;
    while start < bytes.len() {
        let end = bytes[start..]
            .iter()
            .position(|&b| b == b'\n')
            .map_or(bytes.len(), |i| start + i);
        if bytes[start..end].trim_ascii() == b"end_header" {
            return Some((start, (end + 1).min(bytes.len())));
        }
        start = end + 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ascii_with_extra_properties() {
        let src = "ply\nformat ascii 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0 255\n1 0 0 0\n1 1 0 0\n0 1 0 0\n4 0 1 2 3\n";
        let got = parse(src.as_bytes()).unwrap();
        let m = &got.mesh;
        assert_eq!(m.positions.len(), 4);
        assert_eq!(m.triangles.len(), 2);
        let area: f64 = (0..2).map(|t| m.area(t)).sum();
        assert!((area - 1.0).abs() < 1e-12);
    }

    #[test]
    fn binary_little_endian() {
        let mut bytes = b"ply\nformat binary_little_endian 1.0\nelement vertex 3\nproperty double x\nproperty double y\nproperty double z\nelement face 1\nproperty list uchar uint vertex_indices\nend_header\n".to_vec();
        for p in [[0.0f64, 0.0, 0.0], [2.0, 0.0, 0.0], [0.0, 3.0, 0.0]] {
            for v in p {
                bytes.extend_from_slice(&v.to_le_bytes());
            }
        }
        bytes.push(3);
        for i in 0u32..3 {
            bytes.extend_from_slice(&i.to_le_bytes());
        }
        let got = parse(&bytes).unwrap();
        assert_eq!(got.mesh.positions[2], [0.0, 3.0, 0.0]);
        assert_eq!(got.mesh.triangles, vec![[0, 1, 2]]);
    }

    #[test]
    fn binary_big_endian_float() {
        let mut bytes = b"ply\nformat binary_big_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_index\nend_header\n".to_vec();
        for p in [[0.0f32, 0.0, 0.0], [1.5, 0.0, 0.0], [0.0, 1.0, 0.0]] {
            for v in p {
                bytes.extend_from_slice(&v.to_be_bytes());
            }
        }
        bytes.push(3);
        for i in 0i32..3 {
            bytes.extend_from_slice(&i.to_be_bytes());
        }
        let got = parse(&bytes).unwrap();
        assert_eq!(got.mesh.positions[1], [1.5, 0.0, 0.0]);
    }

    #[test]
    fn huge_binary_count_rejected_without_reading() {
        let src = b"ply\nformat binary_little_endian 1.0\nelement vertex 4000000000\nproperty float x\nproperty float y\nproperty float z\nelement face 0\nproperty list uchar int vertex_indices\nend_header\n";
        assert!(parse(src).unwrap_err().contains("ended early"));
    }

    #[test]
    fn end_header_inside_a_comment_is_not_the_end() {
        let src = "ply\nformat ascii 1.0\ncomment exported with end_header marker\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n";
        let got = parse(src.as_bytes()).unwrap();
        assert_eq!(got.mesh.triangles, vec![[0, 1, 2]]);
    }

    #[test]
    fn negative_face_index_is_skipped_not_remapped() {
        let src = "ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 2\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n3 -1 1 2\n";
        let got = parse(src.as_bytes()).unwrap();
        assert_eq!(got.mesh.triangles, vec![[0, 1, 2]]);
        assert!(got.warnings.iter().any(|w| w.contains("invalid indices")));
    }

    #[test]
    fn point_cloud_rejected() {
        let src = "ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 0\n";
        assert!(parse(src.as_bytes()).unwrap_err().contains("point clouds"));
    }
}
