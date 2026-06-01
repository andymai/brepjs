/* v8 ignore file -- occt-wasm kernel not available in brepkit test suite */
/**
 * Shape construction (builder) operations for the occt-wasm adapter.
 *
 * @module
 */

import type { KernelShape, KernelType } from '@/kernel/types.js';
import type { OcctKernelWasm, OcctWasmModule } from './occtWasmTypes.js';
import {
  handle,
  isOcctWasmHandle,
  makeVecDouble,
  makeVecInt,
  makeVecU32,
  noop,
  unwrap,
  wrapResult,
} from './helpers.js';

export function makeVertex(k: OcctKernelWasm, x: number, y: number, z: number): KernelShape {
  return handle('vertex', k.makeVertex(x, y, z));
}

export function makeEdge(_k: OcctKernelWasm, curve: KernelType): KernelShape {
  if (isOcctWasmHandle(curve)) {
    throw new Error('occt-wasm: makeEdge from curve handle is not implemented');
  }
  throw new Error('occt-wasm: makeEdge is not implemented');
}

export function makeWire(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  edges: KernelShape[]
): KernelShape {
  const vec = makeVecU32(Module, edges.map(unwrap));
  try {
    return handle('wire', k.makeWire(vec));
  } finally {
    vec.delete();
  }
}

export function makeWireFromMixed(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  items: KernelShape[]
): KernelShape {
  // The native makeWire casts every input to TopoDS::Edge, so a wire input
  // throws. Explode each item to its edges first (an edge yields itself),
  // which lets a mix of edges and wires assemble into one wire.
  const edgeIds: number[] = [];
  for (const item of items) {
    const sub = k.getSubShapes(unwrap(item), 'edge');
    try {
      const n = sub.size();
      for (let i = 0; i < n; i++) edgeIds.push(sub.get(i));
    } finally {
      sub.delete();
    }
  }
  const vec = makeVecU32(Module, edgeIds);
  try {
    return handle('wire', k.makeWire(vec));
  } finally {
    vec.delete();
  }
}

export function makeFace(k: OcctKernelWasm, wire: KernelShape, _planar?: boolean): KernelShape {
  return handle('face', k.makeFace(unwrap(wire)));
}

export function makeLineEdge(
  k: OcctKernelWasm,
  p1: [number, number, number],
  p2: [number, number, number]
): KernelShape {
  return handle('edge', k.makeLineEdge(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]));
}

export function makeCircleEdge(
  k: OcctKernelWasm,
  center: [number, number, number],
  normal: [number, number, number],
  radius: number
): KernelShape {
  return handle(
    'edge',
    k.makeCircleEdge(center[0], center[1], center[2], normal[0], normal[1], normal[2], radius)
  );
}

export function makeCircleArc(
  k: OcctKernelWasm,
  center: [number, number, number],
  normal: [number, number, number],
  radius: number,
  startAngle: number,
  endAngle: number
): KernelShape {
  return handle(
    'edge',
    k.makeCircleArc(
      center[0],
      center[1],
      center[2],
      normal[0],
      normal[1],
      normal[2],
      radius,
      startAngle,
      endAngle
    )
  );
}

export function makeArcEdge(
  k: OcctKernelWasm,
  p1: [number, number, number],
  p2: [number, number, number],
  p3: [number, number, number]
): KernelShape {
  return handle(
    'edge',
    k.makeArcEdge(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2])
  );
}

export function makeEllipseEdge(
  k: OcctKernelWasm,
  center: [number, number, number],
  normal: [number, number, number],
  majorRadius: number,
  minorRadius: number
): KernelShape {
  return handle(
    'edge',
    k.makeEllipseEdge(
      center[0],
      center[1],
      center[2],
      normal[0],
      normal[1],
      normal[2],
      majorRadius,
      minorRadius
    )
  );
}

