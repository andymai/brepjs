# Independent IFC validation

brepjs-bim's internal validation (`toIfcValidated`, `checkSchema`) re-reads its own
output with **web-ifc** — the same parser it writes with. That catches a lot, but it
cannot catch bugs the writer and reader share. This document records validation by an
**independent** implementation.

## Toolchain

[**IfcOpenShell**](https://ifcopenshell.org/) (the engine behind BlenderBIM / Bonsai) is
a separate C++/Python IFC implementation that shares no code with web-ifc. Passing its
schema validator and geometry engine is a genuine cross-implementation check.

## Reproduce

```bash
# 1. Generate the sample model (kernel + brepjs-bim required):
node examples/sampleBuilding.mjs            # writes examples/sample-building.ifc

# 2. Validate it with IfcOpenShell (independent of web-ifc):
pip install ifcopenshell                     # Python 3.9–3.12
python scripts/validateIfc.py                # exit 0 = all gates pass
```

`scripts/validateIfc.py` runs five gates: parse + schema, `ifcopenshell.validate`
(EXPRESS schema + where-rules), spatial-root presence, GlobalId validity/uniqueness, and
geometry generation for every product with a representation.

## Result

The committed fixture `examples/sample-building.ifc` — a two-storey office with walls,
a window, a door, floor slabs, columns, materials, psets, quantities and a Uniclass
classification — passes cleanly:

```
IfcOpenShell 0.8.5
[1] Parsed OK — schema IFC4
[2] Schema validation: PASS (no EXPRESS / where-rule violations)
[3] Spatial structure: 1 project, 1 site, 1 building, 2 storey(s)
[4] GlobalIds: 77 unique, 0 malformed
[5] Geometry: 12/12 products generated a shape

RESULT: PASS — independently validated by IfcOpenShell
```

## Bugs this caught

Two non-conformances were invisible to the web-ifc self-check and only surfaced under
IfcOpenShell — both now fixed and regression-tested:

1. **IFC GlobalId encoding.** The 128-bit GUID was base64-packed without the 4-bit front
   padding the buildingSMART encoding requires, so the first character could exceed the
   legal `0–3` range. Fixed in `identity/ifcGuid.ts` (now bit-identical to the canonical
   compression); guarded by `tests/ifcGuid.test.ts`.
2. **STEP `FILE_NAME` header.** web-ifc emits null `author` / `organization` /
   `authorization` fields, which violate the ISO 10303-21 `LIST [1:?] OF STRING` / `STRING`
   types. The writer now rewrites them to conformant, attributed values; guarded by
   `tests/ifcWriterHeader.test.ts`.

## Not yet covered

- The official [buildingSMART Validation Service](https://validate.buildingsmart.org/)
  (reporting-rule / MVD conformance) has not been run here — run a sample through it
  before claiming certification.
- Round-tripping through desktop authoring tools (Revit, ArchiCAD, Solibri) is unverified.
- Validation covers the elements exercised by the sample; element types not present in
  `examples/sampleBuilding.mjs` are covered only by the internal suite.
