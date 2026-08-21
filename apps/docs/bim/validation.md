---
title: Validation
description: 'Five internal checkers, one-call validated export, the official buildingSMART rule catalog run locally, and an independent IfcOpenShell gate: how brepjs-bim proves its IFC is real.'
---

# Validation

An IFC file that only its own writer can read is not an exchange format. brepjs-bim validates at four distances from the code that wrote the file.

## Internal checkers

Five composable checks, each returning a severity-tagged report:

- `checkReferentialIntegrity(model)`: every relationship points at an element that exists; containment, voids, fills, aggregation, and group membership all resolve.
- `checkSchema(bytes)`: the exported file re-parses and passes structural schema checks.
- `checkGeometryValidity(solids)`: the given element solids pass brepjs validity (closed, manifold, positive volume).
- `checkRoundTrip(bytes)`: re-read an exported file and compare entity counts; losses are reported per type.
- `checkGherkinRules(bytes)`: local implementations of the buildingSMART Validation Service's normative rules that touch this writer's vocabulary, currently IFC102 (no deprecated IFC4 entities or attributes), QTY001 (every `Qto_*` set validated against the official quantity table), and GRF003 (a facility model warns unless it declares a coordinate reference system).

`toIfcValidated(model, meta)` runs export plus the suite in one call:

```typescript
import { toIfcValidated } from 'brepjs-bim';

const validated = await toIfcValidated(model, {
  applicationName: 'office-tool',
  applicationVersion: '1.0',
});
if (validated.ok) {
  const { bytes, report } = validated.value;
  // report.issues: severity-tagged findings from every gate
}
```

## The complete official rule catalog

`checkGherkinRules` covers only the rules this writer's vocabulary can trip. The **entire** normative catalog is also runnable locally: `scripts/setupGherkinRunner.sh` in the package builds a pinned instance of the exact rule engine behind the buildingSMART Validation Service, and `run-gherkin.sh model.ifc` executes every ALB / GEM / GRF / IFC / OJT / PJS / PSE / QTY / SPS feature against a file in about a second. All three committed fixtures pass it completely: 950 scenarios, zero failures, zero undefined.

The distinction is worth keeping straight. `toIfcValidated` gives you a fast in-process subset on every export; the runner gives you the full catalog, the same rules the service would apply, before anything is uploaded.

## The independent gate

Internal checks share code with the writer, so they cannot catch bugs the writer and reader agree on. The committed sample building is therefore validated by **IfcOpenShell**, a separate C++/Python IFC implementation sharing no code with `web-ifc`: EXPRESS schema + where-rules, spatial-structure presence, GlobalId validity and uniqueness, and geometry generation for every product. See `VALIDATION.md` in the package for the reproduction steps (two commands).

## The semantic round-trip gate

The test suite additionally gates on semantic fidelity through a full source → IFC → import cycle: identity (GlobalIds), relationships (voids / fills / containment), property sets, spatial structure, and solid volumes within 0.5% all survive. This is what "round-trip" means here: not that a file parses, but that the model that comes back is the model that went out.

## External tools

The buildingSMART Validation Service has been run against the fixtures, and its findings drove real writer fixes: an invalid scientific-real STEP token, then a semantic pass that surfaced six more defects (owner-history change action, person identification, unnamed type objects, an undefined curtain-wall enum literal, duplicated occurrence predefined types, and missing `MethodOfMeasurement` on quantity sets). All are fixed and regression-tested, and its rule catalog now runs locally as described above, so the service is confirmation rather than discovery.

Desktop imports (Solibri, Revit) remain unverified. Per-tool checklists and both fixtures are ready in the package's `VALIDATION.md`; results are recorded there as they land.
