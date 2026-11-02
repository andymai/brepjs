import type { ConversionReport } from 'brepjs-mesh2solid';
import { count, length, unitLabel } from './format.js';

const TIER: Record<ConversionReport['tierReached'], { title: string; detail: string }> = {
  2: {
    title: 'Rebuilt as a feature program',
    detail:
      'Exact surfaces, with a .brep.ts module that rebuilds the part from brepjs calls you can edit.',
  },
  1: {
    title: 'Rebuilt from exact surfaces',
    detail: 'Planes, cylinders, cones, spheres, and tori fitted to the mesh, joined into a solid.',
  },
  0: {
    title: 'Rebuilt as a faceted solid',
    detail: 'The mesh triangles as faces, with flat regions merged into single faces.',
  },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** One closed body is a solid; several come back as a compound, and an open one as a shell. */
function resultLabel(report: ConversionReport, solid: boolean): string {
  if (solid) return 'Closed solid';
  // Cavities are bodies of their own in the report but not separate parts.
  const bodies = report.bodies.filter((b) => b.parent < 0).length;
  const open = report.bodies.filter((b) => !b.closed).length;
  if (open === 0) return `${count(bodies)} closed bodies`;
  if (bodies === 1) return 'Open shell (the mesh has holes)';
  return `${count(bodies)} bodies, ${count(open)} with holes`;
}

export function ReportPanel({ report, solid }: { report: ConversionReport; solid: boolean }) {
  const tier = TIER[report.tierReached];
  const units = report.units;
  const unitSource =
    units.source === 'file' ? 'from the file' : units.source === 'option' ? 'as chosen' : 'assumed';
  const reasons = [report.tier2?.fallbackReason, report.tier1?.fallbackReason].filter(
    (r): r is string => r !== undefined && r !== ''
  );
  return (
    <section className="panel" aria-label="Conversion report">
      <h2>{tier.title}</h2>
      <p className="muted">{tier.detail}</p>
      <dl className="rows">
        <Row label="Result">{resultLabel(report, solid)}</Row>
        <Row label="Faces">
          {count(report.faces.triangles)} triangles in, {count(report.faces.faces)} faces out
        </Row>
        <Row label="Distance to mesh">
          95% within {length(report.deviation.p95)}, largest {length(report.deviation.max)}
        </Row>
        <Row label="Mesh">{report.estimate.kind === 'scan' ? '3D scan' : 'CAD export'}</Row>
        <Row label="Units">
          {unitLabel(units.unit)}, {unitSource}
        </Row>
        <Row label="Time">
          {((report.timings.engineMs + report.timings.buildMs) / 1000).toFixed(1)} s
        </Row>
      </dl>
      {reasons.length > 0 && (
        <div className="note">
          <h3>Why not further</h3>
          <ul>
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {report.warnings.length > 0 && (
        <details className="note">
          <summary>
            {report.warnings.length} {report.warnings.length === 1 ? 'note' : 'notes'} from the
            conversion
          </summary>
          <ul>
            {report.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
