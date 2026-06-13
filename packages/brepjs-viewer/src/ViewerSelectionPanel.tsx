import { type CSSProperties } from 'react';
import type { FaceInfo } from './types.js';

// Controlled readout for a picked face. Store-agnostic; renders nothing when no face
// is selected. Self-contained inline styles so it works without Tailwind.
export interface ViewerSelectionPanelProps {
  face?: FaceInfo | null;
  onClear?: () => void;
  unit?: string | undefined;
  className?: string;
}

const SURFACE_LABELS: Record<string, string> = {
  PLANE: 'Planar',
  CYLINDER: 'Cylindrical',
  CONE: 'Conical',
  SPHERE: 'Spherical',
  TORUS: 'Toroidal',
  BEZIER_SURFACE: 'Bézier',
  BSPLINE_SURFACE: 'B-spline',
  REVOLUTION_SURFACE: 'Revolved',
  EXTRUSION_SURFACE: 'Extruded',
  OFFSET_SURFACE: 'Offset',
  OTHER_SURFACE: 'Surface',
};
function surfaceLabel(t: string): string {
  return SURFACE_LABELS[t] ?? 'Surface';
}
function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Number.isInteger(n)) return n.toLocaleString();
  return Number(n.toFixed(2)).toLocaleString();
}

export function ViewerSelectionPanel({
  face,
  onClear,
  unit,
  className,
}: ViewerSelectionPanelProps) {
  if (!face) return null;
  const [nx, ny, nz] = face.normal;
  return (
    <div className={className} style={className ? undefined : containerStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>{surfaceLabel(face.surfaceType)} face</span>
        {onClear && (
          <button type="button" onClick={onClear} aria-label="Clear selection" style={closeStyle}>
            ✕
          </button>
        )}
      </div>
      <Row label="Area" value={`${fmt(face.area)}${unit ? ` ${unit}²` : ''}`} />
      <Row label="Normal" value={`${fmt(nx)}, ${fmt(ny)}, ${fmt(nz)}`} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span style={valueStyle}>{value}</span>
    </div>
  );
}

const containerStyle: CSSProperties = {
  position: 'absolute',
  left: 12,
  top: 12,
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '8px 10px',
  borderRadius: 8,
  minWidth: 170,
  background: 'rgba(26, 29, 33, 0.7)',
  backdropFilter: 'blur(6px)',
  border: '1px solid rgba(74, 206, 204, 0.3)',
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};
const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  marginBottom: 2,
};
const titleStyle: CSSProperties = { color: '#6ee7d7', fontSize: 12, fontWeight: 600 };
const closeStyle: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: '#7b8591',
  fontSize: 12,
  lineHeight: 1,
  padding: 0,
};
const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  fontSize: 12,
  lineHeight: 1.5,
};
const labelStyle: CSSProperties = { color: '#7b8591' };
const valueStyle: CSSProperties = { color: '#c8cdd3', fontVariantNumeric: 'tabular-nums' };
