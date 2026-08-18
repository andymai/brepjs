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

const cobie = deriveCobieModel(model, { createdBy: 'jane@example.com' });
if (cobie.ok) {
  const csv = serializeCobieToCsv(cobie.value); // one CSV per sheet
  const json = serializeCobieToJson(cobie.value);
}
```

## IDS 1.0 (requirement checking)

The Information Delivery Specification is buildingSMART's machine-readable requirements format ("every external wall must carry a FireRating"). `parseIdsXml` reads an IDS document; `checkModelAgainstIds` (alias `checkIds`) evaluates every specification against the model and reports pass / fail per element with the failing facet.

```typescript
import { parseIdsXml, checkIds } from 'brepjs-bim';

const ids = parseIdsXml(idsXml);
if (ids.ok) {
  const report = checkIds(model, ids.value);
  // report.value.results: per-spec, per-element outcomes
}
```

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
