# Zero to Shape in 60 Seconds

The fastest path from `npm install` to a real 3D shape.

## Install

```bash
npm install brepjs brepjs-opencascade
```

## Create a shape

```typescript
import { box, measureVolume, exportSTEP, unwrap } from 'brepjs/quick';

// Create a box — no init needed with brepjs/quick
const b = box(30, 20, 10);

// Measure it
console.log('Volume:', measureVolume(b).toFixed(1), 'mm³');

// Export to STEP (industry-standard CAD format)
const step = unwrap(exportSTEP(b));
console.log('STEP file:', step.size, 'bytes');
```

That's it. `brepjs/quick` auto-initializes the WASM kernel via top-level await — no ceremony required.

## What just happened?

1. `brepjs/quick` loaded the OpenCascade WASM module and initialized the kernel automatically
2. `box(30, 20, 10)` created a B-Rep solid with the given width, depth, and height
3. `measureVolume` computed the exact volume (6000 mm³)
4. `exportSTEP` serialized the shape to an industry-standard CAD file

## Next steps

- **[Getting Started](./getting-started.md)** — Full tutorial with booleans, transforms, and export
- **[Cheat Sheet](./cheat-sheet.md)** — Single-page quick reference for all common operations
- **[Which API?](./which-api.md)** — Choose between the Sketcher, functional API, and Drawing API
- **[Examples](../examples/)** — 9 runnable examples from beginner to advanced
