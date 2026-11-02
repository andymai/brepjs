mod obj;
mod ply;
mod stl;
mod threemf;
mod zip;

use crate::mesh::Mesh;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Format {
    Stl,
    Obj,
    Ply,
    ThreeMf,
}

impl Format {
    pub fn name(self) -> &'static str {
        match self {
            Format::Stl => "stl",
            Format::Obj => "obj",
            Format::Ply => "ply",
            Format::ThreeMf => "3mf",
        }
    }

    pub fn parse_hint(hint: &str) -> Option<Format> {
        let h = hint.trim().to_ascii_lowercase();
        let ext = h.rsplit('.').next().unwrap_or(&h);
        match ext {
            "stl" => Some(Format::Stl),
            "obj" => Some(Format::Obj),
            "ply" => Some(Format::Ply),
            "3mf" => Some(Format::ThreeMf),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Unit {
    Micron,
    Millimeter,
    Centimeter,
    Meter,
    Inch,
    Foot,
}

impl Unit {
    pub fn parse(s: &str) -> Option<Unit> {
        match s.trim().to_ascii_lowercase().as_str() {
            "micron" | "um" | "µm" => Some(Unit::Micron),
            "millimeter" | "mm" => Some(Unit::Millimeter),
            "centimeter" | "cm" => Some(Unit::Centimeter),
            "meter" | "m" => Some(Unit::Meter),
            "inch" | "in" => Some(Unit::Inch),
            "foot" | "ft" => Some(Unit::Foot),
            _ => None,
        }
    }

    pub fn to_mm(self) -> f64 {
        match self {
            Unit::Micron => 0.001,
            Unit::Millimeter => 1.0,
            Unit::Centimeter => 10.0,
            Unit::Meter => 1000.0,
            Unit::Inch => 25.4,
            Unit::Foot => 304.8,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Unit::Micron => "um",
            Unit::Millimeter => "mm",
            Unit::Centimeter => "cm",
            Unit::Meter => "m",
            Unit::Inch => "in",
            Unit::Foot => "ft",
        }
    }
}

/// How the file stored coordinates, which bounds how exactly coplanar points
/// can agree.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub enum Storage {
    F32,
    #[default]
    F64,
    /// Decimal text; the value is the printed resolution (file units) when it
    /// could be measured.
    Text(Option<f64>),
}

fn ulp(max_abs: f64, mantissa_bits: i32) -> f64 {
    if max_abs.is_nan() || max_abs <= 0.0 || !max_abs.is_finite() {
        return f64::MIN_POSITIVE;
    }
    2f64.powi(max_abs.log2().floor() as i32 - mantissa_bits)
}

impl Storage {
    /// Coordinate quantization step for values up to `max_abs`.
    pub fn resolution(self, max_abs: f64) -> f64 {
        let f64_step = ulp(max_abs, 52);
        match self {
            Storage::F32 => ulp(max_abs, 23),
            Storage::F64 | Storage::Text(None) => f64_step,
            Storage::Text(Some(r)) => r.max(f64_step),
        }
    }
}

/// Measures the printed resolution of decimal coordinates: the 95th percentile
/// of the last-digit place over tokens with at least four significant digits
/// (round values like "10" say nothing about the exporter's precision).
#[derive(Default)]
pub struct DecimalTracker {
    samples: Vec<f64>,
}

const MAX_DECIMAL_SAMPLES: usize = 100_000;

impl DecimalTracker {
    pub fn observe(&mut self, tok: &str) {
        if self.samples.len() >= MAX_DECIMAL_SAMPLES {
            return;
        }
        if let Some(r) = token_resolution(tok) {
            self.samples.push(r);
        }
    }

    pub fn finish(mut self) -> Storage {
        if self.samples.is_empty() {
            return Storage::Text(None);
        }
        let k = ((self.samples.len() - 1) as f64 * 0.95).round() as usize;
        let (_, r, _) = self
            .samples
            .select_nth_unstable_by(k, |a, b| a.total_cmp(b));
        Storage::Text(Some(*r))
    }
}

fn token_resolution(tok: &str) -> Option<f64> {
    let tok = tok.trim_start_matches(['+', '-']);
    let (mant, exp) = match tok.find(['e', 'E']) {
        Some(i) => (&tok[..i], tok[i + 1..].parse::<i32>().ok()?),
        None => (tok, 0),
    };
    let (int, frac) = mant.split_once('.').unwrap_or((mant, ""));
    if !int.bytes().chain(frac.bytes()).all(|b| b.is_ascii_digit()) {
        return None;
    }
    let digits: String = int.chars().chain(frac.chars()).collect();
    let significant = digits.trim_start_matches('0').len();
    if significant < 4 {
        return None;
    }
    Some(10f64.powi(exp - frac.len() as i32))
}

#[derive(Debug, Default)]
pub struct Ingested {
    pub mesh: Mesh,
    pub unit: Option<Unit>,
    pub storage: Storage,
    /// Non-fatal notes about content the reader skipped.
    pub warnings: Vec<String>,
}

/// Sniff the format from content, falling back to the caller's hint (a file
/// name or extension) when the bytes are ambiguous.
pub fn detect(bytes: &[u8], hint: &str) -> Option<Format> {
    if bytes.starts_with(b"PK\x03\x04") {
        return Some(Format::ThreeMf);
    }
    if bytes.starts_with(b"ply") {
        return Some(Format::Ply);
    }
    if stl::looks_binary(bytes) {
        return Some(Format::Stl);
    }
    let head = &bytes[..bytes.len().min(512)];
    let text = String::from_utf8_lossy(head);
    let trimmed = text.trim_start();
    if trimmed.starts_with("solid") && (text.contains("facet") || bytes.len() < 512) {
        return Some(Format::Stl);
    }
    if let Some(f) = Format::parse_hint(hint) {
        return Some(f);
    }
    if trimmed.lines().any(|l| {
        let l = l.trim_start();
        l.starts_with("v ") || l.starts_with("f ") || l.starts_with('#')
    }) {
        return Some(Format::Obj);
    }
    None
}

pub fn parse(bytes: &[u8], format: Format) -> Result<Ingested, String> {
    let out = match format {
        Format::Stl => stl::parse(bytes),
        Format::Obj => obj::parse(bytes),
        Format::Ply => ply::parse(bytes),
        Format::ThreeMf => threemf::parse(bytes),
    }?;
    if out.mesh.triangles.is_empty() {
        return Err(format!("{} file contains no triangles", format.name()));
    }
    if out
        .mesh
        .positions
        .iter()
        .any(|p| !(p[0].is_finite() && p[1].is_finite() && p[2].is_finite()))
    {
        return Err(format!(
            "{} file contains non-finite coordinates",
            format.name()
        ));
    }
    Ok(out)
}

/// Fan-triangulate a polygon given as vertex indices.
pub(crate) fn push_fan(mesh: &mut Mesh, face: &[u32]) {
    for i in 1..face.len().saturating_sub(1) {
        mesh.triangles.push([face[0], face[i], face[i + 1]]);
    }
}

#[cfg(test)]
pub(crate) fn stl_bytes(mesh: &Mesh) -> Vec<u8> {
    stl::write_binary(mesh)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_by_content_then_hint() {
        assert_eq!(detect(b"PK\x03\x04rest", "x.stl"), Some(Format::ThreeMf));
        assert_eq!(detect(b"ply\nformat ascii 1.0\n", ""), Some(Format::Ply));
        assert_eq!(
            detect(b"solid x\nfacet normal 0 0 1\n", ""),
            Some(Format::Stl)
        );
        assert_eq!(detect(b"# comment\nv 0 0 0\n", ""), Some(Format::Obj));
        assert_eq!(detect(b"garbage", "part.OBJ"), Some(Format::Obj));
        assert_eq!(detect(b"garbage", ""), None);
    }

    #[test]
    fn decimal_resolution() {
        assert_eq!(token_resolution("12.3456"), Some(1e-4));
        assert!((token_resolution("-1.234560e+01").unwrap() - 1e-5).abs() < 1e-18);
        assert_eq!(token_resolution("10"), None);
        assert_eq!(token_resolution("0.001"), None);
        assert!((token_resolution("0.0012345").unwrap() - 1e-7).abs() < 1e-20);
        let mut t = DecimalTracker::default();
        for tok in ["1.25", "3.14159", "2.71828", "10"] {
            t.observe(tok);
        }
        assert_eq!(t.finish(), Storage::Text(Some(1e-5)));
        assert_eq!(Storage::F32.resolution(100.0), 2f64.powi(6 - 23));
    }

    #[test]
    fn units_convert_to_mm() {
        assert_eq!(Unit::parse("inch").unwrap().to_mm(), 25.4);
        assert_eq!(Unit::parse("MM").unwrap(), Unit::Millimeter);
        assert!(Unit::parse("parsec").is_none());
    }
}
