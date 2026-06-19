import { type CSSProperties, type ReactNode } from 'react';
import { VIEW_NAMES, type Projection, type ViewMode, type ViewName } from './types.js';

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
  /** When 'orthographic', the projection button reads "Ortho" and shows active. */
  projection?: Projection;
  onToggleProjection?: () => void;
  activeView?: ViewName | null;
  onView?: (view: ViewName) => void;
  onFit?: () => void;
  onScreenshot?: () => void;
  /** Enlarge buttons and gaps for finger taps on touch devices. */
  touch?: boolean;
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
  projection,
  onToggleProjection,
  activeView,
  onView,
  onFit,
  onScreenshot,
  touch = false,
  className,
}: ViewerControlsProps) {
  return (
    <div
      className={className}
      style={className ? undefined : { ...containerStyle, gap: touch ? 8 : 6 }}
    >
      {(onFit || onScreenshot) && (
        <Group touch={touch}>
          {onFit && <Btn label="Fit" onClick={onFit} touch={touch} />}
          {onScreenshot && <Btn label="Snap" onClick={onScreenshot} touch={touch} />}
        </Group>
      )}
      {viewMode && onViewModeChange && (
        <Group touch={touch}>
          {(Object.keys(MODE_LABELS) as ViewMode[]).map((mode) => (
            <Btn
              key={mode}
              label={MODE_LABELS[mode]}
              active={viewMode === mode}
              touch={touch}
              onClick={() => {
                onViewModeChange(mode);
              }}
            />
          ))}
        </Group>
      )}
      {(onToggleEdges || onToggleGrid || onToggleAutoRotate || onToggleProjection) && (
        <Group touch={touch}>
          {onToggleEdges && (
            <Btn label="Edges" active={showEdges} onClick={onToggleEdges} touch={touch} />
          )}
          {onToggleGrid && (
            <Btn label="Grid" active={showGrid} onClick={onToggleGrid} touch={touch} />
          )}
          {onToggleAutoRotate && (
            <Btn label="Spin" active={autoRotate} onClick={onToggleAutoRotate} touch={touch} />
          )}
          {onToggleProjection && (
            <Btn
              label={projection === 'orthographic' ? 'Ortho' : 'Persp'}
              active={projection === 'orthographic'}
              touch={touch}
              onClick={onToggleProjection}
            />
          )}
        </Group>
      )}
      {onView && (
        <Group touch={touch}>
          {VIEW_NAMES.map((view) => (
            <Btn
              key={view}
              label={VIEW_LABELS[view]}
              active={activeView === view}
              touch={touch}
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

function Group({ children, touch }: { children: ReactNode; touch?: boolean }) {
  return <div style={touch ? groupStyleTouch : groupStyle}>{children}</div>;
}

function Btn({
  label,
  active,
  onClick,
  touch,
}: {
  label: string;
  active?: boolean | undefined;
  onClick: () => void;
  touch?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Omit aria-pressed for one-shot actions (Fit/Snap, active===undefined); set it only
      // for the toggle buttons so screen readers don't announce actions as unpressed toggles.
      aria-pressed={active}
      style={{
        ...(touch ? buttonStyleTouch : buttonStyle),
        ...(active ? activeButtonStyle : null),
      }}
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
  // The toolbar overlays the canvas; let pointer events fall through the container/gaps to
  // the scene (so e.g. face picking works near the toolbar) and re-enable them on buttons.
  pointerEvents: 'none',
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
  pointerEvents: 'auto',
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
const groupStyleTouch: CSSProperties = { ...groupStyle, gap: 6, padding: 6 };
const buttonStyleTouch: CSSProperties = {
  ...buttonStyle,
  padding: '9px 14px',
  fontSize: 13,
  borderRadius: 6,
};
