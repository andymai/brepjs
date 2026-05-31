/**
 * Op-graph node — the recorded intent behind every manifold shape.
 *
 * Each native manifold operation runs on the mesh AND records an {@link OpNode}
 * capturing its exact parameters (radii, axes, selection predicates, profile
 * outlines). The replay engine ({@link ./replay.js}) walks this graph to
 * reconstruct a true B-rep on another kernel.
 *
 * `OpKind` is intentionally an open string union rather than an enum: op names
 * are validated at replay time against the handler table and the replayable set
 * in {@link ./helpers.js}, not by the type system. The op names currently
 * produced across the adapter are:
 *
 * - primitives: makeBox, makeBoxWithCorners, makeCylinder, makeSphere, makeCone,
 *   makeTorus, makeEllipsoid
 * - booleans: makeFuse, makeCut, makeCommon, section, split
 * - transforms: translateShape, rotateShape, scaleShape, mirrorShape,
 *   transformShape, generalTransform, generalTransformNonOrthogonal, gridPattern
 * - sweeps: extrude, revolve, revolveVec, loft, loftAdvanced, sweep, simplePipe,
 *   sweepWithOptions, sweepPipeShell, helicalSweep, draftPrism
 * - modifiers: fillet, chamfer, chamferDistAngle, shell, thicken, offset,
 *   filletVariable, draft, defeature, simplify, reverseShape
 * - builders: hull, hullFromPoints, sewAndSolidify
 * - non-replayable origins: importMesh, importSTEP, importIGES, fromBREP, spine
 *
 * @module
 */

import { opIsReplayable } from './helpers.js';

export type OpKind = string;

export interface OpNode {
  readonly op: OpKind;
  readonly params: Readonly<Record<string, unknown>>;
  readonly inputs: readonly OpNode[];
  readonly replayable: boolean;
}

export function makeNode(
  op: OpKind,
  params: Readonly<Record<string, unknown>>,
  inputs: readonly OpNode[]
): OpNode {
  const replayable = opIsReplayable(op) && inputs.every((input) => input.replayable);
  return { op, params, inputs, replayable };
}
