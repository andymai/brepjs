---
title: 'Interop: COBie, IDS, BCF'
description: 'Handover data (COBie 2.4), requirement checking (IDS 1.0), and issue exchange (BCF 3.0) on top of the BIM model.'
---

# Interop: COBie, IDS, BCF

IFC carries the model; three sibling formats carry the workflows around it.

## COBie 2.4 (handover data)

`deriveCobieModel(model, meta)` (alias `exportCobie`) extracts the facility-management view: contacts, facility, floors, spaces, zones, types, components, systems, and attributes, straight from the model's spatial structure and psets.

```typescript
import { deriveCobieModel, serializeCobieToCsv, serializeCobieToJson } from 'brepjs-bim';

const cobie = deriveCobieModel(model, {
  contact: { email: 'jane@example.com', givenName: 'Jane', familyName: 'Doe' },
});
const csv = serializeCobieToCsv(cobie); // one CSV per sheet
const json = serializeCobieToJson(cobie);
```

## IDS 1.0 (requirement checking)

The Information Delivery Specification is buildingSMART's machine-readable requirements format ("every external wall must carry a FireRating"). `parseIdsXml` reads and **audits** an IDS document the way the official IDS Audit tool does (entity names validated against the IFC schemas, attribute names against the applicable entities, value constraints against the declared data types — an invalid document is rejected, never silently mis-checked). `checkIdsData` (alias `checkIds`) then evaluates every specification against IFC file bytes directly, covering every entity instance in the file.

```typescript
import { parseIdsXml, checkIds } from 'brepjs-bim';

const ids = parseIdsXml(idsXml);
if (ids.ok) {
  const report = await checkIds(ifcBytes, ids.value);
  if (report.ok) {
    // report.value.results: per-spec outcomes with counts and issues
  }
}
```

The checker passes the complete official buildingSMART IDS conformance suite (334 of 334 test cases across entity, attribute, property, classification, material, partOf, restriction, and tolerance facets, including the floating-point tolerance contract, unit conversion to SI, the IFC2X3 type-mapping table, and per-facet cardinality). Reproduce with `scripts/idsConformance.ts` against a clone of [buildingSMART/IDS](https://github.com/buildingSMART/IDS).

## BCF 3.0 (issue exchange)

The BIM Collaboration Format moves issues (topics, comments, viewpoints, component selections) between tools without moving the model. `parseBcfFiles` reads an unzipped BCF container into typed data; `serializeBcfFiles` writes one. Zip packaging is deliberately left to the caller, so the library stays dependency-free.

```typescript
import { parseBcfFiles, serializeBcfFiles } from 'brepjs-bim';

const container = parseBcfFiles(files); // Record<path, bytes>
if (container.ok) {
  const roundTripped = serializeBcfFiles(container.value);
}
```

Topics reference model elements by GlobalId, which is where [stable identity](/families/identity) pays off again: a families-projected model keeps GlobalIds stable across rebuilds, so BCF issues filed against one export still point at the right elements in the next.
