import type { VerifyReport } from '../src/verify/report.js';

// Flat, human-legible projection of the deterministic metrics in a VerifyReport (`brep verify
// --metrics`). Both judges consume this one shape: the SDK judge gets it via JudgeInput.metrics, and
// the blind sub-agent orchestrator pastes formatDigest() symmetrically per render. Kept out of
// score.ts so scoring isn't coupled to judge-input shaping.

export interface MetricsDigest {
  /** Number of distinct solid bodies (1 for a single solid). */
  bodyCount: number;
  /** One human-legible line per body pair, e.g. "bodies 0&1: interfering (clearance 0.00mm)". */
  bodyRelations: string[];
  /** Conservative deterministic hard violations (e.g. a degenerate zero-volume body). */
  violations: string[];
  /** True when the relation matrix was capped (large assembly) — the relations are not exhaustive. */
  relationsTruncated?: boolean;
}

/** Project a report's metrics into a digest, or `undefined` if metrics were not computed. */
export function digestMetrics(report: VerifyReport): MetricsDigest | undefined {
  if (!report.manufacturability && !report.bodies && !report.bodyRelations) return undefined;
  const relations = (report.bodyRelations ?? []).map((r) => {
    const clearance = r.clearance === undefined ? '' : ` (clearance ${r.clearance.toFixed(2)}mm)`;
    return `bodies ${r.a}&${r.b}: ${r.relation}${clearance}`;
  });
  return {
    bodyCount: report.bodies?.length ?? 1,
    bodyRelations: relations,
    violations: report.manufacturability?.violations ?? [],
    ...(report.manufacturability?.relationsTruncated ? { relationsTruncated: true } : {}),
  };
}

/** Render a digest as a compact text block for a judge prompt (ground truth the image can't show). */
export function formatDigest(d: MetricsDigest): string {
  const lines = [`Measured facts (ground truth the render cannot show — trust these):`];
  lines.push(`- distinct bodies: ${d.bodyCount}`);
  if (d.bodyRelations.length) lines.push(`- body relations: ${d.bodyRelations.join('; ')}`);
  if (d.relationsTruncated)
    lines.push(`- (relation matrix truncated — large assembly; not exhaustive)`);
  if (d.violations.length) lines.push(`- violations: ${d.violations.join('; ')}`);
  return lines.join('\n');
}