export function makeEllipseArc(
  k: OcctKernelWasm,
  center: [number, number, number],
  normal: [number, number, number],
  majorRadius: number,
  minorRadius: number,
  startAngle: number,
  endAngle: number
): KernelShape {
  return handle(
    'edge',
    k.makeEllipseArc(
      center[0],
      center[1],
      center[2],
      normal[0],
      normal[1],
      normal[2],
      majorRadius,
      minorRadius,
      startAngle,
      endAngle
    )
  );
}

export function makeBezierEdge(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  points: [number, number, number][]
): KernelShape {
  const flat: number[] = [];
  for (const p of points) flat.push(p[0], p[1], p[2]);
  const vec = makeVecDouble(Module, flat);
  try {
    return handle('edge', k.makeBezierEdge(vec));
  } finally {
    vec.delete();
  }
}

export function makeTangentArc(
  k: OcctKernelWasm,
  startPoint: [number, number, number],
  startTangent: [number, number, number],
  endPoint: [number, number, number]
): KernelShape {
  const [x1, y1, z1] = startPoint;
  const [tx, ty, tz] = startTangent;
  const [x2, y2, z2] = endPoint;
  return handle('edge', k.makeTangentArc(x1, y1, z1, tx, ty, tz, x2, y2, z2));
}

export function makeHelixWire(
  k: OcctKernelWasm,
  pitch: number,
  height: number,
  radius: number,
  center?: [number, number, number],
  direction?: [number, number, number]
): KernelShape {
  const px = center ? center[0] : 0;
  const py = center ? center[1] : 0;
  const pz = center ? center[2] : 0;
  const dx = direction ? direction[0] : 0;
  const dy = direction ? direction[1] : 0;
  const dz = direction ? direction[2] : 1;
  return handle('wire', k.makeHelixWire(px, py, pz, dx, dy, dz, pitch, height, radius));
}

export function makeCompound(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shapes: KernelShape[]
): KernelShape {
  const vec = makeVecU32(Module, shapes.map(unwrap));
  try {
    return handle('compound', k.makeCompound(vec));
  } finally {
    vec.delete();
  }
}

export function solidFromShell(k: OcctKernelWasm, shell: KernelShape): KernelShape {
  return handle('solid', k.solidFromShell(unwrap(shell)));
}

export function buildSolidFromFaces(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  points: Array<{ x: number; y: number; z: number }>,
  faces: Array<readonly [number, number, number]>,
  tolerance: number
): KernelShape {
  // Build triangle faces, sew them, and solidify.
  const faceIds: number[] = [];
  for (const [i0, i1, i2] of faces) {
    const p0 = points[i0];
    const p1 = points[i1];
    const p2 = points[i2];
    if (!p0 || !p1 || !p2) continue;
    faceIds.push(k.buildTriFace(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z));
  }
  const vec = makeVecU32(Module, faceIds);
  try {
    let sewn = k.sewAndSolidify(vec, tolerance);
    sewn = k.fixFaceOrientations(sewn);
    return wrapResult(k, sewn);
  } finally {
    vec.delete();
  }
}

export function makeNonPlanarFace(k: OcctKernelWasm, wire: KernelShape): KernelShape {
  return handle('face', k.makeNonPlanarFace(unwrap(wire)));
}

export function addHolesInFace(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  face: KernelShape,
  holeWires: KernelShape[]
): KernelShape {
  const vec = makeVecU32(Module, holeWires.map(unwrap));
  try {
    return handle('face', k.addHolesInFace(unwrap(face), vec));
  } finally {
    vec.delete();
  }
}

export function removeHolesFromFace(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  face: KernelShape
): KernelShape {
  // C++ facade takes face + hole indices to remove. Pass all inner wire indices.
  const allWires = k.getSubShapes(unwrap(face), 'wire');
  const holeCount = (() => {
    try {
      return allWires.size() - 1; // exclude outer wire
    } finally {
      allWires.delete();
    }
  })();
  const indices: number[] = [];
  for (let i = 0; i < holeCount; i++) indices.push(i);
  const vec = makeVecInt(Module, indices);
  try {
    return handle('face', k.removeHolesFromFace(unwrap(face), vec));
  } finally {
    vec.delete();
  }
}

