import { type CSSProperties } from 'react';
import type { SectionAxis } from './geometry.js';

// Controlled, store-agnostic section-plane controls. Shows just the enable toggle when
// off; reveals axis / position / flip when on. Self-contained inline styles.
export interface ViewerSectionControlsProps {
  enabled: boolean;
  onToggle: () => void;
  axis: SectionAxis;
  onAxisChange: (axis: SectionAxis) => void;
  position: number;
  min: number;
  max: number;
  onPositionChange: (position: number) => void;
  flip: boolean;
  onToggleFlip: () => void;
  className?: string;
}

const AXES: SectionAxis[] = ['x', 'y', 'z'];

export function ViewerSectionControls({
  enabled,
  onToggle,
  axis,
  onAxisChange,
  position,
  min,
  max,
  onPositionChange,
  flip,
  onToggleFlip,
  className,
}: ViewerSectionControlsProps) {
  return (
    <div className={className} style={className ? undefined : containerStyle}>
      <Btn label="Section" active={enabled} onClick={onToggle} />
      {enabled && (
        <>
          {AXES.map((a) => (
            <Btn
              key={a}
              label={a.toUpperCase()}
              active={axis === a}
              onClick={() => {
                onAxisChange(a);
              }}
            />
          ))}
          <input
            type="range"
            min={min}
            max={max}
            step={(max - min) / 200 || 0.01}
            value={position}
            disabled={min === max}
            onChange={(e) => {
              onPositionChange(Number(e.target.value));
            }}
            aria-label="Section position"
            // A zero-extent axis (e.g. a sheet body) has nothing to slide along; dim and
            // disable so the stuck handle reads as intentional rather than broken.
            style={{ ...sliderStyle, ...(min === max ? { opacity: 0.4 } : null) }}
          />
          <Btn label="Flip" active={flip} onClick={onToggleFlip} />
        </>
      )}
    </div>
  );
}

function Btn({ label, active, onClick }: { label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{ ...buttonStyle, ...(active ? activeButtonStyle : null) }}
    >
      {label}
    </button>
  );
}

const containerStyle: CSSProperties = {
  position: 'absolute',
  bottom: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 10,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: 4,
  borderRadius: 8,
  background: 'rgba(26, 29, 33, 0.7)',
  backdropFilter: 'blur(6px)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};
const buttonStyle: CSSProperties = {
  cursor: 'pointer',
  padding: '4px 10px',
  borderRadius: 5,
  fontSize: 12,
  fontWeight: 500,
  lineHeight: 1.2,
  color: '#9aa3ad',
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid transparent',
};
const activeButtonStyle: CSSProperties = {
  color: '#6ee7d7',
  background: 'rgba(45, 212, 191, 0.16)',
  borderColor: 'rgba(45, 212, 191, 0.3)',
};
const sliderStyle: CSSProperties = { width: 160, accentColor: '#4ACECC', margin: '0 4px' };
