# Memory Management

WASM objects aren't garbage-collected — you have to clean them up. brepjs gives you four ways to do it, from modern to legacy:

1. **`Symbol.dispose`** -- Modern TC39 explicit resource management
2. **`DisposalScope`** -- Scoped cleanup for multiple temporaries
3. **`FinalizationRegistry`** -- Safety net for missed cleanup
4. **Manual `delete()`** -- Legacy explicit cleanup

## Symbol.dispose (Recommended)

The `using` declaration automatically disposes objects when they go out of scope:

```typescript
{
  using b = box(10, 10, 10);
  using cyl = cylinder(5, 20);
  const result = fuse(b, cyl);
  // b and cyl are automatically disposed at block end
  return result;
}
```

### Requirements

- TypeScript 5.9+ with `"lib": ["ES2022", "ESNext.Disposable"]`
- Node.js 20+ or modern browsers

> **Note:** TypeScript 5.9 is required for proper `using` syntax support in brepjs v4.0.0+.

### Polyfill

If `Symbol.dispose` is unavailable, brepjs provides a polyfill. Objects will still work but won't auto-dispose. Use `DisposalScope` instead.

## DisposalScope

For scoped cleanup of multiple temporary objects:

```typescript
import { DisposalScope, box, cylinder, cut } from 'brepjs';

function buildPart() {
  using scope = new DisposalScope();

  // Register temporaries for cleanup
  const b = scope.register(box(10, 10, 10));
  const hole = scope.register(cylinder(2, 15));

  // Result escapes the scope
  return cut(b, hole);
  // b and hole are freed when scope exits
}
```

### How It Works

1. `new DisposalScope()` creates a scope that tracks resources
2. `scope.register(obj)` registers an object for cleanup and returns it
3. When the scope is disposed (via `using` or `scope[Symbol.dispose]()`), all registered objects are freed in LIFO order
4. Cleanup is deterministic — it happens at scope exit, not when GC runs

### Best Practices

- Register **only** intermediate objects you won't return
- Don't register objects you need to keep
- Use `using scope = new DisposalScope()` for automatic cleanup at block exit
- Nest scopes for complex operations

## FinalizationRegistry Safety Net

brepjs uses `FinalizationRegistry` as a fallback:

```typescript
// If you forget to dispose, the finalizer will eventually clean up
const shape = box(10, 10, 10);
// ... shape goes out of scope without dispose
// Eventually GC runs and FinalizationRegistry disposes it
```

**Warning**: Do not rely on FinalizationRegistry — GC timing is unpredictable and memory pressure may build up before cleanup.

## Manual delete() (Legacy)

For explicit control:

```typescript
const shape = box(10, 10, 10);
try {
  doSomething(shape);
} finally {
  shape.delete();
}
```

## Environment Compatibility

| Environment    | Symbol.dispose | FinalizationRegistry | Recommendation          |
| -------------- | -------------- | -------------------- | ----------------------- |
| Node.js 20+    | ✅             | ✅                   | Use `using` declaration |
| Node.js 18-19  | ❌             | ✅                   | Use `DisposalScope`     |
| Chrome 117+    | ✅             | ✅                   | Use `using` declaration |
| Firefox 115+   | ✅             | ✅                   | Use `using` declaration |
| Safari 16.4+   | ✅             | ✅                   | Use `using` declaration |
| Older browsers | ❌             | ⚠️                   | Use `DisposalScope`     |

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
  const b = box(1, 1, 1);
}

// ✅ Proper cleanup
for (let i = 0; i < 1000; i++) {
  using b = box(1, 1, 1);
  processBox(b);
}

// ✅ Or with DisposalScope
for (let i = 0; i < 1000; i++) {
  using scope = new DisposalScope();
  const b = scope.register(box(1, 1, 1));
  processBox(b);
}
```

### 2. Storing References in Arrays

```typescript
// ❌ Array prevents cleanup
const shapes: Shape[] = [];
for (let i = 0; i < 100; i++) {
  shapes.push(box(1, 1, 1));
}
// shapes still holds references

// ✅ Clear when done
shapes.length = 0;
// Or explicitly dispose each
shapes.forEach((s) => s[Symbol.dispose]?.());
```

### 3. Event Handlers Holding References

```typescript
// ❌ Shape never cleaned up
button.onclick = () => {
  const shape = box(10, 10, 10);
  render(shape);
  // shape leaks on every click
};

// ✅ Clean up after use
button.onclick = () => {
  using shape = box(10, 10, 10);
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

const originalBox = box;
box = (...args) => {
  activeShapes++;
  const shape = originalBox(...args);
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

| Scenario             | Recommended Approach                             |
| -------------------- | ------------------------------------------------ |
| Simple temporary     | `using shape = makeShape()`                      |
| Multiple temporaries | `using scope = new DisposalScope()` + `register` |
| Long-lived objects   | Store reference, dispose when done               |
| Loops                | `using` in loop body                             |
| Legacy code          | `try/finally` with `delete()`                    |
