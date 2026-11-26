#!/usr/bin/env python3
"""Independent validation of a brepjs-bim IFC file using IfcOpenShell.

IfcOpenShell is a separate, widely-used IFC implementation (the engine behind
BlenderBIM / Bonsai). It shares no code with web-ifc — the parser brepjs-bim
uses internally — so passing this is a genuine cross-implementation check, not
self-validation.

Checks performed:
  1. The file parses and reports its schema.
  2. `ifcopenshell.validate` — the EXPRESS schema + where-rule validator.
  3. Required spatial roots exist (IfcProject + a containment hierarchy).
  4. Every IfcRoot.GlobalId is a syntactically valid, unique IFC GUID.
  5. Every product with a shape representation generates geometry via the
     IfcOpenShell geometry iterator (catches malformed BREP/extrusion data).

Usage: validateIfc.py [--sample-columns] [path/to/model.ifc]   (defaults to the sample fixture)
Exit code 0 = all gates pass; 1 = at least one error.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import ifcopenshell
import ifcopenshell.validate
import ifcopenshell.geom
import ifcopenshell.util.placement
import ifcopenshell.util.unit


def check_sample_columns(model: ifcopenshell.file) -> list[str]:
    grounds = [s for s in model.by_type("IfcBuildingStorey") if s.Name == "Ground Floor"]
    columns = model.by_type("IfcColumn")
    if len(grounds) != 1 or len(columns) != 2:
        return ["sample must contain one Ground Floor and two columns"]
    ground = grounds[0]
    for column in columns:
        if column.ObjectPlacement.PlacementRelTo != ground.ObjectPlacement:
            return [f"column #{column.id()} placement parent must be Ground Floor"]
        if [r.RelatingStructure for r in column.ContainedInStructure] != [ground]:
            return [f"column #{column.id()} must be contained in Ground Floor"]

    # Move the storey in the independently parsed sample. Distances below are in file units.
    def heights():
        return [ifcopenshell.util.placement.get_local_placement(c.ObjectPlacement)[2, 3] for c in columns]

    original = heights()
    origin = ground.ObjectPlacement.RelativePlacement.Location
    x, y, z = origin.Coordinates
    delta = 2.5 / ifcopenshell.util.unit.calculate_unit_scale(model)
    try:
        origin.Coordinates = (x, y, z + delta)
        if any(abs(after - before - delta) > 1e-8 for before, after in zip(original, heights())):
            return ["both sample columns must move 2.5 m with the Ground Floor"]
    finally:
        origin.Coordinates = (x, y, z)
    return []


def main(argv: list[str]) -> int:
    default = Path(__file__).resolve().parent.parent / "examples" / "sample-building.ifc"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", type=Path, default=default)
    parser.add_argument("--sample-columns", action="store_true", help="check the sample building's two ground-floor columns")
    args = parser.parse_args(argv[1:])
    path = args.path
    if not path.exists():
        print(f"ERROR: file not found: {path}")
        return 1

    print(f"IfcOpenShell {ifcopenshell.version}")
    print(f"Validating: {path} ({path.stat().st_size} bytes)\n")

    errors: list[str] = []

    # 1. Parse + schema.
    model = ifcopenshell.open(str(path))
    print(f"[1] Parsed OK — schema {model.schema}")

    # 2. EXPRESS schema + where-rule validation.
    logger = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(model, logger, express_rules=True)
    schema_issues = logger.statements
    if schema_issues:
        print(f"[2] Schema validation: {len(schema_issues)} issue(s)")
        for s in schema_issues[:25]:
            errors.append(f"schema: {s.get('message', s)}")
            print(f"    - {s.get('message', s)}")
    else:
        print("[2] Schema validation: PASS (no EXPRESS / where-rule violations)")

    # 3. Spatial roots.
    projects = model.by_type("IfcProject")
    sites = model.by_type("IfcSite")
    buildings = model.by_type("IfcBuilding")
    storeys = model.by_type("IfcBuildingStorey")
    print(
        f"[3] Spatial structure: {len(projects)} project, {len(sites)} site, "
        f"{len(buildings)} building, {len(storeys)} storey(s)"
    )
    if len(projects) != 1:
        errors.append(f"expected exactly 1 IfcProject, found {len(projects)}")
    if not storeys:
        errors.append("no IfcBuildingStorey found")

    # 4. GlobalId validity + uniqueness. A valid IFC GlobalId is 22 chars from
    # the IFC base64 alphabet whose leading char is 0-3 (the 4-bit front slack of
    # the 128-bit GUID) — length alone would miss the off-by-four-bits bug.
    ifc_chars = set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$")
    seen: dict[str, str] = {}
    bad = 0
    for root in model.by_type("IfcRoot"):
        gid = root.GlobalId
        if (
            not isinstance(gid, str)
            or len(gid) != 22
            or gid[0] not in "0123"
            or not all(c in ifc_chars for c in gid)
        ):
            bad += 1
            errors.append(f"{root.is_a()} #{root.id()} has invalid GlobalId {gid!r}")
        elif gid in seen:
            errors.append(f"duplicate GlobalId {gid} on {root.is_a()} and {seen[gid]}")
        else:
            seen[gid] = root.is_a()
    print(f"[4] GlobalIds: {len(seen)} unique, {bad} malformed")

    # 5. Geometry generation for every product with a representation.
    settings = ifcopenshell.geom.settings()
    products = [
        p
        for p in model.by_type("IfcProduct")
        if getattr(p, "Representation", None) is not None
    ]
    ok_geom = 0
    for p in products:
        try:
            ifcopenshell.geom.create_shape(settings, p)
            ok_geom += 1
        except Exception as e:  # noqa: BLE001 — report any geometry failure
            errors.append(f"geometry failed for {p.is_a()} #{p.id()}: {e}")
    print(f"[5] Geometry: {ok_geom}/{len(products)} products generated a shape")

    if args.sample_columns:
        column_errors = check_sample_columns(model)
        errors.extend(column_errors)
        print("[6] Sample columns:", ", ".join(column_errors) if column_errors else "both follow Ground Floor")

    print()
    if errors:
        print(f"RESULT: FAIL — {len(errors)} error(s)")
        return 1
    print("RESULT: PASS — independently validated by IfcOpenShell")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