export function makeFaceOnSurface(
  k: OcctKernelWasm,
  surface: KernelType,
  wire: KernelShape
): KernelShape {
  // brepjs-patterns-disable: no-double-cast
  const faceId = unwrap(surface);
  return handle('face', k.makeFaceOnSurface(faceId, unwrap(wire)));
}

export function bsplineSurface(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  points: [number, number, number][],
  rows: number,
  cols: number
): KernelShape {
  const vec = new Module.VectorDouble();
  for (const [x, y, z] of points) {
    vec.push_back(x);
    vec.push_back(y);
    vec.push_back(z);
  }
  try {
    return handle('face', k.bsplineSurface(vec, rows, cols));
  } finally {
    vec.delete();
  }
}

export function triangulatedSurface(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  points: [number, number, number][],
  rows: number,
  cols: number
): KernelShape {
  const faceIds: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i00 = r * cols + c;
      const i10 = (r + 1) * cols + c;
      const i01 = r * cols + (c + 1);
      const i11 = (r + 1) * cols + (c + 1);
      const p00 = points[i00];
      const p10 = points[i10];
      const p01 = points[i01];
      const p11 = points[i11];
      if (p00 && p10 && p01) {
        faceIds.push(
          k.buildTriFace(p00[0], p00[1], p00[2], p10[0], p10[1], p10[2], p01[0], p01[1], p01[2])
        );
      }
      if (p10 && p11 && p01) {
        faceIds.push(
          k.buildTriFace(p10[0], p10[1], p10[2], p11[0], p11[1], p11[2], p01[0], p01[1], p01[2])
        );
      }
    }
  }
  const vec = makeVecU32(Module, faceIds);
  try {
    return wrapResult(k, k.sewAndSolidify(vec, 1e-3));
  } finally {
    vec.delete();
  }
}

export function buildTriFace(
  k: OcctKernelWasm,
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number]
): KernelShape | null {
  const id = k.buildTriFace(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  if (id === 0) return null;
  return handle('face', id);
}

export function sewAndSolidify(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  faces: KernelShape[],
  tolerance: number
): KernelShape {
  const vec = makeVecU32(Module, faces.map(unwrap));
  try {
    let sewn = k.sewAndSolidify(vec, tolerance);
    sewn = k.fixFaceOrientations(sewn);
    return handle('solid', sewn);
  } finally {
    vec.delete();
  }
}

// ─── Geometric primitives (point/direction/vector/axis builders) ──────────

export function createPoint3d(x: number, y: number, z: number): KernelType {
  return { x, y, z, __type: 'point3d', delete: noop };
}

export function createDirection3d(x: number, y: number, z: number): KernelType {
  return { x, y, z, __type: 'direction3d', delete: noop };
}

export function createVector3d(x: number, y: number, z: number): KernelType {
  return { x, y, z, __type: 'vector3d', delete: noop };
}

export function createAxis1(
  cx: number,
  cy: number,
  cz: number,
  dx: number,
  dy: number,
  dz: number
): KernelType {
  return {
    origin: { x: cx, y: cy, z: cz },
    direction: { x: dx, y: dy, z: dz },
    __type: 'axis1',
    delete: noop,
  };
}

export function createAxis2(
  ox: number,
  oy: number,
  oz: number,
  zx: number,
  zy: number,
  zz: number,
  xx?: number,
  xy?: number,
  xz?: number
): KernelType {
  return {
    origin: { x: ox, y: oy, z: oz },
    zDir: { x: zx, y: zy, z: zz },
    xDir: xx !== undefined ? { x: xx, y: xy, z: xz } : undefined,
    __type: 'axis2',
    delete: noop,
  };
}

export function createAxis3(
  ox: number,
  oy: number,
  oz: number,
  zx: number,
  zy: number,
  zz: number,
  xx?: number,
  xy?: number,
  xz?: number
): KernelType {
  return {
    origin: { x: ox, y: oy, z: oz },
    zDir: { x: zx, y: zy, z: zz },
    xDir: xx !== undefined ? { x: xx, y: xy, z: xz } : undefined,
    __type: 'axis3',
    delete: noop,
  };
}
