# Compatibility Matrix

## Runtime Environments

| Environment | Tested     | Notes                       |
| ----------- | ---------- | --------------------------- |
| Node.js 24  | ✅ Primary | CI tested                   |
| Node.js 22  | ⚠️         | LTS, untested in CI         |
| Node.js 20  | ⚠️         | LTS, untested in CI         |
| Node.js 18  | ⚠️         | Untested, no Symbol.dispose |
| Deno        | 🔲         | Untested                    |
| Bun         | 🔲         | Untested                    |

## Browsers

| Browser         | Tested | Notes              |
| --------------- | ------ | ------------------ |
| Chrome 117+     | ✅     | Full support       |
| Firefox 115+    | ✅     | Full support       |
| Safari 16.4+    | ✅     | Full support       |
| Edge (Chromium) | ✅     | Same as Chrome     |
| Safari < 16.4   | ⚠️     | May need polyfills |
| IE 11           | ❌     | Not supported      |

## TypeScript

| Version | Support                    |
| ------- | -------------------------- |
| 5.9+    | ✅ Required                |
| 5.2-5.8 | ❌ Not supported (v4.0.0+) |
| 5.0-5.1 | ❌ Not supported           |
| < 5.0   | ❌ Not supported           |

### tsconfig.json Requirements

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "ESNext.Disposable"],
    "strict": true
  }
}
```

## Bundlers

| Bundler   | Tested     | Notes                     |
| --------- | ---------- | ------------------------- |
| Vite 7    | ✅ Primary | Used in development       |
| Vite 5-6  | ✅         | Works                     |
| esbuild   | ✅         | Direct usage              |
| Webpack 5 | ⚠️         | Requires externals config |
| Rollup    | ⚠️         | Requires externals config |
| Parcel    | 🔲         | Untested                  |

### WASM External

The kernel WASM module must be external. For the default `occt-wasm` kernel:

**Vite:**

```typescript
// vite.config.ts
export default defineConfig({
  optimizeDeps: {
    exclude: ['occt-wasm'],
  },
});
```

**Webpack:**

```javascript
// webpack.config.js
module.exports = {
  externals: {
    'occt-wasm': 'commonjs occt-wasm',
  },
};
```

If you use the alternative `brepjs-opencascade` kernel instead, externalize that package in the same way.

## WASM Requirements

brepjs requires WebAssembly support:

| Feature         | Required                         |
| --------------- | -------------------------------- |
| Basic WASM      | ✅                               |
| WASM Exceptions | ✅ (for brepjs-with-exceptions)  |
| WASM BigInt     | ✅                               |
| WASM Threads    | ✅ (for brepjs_threaded variant) |
| WASM SIMD       | ❌ Not used                      |

### WASM Module Variants

**occt-wasm** (default kernel):

| Module           | Size   | Features                                                        |
| ---------------- | ------ | --------------------------------------------------------------- |
| `occt-wasm.wasm` | ~21 MB | Arena-based OCCT V8, single-threaded, handle-based memory model |

**Alternative kernels** (optional peer dependencies):

| Package              | Description                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `brepjs-opencascade` | Legacy OpenCascade WASM build: `brepjs_single` (~15 MB), `brepjs_threaded` (~16 MB), `brepjs_with_exceptions` (~17 MB) |
| `brepkit-wasm`       | Alternative kernel with growing operation coverage                                                                     |

All kernels are optional peer dependencies; install whichever you need. See [Custom Kernel Guide](./kernel-swap.md) for initialization details.

## Known Limitations

### 1. WASM Memory

- Default max: 2 GB
- Complex models may require memory tuning
- Node.js: Use `--max-old-space-size=4096`

### 2. Threading

- Default (`brepjs_single`): Kernel operations are single-threaded and block the main thread
- Multi-threaded (`brepjs_threaded`): Parallel operations available, requires SharedArrayBuffer and cross-origin isolation (COOP/COEP headers)
- Consider Web Workers for heavy computation in single-threaded mode

### 3. No SSR Support

- WASM must load in a browser/Node.js context
- Server-side rendering requires dynamic import:

```typescript
// In SSR context
let brepjs;
if (typeof window !== 'undefined') {
  brepjs = await import('brepjs');
}
```

## Feature Detection

```typescript
// Check WASM support
const hasWasm = typeof WebAssembly !== 'undefined';

// Check BigInt support (required)
const hasBigInt = typeof BigInt !== 'undefined';

// Check explicit resource management
const hasDispose = typeof Symbol.dispose === 'symbol';

// Check FinalizationRegistry
const hasFinReg = typeof FinalizationRegistry !== 'undefined';

if (!hasWasm || !hasBigInt) {
  throw new Error('brepjs requires WebAssembly and BigInt support');
}
```

## Tested Configurations

The following configurations are tested in CI:

```yaml
- Node.js 24 on Ubuntu
- Build: Vite 7, TypeScript 5.9
- Tests: Vitest 4
- Coverage: V8 provider
```

For other configurations, please report issues at [GitHub](https://github.com/andymai/brepjs/issues).
