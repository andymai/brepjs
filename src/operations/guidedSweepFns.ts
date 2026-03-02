/**
 * Guide curve sweep via BRepOffsetAPI_MakePipeShell with auxiliary spine.
 *
 * Uses guide wires to control the evolution of a profile along a spine.
 */

import { getKernel } from '../kernel/index.js';
import type { Wire, Solid, Shell } from '../core/shapeTypes.js';
import { castShape, isShape3D } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { kernelError, typeCastError, BrepErrorCode } from '../core/errors.js';

/** Options for guide curve sweep. */
export interface GuidedSweepOptions {
  /** Transition mode at spine vertices. Defaults to 'transformed'. */
  transition?: 'transformed' | 'round' | 'right';
  /** Produce a solid (true) or shell (false). Defaults to true. */
  solid?: boolean;
  /** Builder tolerance. When set, passed to SetTolerance. */
  tolerance?: number;
}

/**
 * Sweep a profile wire along a spine, using guide wires to control shape evolution.
 *
 * The first guide wire is used as an auxiliary spine via `SetMode_5`, which
 * controls how the profile orientation evolves along the path.
 *
 * @param profile - The cross-section wire to sweep.
 * @param spine - The path wire to sweep along.
 * @param guides - Guide wires controlling profile evolution. First guide is used as auxiliary spine.
 * @param options - Sweep configuration.
 * @returns Result containing the swept Solid or Shell.
 */
export function guidedSweep(
  profile: Wire,
  spine: Wire,
  guides: ReadonlyArray<Wire>,
  options: GuidedSweepOptions = {}
): Result<Solid | Shell> {
  const { transition = 'transformed', solid = true, tolerance } = options;

  try {
    const kernel = getKernel();
    const shellMode = !solid;

    const auxiliary = guides.length > 0 ? guides[0]?.wrapped : undefined;
    const sweepResult = kernel.sweepPipeShell(profile.wrapped, spine.wrapped, {
      transitionMode: transition,
      ...(auxiliary ? { auxiliary } : {}),
      shellMode,
      ...(tolerance !== undefined ? { tolerance, boundTolerance: tolerance } : {}),
    });

    const ocShape =
      typeof sweepResult === 'object' && 'shape' in sweepResult ? sweepResult.shape : sweepResult;

    const result = castShape(ocShape);
    if (!isShape3D(result)) {
      return err(typeCastError('GUIDED_SWEEP_NOT_3D', 'Guided sweep did not produce a 3D shape'));
    }
    return ok(result as Solid | Shell);
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(kernelError(BrepErrorCode.GUIDED_SWEEP_FAILED, `Guided sweep failed: ${raw}`, e));
  }
}
