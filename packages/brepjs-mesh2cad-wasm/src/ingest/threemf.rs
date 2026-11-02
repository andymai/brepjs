use std::collections::HashMap;

use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;

use super::{zip, Ingested, Unit};
use crate::math::V3;
use crate::mesh::Mesh;

/// Row-vector affine transform as 3MF stores it: p' = p·M + t.
#[derive(Clone, Copy)]
struct Affine {
    m: [[f64; 3]; 3],
    t: V3,
}

impl Affine {
    const IDENTITY: Affine = Affine {
        m: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
        t: [0.0; 3],
    };

    fn parse(s: &str) -> Option<Affine> {
        let v: Vec<f64> = s
            .split_ascii_whitespace()
            .map(|x| x.parse::<f64>().ok().filter(|f| f.is_finite()))
            .collect::<Option<Vec<f64>>>()?;
        if v.len() != 12 {
            return None;
        }
        Some(Affine {
            m: [[v[0], v[1], v[2]], [v[3], v[4], v[5]], [v[6], v[7], v[8]]],
            t: [v[9], v[10], v[11]],
        })
    }

    fn apply(&self, p: V3) -> V3 {
        let mut o = self.t;
        for (j, out) in o.iter_mut().enumerate() {
            *out += p[0] * self.m[0][j] + p[1] * self.m[1][j] + p[2] * self.m[2][j];
        }
        o
    }

    /// `self` applied first, then `outer`.
    fn then(&self, outer: &Affine) -> Affine {
        let mut m = [[0.0; 3]; 3];
        for (i, row) in m.iter_mut().enumerate() {
            for (j, cell) in row.iter_mut().enumerate() {
                *cell = (0..3).map(|k| self.m[i][k] * outer.m[k][j]).sum();
            }
        }
        Affine {
            m,
            t: outer.apply(self.t),
        }
    }
}

struct Component {
    path: Option<String>,
    object: u32,
    transform: Affine,
}

#[derive(Default)]
struct Object {
    kind: String,
    positions: Vec<V3>,
    triangles: Vec<[u32; 3]>,
    components: Vec<Component>,
}

#[derive(Default)]
struct Model {
    decimals: Vec<String>,
    unit: Option<Unit>,
    /// The `unit` attribute as written, when it didn't parse.
    unknown_unit: Option<String>,
    objects: HashMap<u32, Object>,
    build: Vec<Component>,
}

fn attr(e: &BytesStart, key: &[u8]) -> Option<String> {
    e.attributes().flatten().find_map(|a| {
        if a.key.local_name().as_ref() == key {
            Some(String::from_utf8_lossy(&a.value).into_owned())
        } else {
            None
        }
    })
}

fn num(e: &BytesStart, key: &[u8]) -> Option<f64> {
    attr(e, key)?.trim().parse().ok()
}

