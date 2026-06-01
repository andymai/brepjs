import type { VerifyReport } from './types.js';

const PASS = '#4ec9b0';
const FAIL = '#f44747';
const DIM = '#858585';
const VAL = '#d4d4d4';

function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function Row({
  label,
  value,
  color = VAL,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 12,
        marginBottom: 3,
      }}
    >
      <span style={{ color: DIM, flexShrink: 0 }}>{label}</span>
      <span style={{ color, fontFamily: 'monospace', fontSize: 11, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

export function MetricsPanel({ report }: { report: VerifyReport }) {
  const { ok, shapeType, measurements, checks, errors } = report;

  return (
    <div
      style={{
        padding: '8px 12px',
        fontFamily: 'var(--vscode-font-family, sans-serif)',
        fontSize: 12,
        color: 'var(--vscode-foreground, #ccc)',
        background: 'var(--vscode-sideBar-background, #1e1e1e)',
        borderTop: '1px solid var(--vscode-sideBarSectionHeader-border, #333)',
        maxHeight: 200,
        overflowY: 'auto',
        flexShrink: 0,
      }}
    >
      {/* Status header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          fontWeight: 600,
        }}
      >
        <span style={{ color: ok ? PASS : FAIL }}>{ok ? '✓' : '✗'}</span>
        <span style={{ color: '#9cdcfe' }}>{shapeType ?? 'Unknown'}</span>
        {errors.length > 0 && (
          <span style={{ color: FAIL, marginLeft: 'auto', fontWeight: 400, fontSize: 11 }}>
            {errors.length} error{errors.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Measurements */}
      {measurements.volume !== undefined && (
        <Row label="Volume" value={`${fmt(measurements.volume)} mm³`} />
      )}
      {measurements.area !== undefined && (
        <Row label="Area" value={`${fmt(measurements.area)} mm²`} />
      )}
      {measurements.bounds !== undefined && (() => {
        const { xMin, xMax, yMin, yMax, zMin, zMax } = measurements.bounds;
        return (
          <Row
            label="Dims"
            value={`${fmt(xMax - xMin)} × ${fmt(yMax - yMin)} × ${fmt(zMax - zMin)} mm`}
          />
        );
      })()}

      {/* Validity checks */}
      {checks.map((c) => (
        <Row
          key={c.name}
          label={c.name}
          value={c.passed ? '✓' : (c.detail ?? '✗')}
          color={c.passed ? PASS : FAIL}
        />
      ))}

      {/* Errors */}
      {errors.map((e, i) => (
        <div
          key={i}
          style={{ color: FAIL, fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}
        >
          {e}
        </div>
      ))}
    </div>
  );
}
