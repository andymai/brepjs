/**
 * Multi-section sweep via positioned loft (BRepOffsetAPI_ThruSections).
 *
 * Positions profile wires at computed locations along a spine curve,
 * then lofts through them to produce a solid or shell.
 */

import { getKernel } from '../kernel/index.js';
import type { KernelShape } from '../kernel/types.js';
import type { Dimension, Wire, Solid, Shell } from '../core/shapeTypes.js';
import { castShape, isShape3D } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { validationError, kernelError, typeCastError, BrepErrorCode } from '../core/errors.js';

/** Configuration for a single sweep section (profile wire + optional location). */
export interface SweepSectionConfig {
  /** The profile wire for this section. */
  wire: Wire<Dimension>;
  /** Location along the spine as a parameter in [0.0, 1.0]. Auto-distributed if omitted. */
  location?: number;
}

/** Options for the multi-section sweep operation. */
export interface MultiSweepOptions {
  /** Produce a solid (true) or shell (false). Defaults to true. */
  solid?: boolean;
  /** Use ruled (straight) interpolation between sections. Defaults to false. */
  ruled?: boolean;
  /** Tolerance for the loft builder. Defaults to 1e-6. */
  tolerance?: number;
}

/**
 * Sweep multiple profile sections along a spine wire.
 *
 * Each section wire is positioned at a point along the spine (either at an
 * explicit `location` parameter or auto-distributed evenly). The profiles
 * are then lofted using `BRepOffsetAPI_ThruSections`.
 *
 * @param sections - At least 2 section configs with profile wires.
 * @param spine - The path wire to sweep along.
 * @param options - Sweep configuration.
 * @returns Result containing the swept Solid or Shell.
 */
export function multiSectionSweep(
  sections: ReadonlyArray<SweepSectionConfig>,
  spine: Wire<Dimension>,
  options?: MultiSweepOptions
): Result<Solid | Shell> {
  if (sections.length < 2) {
    return err(
      validationError(
        BrepErrorCode.MULTI_SWEEP_INSUFFICIENT_SECTIONS,
        `Multi-section sweep requires at least 2 sections, got ${sections.length}`
      )
    );
  }

  const { solid = true, ruled = false, tolerance = 1e-6 } = options ?? {};

  // Validate explicit locations
  const explicitLocations = sections.map((s) => s.location);
  for (let i = 0; i < explicitLocations.length; i++) {
    const loc = explicitLocations[i];
    if (loc !== undefined && (loc < 0 || loc > 1)) {
      return err(
        validationError(
          BrepErrorCode.MULTI_SWEEP_FAILED,
          `Section ${i} location ${loc} is out of range [0, 1]`
        )
      );
    }
  }
  const definedLocs = explicitLocations.filter((l): l is number => l !== undefined);
  for (let i = 1; i < definedLocs.length; i++) {
    if ((definedLocs[i] ?? 0) <= (definedLocs[i - 1] ?? 0)) {
      return err(
        validationError(
          BrepErrorCode.MULTI_SWEEP_FAILED,
          'Section locations must be strictly increasing'
        )
      );
    }
  }

  try {
    const kernel = getKernel();

    // Get spine parameterization
    const [uFirst, uLast] = kernel.curveParameters(spine.wrapped);
    const uRange = uLast - uFirst;

    // Compute parameter for each section
    const params: number[] = sections.map((s, i) => {
      if (s.location !== undefined) {
        return uFirst + s.location * uRange;
      }
      // Auto-distribute evenly
      return uFirst + (i / (sections.length - 1)) * uRange;
    });

    // Position each profile wire along the spine and loft
    const positionedWires: KernelShape[] = [];
    for (let i = 0; i < sections.length; i++) {
      const param = params[i];
      const section = sections[i];
      if (param === undefined || section === undefined) continue;

      const positioned = kernel.positionOnCurve(section.wire.wrapped, spine.wrapped, param);
      positionedWires.push(kernel.downcast(positioned, 'wire'));
    }

    const loftResult = kernel.loftAdvanced(positionedWires, { solid, ruled, tolerance });

    const result = castShape(loftResult);
    if (!isShape3D(result)) {
      return err(
        typeCastError('MULTI_SWEEP_NOT_3D', 'Multi-section sweep did not produce a 3D shape')
      );
    }
    return ok(result as Solid | Shell);
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(
      kernelError(BrepErrorCode.MULTI_SWEEP_FAILED, `Multi-section sweep failed: ${raw}`, e)
    );
  }
}
