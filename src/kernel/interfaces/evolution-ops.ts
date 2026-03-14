/**
 * KernelEvolutionOps — operations with shape history tracking.
 *
 * These variants of boolean, transform, and modifier operations return an
 * {@link OperationResult} containing both the result shape and a
 * {@link ShapeEvolution} record that maps input face hashes to output face
 * hashes. Used by `propagateOrigins` and other shape history systems.
 *
 * @see {@link KernelBooleanOps} for non-history boolean variants.
 * @see {@link KernelTransformOps} for non-history transform variants.
 * @see {@link KernelModifierOps} for non-history modifier variants.
 */

import type { BooleanOptions, KernelShape, KernelType, OperationResult } from '../types.js';

export interface KernelEvolutionOps {
  translateWithHistory(
    shape: KernelShape,
    x: number,
    y: number,
    z: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult;
  rotateWithHistory(
    shape: KernelShape,
    angle: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    axis?: readonly [number, number, number],
    center?: readonly [number, number, number]
  ): OperationResult;
  mirrorWithHistory(
    shape: KernelShape,
    origin: readonly [number, number, number],
    normal: readonly [number, number, number],
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult;
  scaleWithHistory(
    shape: KernelShape,
    center: readonly [number, number, number],
    factor: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult;
  generalTransformWithHistory(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number],
    isOrthogonal: boolean,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult;
  fuseWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): OperationResult;
  cutWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): OperationResult;
  intersectWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): OperationResult;
  filletWithHistory(
    shape: KernelShape,
    edges: KernelShape[],
    radius: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult;
  chamferWithHistory(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult;
  shellWithHistory(
    shape: KernelShape,
    faces: KernelShape[],
    thickness: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    tolerance?: number
  ): OperationResult;
  thickenWithHistory(
    shape: KernelShape,
    thickness: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult;
  offsetWithHistory(
    shape: KernelShape,
    distance: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    tolerance?: number
  ): OperationResult;

  /** Apply a composed transform to a shape with history tracking. */
  applyComposedTransformWithHistory(
    shape: KernelShape,
    transformHandle: KernelType,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult;
}
