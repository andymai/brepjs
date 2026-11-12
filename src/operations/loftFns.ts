/**
 * Functional loft operation using branded shape types.
 */

import { getKernel } from '@/kernel/index.js';
import type { PointInput } from '@/core/types.js';
import { toVec3 } from '@/core/types.js';
import type { Dimension, Edge, Face, Wire, Shape3D } from '@/core/shapeTypes.js';
import type { KernelLoftEnd } from '@/kernel/interfaces/sweepOps.js';
import { isUnsupportedKernelOperationError } from '@/kernel/unsupported.js';
import { castResultShape, disposeResultShape, isShape3D } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import {
  typeCastError,
  validationError,
  kernelError,
  unsupportedError,
  BrepErrorCode,
  type BrepError,
} from '@/core/errors.js';

/**
 * How a loft's surface leaves its first or last profile: `'free'` (the
 * default), `'normal'` to the profile's plane, or `'tangent'` to a face the
 * profile lies on. A weight scales the derivative from its natural size; a
 * negative weight on `'tangent'` leaves on the profile's other side.
 */
export type LoftEndCondition =
  | 'free'
  | 'normal'
  | { kind: 'normal'; weight?: number }
  | { kind: 'tangent'; face: Face<Dimension>; weight?: number };

/** Configuration for the functional loft operation. */
export interface LoftOptions {
  /**
   * Use ruled (straight) interpolation between profiles. Defaults to `true`,
   * and to `false` with rails or an end condition, which a ruled loft cannot follow.
   */
  ruled?: boolean;
  /** Guide rails: edges or wires, each through one vertex of every profile. */
  rails?: ReadonlyArray<Edge<Dimension> | Wire<Dimension>>;
  /** How the surface leaves the first profile. Defaults to `'free'`. */
  start?: LoftEndCondition;
  /** How the surface leaves the last profile. Defaults to `'free'`. */
  end?: LoftEndCondition;
  /** Optional start vertex before the first wire profile. */
  startPoint?: PointInput;
  /** Optional end vertex after the last wire profile. */
  endPoint?: PointInput;
  /** Sewing tolerance for ThruSections builder. Defaults to `1e-6`. */
  tolerance?: number;
}

/**
 * Loft through a set of wire profiles to create a 3D shape.
 *
 * Builds a `BRepOffsetAPI_ThruSections` surface through the given wires,
 * optionally starting and/or ending at point vertices. Produces a solid
 * by default, or a shell when `returnShell` is `true`.
 *
 * @param wires - Ordered wire profiles to loft through.
 * @param config - Loft configuration (ruled interpolation, start/end points).
 * @param returnShell - When `true`, return a shell instead of a solid.
 * @returns `Result` containing the lofted 3D shape, or an error on failure.
 *
 * @example
 * ```ts
 * const result = loft([bottomWire, topWire], { ruled: false });
 * ```
 *
 * @see {@link loft!loft | loft} for the OOP API equivalent.
 */
export function loft(
  wires: Wire<Dimension>[],
  config: LoftOptions = {},
  returnShell = false
): Result<Shape3D> {
  const { ruled = true, startPoint, endPoint, tolerance = 1e-6 } = config;
  if (wires.length === 0 && !startPoint && !endPoint) {
    return err(validationError('LOFT_EMPTY', 'Loft requires at least one wire or start/end point'));
  }
  if (isGuided(config)) return loftGuided(wires, config, returnShell);

  const kernel = getKernel();

  const startVertex = startPoint ? kernel.makeVertex(...toVec3(startPoint)) : undefined;
  const endVertex = endPoint ? kernel.makeVertex(...toVec3(endPoint)) : undefined;

  try {
    const shape = kernel.loftAdvanced(
      wires.map((w) => w.wrapped),
      {
        solid: !returnShell,
        ruled,
        tolerance,
        ...(startVertex ? { startVertex } : {}),
        ...(endVertex ? { endVertex } : {}),
      }
    );

    const result = castResultShape(shape);
    if (!isShape3D(result)) {
      disposeResultShape(result);
      return err(typeCastError('LOFT_NOT_3D', 'Loft did not produce a 3D shape'));
    }
    return ok(result);
  } catch (e) {
    if (isUnsupportedKernelOperationError(e)) {
      return err(
        unsupportedError(
          BrepErrorCode.UNSUPPORTED_CAPABILITY,
          `loft: the ${kernel.kernelId} kernel cannot build this loft (${e instanceof Error ? e.message : String(e)})`,
          e,
          { kernel: kernel.kernelId, operation: 'loft' }
        )
      );
    }
    return err(
      kernelError(
        'LOFT_FAILED',
        'Loft operation failed',
        e,
        undefined,
        'Common causes: wire profiles with different edge counts, self-intersecting result, or profiles too far apart. Ensure profiles are compatible and ordered.'
      )
    );
  }
}

function kernelLoftEnd(end: LoftEndCondition | undefined): KernelLoftEnd | undefined {
  if (end === undefined || end === 'free') return undefined;
  if (end === 'normal') return { kind: 'normal' };
  if (end.kind === 'normal') return { kind: 'normal', weight: end.weight };
  return { kind: 'tangent', face: end.face.wrapped, weight: end.weight };
}

