# Examples

Complete workflow examples demonstrating brepjs capabilities.

## Running Examples

```bash
# Install dependencies
npm install

# Run an example with tsx
npx tsx examples/basic-primitives.ts
```

## Available Examples

### [basic-primitives.ts](./basic-primitives.ts)

Create primitive shapes (box, cylinder, sphere) and perform boolean operations (fuse, cut, intersect).

**Concepts covered:**

- Creating primitive shapes
- Boolean operations
- Measuring volume
- Exporting to STEP

### [mechanical-part.ts](./mechanical-part.ts)

Create a bracket with mounting holes and a center slot.

**Concepts covered:**

- Building complex parts from primitives
- Batch boolean operations with `cutAll`
- Translating shapes
- Measuring material removal

### [2d-to-3d.ts](./2d-to-3d.ts)

Create a 2D sketch profile and extrude it to a 3D solid.

**Concepts covered:**

- Drawing API (`draw`, `drawRectangle`, `drawCircle`)
- Boolean operations on drawings
- Converting drawings to sketches
- Extruding sketches

### [import-export.ts](./import-export.ts)

Load, modify, and export CAD files in different formats.

**Concepts covered:**

- Importing STEP files
- Transforming shapes (scale, translate)
- Exporting to STEP and STL
- Generating mesh data

### [text-engraving.ts](./text-engraving.ts)

Create a nameplate with engraved text (workflow demonstration).

**Concepts covered:**

- Loading fonts
- Creating text blueprints
- Sketching on faces
- Subtractive operations for engraving

## Common Patterns

### Error Handling

All fallible operations return `Result<T, BrepError>`:

```typescript
import { fuseShapes, isOk, unwrap } from 'brepjs';

const result = fuseShapes(shape1, shape2);

// Check before using
if (isOk(result)) {
  const fused = result.value;
}

// Or unwrap (throws on error)
const fused = unwrap(result);
```

### Memory Management

Use `using` for automatic cleanup:

```typescript
{
  using tempShape = makeBox([10, 10, 10]);
  // tempShape automatically disposed at block end
}
```

### Type Casting

Convert between legacy and functional APIs:

```typescript
// Legacy shape to functional
const fnShape = castShape(legacyShape.wrapped);

// Create from functional API
const box = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
```

## Requirements

- Node.js 20+
- brepjs and brepjs-opencascade packages
- tsx or ts-node for running TypeScript directly
