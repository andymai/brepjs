---
title: BIM over MCP
description: 'Let an agent hold a building model open through brep-mcp: find elements by key path or GlobalId, edit the program, see exactly what each edit changed, render it, and export validated IFC.'
---

# BIM over MCP

With `brep-mcp` connected, your agent can keep a building open while it works on it. It opens a [families](../families/overview) program or an IFC file, finds the elements a request is about, edits the program, and after every edit gets back exactly what changed: which elements, which props and psets, and how their geometry moved. It can look at the result and write validated IFC without leaving the session.

The program on disk stays the model. The agent changes it with its own file tools, the same way it edits any code, and the session rebuilds from it.

## Set it up

Register the server from your project, so relative paths resolve there:

```bash
claude mcp add brep -- npx -y --package brepjs-cad brep-mcp
```

Opening or exporting IFC needs `brepjs-bim` (and its `web-ifc` peer) installed in the project; a project made with `npm create brepjs` already has it. Pictures come from headless Chrome through `puppeteer`, which installs with `brepjs-cad` as an optional dependency.

## One edit, start to finish

Say the request is "make the annex wall 3 m tall". Here's what the agent does, with the results trimmed.

**Open the model.** Elements are addressed by key path, the same one [identity](../families/identity) is built on.

```jsonc
// open_model { "path": "model.tsx" }
{
  "ok": true,
  "sessionId": "s1",
  "buildHash": "940ec923d2d5",
  "elementCount": 12,
  "byCategory": {
    "wall": 5,
    "opening": 2,
    "door": 1,
    "window": 1,
    "slab": 1,
    "storey": 1,
    "Room": 1,
  },
}
```

**Find the wall.** A query returns ids plus counts over everything it matched, so a broad query can be narrowed before fetching details.

```jsonc
// query_elements { "sessionId": "s1",
//   "where": { "category": "wall", "psets": [{ "path": "Pset_WallCommon.FireRating", "value": "REI60" }] } }
{ "total": 1, "ids": ["ground/annex"], "breakdown": { "category": { "wall": 1 } } }
```

`get_elements` then shows its props (`height: 2700`), psets, relationships, bounds and volume, and the line that authors it (`model.tsx:14`, the `<Wall` tag), so the agent knows exactly where to edit.

**Edit and rebuild.** The agent changes `height={2700}` to `height={3000}` in the source and calls `rebuild`:

```jsonc
// rebuild { "sessionId": "s1" }
{
  "ok": true,
  "diff": {
    "counts": { "added": 0, "removed": 0, "changed": 1, "unchanged": 11 },
    "changed": [
      {
        "id": "ground/annex",
        "props": { "height": { "before": 2700, "after": 3000 } },
        "geometryChanged": true,
        "volumeDelta": 240000000,
        "boundsDelta": { "zMax": 300 },
      },
    ],
  },
}
```

One element changed, by the prop that was meant to change, and it grew 300 mm up. If the diff had listed anything else, the edit touched more than intended. If the edit had broken the build, `rebuild` would return the errors and the session would keep serving the last good build.

**Look at it.** `render_view` with `highlight: ["ground/annex"]` returns a 1200 × 900 picture with the wall in orange and the rest ghosted.

**Export.** `export_ifc` with `outPath: "dist/model.ifc"` writes the file through the [validated IFC export](../families/ifc-export) and returns the validation report, with each issue mapped to a key path, and the GlobalId of every exported element.

The `edit-and-verify` prompt walks an agent through this loop, `inspect-building` opens a model, summarizes it and renders a plan per storey, `quantity-takeoff` schedules a category's quantities, `compare-revisions` summarizes two revisions, `ifc-review` checks an IFC file and raises its problems as BCF issues, and `model-check` validates a families model and fixes what it can, along with any BCF issues raised on its export.

## Tools