function isGuided({ rails, start, end }: LoftOptions): boolean {
  return (
    (rails !== undefined && rails.length > 0) ||
    kernelLoftEnd(start) !== undefined ||
    kernelLoftEnd(end) !== undefined
  );
}

function guidedLoftUnsupported(kernelId: string, cause?: unknown): BrepError {
  const raw = cause instanceof Error ? ` (${cause.message})` : '';
  return unsupportedError(
    BrepErrorCode.UNSUPPORTED_CAPABILITY,
    `loft: the ${kernelId} kernel cannot loft along rails or under end conditions${raw}`,
    cause,
    { kernel: kernelId, operation: 'loft' },
    'Drop the rails and end conditions, or use the brepkit kernel'
  );
}

/** Loft along rails and under end conditions, which only some kernels build. */
function loftGuided(
  wires: Wire<Dimension>[],
  { ruled, rails, start, end, startPoint, endPoint, tolerance }: LoftOptions,
  returnShell: boolean
): Result<Shape3D> {
  if (ruled === true || startPoint !== undefined || endPoint !== undefined) {
    return err(
      validationError(
        'LOFT_GUIDED_OPTIONS',
        'loft: rails and end conditions build a smooth surface that closes on its profiles, so they take no ruled: true, startPoint or endPoint'
      )
    );
  }
  const kernel = getKernel();
  if (!kernel.loftGuided) return err(guidedLoftUnsupported(kernel.kernelId));
  try {
    const shape = kernel.loftGuided(
      wires.map((w) => w.wrapped),
      {
        solid: !returnShell,
        tolerance,
        rails: rails?.map((r) => r.wrapped),
        start: kernelLoftEnd(start),
        end: kernelLoftEnd(end),
      }
    );
    const result = castResultShape(shape);
    if (!isShape3D(result)) {
      disposeResultShape(result);
      return err(typeCastError('LOFT_NOT_3D', 'Loft did not produce a 3D shape'));
    }
    return ok(result);
  } catch (e) {
    if (isUnsupportedKernelOperationError(e)) return err(guidedLoftUnsupported(kernel.kernelId, e));
    const raw = e instanceof Error ? e.message : String(e);
    return err(
      kernelError(
        'LOFT_FAILED',
        `Loft operation failed: ${raw}`,
        e,
        { operation: 'loft' },
        'Each rail must pass through one vertex of every profile, in profile order, and a tangent end needs its profile to lie on the face.'
      )
    );
  }
}

/** Configuration for a single entry in a batch loft operation. */
export interface LoftAllEntry {
  /** Ordered wire profiles to loft through. */
  wires: Wire<Dimension>[];
  /** Use ruled (straight) interpolation. Defaults to `true`. */
  ruled?: boolean;
  /** Optional start point before the first wire. */
  startPoint?: PointInput;
  /** Optional end point after the last wire. */
  endPoint?: PointInput;
  /** Sewing tolerance. Defaults to `1e-6`. */
  tolerance?: number;
}

/**
 * Batch loft: build N independent lofts in a single kernel call.
 *
 * Uses the C++ LoftBatch extractor when available (single WASM call),
 * falling back to N individual loft operations otherwise.
 *
 * @returns Array of 3D shapes, one per entry.
 */
export function loftAll(entries: readonly LoftAllEntry[]): Result<Shape3D[]> {
  if (entries.length === 0) return ok([]);

  const kernel = getKernel();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WASM vertex handles
  const verticesToDelete: any[] = [];
  const kernelEntries = entries.map((e) => {
    const startVertex = e.startPoint ? kernel.makeVertex(...toVec3(e.startPoint)) : undefined;
    const endVertex = e.endPoint ? kernel.makeVertex(...toVec3(e.endPoint)) : undefined;
    if (startVertex) verticesToDelete.push(startVertex);
    if (endVertex) verticesToDelete.push(endVertex);
    return {
      wires: e.wires.map((w) => w.wrapped),
      solid: true,
      ruled: e.ruled ?? true,
      tolerance: e.tolerance ?? 1e-6,
      startVertex,
      endVertex,
    };
  });

  try {
    const shapes =
      kernel.loftBatch?.(kernelEntries) ??
      kernelEntries.map((e) =>
        kernel.loftAdvanced(e.wires, {
          solid: e.solid,
          ruled: e.ruled,
          tolerance: e.tolerance,
          startVertex: e.startVertex,
          endVertex: e.endVertex,
        })
      );

    const results: Shape3D[] = [];
    for (const shape of shapes) {
      const cast = castResultShape(shape);
      if (!isShape3D(cast)) {
        disposeResultShape(cast);
        return err(typeCastError('LOFT_ALL_NOT_3D', 'Batch loft entry did not produce a 3D shape'));
      }
      results.push(cast);
    }
    return ok(results);
  } catch (e) {
    return err(kernelError('LOFT_ALL_FAILED', 'Batch loft operation failed', e));
  } finally {
    for (const v of verticesToDelete) kernel.dispose(v);
  }
}
