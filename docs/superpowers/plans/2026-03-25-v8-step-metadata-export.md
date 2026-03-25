# V8 STEP Metadata Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose OCCT V8's enhanced STEP metadata export capabilities — General Attributes and richer property roundtripping — through brepjs's `exportSTEPConfigured()` API.

**Architecture:** Extends the existing XCAF-based STEP export path in `advancedOps.ts` to include General Attributes when provided. Requires adding V8 STEP metadata classes to WASM bindings and extending the `StepExportPart` type with optional metadata fields.

**Tech Stack:** TypeScript, C++ (XCAF document handling), STEP AP242

**Prerequisites:** Plan 2 (new capabilities) binding additions should be batched with this plan's bindings in a single Docker rebuild.

---

## File Structure

| File                                                  | Purpose                                           |
| ----------------------------------------------------- | ------------------------------------------------- |
| `packages/brepjs-opencascade/build-config/brepjs.yml` | Add STEP metadata symbols                         |
| `src/kernel/occt/advancedOps.ts:1072-1167`            | Extend `exportSTEPConfigured` with metadata       |
| `src/io/stepConfigFns.ts`                             | Extend `StepExportPart` type with metadata fields |
| `src/kernel/interfaces/ioOps.ts`                      | Update `exportSTEPConfigured` interface           |
| `tests/exporterFns.test.ts`                           | Add metadata roundtrip tests                      |

---

### Task 1: Investigate V8 STEP metadata classes

- [ ] **Step 1: Check available General Attribute classes**

```bash
distrobox-host-exec docker run --rm --entrypoint bash ghcr.io/andymai/opencascade.js:v8 -c '
  grep -r "GeneralAttribute\|XCAFDoc_Note\|XCAFDoc_Material\|StepRepr_PropertyDefinition" /occt/src --include="*.hxx" -l | head -20
'
```

- [ ] **Step 2: Check XCAFDoc for new metadata tools**

```bash
distrobox-host-exec docker run --rm --entrypoint bash ghcr.io/andymai/opencascade.js:v8 -c '
  ls /occt/src/*/TKXCAF/XCAFDoc/ | grep -i "note\|material\|prop\|attr" | head -20
'
```

- [ ] **Step 3: Document findings and available classes**

Record which metadata types are available:

- `XCAFDoc_Note` — annotations/comments
- `XCAFDoc_Material` — material properties
- General Attributes — custom key-value metadata
- `SurfaceStyleReflectanceAmbientDiffuse` — visual properties

---

### Task 2: Extend StepExportPart with metadata

**Files:**

- Modify: `src/io/stepConfigFns.ts`
- Modify: `src/kernel/interfaces/ioOps.ts`

- [ ] **Step 1: Read current StepExportPart type**

Read: `src/io/stepConfigFns.ts`

- [ ] **Step 2: Extend the type with optional metadata**

```typescript
// Extend existing StepExportPart (preserving readonly, Dimension generic, | undefined):
export interface StepExportPart<D extends Dimension = '3D'> {
  readonly shape: AnyShape<D>;
  readonly name?: string | undefined;
  readonly color?: readonly [number, number, number, number] | undefined;
  // V8: optional metadata for STEP General Attributes
  readonly metadata?: Readonly<Record<string, string | number | boolean>> | undefined;
  readonly material?:
    | {
        readonly name: string;
        readonly density?: number | undefined;
        readonly description?: string | undefined;
      }
    | undefined;
}
```

- [ ] **Step 3: Update kernel interface**

In `src/kernel/interfaces/ioOps.ts`, update `exportSTEPConfigured` shapes param to accept the new metadata fields.

- [ ] **Step 4: Commit type changes**

```bash
git commit -m "feat(io): extend StepExportPart with metadata and material fields"
```

---

### Task 3: Implement metadata in XCAF export

**Files:**

- Modify: `src/kernel/occt/advancedOps.ts:1088-1145` (XCAF metadata path)
- Modify: `packages/brepjs-opencascade/build-config/brepjs.yml` (add STEP metadata symbols)

- [ ] **Step 1: Add required symbols to brepjs.yml**

```yaml
# STEP metadata (V8)
- symbol: XCAFDoc_Note
- symbol: XCAFDoc_Material
- symbol: XCAFDoc_NotesTool
- symbol: XCAFDoc_MaterialTool
```

**NOTE:** Verify exact class names from step 1 investigation.

- [ ] **Step 2: Extend the XCAF export path in advancedOps.ts**

In the XCAF metadata section (after setting name and color), add:

```typescript
// V8: attach General Attributes (key-value metadata)
if (part.metadata && typeof oc.XCAFDoc_NotesTool !== 'undefined') {
  const notesTool = oc.XCAFDoc_NotesTool.Set(doc);
  for (const [key, value] of Object.entries(part.metadata)) {
    const noteStr = `${key}=${String(value)}`;
    notesTool.CreateComment(shapeNode, new oc.TCollection_ExtendedString_2(noteStr, true));
  }
  notesTool.delete();
}

// V8: attach material properties
if (part.material && typeof oc.XCAFDoc_MaterialTool !== 'undefined') {
  const materialTool = oc.XCAFDoc_MaterialTool.Set(doc);
  materialTool.SetMaterial(
    shapeNode,
    new oc.TCollection_HAsciiString_2(part.material.name),
    new oc.TCollection_HAsciiString_2(part.material.description ?? ''),
    part.material.density ?? 0,
    new oc.TCollection_HAsciiString_2(''), // density name
    new oc.TCollection_HAsciiString_2('') // density value type
  );
  materialTool.delete();
}
```

**NOTE:** The exact XCAFDoc API may differ — adapt after investigation. Feature-detect to maintain V7 compatibility.

- [ ] **Step 3: Write roundtrip test**

In `tests/exporterFns.test.ts`:

```typescript
describe('STEP metadata export', () => {
  it('exports with metadata (name + color + custom attributes)', () => {
    const result = exportSTEPConfigured([
      {
        shape: box(10, 10, 10),
        name: 'TestBox',
        color: [255, 0, 0, 1],
        metadata: { partNumber: 'P-001', revision: 3 },
      },
    ]);
    expect(result).toContain('HEADER');
    expect(result).toContain('TestBox');
    // Metadata may appear as STEP General Attributes
    // The exact STEP entity depends on OCCT's export mapping
  });

  it('exports with material properties', () => {
    const result = exportSTEPConfigured([
      {
        shape: box(10, 10, 10),
        name: 'SteelBox',
        material: { name: 'Steel', density: 7850, description: 'Carbon steel' },
      },
    ]);
    expect(result).toContain('HEADER');
    expect(result).toContain('SteelBox');
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/exporterFns.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/brepjs-opencascade/build-config/brepjs.yml \
  src/kernel/occt/advancedOps.ts src/io/stepConfigFns.ts \
  src/kernel/interfaces/ioOps.ts tests/exporterFns.test.ts
git commit -m "feat(io): STEP metadata export with General Attributes and materials"
```

---

## Docker Rebuild Note

Batch the symbol additions from this plan with Plans 1 and 2 into a single Docker rebuild. The STEP metadata classes are small additions that won't significantly impact binary size.
