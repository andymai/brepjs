import { type CSSProperties, type ReactNode } from 'react';
import { VIEW_NAMES, type ViewMode, type ViewName } from './types.js';

// Fully controlled, store-agnostic toolbar. Each control group renders only when
// its handler is supplied, so a consumer (the verify viewer, the playground) opts
// into exactly the controls it wires up. Styling defaults to self-contained inline
// styles so it works without Tailwind; pass `className` to restyle the container.
export interface ViewerControlsProps {
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  showEdges?: boolean;
  onToggleEdges?: () => void;
  showGrid?: boolean;
  onToggleGrid?: () => void;
  autoRotate?: boolean;
  onToggleAutoRotate?: () => void;
  activeView?: ViewName | null;
  onView?: (view: ViewName) => void;
  onFit?: () => void;
  onScreenshot?: () => void;
  className?: string;
}

const MODE_LABELS: Record<ViewMode, string> = {
  solid: 'Solid',
  wireframe: 'Wire',
  xray: 'X-ray',
};
const VIEW_LABELS: Record<ViewName, string> = {
  iso: 'Iso',
  front: 'Front',
  top: 'Top',
  right: 'Right',
};

export function ViewerControls({
  viewMode,
  onViewModeChange,
  showEdges,
  onToggleEdges,
  showGrid,
  onToggleGrid,
  autoRotate,
  onToggleAutoRotate,
  activeView,
  onView,
  onFit,
  onScreenshot,
  className,
}: ViewerControlsProps) {
  return (
    <div className={className} style={className ? undefined : containerStyle}>
      {(onFit || onScreenshot) && (
        <Group>
          {onFit && <Btn label="Fit" onClick={onFit} />}
          {onScreenshot && <Btn label="Snap" onClick={onScreenshot} />}
        </Group>
      )}
      {viewMode && onViewModeChange && (
        <Group>
          {(Object.keys(MODE_LABELS) as ViewMode[]).map((mode) => (
            <Btn
              key={mode}
              label={MODE_LABELS[mode]}
              active={viewMode === mode}
              onClick={() => {
                onViewModeChange(mode);
              }}
            />
          ))}
        </Group>
      )}
      {(onToggleEdges || onToggleGrid || onToggleAutoRotate) && (
        <Group>
          {onToggleEdges && (
            <Btn label="Edges" active={showEdges} onClick={onToggleEdges} />
          )}
          {onToggleGrid && <Btn label="Grid" active={showGrid} onClick={onToggleGrid} />}
          {onToggleAutoRotate && (
            <Btn label="Spin" active={autoRotate} onClick={onToggleAutoRotate} />
          )}
        </Group>
      )}
      {onView && (
        <Group>
          {VIEW_NAMES.map((view) => (
            <Btn
              key={view}
              label={VIEW_LABELS[view]}
              active={activeView === view}
              onClick={() => {
                onView(view);
              }}
            />
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div style={groupStyle}>{children}</div>;
}

function Btn({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Omit aria-pressed for one-shot actions (Fit/Snap, active===undefined); set it only
      // for the toggle buttons so screen readers don't announce actions as unpressed toggles.
      aria-pressed={active}
      style={{ ...buttonStyle, ...(active ? activeButtonStyle : null) }}
    >
      {label}
    </button>
  );
}

const containerStyle: CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};
const groupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: 4,
  borderRadius: 8,
  background: 'rgba(26, 29, 33, 0.7)',
  backdropFilter: 'blur(6px)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
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
  transition: 'color 120ms, background 120ms',
};
const activeButtonStyle: CSSProperties = {
  color: '#6ee7d7',
  background: 'rgba(45, 212, 191, 0.16)',
  borderColor: 'rgba(45, 212, 191, 0.3)',
};
