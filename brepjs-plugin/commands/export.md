---
description: Export CAD model to STEP, GLTF, OBJ, or SVG
argument-hint: <format>
allowed-tools: [Read, Edit, Bash]
model: haiku
---

# /brepjs:export

Export to different formats.

**Formats:**

- STEP: Exact geometry (CAD)
- GLTF: Web 3D
- OBJ: Rendering
- SVG: 2D projections

**Action:**

1. Find recent brepjs .ts file
2. Add export code
3. Run file

```typescript
// STEP
await exportSTEP(model, 'output.step');

// GLTF
await exportGLTF(model, 'output.gltf', { tolerance: 0.1 });

// SVG (projections)
await exportSVG(model, 'output-top.svg', { direction: [0, 0, -1] });
```
