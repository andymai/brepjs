/**
 * Curve query operations for the occt-wasm adapter.
 *
 * @module
 */

import type { KernelShape, NurbsCurveData } from '@/kernel/types.js';
import type { OcctKernelWasm, OcctWasmModule } from './occtWasmTypes.js';
import { handle, makeVecDouble, unwrap } from './helpers.js';

const CURVE_TYPE_MAP: Record<string, string> = {
  line: 'LINE',
  circle: 'CIRCLE',
  ellipse: 'ELLIPSE',
  hyperbola: 'HYPERBOLA',
  parabola: 'PARABOLA',
  bezier: 'BEZIER_CURVE',
  bspline: 'BSPLINE_CURVE',
  offset: 'OFFSET_CURVE',
  other: 'OTHER_CURVE',
};

export function curveType(k: OcctKernelWasm, shape: KernelShape): string {
  const t = k.curveType(unwrap(shape));
  return CURVE_TYPE_MAP[t] ?? t.toUpperCase();
}

export function curveParameters(k: OcctKernelWasm, shape: KernelShape): [number, number] {
  const vec = k.curveParameters(unwrap(shape));
  try {
    return [vec.get(0), vec.get(1)];
  } finally {
    vec.delete();
  }
}

export function curvePointAtParam(
  k: OcctKernelWasm,
  shape: KernelShape,
  param: number
): [number, number, number] {
  const vec = k.curvePointAtParam(unwrap(shape), param);
  try {
    return [vec.get(0), vec.get(1), vec.get(2)];
  } finally {
    vec.delete();
  }
}

export function curveTangent(
  k: OcctKernelWasm,
  shape: KernelShape,
  param: number
): { point: [number, number, number]; tangent: [number, number, number] } {
  const tvec = k.curveTangent(unwrap(shape), param);
  try {
    const pvec = k.curvePointAtParam(unwrap(shape), param);
    try {
      return {
        point: [pvec.get(0), pvec.get(1), pvec.get(2)],
        tangent: [tvec.get(0), tvec.get(1), tvec.get(2)],
      };
    } finally {
      pvec.delete();
    }
  } finally {
    tvec.delete();
  }
}

export function curveIsClosed(k: OcctKernelWasm, shape: KernelShape): boolean {
  // C++ handles both wires (BRep_Tool::IsClosed) and edges (BRepAdaptor_Curve::IsClosed)
  return k.curveIsClosed(unwrap(shape));
}

export function curveIsPeriodic(k: OcctKernelWasm, shape: KernelShape): boolean {
  return k.curveIsPeriodic(unwrap(shape));
}

export function curvePeriod(_k: OcctKernelWasm, _shape: KernelShape): number {
  // Periodic curves in OCCT always have period 2π
  return 2 * Math.PI;
}

export function interpolatePoints(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  points: [number, number, number][],
  options?: { periodic?: boolean; tolerance?: number }
): KernelShape {
  const flat: number[] = [];
  for (const p of points) flat.push(p[0], p[1], p[2]);
  const vec = makeVecDouble(Module, flat);
  try {
    const id = k.interpolatePoints(vec, options?.periodic ?? false);
    return handle('edge', id);
  } finally {
    vec.delete();
  }
}

export function approximatePoints(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  points: [number, number, number][],
  options?: {
    tolerance?: number;
    degMin?: number;
    degMax?: number;
    smoothing?: [number, number, number] | null;
  }
): KernelShape {
  const flat: number[] = [];
  for (const p of points) flat.push(p[0], p[1], p[2]);
  const vec = makeVecDouble(Module, flat);
  try {
    const id = k.approximatePoints(vec, options?.tolerance ?? 1e-3);
    return handle('edge', id);
  } finally {
    vec.delete();
  }
}

export function getNurbsCurveData(k: OcctKernelWasm, edge: KernelShape): NurbsCurveData | null {
  try {
    const data = k.getNurbsCurveData(unwrap(edge));
    try {
      const nPoles = data.poles.size() / 3;
      const poles: [number, number, number][] = [];
      for (let i = 0; i < nPoles; i++) {
        poles.push([data.poles.get(i * 3), data.poles.get(i * 3 + 1), data.poles.get(i * 3 + 2)]);
      }
      const knots: number[] = [];
      for (let i = 0; i < data.knots.size(); i++) knots.push(data.knots.get(i));
      const multiplicities: number[] = [];
      for (let i = 0; i < data.multiplicities.size(); i++)
        multiplicities.push(data.multiplicities.get(i));
      const weights: number[] = [];
      if (data.rational) {
        for (let i = 0; i < data.weights.size(); i++) weights.push(data.weights.get(i));
      } else {
        for (let i = 0; i < nPoles; i++) weights.push(1);
      }
      return {
        degree: data.degree,
        poles,
        weights,
        knots,
        multiplicities,
        isPeriodic: data.periodic,
        isRational: data.rational,
      };
    } finally {
      data.delete();
    }
  } catch {
    return null;
  }
}