| Tool                      | What it does                                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open_model`              | Builds a families program (type-checked first) or imports an `.ifc` file, and returns a `sessionId`, a `buildHash`, and counts by category, storey and family.       |
| `list_sessions`           | Lists open sessions. A session is `stale` once its source files change on disk.                                                                                      |
| `close_model`             | Stops a session.                                                                                                                                                     |
| `rebuild`                 | Rebuilds after an edit and diffs against the last good build: added and removed ids, prop and pset values before and after, and geometry, volume and bounds changes. |
| `get_diff`                | Pages through the last rebuild's diff when it's longer than the 100 entries per list `rebuild` returns.                                                              |
| `query_elements`          | Finds elements by category, family, storey, name or key-path glob, prop and pset predicates, and bounds.                                                             |
| `get_elements`            | Returns identity, props, psets, quantities, material, classification, relationships, children and geometry for given ids.                                            |
| `list_schedulable_fields` | Lists the fields a selection carries for a schedule, with types and counts.                                                                                          |
| `schedule`                | Tabulates the selected elements, grouped, sorted and totalled, optionally as CSV.                                                                                    |
| `validate_model`          | Runs brepjs-bim's checks and maps each finding to an element.                                                                                                        |
| `compare_models`          | Diffs two sessions, such as two revisions of an IFC file, by element identity.                                                                                       |
| `create_issue`            | Raises a BCF 3.0 issue on elements, with a camera and a snapshot, in a new or existing `.bcf` file.                                                                  |
| `read_issues`             | Reads a `.bcf` file's topics, comments and viewpoints, and resolves their GlobalIds to a session's elements.                                                         |
| `render_view`             | Renders to PNG: `highlight`, `isolate`, `colorBy` category, storey or family, a storey `plan`, or a `section`.                                                       |
| `export_ifc`              | Writes a families session to `.ifc` with the validation report, proxied elements and GlobalIds. Asks before replacing a file.                                        |
| `search_reference`        | Searches the bundled brepjs API reference and these families docs, no session needed.                                                                                |

## Schedules

`schedule` turns a selection into a table. Pick columns from `list_schedulable_fields`: built-ins like `name` and `storey`, `props.height`, `psets.Pset_WallCommon.FireRating`, and base quantities like `quantities.Qto_WallBaseQuantities.Length`. Group by storey to get a count and sums per storey, and pass `outPath` to write a CSV.

```jsonc
// schedule { "sessionId": "s1", "where": { "category": "wall" },
//   "fields": ["storey", "quantities.Qto_WallBaseQuantities.Length"], "groupBy": ["storey"] }
{ "columns": ["storey", "count", "sum(quantities.Qto_WallBaseQuantities.Length)"],
  "rows": [["Ground floor", 5, ...]] }
```

A families model has no quantities of its own, so the session reads them back from an in-memory IFC export: the schedule shows the numbers `export_ifc` would write, in metres, square metres and cubic metres. An opened IFC file uses the quantity sets it carries, in its own units. The `quantity-takeoff` prompt runs this for one category.

## Checking a model

`validate_model` runs brepjs-bim's checks: referential integrity, the EXPRESS schema, a write-read-write round trip, the buildingSMART gherkin rules, and each element's solid. A families model is checked as the IFC file `export_ifc` would write, and each finding comes back with the key path of the element it names; an opened IFC file is checked as it is, with GlobalIds, and an element whose body the importer could not fully rebuild is reported too. Findings come errors first, 200 at a time. The run is kept until the session rebuilds, so paging with `offset` doesn't re-run the checks.

`compare_models` diffs two open sessions by element identity. Open two revisions of an IFC file and it lists what was added, removed and changed, down to the pset value:

```jsonc
// compare_models { "from": "s2", "to": "s3" }
{ "diff": { "counts": { ... },
    "changed": [{ "id": "2XAz8MTt9Q9ubMaPpMza8b",
      "psets": { "Pset_WallCommon.FireRating": { "before": "REI 120", "after": "REI 90" } } }] } }