fn parse_model(xml: &[u8]) -> Result<Model, String> {
    let mut reader = Reader::from_reader(xml);
    let mut buf = Vec::new();
    let mut model = Model::default();
    let mut current: Option<(u32, Object)> = None;
    loop {
        let ev = reader
            .read_event_into(&mut buf)
            .map_err(|e| format!("3MF XML error at {}: {e}", reader.buffer_position()))?;
        match ev {
            Event::Start(ref e) | Event::Empty(ref e) => {
                let empty = matches!(ev, Event::Empty(_));
                match e.local_name().as_ref() {
                    b"model" => {
                        if let Some(raw) = attr(e, b"unit") {
                            model.unit = Unit::parse(&raw);
                            if model.unit.is_none() {
                                model.unknown_unit = Some(raw);
                            }
                        }
                    }
                    b"object" => {
                        let id = num(e, b"id").ok_or("3MF object without id")? as u32;
                        let kind = attr(e, b"type").unwrap_or_else(|| "model".into());
                        let obj = Object {
                            kind,
                            ..Object::default()
                        };
                        if empty {
                            model.objects.insert(id, obj);
                        } else {
                            current = Some((id, obj));
                        }
                    }
                    b"vertex" => {
                        if model.decimals.len() < 3000 {
                            for k in [&b"x"[..], b"y", b"z"] {
                                if let Some(v) = attr(e, k) {
                                    model.decimals.push(v);
                                }
                            }
                        }
                        if let Some((_, obj)) = current.as_mut() {
                            let p = [
                                num(e, b"x").ok_or("3MF vertex missing x")?,
                                num(e, b"y").ok_or("3MF vertex missing y")?,
                                num(e, b"z").ok_or("3MF vertex missing z")?,
                            ];
                            obj.positions.push(p);
                        }
                    }
                    b"triangle" => {
                        if let Some((_, obj)) = current.as_mut() {
                            let v = |k: &[u8]| num(e, k).map(|x| x as u32);
                            let t = [
                                v(b"v1").ok_or("3MF triangle missing v1")?,
                                v(b"v2").ok_or("3MF triangle missing v2")?,
                                v(b"v3").ok_or("3MF triangle missing v3")?,
                            ];
                            obj.triangles.push(t);
                        }
                    }
                    b"component" => {
                        if let Some((_, obj)) = current.as_mut() {
                            obj.components.push(component(e)?);
                        }
                    }
                    b"item" => model.build.push(component(e)?),
                    _ => {}
                }
            }
            Event::End(ref e) => {
                if e.local_name().as_ref() == b"object" {
                    if let Some((id, obj)) = current.take() {
                        model.objects.insert(id, obj);
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    Ok(model)
}

fn component(e: &BytesStart) -> Result<Component, String> {
    let object = num(e, b"objectid").ok_or("3MF component without objectid")? as u32;
    let transform = match attr(e, b"transform") {
        Some(s) => Affine::parse(&s).ok_or("bad 3MF transform")?,
        None => Affine::IDENTITY,
    };
    let path = attr(e, b"path").map(|p| p.trim_start_matches('/').to_string());
    Ok(Component {
        path,
        object,
        transform,
    })
}

struct Package<'a> {
    bytes: &'a [u8],
    entries: Vec<zip::Entry>,
    models: HashMap<String, Model>,
}

impl Package<'_> {
    fn load(&mut self, path: &str) -> Result<(), String> {
        if self.models.contains_key(path) {
            return Ok(());
        }
        let entry = self
            .entries
            .iter()
            .find(|e| e.name.trim_start_matches('/').eq_ignore_ascii_case(path))
            .ok_or_else(|| format!("3MF part {path} not found"))?;
        let xml = zip::read(self.bytes, entry)?;
        let model = parse_model(&xml)?;
        self.models.insert(path.to_string(), model);
        Ok(())
    }
}

fn start_part(pkg: &Package) -> Option<String> {
    if let Some(rels) = pkg.entries.iter().find(|e| e.name == "_rels/.rels") {
        if let Ok(xml) = zip::read(pkg.bytes, rels) {
            let mut reader = Reader::from_reader(xml.as_slice());
            let mut buf = Vec::new();
            while let Ok(ev) = reader.read_event_into(&mut buf) {
                match ev {
                    Event::Start(ref e) | Event::Empty(ref e)
                        if e.local_name().as_ref() == b"Relationship" =>
                    {
                        let ty = attr(e, b"Type").unwrap_or_default();
                        if ty.ends_with("/3dmodel") {
                            if let Some(t) = attr(e, b"Target") {
                                return Some(t.trim_start_matches('/').to_string());
                            }
                        }
                    }
                    Event::Eof => break,
                    _ => {}
                }
                buf.clear();
            }
        }
    }
    pkg.entries
        .iter()
        .find(|e| e.name.to_ascii_lowercase().ends_with(".model"))
        .map(|e| e.name.trim_start_matches('/').to_string())
}

pub fn parse(bytes: &[u8]) -> Result<Ingested, String> {
    let entries = zip::entries(bytes)?;
    let mut pkg = Package {
        bytes,
        entries,
        models: HashMap::new(),
    };
    let root = start_part(&pkg).ok_or("3MF package has no 3D model part")?;
    pkg.load(&root)?;

    let mut mesh = Mesh::default();
    let mut warnings = Vec::new();
    let unit = pkg.models[&root].unit;
    let build: Vec<(Option<String>, u32, Affine)> = pkg.models[&root]
        .build
        .iter()
        .map(|c| (c.path.clone(), c.object, c.transform))
        .collect();
    let items: Vec<(Option<String>, u32, Affine)> = if build.is_empty() {
        let mut ids: Vec<u32> = pkg.models[&root].objects.keys().copied().collect();
        ids.sort_unstable();
        ids.into_iter()
            .map(|id| (None, id, Affine::IDENTITY))
            .collect()
    } else {
        build
    };
    let mut memo = HashMap::new();
    let mut total = Cost::default();
    for (path, id, _) in &items {
        let path = path.clone().unwrap_or_else(|| root.clone());
        total = total.add(expanded_cost(&mut pkg, &path, *id, 0, &mut memo)?);
    }
    total.check()?;
    let mut stats = EmitStats::default();
    for (path, id, xf) in items {
        let path = path.unwrap_or_else(|| root.clone());
        emit(&mut pkg, &path, id, xf, 0, &mut mesh, &mut stats)?;
    }
    let skipped_kinds = stats.skipped_kinds;
    if stats.bad_refs > 0 {
        warnings.push(format!(
            "skipped {} 3MF triangles with out-of-range vertex references",
            stats.bad_refs
        ));
    }
    if let Some(raw) = &pkg.models[&root].unknown_unit {
        warnings.push(format!(
            "3MF unit {raw:?} is not a 3MF unit; assuming millimeters"
        ));
    }
    let root_unit = unit.unwrap_or(Unit::Millimeter);
    if pkg
        .models
        .values()
        .any(|m| m.unit.is_some_and(|u| u != root_unit))
    {
        return Err(
            "3MF parts declare different units; mixed-unit packages are not supported".into(),
        );
    }
    if skipped_kinds > 0 {
        warnings.push(format!(
            "skipped {skipped_kinds} 3MF support/non-model objects"
        ));
    }
    if unit.is_none() {
        warnings.push("3MF model has no unit attribute; 3MF defaults to millimeters".into());
    }
    let mut decimals = super::DecimalTracker::default();
    for m in pkg.models.values() {
        m.decimals.iter().for_each(|t| decimals.observe(t));
    }
    Ok(Ingested {
        mesh,
        unit: Some(unit.unwrap_or(Unit::Millimeter)),
        storage: decimals.finish(),
        warnings,
    })
}

/// Components instance objects, so a small file can describe an enormous mesh.
/// Refuse builds that expand past these limits before emitting anything.
const MAX_EXPANDED_TRIANGLES: usize = 20_000_000;
const MAX_EXPANDED_VERTICES: usize = 3 * MAX_EXPANDED_TRIANGLES;
const MAX_INSTANCES: usize = 1_000_000;

/// What one object costs once its components are instanced.
#[derive(Clone, Copy, Default)]
struct Cost {
    triangles: usize,
    vertices: usize,
    instances: usize,
}

impl Cost {
    fn add(self, o: Cost) -> Cost {
        Cost {
            triangles: self.triangles.saturating_add(o.triangles),
            vertices: self.vertices.saturating_add(o.vertices),
            instances: self.instances.saturating_add(o.instances),
        }
    }

    fn check(self) -> Result<(), String> {
        if self.triangles > MAX_EXPANDED_TRIANGLES
            || self.vertices > MAX_EXPANDED_VERTICES
            || self.instances > MAX_INSTANCES
        {
            return Err(format!(
                "3MF build expands to {} triangles, {} vertices and {} instances, over the limits \
                 ({MAX_EXPANDED_TRIANGLES}, {MAX_EXPANDED_VERTICES}, {MAX_INSTANCES})",
                self.triangles, self.vertices, self.instances
            ));
        }
        Ok(())
    }
}

/// Cost of instancing `id` (memoized per part and object).
fn expanded_cost(
    pkg: &mut Package,
    path: &str,
    id: u32,
    depth: usize,
    memo: &mut HashMap<(String, u32), Cost>,
) -> Result<Cost, String> {
    if depth > 32 {
        return Err("3MF component nesting is too deep (cycle?)".into());
    }
    if let Some(&c) = memo.get(&(path.to_string(), id)) {
        return Ok(c);
    }
    pkg.load(path)?;
    let (own, comps) = {
        let obj = pkg.models[path]
            .objects
            .get(&id)
            .ok_or_else(|| format!("3MF object {id} not found in {path}"))?;
        let own = if obj.kind == "model" || obj.kind.is_empty() {
            Cost {
                triangles: obj.triangles.len(),
                vertices: obj.positions.len(),
                instances: 1,
            }
        } else {
            Cost {
                instances: 1,
                ..Cost::default()
            }
        };
        let comps: Vec<(Option<String>, u32)> = obj
            .components
            .iter()
            .map(|c| (c.path.clone(), c.object))
            .collect();
        (own, comps)
    };
    let mut cost = own;
    for (cpath, cid) in comps {
        let child = cpath.unwrap_or_else(|| path.to_string());
        cost = cost.add(expanded_cost(pkg, &child, cid, depth + 1, memo)?);
    }
    memo.insert((path.to_string(), id), cost);
    Ok(cost)
}

#[derive(Default)]
struct EmitStats {
    skipped_kinds: usize,
    bad_refs: usize,
}

fn emit(
    pkg: &mut Package,
    path: &str,
    id: u32,
    xf: Affine,
    depth: usize,
    mesh: &mut Mesh,
    stats: &mut EmitStats,
) -> Result<(), String> {
    if depth > 32 {
        return Err("3MF component nesting is too deep (cycle?)".into());
    }
    if mesh.triangles.len() > MAX_EXPANDED_TRIANGLES {
        return Err(format!(
            "3MF build expands to more than {MAX_EXPANDED_TRIANGLES} triangles"
        ));
    }
    pkg.load(path)?;
    let (kind_ok, comps) = {
        let obj = pkg.models[path]
            .objects
            .get(&id)
            .ok_or_else(|| format!("3MF object {id} not found in {path}"))?;
        let kind_ok = obj.kind == "model" || obj.kind.is_empty();
        if kind_ok {
            if mesh.triangles.len() + obj.triangles.len() > MAX_EXPANDED_TRIANGLES
                || mesh.positions.len() + obj.positions.len() > MAX_EXPANDED_VERTICES
            {
                return Err(format!(
                    "3MF build expands to more than {MAX_EXPANDED_TRIANGLES} triangles"
                ));
            }
            let base = mesh.positions.len() as u32;
            let n = obj.positions.len() as u32;
            mesh.positions
                .extend(obj.positions.iter().map(|&p| xf.apply(p)));
            mesh.triangles.extend(
                obj.triangles
                    .iter()
                    .filter(|t| t.iter().all(|&v| v < n))
                    .map(|t| [t[0] + base, t[1] + base, t[2] + base]),
            );
            stats.bad_refs += obj
                .triangles
                .iter()
                .filter(|t| t.iter().any(|&v| v >= n))
                .count();
        }
        let comps: Vec<(Option<String>, u32, Affine)> = obj
            .components
            .iter()
            .map(|c| (c.path.clone(), c.object, c.transform))
            .collect();
        (kind_ok, comps)
    };
    if !kind_ok {
        stats.skipped_kinds += 1;
        return Ok(());
    }
    for (cpath, cid, cxf) in comps {
        let child_path = cpath.unwrap_or_else(|| path.to_string());
        emit(pkg, &child_path, cid, cxf.then(&xf), depth + 1, mesh, stats)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const RELS: &[u8] = br#"<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>"#;

    fn tetra_object(id: u32) -> String {
        format!(
            r#"<object id="{id}" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/><vertex x="0" y="0" z="1"/></vertices><triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="1" v2="2" v3="3"/><triangle v1="0" v2="3" v3="2"/></triangles></mesh></object>"#
        )
    }

    #[test]
    fn single_object_with_units_and_transform() {
        let model = format!(
            r#"<?xml version="1.0"?><model unit="inch" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>{}</resources><build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 10 0 0"/></build></model>"#,
            tetra_object(1)
        );
        let pkg = zip::write_deflated(&[
            ("_rels/.rels", RELS),
            ("3D/3dmodel.model", model.as_bytes()),
        ]);
        let got = parse(&pkg).unwrap();
        assert_eq!(got.unit, Some(Unit::Inch));
        assert_eq!(got.mesh.triangles.len(), 4);
        assert_eq!(got.mesh.positions[1], [11.0, 0.0, 0.0]);
    }

    #[test]
    fn components_across_parts() {
        let part = format!(
            r#"<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>{}</resources><build/></model>"#,
            tetra_object(7)
        );
        let root = r#"<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"><resources><object id="2" type="model"><components><component p:path="/3D/Objects/o.model" objectid="7" transform="2 0 0 0 2 0 0 0 2 0 0 0"/><component p:path="/3D/Objects/o.model" objectid="7" transform="1 0 0 0 1 0 0 0 1 0 0 5"/></components></object></resources><build><item objectid="2" transform="1 0 0 0 1 0 0 0 1 100 0 0"/></build></model>"#;
        let pkg = zip::write_stored(&[
            ("_rels/.rels", RELS),
            ("3D/3dmodel.model", root.as_bytes()),
            ("3D/Objects/o.model", part.as_bytes()),
        ]);
        let got = parse(&pkg).unwrap();
        assert_eq!(got.mesh.triangles.len(), 8);
        assert_eq!(got.mesh.positions[1], [102.0, 0.0, 0.0]);
        assert_eq!(got.mesh.positions[7], [100.0, 0.0, 6.0]);
    }

    #[test]
    fn instancing_bomb_is_capped() {
        let mut objects = tetra_object(1);
        for k in 2..=33 {
            objects.push_str(&format!(
                r#"<object id="{k}" type="model"><components><component objectid="{p}"/><component objectid="{p}"/></components></object>"#,
                p = k - 1
            ));
        }
        let model = format!(
            r#"<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>{objects}</resources><build><item objectid="33"/></build></model>"#
        );
        let pkg = zip::write_deflated(&[
            ("_rels/.rels", RELS),
            ("3D/3dmodel.model", model.as_bytes()),
        ]);
        let err = parse(&pkg).unwrap_err();
        assert!(err.contains("expands") || err.contains("deep"), "{err}");
    }

    #[test]
    fn vertex_only_instancing_is_capped() {
        let verts: String = (0..200)
            .map(|i| format!(r#"<vertex x="{i}" y="0" z="0"/>"#))
            .collect();
        let mut objects = format!(
            r#"<object id="1" type="model"><mesh><vertices>{verts}</vertices><triangles/></mesh></object>"#
        );
        for k in 2..=30 {
            objects.push_str(&format!(
                r#"<object id="{k}" type="model"><components><component objectid="{p}"/><component objectid="{p}"/></components></object>"#,
                p = k - 1
            ));
        }
        let model = format!(
            r#"<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>{objects}</resources><build><item objectid="30"/></build></model>"#
        );
        let pkg = zip::write_deflated(&[
            ("_rels/.rels", RELS),
            ("3D/3dmodel.model", model.as_bytes()),
        ]);
        let err = parse(&pkg).unwrap_err();
        assert!(err.contains("over the limits"), "{err}");
    }

    #[test]
    fn malformed_transform_is_rejected() {
        assert!(Affine::parse("1 0 0 0 1 0 0 0 1 0 0 x").is_none());
        assert!(Affine::parse("1 0 0 0 1 0 0 0 1 0 0 0 9 9").is_none());
    }

    #[test]
    fn mixed_units_across_parts_are_rejected() {
        let part = format!(
            r#"<model unit="inch" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>{}</resources><build/></model>"#,
            tetra_object(7)
        );
        let root = r#"<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"><resources><object id="2" type="model"><components><component p:path="/3D/Objects/o.model" objectid="7"/></components></object></resources><build><item objectid="2"/></build></model>"#;
        let pkg = zip::write_stored(&[
            ("_rels/.rels", RELS),
            ("3D/3dmodel.model", root.as_bytes()),
            ("3D/Objects/o.model", part.as_bytes()),
        ]);
        assert!(parse(&pkg).unwrap_err().contains("different units"));
    }

    #[test]
    fn affine_composition_order() {
        let scale = Affine::parse("2 0 0 0 2 0 0 0 2 0 0 0").unwrap();
        let shift = Affine::parse("1 0 0 0 1 0 0 0 1 1 0 0").unwrap();
        assert_eq!(scale.then(&shift).apply([1.0, 0.0, 0.0]), [3.0, 0.0, 0.0]);
        assert_eq!(shift.then(&scale).apply([1.0, 0.0, 0.0]), [4.0, 0.0, 0.0]);
    }
}
