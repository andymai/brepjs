# Memory Management

brepjs wraps OpenCascade (OCCT) objects which require explicit memory management. This guide explains how memory is handled and how to avoid leaks.

## Overview

OCCT objects are allocated in WebAssembly memory and must be explicitly freed. brepjs provides several mechanisms:

1. **`Symbol.dispose`** — Modern TC39 explicit resource management
2. **`gcWithScope`** — Scoped cleanup for temporary objects
3. **`FinalizationRegistry`** — Safety net for missed cleanup
4. **Manual `delete()`** — Legacy explicit cleanup

## Symbol.dispose (Recommended)

The `using` declaration automatically disposes objects when they go out of scope:

```typescript
{
  using box = makeBox([10, 10, 10]);
  using cylinder = makeCylinder(5, 20);
  const result = fuseShapes(box, cylinder);
  // box and cylinder are automatically disposed at block end
  return result;
}
```

### Requirements

- TypeScript 5.2+ with `"lib": ["ES2022", "ESNext.Disposable"]`
- Node.js 20+ or modern browsers

### Polyfill

If `Symbol.dispose` is unavailable, brepjs provides a polyfill. Objects will still work but won't auto-dispose. Use `gcWithScope` instead.

## gcWithScope

For scoped cleanup of multiple temporary objects:

```typescript
import { gcWithScope, makeBox, makeCircle } from 'brepjs';

function buildPart() {
  const r = gcWithScope();

  // Register temporaries for cleanup
  const box = r(makeBox([10, 10, 10]));
  const hole = r(makeCylinder(2, 15));

  // Result escapes the scope
  const result = cutShape(box, hole);

  // box and hole are cleaned up when function returns
  return result;
}
```

### How It Works

1. `gcWithScope()` creates a cleanup registry
2. `r(obj)` registers an object and returns it
3. When the scope exits (via FinalizationRegistry), all registered objects are disposed

### Best Practices

- Register **only** intermediate objects you won't return
- Don't register objects you need to keep
- Nest scopes for complex operations

## FinalizationRegistry Safety Net

brepjs uses `FinalizationRegistry` as a fallback:

```typescript
// If you forget to dispose, the finalizer will eventually clean up
const shape = makeBox([10, 10, 10]);
// ... shape goes out of scope without dispose
// Eventually GC runs and FinalizationRegistry disposes it
```

**Warning**: Relying on FinalizationRegistry is not recommended because:
- GC timing is unpredictable
- Memory pressure may build up before cleanup
- Not all environments support it

## Manual delete() (Legacy)

For explicit control:

```typescript
const shape = makeBox([10, 10, 10]);
try {
  doSomething(shape);
} finally {
  shape.delete();
}
```

## Environment Compatibility

| Environment | Symbol.dispose | FinalizationRegistry | Recommendation |
|-------------|----------------|----------------------|----------------|
| Node.js 20+ | ✅ | ✅ | Use `using` declaration |
| Node.js 18-19 | ❌ | ✅ | Use `gcWithScope` |
| Chrome 117+ | ✅ | ✅ | Use `using` declaration |
| Firefox 115+ | ✅ | ✅ | Use `using` declaration |
| Safari 16.4+ | ✅ | ✅ | Use `using` declaration |
| Older browsers | ❌ | ⚠️ | Use `gcWithScope` + polyfill |

### Checking Support

```typescript
const hasExplicitDispose = typeof Symbol.dispose === 'symbol';
const hasFinalizationRegistry = typeof FinalizationRegistry !== 'undefined';

if (!hasFinalizationRegistry) {
  console.warn('FinalizationRegistry unavailable - manual cleanup required');
}
```

## Common Memory Leaks

### 1. Loops Without Cleanup

```typescript
// ❌ Leaks one shape per iteration
for (let i = 0; i < 1000; i++) {
  const box = makeBox([i, 0, 0], [i + 1, 1, 1]);
}

// ✅ Proper cleanup
for (let i = 0; i < 1000; i++) {
  using box = makeBox([i, 0, 0], [i + 1, 1, 1]);
  processBox(box);
}

// ✅ Or with gcWithScope
for (let i = 0; i < 1000; i++) {
  const r = gcWithScope();
  const box = r(makeBox([i, 0, 0], [i + 1, 1, 1]));
  processBox(box);
}
```

### 2. Storing References in Arrays

```typescript
// ❌ Array prevents cleanup
const shapes: Shape[] = [];
for (let i = 0; i < 100; i++) {
  shapes.push(makeBox([i, 0, 0], [i + 1, 1, 1]));
}
// shapes still holds references

// ✅ Clear when done
shapes.length = 0;
// Or explicitly dispose each
shapes.forEach(s => s[Symbol.dispose]?.());
```

### 3. Event Handlers Holding References

```typescript
// ❌ Shape never cleaned up
button.onclick = () => {
  const shape = makeBox([10, 10, 10]);
  render(shape);
  // shape leaks on every click
};

// ✅ Clean up after use
button.onclick = () => {
  using shape = makeBox([10, 10, 10]);
  render(shape);
};
```

## Debugging Memory Issues

### Monitor Heap Size

```typescript
// Node.js
const used = process.memoryUsage().heapUsed;
console.log(`Heap: ${Math.round(used / 1024 / 1024)} MB`);

// Browser
if (performance.memory) {
  console.log(`Heap: ${performance.memory.usedJSHeapSize / 1024 / 1024} MB`);
}
```

### Track Object Count

```typescript
let activeShapes = 0;

const originalMakeBox = makeBox;
makeBox = (...args) => {
  activeShapes++;
  const shape = originalMakeBox(...args);
  const originalDispose = shape[Symbol.dispose];
  shape[Symbol.dispose] = () => {
    activeShapes--;
    originalDispose?.call(shape);
  };
  return shape;
};

// Later
console.log(`Active shapes: ${activeShapes}`);
```

## Summary

| Scenario | Recommended Approach |
|----------|---------------------|
| Simple temporary | `using shape = makeShape()` |
| Multiple temporaries | `const r = gcWithScope()` |
| Long-lived objects | Store reference, dispose when done |
| Loops | `using` in loop body |
| Legacy code | `try/finally` with `delete()` |
