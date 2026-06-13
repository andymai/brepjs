import { type CSSProperties, type ReactNode } from 'react';

// Controlled, store-agnostic readout of a model's measurements. Renders only the rows
// whose values are supplied; self-contained inline styles so it works without Tailwind.
export interface ViewerInfoPanelProps {
  /** Bounding-box extents (width, depth, height) in model units. */
  dims?: [number, number, number] | undefined;
  volume?: number | undefined;
  area?: number | undefined;
  triangles?: number | undefined;
  valid?: boolean | undefined;
  /** Unit suffix for lengths (e.g. "mm"). Volume/area get the squared/cubed form. */
  unit?: string | undefined;
  className?: string;
}

export function ViewerInfoPanel({
  dims,
  volume,
  area,
  triangles,
  valid,
  unit,
  className,
}: ViewerInfoPanelProps) {
  const u = unit ? ` ${unit}` : '';
  const rows: ReactNode[] = [];
  if (dims)
    rows.push(
      <Row
        key="size"
        label="Size"
        value={`${fmt(dims[0])} × ${fmt(dims[1])} × ${fmt(dims[2])}${u}`}
      />,
    );
  if (volume !== undefined)
    rows.push(<Row key="vol" label="Volume" value={`${fmt(volume)}${unit ? ` ${unit}³` : ''}`} />);
  if (area !== undefined)
    rows.push(<Row key="area" label="Area" value={`${fmt(area)}${unit ? ` ${unit}²` : ''}`} />);
  if (triangles !== undefined)
    rows.push(<Row key="tris" label="Triangles" value={triangles.toLocaleString()} />);
  if (valid !== undefined)
    rows.push(
      <Row
        key="valid"
        label="Validity"
        value={valid ? 'valid' : 'invalid'}
        valueColor={valid ? '#6ee7d7' : '#f0a0a0'}
      />,
    );
  if (rows.length === 0) return null;

  return (
    <div className={className} style={className ? undefined : containerStyle}>
      {rows}
    </div>
  );
}

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={{ ...valueStyle, ...(valueColor ? { color: valueColor } : null) }}>{value}</span>
    </div>
  );
}

// Compact number: integers as-is, otherwise up to 2 decimals without trailing zeros.
function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Number.isInteger(n)) return n.toLocaleString();
  return Number(n.toFixed(2)).toLocaleString();
}

const containerStyle: CSSProperties = {
  position: 'absolute',
  left: 12,
  bottom: 12,
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '8px 10px',
  borderRadius: 8,
  minWidth: 150,
  background: 'rgba(26, 29, 33, 0.7)',
  backdropFilter: 'blur(6px)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};
const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  fontSize: 12,
  lineHeight: 1.5,
};
const labelStyle: CSSProperties = { color: '#7b8591' };
const valueStyle: CSSProperties = {
  color: '#c8cdd3',
  fontVariantNumeric: 'tabular-nums',
};
