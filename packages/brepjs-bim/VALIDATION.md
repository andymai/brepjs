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
pip install ifcopenshell pytest              # Python 3.9–3.12; express-rule checks import pytest
python scripts/validateIfc.py                # exit 0 = all gates pass
```

`scripts/validateIfc.py` runs five gates: parse + schema, `ifcopenshell.validate`
(EXPRESS schema + where-rules), spatial-root presence, GlobalId validity/uniqueness, and
geometry generation for every product with a representation.

## The interop fixture

`examples/interop-fixture.ifc` (generate: `node examples/interopFixture.mjs`) concentrates the
geometry kinds most likely to break in desktop tools, where the sample building is the friendly
baseline: gable / hip / dome roofs and a two-flight stair and posted railing (tessellated bodies),
a curtain-wall panel grid, and circular + I-shape columns and beams (parametric profile defs).
Validate it the same way:

```bash
python scripts/validateIfc.py examples/interop-fixture.ifc
```

Its first run caught a real cross-implementation bug: `IfcTriangulatedFaceSet.Closed` was emitted
as `.U.` (a raw JS boolean, serialized by web-ifc as UNKNOWN) on every tessellated body — web-ifc
accepts it, IfcOpenShell's where-rules reject it. The writer now emits a typed `.T.`.

The first buildingSMART Validation Service run caught a second one, a level deeper: web-ifc prints
integral-mantissa scientific reals without the decimal point ISO 10303-21 requires (`1E-05` in the
representation context's precision), and both web-ifc and IfcOpenShell tolerate the invalid token
while the official validator's strict STEP grammar rejects the whole file. The writer now
normalizes bare reals post-save (`1.E-05`), with a regression test on the full export path.

The second service run reached the semantic layer and surfaced six more writer defects, all fixed:
`IfcOwnerHistory.ChangeAction` claimed ADDED without a LastModifiedDate, the default `IfcPerson`
carried no identification, every type object lacked the required `Name`, the curtain wall emitted
a `CURTAIN_WALL` literal that `IfcCurtainWallTypeEnum` does not define, occurrences duplicated the
`PredefinedType` their relating type already carried (OJT001 — the enum now rides the type object
and the importer resolves it through `IfcRelDefinesByType`), and `Qto_*` element quantities omitted
`MethodOfMeasurement='BaseQuantities'` (QTY001). `scripts/validateIfc.py` now runs IfcOpenShell
with `express_rules=True`, which reproduces the service's entity-rule findings locally — the local
gate is the QA loop, the service is confirmation.

## The complete official rule catalog, locally

`scripts/setupGherkinRunner.sh /path/to/workdir` builds a local instance of the exact rule engine
behind the buildingSMART Validation Service (buildingSMART/ifc-gherkin-rules, pinned), then
`run-gherkin.sh model.ifc` executes every normative rule — the full catalog of 100+ ALB/GEM/GRF/
IFC/OJT/PJS/PSE/QTY/SPS/... features, not just the subset reimplemented below. All three committed
fixtures pass it completely (950 scenarios, 0 failed, 0 undefined), including PSE001
standard-property-set validation. The script documents the five environment fixes it applies
(behave pin, sibling data model, two step-loading shims, a CSV-parser patch); none alter rule
logic.

## Gherkin-layer rules, locally

`toIfcValidated` also runs local implementations of the Validation Service's gherkin normative
rules that touch this writer's vocabulary: IFC102 (no deprecated IFC4 entities or attributes —
stair-flight geometry lives in `Pset_StairFlightCommon`), QTY001 (every `Qto_*` set validated
against the official `qto_definitions.csv`, generated into
`src/validation/qtoDefinitions.generated.ts`), and GRF003 (a facility model warns unless
`ProjectSpec.crs` declares a coordinate reference system, emitted as
`IfcProjectedCRS` + `IfcMapConversion`).

## IDS conformance

The IDS 1.0 checker (`parseIdsXml` + `checkIdsData`) is validated against the complete official
buildingSMART conformance suite — 334 of 334 test cases. Reproduce:

```bash
git clone --depth 1 https://github.com/buildingSMART/IDS /tmp/IDS
npx tsx scripts/idsConformance.ts /tmp/IDS/Documentation/ImplementersDocumentation/TestCases
```

The audit layer validates documents against a schema table generated from IfcOpenShell's EXPRESS
schemas (`scripts/generateIdsSchema.py` → `src/ids/idsSchema.generated.ts`, IFC2X3 + IFC4 + IFC4X3
with per-schema masks).

## External tool checklist

Manual gates for the 1.0 flip, run per tool against **both** fixtures
(`examples/sample-building.ifc`, `examples/interop-fixture.ifc`). Record results below with date,
tool version, and screenshots in `examples/interop-results/`.

### buildingSMART Validation Service ([validate.buildingsmart.org](https://validate.buildingsmart.org))

1. Sign in, upload both files.
2. Wait for the report: syntax, schema, normative IA/IP rules, industry practices.
3. Record: overall verdict per file + any rule ids flagged. Export the report PDF if offered.

- [ ] sample-building.ifc — result:
- [ ] interop-fixture.ifc — result:

### Solibri Anywhere (free viewer)

1. File → Open both IFC files.
2. Check: every element visible (3 roofs, stair with 2 flights, curtain-wall grid, railing posts,
   profiled columns/beams); no "geometry could not be created" warnings in the log.
3. Pick two elements (a wall, the stair): confirm psets, material, and classification show in Info.
4. Record: screenshot of the 3D view + the model tree.

- [ ] sample-building.ifc — result:
- [ ] interop-fixture.ifc — result:

### Revit (trial, via IFC open)

1. Open IFC (not link) both files in a blank project.
2. Check: category mapping (walls→Walls, stair→Stairs, roofs→Roofs), no dropped elements in the
   import log, storey/level structure intact.
3. Record: screenshot of the 3D view + the import log summary.

- [ ] sample-building.ifc — result:
- [ ] interop-fixture.ifc — result:

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
