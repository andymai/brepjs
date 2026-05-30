import type { ConstraintSketchCapability } from '@/kernel/types.js';
import type { ManifoldModule } from './helpers.js';
import { notImplemented } from './helpers.js';

export function makeConstraintSketchOps(_module: ManifoldModule): ConstraintSketchCapability {
  return {
    sketchNew: () => notImplemented('sketchNew'),
    sketchAddPoint: () => notImplemented('sketchAddPoint'),
    sketchAddArc: () => notImplemented('sketchAddArc'),
    sketchAddConstraint: () => notImplemented('sketchAddConstraint'),
    sketchSolve: () => notImplemented('sketchSolve'),
    sketchDof: () => notImplemented('sketchDof'),
  };
}
