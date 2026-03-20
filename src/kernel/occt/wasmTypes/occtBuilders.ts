/**
 * Typed interfaces for OCCT WASM operation builders.
 *
 * These minimal interfaces cover only the methods actually used in brepjs
 * kernel code, avoiding a dependency on any specific OCCT type definition
 * package.
 */

import type { KernelShape, KernelType } from '@/kernel/types.js';

// ---------------------------------------------------------------------------
// OCCT operation builder interfaces
// ---------------------------------------------------------------------------

/** Base interface for OCCT operation builders that produce a result shape. */
export interface OcctBuilder {
  Shape(): KernelShape;
  IsDone?(): boolean;
  delete(): void;
}

/**
 * OCCT builders that support simplification of the result shape.
 * Used by boolean operations (BRepAlgoAPI_Fuse, BRepAlgoAPI_Cut, etc.).
 */
export interface OcctSimplifyBuilder extends OcctBuilder {
  SimplifyResult(unify: boolean, edges: boolean, tol: number): void;
}

/**
 * OCCT builders that track shape evolution through Modified/Generated/IsDeleted.
 * Used by BRepAlgoAPI and BRepBuilderAPI operations.
 */
export interface OcctEvolutionBuilder extends OcctBuilder {
  Modified(shape: KernelShape): KernelShape;
  Generated(shape: KernelShape): KernelShape;
  IsDeleted?(shape: KernelShape): boolean;
}

/**
 * C++ EvolutionExtractor result — packed evolution data accessed via pointers.
 * Returned by EvolutionExtractor.extract().
 */
export interface OcctEvolutionData {
  getModifiedPtr(): number;
  getModifiedSize(): number;
  getGeneratedPtr(): number;
  getGeneratedSize(): number;
  getDeletedPtr(): number;
  getDeletedSize(): number;
  delete(): void;
}

// ---------------------------------------------------------------------------
// OCCT geometry primitives
// ---------------------------------------------------------------------------

/** OCCT gp_Trsf — an affine transform. */
export interface OcctTransform {
  IsNegative(): boolean;
  Transforms_1(coords: KernelType): void;
  delete(): void;
}

/** OCCT gp_Pnt — a 3D point with XYZ access. */
export interface OcctPoint {
  XYZ(): KernelType;
  delete(): void;
}