```

Two families sessions compare their quantity sets as well, derived the way `export_ifc` writes them. When a diff runs past one page, pass the `buildHash` of each side from the first page as `fromBuild` and `toBuild`: a rebuild between pages then fails the call instead of shifting the entries. The `compare-revisions` prompt summarizes such a diff by category and renders the changes.

## Issues (BCF)

BCF is how BIM tools pass issues around without passing the model: BIMcollab, Solibri, Revit (through a BCF add-in) and others open a `.bcf` file and show each issue on the elements it names, from the camera it was raised from. `create_issue` raises one on a session's elements and saves it:

```jsonc
// create_issue
{
  "sessionId": "s1",
  "outPath": "review.bcf",
  "title": "Annex wall fire rating",
  "elements": ["ground/annex"],
  "priority": "High",
  "comment": "Raise to REI90.",
}
```

The issue gets one viewpoint with the elements as its selection, colored orange (or alone, with `focus: "isolate"`), the camera of a `render_view` picture, and that picture as its snapshot, which the call also returns. If `review.bcf` exists, the issue is added to it and its other topics are kept. Issues name elements by IFC GlobalId, so a families session needs an `export_ifc` first, and the issue belongs with that file.

`read_issues` goes the other way. Give it a `.bcf` file and a session, and each topic comes back with its comments and viewpoints, every GlobalId resolved to the session's element id. For a families session that means issues raised on its last export land on key paths, and `get_elements` gives the source line to fix.

## Running code against a session

Some questions don't fit a query, such as the clear distance between two elements. Start the server with `--allow-code` and it also lists `eval_in_session`, which runs a TypeScript function body against the session's live build:

```bash
claude mcp add brep -- npx -y --package brepjs-cad brep-mcp --allow-code
```

```ts
// eval_in_session { "sessionId": "s1", "code": ... }
const shape = ctx.model.byKeyPath.get('ground/annex').shape.value;
return ctx.brep.measureVolume(shape).value;
```

The code receives `ctx` with `brep` (the brepjs namespace), the element `records`, `record(id)`, and `model`: the resolved tree and each element's mesh and shape for a families session, or the imported model for an IFC file. It returns JSON and its console output. The code runs with the server's own permissions, which is why the tool is off by default. A runaway loop is stopped at its time limit along with the session's worker; `rebuild` starts a new one.

A key-path glob uses `*` within one path segment and `**` across segments, so `ground/*/voids:*` finds every opening one level under `ground`. In `highlight` and `isolate`, a container such as a storey or a composed family stands for everything under it.

The server also serves each session's element tree (`brep://sessions/{id}/tree`), single elements (`brep://sessions/{id}/elements/{id}`), the bundled reference files (`brep://reference/...`), and the families starter registry (`brep://families/registry` lists each family and its `npx brepjs add` command, `brep://families/registry/{name}` returns its source) as resources.

## How a session behaves

- **The last good build stays.** Each build runs in its own worker process with a memory cap and a time limit (120 s by default). A rebuild only replaces the current build when it succeeds, so a type error, a crash, a timeout, or an element whose geometry newly fails leaves the previous build in place.
- **Ids from an old build are caught.** Results carry a `buildHash`. Pass it back as `expectBuild` and a call fails with `BUILD_MISMATCH` if the model was rebuilt in between.
- **GlobalIds follow the project id.** An export scopes them by the project id, which defaults to your `package.json` name, so keep it the same across exports. After an export, `get_elements` shows each element's GlobalId and accepts GlobalIds as ids.
- **IFC files are read-only.** An opened IFC file can be queried and rendered. It can't be exported again, since brepjs-bim has no way back from an imported model to one it can write.
- **Plans cut at 1200 mm.** A storey plan cuts that far above the storey's elevation, or above its lowest element, and draws from above in orthographic. Cut walls show as outlines, not filled sections.
- Up to four sessions can be open at once.
