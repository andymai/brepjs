import { useMemo, useState } from 'react';
import type { Pt2 } from 'brepjs-sheetmetal';
import { usePlaygroundStore } from '../../stores/playgroundStore';

const UP_COLOR = '#4acecc';
const DOWN_COLOR = '#f59e0b';

/**
 * Read-only 2D overlay showing a sheet-metal flat pattern (the developed blank):
 * the outline, any cutouts, and the bend lines coloured by fold direction.
 * Renders only when the current example exposed one via
 * `present(shape, { overlay2d })`.
 */
export default function FlatPatternPanel() {
  const flat = usePlaygroundStore((s) => s.flatPattern);
  const [collapsed, setCollapsed] = useState(false);

  const view = useMemo(() => {
    if (!flat || flat.outline.length < 3) return null;
    const all: Pt2[] = [
      ...flat.outline,
      ...flat.holes.flat(),
      ...flat.bendLines.flatMap((b) => [b.from, b.to]),
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of all) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const span = Math.max(w, h);
    // SVG y grows downward; flip so the developed pattern reads upright.
    const fy = (y: number) => minY + maxY - y;
    // Outline + holes as one even-odd path so cutouts are genuinely transparent
    // (the 3D viewer shows through), not opaque polygons stacked on the outline.
    const subpath = (poly: Pt2[]) => `M${poly.map(([x, y]) => `${x} ${fy(y)}`).join(' L ')} Z`;
    const fillPath = [flat.outline, ...flat.holes].map(subpath).join(' ');
    return { minX, minY, w, h, span, fy, fillPath };
  }, [flat]);

  if (!flat || !view) return null;
  const pad = view.span * 0.06;
  const stroke = view.span * 0.006;
  const dash = `${view.span * 0.022} ${view.span * 0.014}`;

  return (
    <div className="absolute bottom-3 left-3 z-10 flex w-64 flex-col overflow-hidden rounded-md border border-border-subtle bg-surface/95 shadow-lg backdrop-blur">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between border-b border-border-subtle px-3 py-1.5 text-left text-xs font-medium text-gray-300 hover:text-white"
        title={collapsed ? 'Expand flat pattern' : 'Collapse flat pattern'}
        aria-expanded={!collapsed}
      >
        <span>Flat Pattern</span>
        <span className="text-[10px] text-gray-500">
          {flat.bendLines.length} bend{flat.bendLines.length === 1 ? '' : 's'}{' '}
          {collapsed ? '▸' : '▾'}
        </span>
      </button>
      {!collapsed && (
        <div className="p-2">
          <svg
            viewBox={`${view.minX - pad} ${view.minY - pad} ${view.w + 2 * pad} ${view.h + 2 * pad}`}
            className="w-full"
            style={{ maxHeight: 220 }}
          >
            <path
              d={view.fillPath}
              fillRule="evenodd"
              fill="#3a3a44"
              stroke="#9ca3af"
              strokeWidth={stroke}
            />
            {flat.bendLines.map((bend, i) => (
              <line
                key={i}
                x1={bend.from[0]}
                y1={view.fy(bend.from[1])}
                x2={bend.to[0]}
                y2={view.fy(bend.to[1])}
                stroke={bend.direction === 'up' ? UP_COLOR : DOWN_COLOR}
                strokeWidth={stroke}
                strokeDasharray={dash}
              />
            ))}
          </svg>
          {flat.bendLines.length > 0 && (
            <div className="mt-1 flex gap-3 px-1 text-[10px] text-gray-500">
              <span style={{ color: UP_COLOR }}>--- bend up</span>
              <span style={{ color: DOWN_COLOR }}>--- bend down</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
