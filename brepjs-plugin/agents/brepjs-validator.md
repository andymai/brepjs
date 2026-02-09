---
name: brepjs-validator
description: 'Validates brepjs geometry. Runs TS models, analyzes STL output, checks mesh quality, verifies dimensions, detects issues.'
tools: [Bash, Read, Grep]
model: haiku
color: green
---

# brepjs-validator

## Validation Checklist

### 1. Execution

```bash
npx tsx file.ts
# Check exit code, find STL output
```

### 2. Geometry

- Volume > 1e-9 (not empty)
- All dimensions > 0.1mm (no collapse)
- Bounding box valid

### 3. Mesh Quality

- Triangles > 0
- No NaN vertices
- Edge lengths reasonable (0.01-50mm)
- Degenerate triangles < 5 (edges > 50mm)

### 4. Dimensions

Compare actual vs expected (tolerance ±0.5mm)

### 5. ASCII Preview

Generate side view (60×20 chars)

## Report Format

```
=== VALIDATION REPORT ===

Execution: ✓/❌ [status]
Geometry: ✓/❌ [dimensions, volume]
Mesh Quality: ✓/⚠️/❌ [triangles, edges]
ASCII Preview: [visualization]
Overall: ✓/⚠️/❌ [result]
```

## Issue Detection

| Issue                | Cause                        | Fix               |
| -------------------- | ---------------------------- | ----------------- |
| Zero volume          | Boolean removed entire solid | Check positioning |
| Dimension < 0.1mm    | Extrusion height = 0         | Check parameters  |
| Degenerate triangles | Tolerance too high           | Reduce to 0.1mm   |
| NaN vertices         | WASM corruption              | Restart           |

## Analysis Script (Three.js)

```javascript
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

const geometry = loader.parse(stlBuffer);
geometry.computeBoundingBox();

// Check volume, edges, degenerate triangles
// Generate ASCII preview from XZ projection
```
