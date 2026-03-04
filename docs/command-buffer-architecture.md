# Command Buffer Architecture

> **Status**: Design document — not yet implemented.
> **Author**: brepjs team
> **Created**: 2026-03-04

## Problem

Every brepjs modeling operation crosses the JS↔WASM boundary multiple times. A single `translate()` makes 5 WASM calls (allocate gp_Trsf, allocate gp_Vec, set translation, apply transform, cleanup). A typical parametric model with 10 operations makes 50–100 boundary crossings. Each crossing costs ~100ns of overhead (indirect call table lookup + argument marshaling + stack switching), and this cost is multiplicative with operation count.

For complex models (gridfinity base plates, mechanical assemblies), the aggregate boundary-crossing overhead becomes a significant fraction of total wall-clock time — even though the individual OCCT operations themselves are fast.

## Solution: Opcode Stream

Encode an entire modeling sequence as a binary opcode stream in WASM linear memory. A C++ interpreter processes all operations in a single WASM call, returning results in a pre-allocated buffer. This reduces N×M boundary crossings to exactly 2 (encode + execute).

The concept is analogous to GPU command buffers (WebGPU's `GPUCommandEncoder`) — deferred execution of a recorded command sequence — applied to a geometry kernel.

## Opcode Table

Each opcode is a u8 followed by a fixed number of f64 arguments and optional u32 shape references.

| Opcode | Name         | Args (f64)                        | Shape Refs (u32)    | Description               |
| ------ | ------------ | --------------------------------- | ------------------- | ------------------------- |
| 0x01   | BOX          | 3 (w, h, d)                       | 0                   | Create box primitive      |
| 0x02   | CYLINDER     | 2 (r, h)                          | 0                   | Create cylinder primitive |
| 0x03   | SPHERE       | 1 (r)                             | 0                   | Create sphere primitive   |
| 0x04   | CONE         | 3 (r1, r2, h)                     | 0                   | Create cone primitive     |
| 0x05   | TORUS        | 2 (major_r, minor_r)              | 0                   | Create torus primitive    |
| 0x10   | FUSE         | 0                                 | 2 (a, b)            | Boolean union             |
| 0x11   | CUT          | 0                                 | 2 (base, tool)      | Boolean subtraction       |
| 0x12   | COMMON       | 0                                 | 2 (a, b)            | Boolean intersection      |
| 0x13   | FUSE_ALL     | 0                                 | N (count prefix)    | N-ary boolean union       |
| 0x14   | CUT_ALL      | 0                                 | 1+N (base, tools…)  | Multi-tool subtraction    |
| 0x20   | FILLET       | 1 (radius)                        | 1 (shape)           | Fillet all edges          |
| 0x21   | CHAMFER      | 1 (distance)                      | 1 (shape)           | Chamfer all edges         |
| 0x22   | FILLET_EDGES | 1 (radius)                        | 1+N (shape, edges…) | Fillet specific edges     |
| 0x30   | TRANSLATE    | 3 (x, y, z)                       | 1 (shape)           | Translate                 |
| 0x31   | ROTATE       | 7 (angle, ax, ay, az, cx, cy, cz) | 1 (shape)           | Rotate around axis        |
| 0x32   | SCALE        | 4 (cx, cy, cz, factor)            | 1 (shape)           | Uniform scale             |
| 0x33   | MIRROR       | 6 (ox, oy, oz, nx, ny, nz)        | 1 (shape)           | Mirror through plane      |
| 0x40   | MESH         | 2 (tolerance, angular_tol)        | 1 (shape)           | Triangulate               |
| 0x41   | MEASURE      | 1 (flags)                         | 1 (shape)           | Volume/area/bbox          |
| 0xF0   | COPY         | 0                                 | 1 (shape)           | Copy shape ref            |
| 0xFF   | END          | 0                                 | 0                   | End of stream             |

## Memory Layout

### Command Buffer (written by JS, read by C++)

```
┌─────────────────────────────────────────────────┐
│ Header (16 bytes)                                │
│   magic: u32 = 0x42524550  ("BREP")             │
│   version: u16 = 1                               │
│   opCount: u16                                   │
│   arenaCapacity: u32                             │
│   reserved: u32                                  │
├─────────────────────────────────────────────────┤
│ Op 0: [opcode: u8] [argCount: u8] [refCount: u8]│
│       [pad: u8] [args: f64[]] [refs: u32[]]     │
├─────────────────────────────────────────────────┤
│ Op 1: ...                                        │
├─────────────────────────────────────────────────┤
│ ...                                              │
├─────────────────────────────────────────────────┤
│ Op N: [0xFF] [0] [0] [0]  (END sentinel)        │
└─────────────────────────────────────────────────┘
```

Each operation is 4-byte aligned. Arguments are 8-byte aligned f64 values. Shape references are u32 indices into the arena.

### Shape Arena (managed by C++)

```
┌───────────────────────────────────────────────┐
│ Slot 0: TopoDS_Shape  (result of op 0)        │
│ Slot 1: TopoDS_Shape  (result of op 1)        │
│ ...                                            │
│ Slot N: TopoDS_Shape  (result of op N)        │
└───────────────────────────────────────────────┘
```

Each operation produces one shape stored at `arena[opIndex]`. Shapes are referenced by their arena index (u32), not by WASM heap pointers. The arena is a contiguous C++ `std::vector<TopoDS_Shape>` allocated once and freed in a single call.

### Result Buffer (written by C++, read by JS)

```
┌─────────────────────────────────────────────────┐
│ Header (8 bytes)                                 │
│   status: u32 (0=ok, 1=error)                   │
│   errorOp: u32 (index of failing op, or 0)      │
├─────────────────────────────────────────────────┤
│ Per-op results (variable)                        │
│   For MESH ops: mesh data pointers + sizes       │
│   For MEASURE ops: measurement values            │
│   For shape ops: arena index (implicit)          │
├─────────────────────────────────────────────────┤
│ Error message (if status != 0)                   │
│   length: u32                                    │
│   chars: u8[]                                    │
└─────────────────────────────────────────────────┘
```

## C++ Interpreter Pseudocode

```cpp
class CommandInterpreter {
public:
  ResultBuffer execute(const uint8_t* commands, int commandSize) {
    // Parse header
    auto header = parseHeader(commands);
    arena_.resize(header.opCount);

    const uint8_t* cursor = commands + HEADER_SIZE;

    for (int i = 0; i < header.opCount; i++) {
      uint8_t opcode = *cursor++;
      uint8_t argCount = *cursor++;
      uint8_t refCount = *cursor++;
      cursor++; // padding

      // Align to 8 bytes for f64 args
      cursor = alignTo(cursor, 8);
      const double* args = reinterpret_cast<const double*>(cursor);
      cursor += argCount * sizeof(double);

      // Read shape refs
      const uint32_t* refs = reinterpret_cast<const uint32_t*>(cursor);
      cursor += refCount * sizeof(uint32_t);

      try {
        switch (opcode) {
          case 0x01: // BOX
            arena_[i] = makeBox(args[0], args[1], args[2]);
            break;
          case 0x10: // FUSE
            arena_[i] = fuse(arena_[refs[0]], arena_[refs[1]]);
            break;
          case 0x30: // TRANSLATE
            arena_[i] = translate(arena_[refs[0]], args[0], args[1], args[2]);
            break;
          // ... other opcodes ...
          case 0xFF: // END
            return ResultBuffer::ok();
        }
      } catch (const Standard_Failure& e) {
        return ResultBuffer::error(i, e.GetMessageString());
      }
    }

    return ResultBuffer::ok();
  }

  // Extract a shape from the arena (called from JS after execute)
  TopoDS_Shape getShape(int index) const { return arena_[index]; }

  // Free all shapes
  void clear() { arena_.clear(); }

private:
  std::vector<TopoDS_Shape> arena_;
};
```

## JS Encoder API

```typescript
import { CommandBuffer } from 'brepjs';

// Record operations (no WASM calls yet)
const buf = new CommandBuffer();
const box = buf.box(10, 10, 10); // returns ShapeRef (u32)
const cyl = buf.cylinder(5, 20);
const fused = buf.fuse(box, cyl);
const translated = buf.translate(fused, 0, 0, 5);
const filleted = buf.fillet(translated, 1);
const mesh = buf.mesh(filleted, { tolerance: 0.1 });

// Execute all operations in one WASM call
const result = buf.execute();

// Extract results
const shape = result.shape(filleted); // TopoDS_Shape
const meshData = result.meshData(mesh); // { vertices, normals, triangles }
const volume = result.measurement(filleted); // BulkMeasurement

// Cleanup
result.dispose(); // frees arena in one WASM call
```

### Implementation

```typescript
class CommandBuffer {
  private ops: Op[] = [];
  private nextRef = 0;

  box(w: number, h: number, d: number): ShapeRef {
    const ref = this.nextRef++;
    this.ops.push({ opcode: 0x01, args: [w, h, d], refs: [] });
    return ref;
  }

  fuse(a: ShapeRef, b: ShapeRef): ShapeRef {
    const ref = this.nextRef++;
    this.ops.push({ opcode: 0x10, args: [], refs: [a, b] });
    return ref;
  }

  translate(shape: ShapeRef, x: number, y: number, z: number): ShapeRef {
    const ref = this.nextRef++;
    this.ops.push({ opcode: 0x30, args: [x, y, z], refs: [shape] });
    return ref;
  }

  execute(): CommandResult {
    // Encode ops into binary buffer
    const byteLength = this.calculateBufferSize();
    const buffer = new ArrayBuffer(byteLength);
    this.encode(buffer);

    // Copy buffer into WASM linear memory
    const wasmPtr = oc._malloc(byteLength);
    new Uint8Array(oc.HEAPU8.buffer, wasmPtr, byteLength).set(new Uint8Array(buffer));

    // Single WASM call
    const interpreter = new oc.CommandInterpreter();
    const resultBuf = interpreter.execute(wasmPtr, byteLength);
    oc._free(wasmPtr);

    return new CommandResult(interpreter, resultBuf);
  }
}
```

## Error Handling

Errors are reported per-operation in the result buffer:

1. **Opcode errors**: Invalid opcode → error at that op index, subsequent ops skipped
2. **OCCT exceptions**: `Standard_Failure` caught per-op → error message includes OCCT detail
3. **Invalid refs**: Arena index out of bounds → error at that op
4. **Allocation failures**: `std::bad_alloc` → error with "out of memory" message

The error includes the failing operation index, so JS can identify which step failed and report it back to the user's modeling code.

```typescript
const result = buf.execute();
if (!result.ok) {
  console.error(`Op ${result.errorOp} failed: ${result.errorMessage}`);
  // Partial results up to errorOp are still available in the arena
}
```

## Benchmark Predictions

Based on measured boundary-crossing costs (~100ns per JS↔WASM call) and typical operation profiles:

| Scenario                    | Current Calls | Command Buffer | Predicted Speedup     |
| --------------------------- | ------------- | -------------- | --------------------- |
| Simple box + fillet         | 15            | 2              | 1.1x (OCCT dominates) |
| 6-box gridfinity plate      | 80            | 2              | 1.3x                  |
| Linear pattern ×20          | 120           | 2              | 1.5x                  |
| Complex assembly (50 ops)   | 300+          | 2              | 2-3x                  |
| Parametric replay (100 ops) | 500+          | 2              | 3-5x                  |

The speedup is most significant for:

- **High operation count**: More ops → more amortized boundary-crossing savings
- **Small per-op OCCT time**: Transforms, copies, measurements (where boundary overhead is a larger fraction of total time)
- **Parametric replay**: Re-executing an entire history is the ideal use case

For operations dominated by OCCT kernel time (complex booleans, meshing), the boundary-crossing overhead is already negligible, so the command buffer provides minimal speedup.

## Integration with Existing Architecture

The command buffer is an **opt-in optimization layer** that sits alongside the existing functional API:

```
User Code
    │
    ├── Functional API (fuse, cut, fillet, ...)  ← existing, unchanged
    │       │
    │       └── KernelAdapter → WASM calls (N per operation)
    │
    └── CommandBuffer API                        ← new, opt-in
            │
            └── Single WASM call (CommandInterpreter.execute)
```

The existing functional API remains the primary interface. The command buffer is for performance-critical paths (parametric replay, batch generation, complex assemblies) where users explicitly opt into deferred execution.

## Future Extensions

- **Conditional ops**: Branch based on measurement results (e.g., skip fillet if radius > edge length)
- **Loop ops**: Repeat a sub-sequence with varying parameters (array patterns)
- **Sub-buffers**: Compose command buffers from reusable sub-sequences
- **Async execution**: Execute command buffer on a Web Worker, return results via transferable
- **Recording mode**: Automatically record functional API calls into a command buffer for replay
