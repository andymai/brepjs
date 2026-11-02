import { type Compound, type Shell, type Solid, getShells, isSolid } from 'brepjs';
import { type Segmentation, type AnalyticSurface, deviationOf } from './analyticFns.js';
import { type FeatureModel, recognizeFeatures } from './featureFns.js';
import { canonicalize, writeProgram } from './programFns.js';
import type { ConversionReport } from './types.js';

export interface Tier2Outcome {
  /** The solid the generated code builds. */
  readonly shape: Solid;
  readonly code: string;
  readonly features: readonly string[];
  readonly deviation: ConversionReport['deviation'];
}

export type Tier2Result = { ok: true; value: Tier2Outcome } | { ok: false; reason: string };

export interface Tier2Gates {
  /** Fit tolerance; values snap to round numbers within it. */
  readonly tolerance: number;
  readonly maxDeviation: number;
  readonly triangulation: number;
}

/** What the model does, one entry per feature, for the report. */
function describe(model: FeatureModel): string[] {
  const out: string[] = model.base.map((b) =>
    b.op === 'extrude'
      ? `extrude ${b.height} mm${b.profile.holes.length > 0 ? ` with ${b.profile.holes.length} hole(s)` : ''}`
      : b.op === 'revolve'
        ? 'revolve'
        : b.op
  );
  for (const c of model.cavities) out.push(`cavity (${describe(c).join(', ')})`);
  for (const f of model.fillets) out.push(`fillet r=${f.radius} on ${f.edges.length} edge(s)`);
  return out;
}

/**
 * Turn an exact tier 1 solid into a feature program: recognize features, snap
 * their values to round numbers, write the `.brep.ts` source, and keep the
 * result only if the solid it builds still matches the mesh.
 */
export function buildTier2(
  shape: Solid | Shell | Compound,
  seg: Pick<Segmentation, 'deviation'>,
  surfaces: readonly AnalyticSurface[],
  gates: Tier2Gates
): Tier2Result {
  if (!isSolid(shape) || getShells(shape).length === 0) {
    return { ok: false, reason: 'tier 2 builds one solid' };
  }
  const model = recognizeFeatures(shape, surfaces, Math.max(gates.tolerance, 1e-6));
  if (!model.ok) return model;
  const canon = canonicalize(model.value, gates.tolerance);
  const program = writeProgram(canon);
  if (!program.ok) return program;
  const built = program.value.shape;
  try {
    const dev = deviationOf(built, seg.deviation, gates.triangulation);
    if (!(dev.max <= gates.maxDeviation && dev.reverseMax <= gates.maxDeviation)) {
      built[Symbol.dispose]();
      return {
        ok: false,
        reason: `the feature program deviates ${Math.max(dev.max, dev.reverseMax).toPrecision(3)} mm from the mesh`,
      };
    }
    return {
      ok: true,
      value: {
        shape: built,
        code: program.value.code,
        features: describe(canon),
        deviation: dev,
      },
    };
  } catch (e) {
    built[Symbol.dispose]();
    throw e;
  }
}
