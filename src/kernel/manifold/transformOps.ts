import type { KernelTransformOps, TransformEntry } from '@/kernel/interfaces/transformOps.js';
import type { KernelShape, KernelType } from '@/kernel/types.js';
import type { ManifoldModule } from './helpers.js';
import { notImplemented } from './helpers.js';
import { makeNode, type OpNode } from './opGraph.js';
import { wrap, unwrap, nodeOf, type ManifoldShape, type ManifoldSolid } from './meshHandle.js';

type Vec3 = readonly [number, number, number];
type Mat3 = readonly [number, number, number, number, number, number, number, number, number];
// Column-major 4x4 affine matrix as a flat 16-element array; last row implied [0,0,0,1].
type Mat4 = number[];

function asShape(shape: KernelShape): ManifoldShape {
  return shape as ManifoldShape;
}

function identityMatrix(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function normalizeAxis(axis: Vec3): Vec3 {
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  if (len < 1e-12) return [0, 0, 1];
  return [axis[0] / len, axis[1] / len, axis[2] / len];
}

function translationMatrix(x: number, y: number, z: number): Mat4 {
  const m = identityMatrix();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

function rotationMatrix(angleDeg: number, axis: Vec3, center: Vec3): Mat4 {
  const rad = (angleDeg * Math.PI) / 180;
  const [ax, ay, az] = normalizeAxis(axis);
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const t = 1 - c;

  const r00 = t * ax * ax + c;
  const r01 = t * ax * ay + s * az;
  const r02 = t * ax * az - s * ay;
  const r10 = t * ax * ay - s * az;
  const r11 = t * ay * ay + c;
  const r12 = t * ay * az + s * ax;
  const r20 = t * ax * az + s * ay;
  const r21 = t * ay * az - s * ax;
  const r22 = t * az * az + c;

  const m = identityMatrix();
  m[0] = r00;
  m[1] = r01;
  m[2] = r02;
  m[4] = r10;
  m[5] = r11;
  m[6] = r12;
  m[8] = r20;
  m[9] = r21;
  m[10] = r22;
  m[12] = center[0] - (r00 * center[0] + r10 * center[1] + r20 * center[2]);
  m[13] = center[1] - (r01 * center[0] + r11 * center[1] + r21 * center[2]);
  m[14] = center[2] - (r02 * center[0] + r12 * center[1] + r22 * center[2]);
  return m;
}

function scaleMatrix(center: Vec3, factor: number): Mat4 {
  const m = identityMatrix();
  m[0] = factor;
  m[5] = factor;
  m[10] = factor;
  m[12] = center[0] * (1 - factor);
  m[13] = center[1] * (1 - factor);
  m[14] = center[2] * (1 - factor);
  return m;
}

function mirrorMatrix(origin: Vec3, normal: Vec3): Mat4 {
  const [nx, ny, nz] = normalizeAxis(normal);
  const r00 = 1 - 2 * nx * nx;
  const r11 = 1 - 2 * ny * ny;
  const r22 = 1 - 2 * nz * nz;
  const r01 = -2 * nx * ny;
  const r02 = -2 * nx * nz;
  const r12 = -2 * ny * nz;

  const m = identityMatrix();
  m[0] = r00;
  m[1] = r01;
  m[2] = r02;
  m[4] = r01;
  m[5] = r11;
  m[6] = r12;
  m[8] = r02;
  m[9] = r12;
  m[10] = r22;
  const d = origin[0] * nx + origin[1] * ny + origin[2] * nz;
  m[12] = 2 * d * nx;
  m[13] = 2 * d * ny;
  m[14] = 2 * d * nz;
  return m;
}

function affineMatrix(linear: Mat3, translation: Vec3): Mat4 {
  // Source linear is row-major 3x3; manifold Mat4 columns are linear columns.
  const m = identityMatrix();
  m[0] = linear[0];
  m[1] = linear[3];
  m[2] = linear[6];
  m[4] = linear[1];
  m[5] = linear[4];
  m[6] = linear[7];
  m[8] = linear[2];
  m[9] = linear[5];
  m[10] = linear[8];
  m[12] = translation[0];
  m[13] = translation[1];
  m[14] = translation[2];
  return m;
}

function applyMatrix(
  solid: ManifoldSolid,
  matrix: Mat4,
  op: string,
  params: Readonly<Record<string, unknown>>,
  input: OpNode
): ManifoldShape {
  const next = solid.transform(matrix);
  return wrap(next, makeNode(op, params, [input]));
}

export function translate(shape: KernelShape, x: number, y: number, z: number): KernelShape {
  const s = asShape(shape);
  return applyMatrix(
    unwrap(s),
    translationMatrix(x, y, z),
    'translateShape',
    { x, y, z },
    nodeOf(s)
  );
}

export function rotate(
  shape: KernelShape,
  angle: number,
  axis: Vec3 = [0, 0, 1],
  center: Vec3 = [0, 0, 0]
): KernelShape {
  const s = asShape(shape);
  return applyMatrix(
    unwrap(s),
    rotationMatrix(angle, axis, center),
    'rotateShape',
    { angle, axis, center },
    nodeOf(s)
  );
}

export function mirror(shape: KernelShape, origin: Vec3, normal: Vec3): KernelShape {
  const s = asShape(shape);
  return applyMatrix(
    unwrap(s),
    mirrorMatrix(origin, normal),
    'mirrorShape',
    { origin, normal },
    nodeOf(s)
  );
}

export function scale(shape: KernelShape, center: Vec3, factor: number): KernelShape {
  const s = asShape(shape);
  return applyMatrix(
    unwrap(s),
    scaleMatrix(center, factor),
    'scaleShape',
    { center, factor },
    nodeOf(s)
  );
}

export function transform(shape: KernelShape, trsf: KernelType): KernelShape {
  if (!Array.isArray(trsf) || trsf.length !== 16) {
    throw new Error('manifold: transform expects a 16-element column-major matrix');
  }
  const s = asShape(shape);
  return applyMatrix(unwrap(s), trsf as Mat4, 'transformShape', { matrix: [...trsf] }, nodeOf(s));
}

export function generalTransform(
  shape: KernelShape,
  linear: Mat3,
  translation: Vec3,
  isOrthogonal: boolean
): KernelShape {
  const s = asShape(shape);
  return applyMatrix(
    unwrap(s),
    affineMatrix(linear, translation),
    'generalTransform',
    { linear, translation, isOrthogonal },
    nodeOf(s)
  );
}

export function generalTransformNonOrthogonal(
  shape: KernelShape,
  linear: Mat3,
  translation: Vec3
): KernelShape {
  const s = asShape(shape);
  return applyMatrix(
    unwrap(s),
    affineMatrix(linear, translation),
    'generalTransformNonOrthogonal',
    { linear, translation },
    nodeOf(s)
  );
}

export function composeTransform(
  ops: Array<
    | { type: 'translate'; x: number; y: number; z: number }
    | {
        type: 'rotate';
        angle: number;
        axis?: Vec3 | undefined;
        center?: Vec3 | undefined;
      }
  >
): { handle: KernelType; dispose: () => void } {
  let acc = identityMatrix();
  for (const o of ops) {
    const step =
      o.type === 'translate'
        ? translationMatrix(o.x, o.y, o.z)
        : rotationMatrix(o.angle, o.axis ?? [0, 0, 1], o.center ?? [0, 0, 0]);
    acc = multiplyMatrix(step, acc);
  }
  return { handle: acc as KernelType, dispose: () => {} };
}

export function linearPattern(
  shape: KernelShape,
  direction: [number, number, number],
  spacing: number,
  count: number
): KernelShape[] {
  const results: KernelShape[] = [shape];
  for (let i = 1; i < count; i++) {
    const offset = spacing * i;
    results.push(
      translate(shape, direction[0] * offset, direction[1] * offset, direction[2] * offset)
    );
  }
  return results;
}

export function circularPattern(
  shape: KernelShape,
  center: [number, number, number],
  axis: [number, number, number],
  angleStep: number,
  count: number
): KernelShape[] {
  const results: KernelShape[] = [shape];
  for (let i = 1; i < count; i++) {
    results.push(rotate(shape, angleStep * i, axis, center));
  }
  return results;
}

export function gridPattern(
  module: ManifoldModule,
  shape: KernelShape,
  directionX: [number, number, number],
  directionY: [number, number, number],
  spacingX: number,
  spacingY: number,
  countX: number,
  countY: number
): KernelShape {
  const s = asShape(shape);
  const solids: ManifoldSolid[] = [];
  const inputs: OpNode[] = [];
  for (let ix = 0; ix < countX; ix++) {
    for (let iy = 0; iy < countY; iy++) {
      const ox = directionX[0] * spacingX * ix + directionY[0] * spacingY * iy;
      const oy = directionX[1] * spacingX * ix + directionY[1] * spacingY * iy;
      const oz = directionX[2] * spacingX * ix + directionY[2] * spacingY * iy;
      solids.push(unwrap(s).transform(translationMatrix(ox, oy, oz)));
      inputs.push(nodeOf(s));
    }
  }
  const fused = solids.length === 1 ? solids[0] : module.Manifold.union(solids);
  return wrap(
    fused,
    makeNode('gridPattern', { directionX, directionY, spacingX, spacingY, countX, countY }, inputs)
  );
}

export function transformBatch(entries: TransformEntry[]): KernelShape[] {
  return entries.map((e) => {
    switch (e.type) {
      case 'translate':
        return translate(e.shape, e.x, e.y, e.z);
      case 'rotate':
        return rotate(e.shape, e.angle, e.axis, e.center);
      case 'scale':
        return scale(e.shape, e.center, e.factor);
      case 'mirror':
        return mirror(e.shape, e.origin, e.normal);
    }
  });
}

export function makeTransformOps(module: ManifoldModule): KernelTransformOps {
  return {
    composeTransform,
    transform,
    translate,
    rotate,
    mirror,
    scale,
    generalTransform,
    generalTransformNonOrthogonal,
    positionOnCurve: () => notImplemented('positionOnCurve'),
    linearPattern,
    circularPattern,
    gridPattern: (shape, dx, dy, sx, sy, cx, cy) =>
      gridPattern(module, shape, dx, dy, sx, sy, cx, cy),
    transformBatch,
  };
}

// Column-major 4x4 multiply: result = a * b (apply b first, then a).
function multiplyMatrix(a: Mat4, b: Mat4): Mat4 {
  const out = identityMatrix();
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        const aVal = a[k * 4 + row] ?? 0;
        const bVal = b[col * 4 + k] ?? 0;
        sum += aVal * bVal;
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}
