---
title: Validation
description: 'Four internal checkers, one-call validated export, and an independent IfcOpenShell gate: how brepjs-bim proves its IFC is real.'
---

# Validation

An IFC file that only its own writer can read is not an exchange format. brepjs-bim validates at three distances from the code that wrote the file.

## Internal checkers

Four composable checks, each returning a severity-tagged report:

- `checkReferentialIntegrity(model)`: every relationship points at an element that exists; containment, voids, fills, aggregation, and group membership all resolve.
- `checkSchema(bytes)`: the exported file re-parses and passes structural schema checks.
- `checkGeometryValidity(model)`: every element's solid passes brepjs validity (closed, manifold, positive volume).
- `checkRoundTrip(model)`: export → import → compare entity counts; losses are reported per type.

`toIfcValidated(model, meta)` runs export plus the suite in one call:

```typescript
import { toIfcValidated } from 'brepjs-bim';

const validated = await toIfcValidated(model, { name: 'Office' });
if (validated.ok) {
  const { bytes, reports } = validated.value;
  // reports.integrity, reports.schema, reports.geometry, reports.roundTrip
}
```

## The independent gate

Internal checks share code with the writer, so they cannot catch bugs the writer and reader agree on. The committed sample building is therefore validated by **IfcOpenShell**, a separate C++/Python IFC implementation sharing no code with `web-ifc`: EXPRESS schema + where-rules, spatial-structure presence, GlobalId validity and uniqueness, and geometry generation for every product. See `VALIDATION.md` in the package for the reproduction steps (two commands).

## The semantic round-trip gate

The test suite additionally gates on semantic fidelity through a full source → IFC → import cycle: identity (GlobalIds), relationships (voids / fills / containment), property sets, spatial structure, and solid volumes within 0.5% all survive. This is what "round-trip" means here: not that a file parses, but that the model that comes back is the model that went out.

## External tools

buildingSMART's official Validation Service and desktop imports (Solibri, Revit) are the remaining frontier; results are recorded in the package's `VALIDATION.md` as they land.
