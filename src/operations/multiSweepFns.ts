/**
 * Multi-section sweep via positioned loft (BRepOffsetAPI_ThruSections).
 *
 * Positions profile wires at computed locations along a spine curve,
 * then lofts through them to produce a solid or shell.
 */

import { getKernel } from '../kernel/index.js';
import type { Wire, Solid, Shell } from '../core/shapeTypes.js';
import { castShape, isShape3D } from '../core/shapeTypes.js';
import { DisposalScope } from '../core/disposal.js';
import { type Result, ok, err } from '../core/result.js';
import { validationError, occtError, typeCastError, BrepErrorCode } from '../core/errors.js';

/** Configuration for a single sweep section (profile wire + optional location). */
export interface SweepSectionConfig {
  /** The profile wire for this section. */
  wire: Wire;
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
  spine: Wire,
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

  try {
    const oc = getKernel().oc;
    using scope = new DisposalScope();

    // Get spine parameterization via BRepAdaptor_CompCurve
    const adaptor = scope.register(new oc.BRepAdaptor_CompCurve_2(spine.wrapped, false));
    const uFirst = Number(adaptor.FirstParameter());
    const uLast = Number(adaptor.LastParameter());
    const uRange = uLast - uFirst;

    // Compute parameter for each section
    const params: number[] = sections.map((s, i) => {
      if (s.location !== undefined) {
        return uFirst + s.location * uRange;
      }
      // Auto-distribute evenly
      return uFirst + (i / (sections.length - 1)) * uRange;
    });

    // Build ThruSections loft with positioned wires
    const builder = scope.register(new oc.BRepOffsetAPI_ThruSections(solid, ruled, tolerance));

    for (let i = 0; i < sections.length; i++) {
      const param = params[i];
      const section = sections[i];
      if (param === undefined || section === undefined) continue;

      // Get point and tangent at this parameter
      const pnt = scope.register(new oc.gp_Pnt_1());
      const tangent = scope.register(new oc.gp_Vec_1());
      adaptor.D1(param, pnt, tangent);

      // Build the target coordinate system at the spine point
      const tangentDir = scope.register(new oc.gp_Dir_2(tangent));
      const toAx3 = scope.register(new oc.gp_Ax3_4(pnt, tangentDir));

      // SetTransformation_2(ax3) computes transform FROM ax3 TO standard coords.
      // We want FROM standard (origin/Z-up) TO toAx3, so invert.
      const trsf = scope.register(new oc.gp_Trsf_1());
      trsf.SetTransformation_2(toAx3);
      trsf.Invert();

      // Apply transform to the profile wire
      const transformer = scope.register(
        new oc.BRepBuilderAPI_Transform_2(section.wire.wrapped, trsf, true)
      );
      const transformedShape = transformer.Shape();
      const transformedWire = oc.TopoDS.Wire_1(transformedShape);

      builder.AddWire(transformedWire);
    }

    const progress = scope.register(new oc.Message_ProgressRange_1());
    builder.Build(progress);

    if (!builder.IsDone()) {
      return err(occtError(BrepErrorCode.MULTI_SWEEP_FAILED, 'Multi-section sweep build failed'));
    }

    const result = castShape(builder.Shape());
    if (!isShape3D(result)) {
      return err(
        typeCastError('MULTI_SWEEP_NOT_3D', 'Multi-section sweep did not produce a 3D shape')
      );
    }
    return ok(result as Solid | Shell);
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(
      occtError(BrepErrorCode.MULTI_SWEEP_FAILED, `Multi-section sweep failed: ${raw}`, e)
    );
  }
}
