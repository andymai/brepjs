/**
 * Guide curve sweep via BRepOffsetAPI_MakePipeShell with auxiliary spine.
 *
 * Uses guide wires to control the evolution of a profile along a spine.
 */

import { getKernel } from '../kernel/index.js';
import type { Wire, Solid, Shell } from '../core/shapeTypes.js';
import { castShape, isShape3D } from '../core/shapeTypes.js';
import { gcWithScope } from '../core/disposal.js';
import { type Result, ok, err } from '../core/result.js';
import { occtError, typeCastError, BrepErrorCode } from '../core/errors.js';

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
    const oc = getKernel().oc;
    const r = gcWithScope();

    const builder = r(new oc.BRepOffsetAPI_MakePipeShell(spine.wrapped));

    const modeMap = {
      transformed: oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_Transformed,
      round: oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RoundCorner,
      right: oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RightCorner,
    } as const;
    builder.SetTransitionMode(modeMap[transition]);

    if (tolerance !== undefined) {
      builder.SetTolerance(tolerance, tolerance, 1e-7);
    }

    // Use first guide as auxiliary spine to control profile evolution
    if (guides.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked
      const firstGuide = guides[0]!;
      builder.SetMode_5(firstGuide.wrapped, false, oc.BRepFill_TypeOfContact.BRepFill_NoContact);
    }

    builder.Add_1(profile.wrapped, false, false);

    const progress = r(new oc.Message_ProgressRange_1());
    builder.Build(progress);

    if (!builder.IsDone()) {
      return err(occtError(BrepErrorCode.GUIDED_SWEEP_FAILED, 'Guided sweep build failed'));
    }

    if (solid) {
      builder.MakeSolid();
    }

    const result = castShape(builder.Shape());
    if (!isShape3D(result)) {
      return err(typeCastError('GUIDED_SWEEP_NOT_3D', 'Guided sweep did not produce a 3D shape'));
    }
    return ok(result as Solid | Shell);
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(occtError(BrepErrorCode.GUIDED_SWEEP_FAILED, `Guided sweep failed: ${raw}`, e));
  }
}
