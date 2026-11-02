import { type Compound, type Shell, type Solid, getSolids, isCompound, isSolid } from 'brepjs';
import { type Segmentation, type AnalyticSurface, deviationOf } from './analyticFns.js';
import { type FeatureModel, recognizeFeatures, surfacesOf } from './featureFns.js';
import { canonicalize, writeProgram } from './programFns.js';
import type { ConversionReport } from './types.js';

export interface Tier2Outcome {
  /** The solid (or one per body, in a compound) the generated code builds. */
  readonly shape: Solid | Compound;
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
  for (const c of model.countersinks) {
    out.push(`countersink r=${c.narrow} to ${c.wide}, ${c.depth} mm deep`);
  }
  for (const c of model.chamfers) out.push(`chamfer ${c.distance} on ${c.edges.length} edge(s)`);
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
  const bodies = isSolid(shape) ? [shape] : isCompound(shape) ? getSolids(shape) : [];
  if (bodies.length === 0) return { ok: false, reason: 'tier 2 builds solids' };
  const tol = Math.max(gates.tolerance, 1e-6);
  const models: FeatureModel[] = [];
  for (const body of bodies) {
    // Each body is recognized with only the fitted surfaces that carry its faces.
    const own = bodies.length === 1 ? surfaces : surfacesOf(body, surfaces, tol);
    const model = recognizeFeatures(body, own, tol);
    if (!model.ok)
      return bodies.length === 1 ? model : { ok: false, reason: `a body: ${model.reason}` };
    models.push(canonicalize(model.value, gates.tolerance));
  }
  const program = writeProgram(models);
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
    const features =
      models.length === 1
        ? models.flatMap(describe)
        : models.flatMap((m, i) => describe(m).map((f) => `body ${i + 1}: ${f}`));
    return {
      ok: true,
      value: { shape: built, code: program.value.code, features, deviation: dev },
    };
  } catch (e) {
    built[Symbol.dispose]();
    throw e;
  }
}
