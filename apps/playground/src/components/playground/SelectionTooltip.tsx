import { useLayoutEffect, useRef, useState } from 'react';
import {
  formatArea,
  formatCurveType,
  formatLength,
  formatNormalDirection,
  formatSurfaceType,
} from '../../lib/selectionLabels';
import { buildEdgeFinderSnippet, buildFaceFinderSnippet } from '../../lib/finderSnippet';
import type { Selection } from '../../stores/playgroundStore';

interface Props {
  selections: Selection[];
  hoverEntity: Selection | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const OFFSET_X = 12;
const OFFSET_Y = 12;
const EDGE_PADDING = 8;

export default function SelectionTooltip({ selections, hoverEntity, containerRef }: Props) {
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // Hover wins over selection while present — the user is actively pointing at
  // something new, so the tooltip should follow their attention. When the
  // pointer leaves the mesh, hoverEntity nulls and we fall back to the most
  // recent selection (the persistent confirmation of what they last picked).
  const last = hoverEntity ?? selections[selections.length - 1] ?? null;
  const isHover = hoverEntity !== null;

  // Keep the tooltip pinned next to the click position while clamping to the
  // viewport panel so it never escapes the canvas. useLayoutEffect avoids a
  // visible flash where the tooltip shows at (0,0) before being clamped.
  useLayoutEffect(() => {
    if (!last || !containerRef.current || !tooltipRef.current) {
      setPos(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const t = tooltipRef.current.getBoundingClientRect();
    let left = last.screenPos.x - rect.left + OFFSET_X;
    let top = last.screenPos.y - rect.top + OFFSET_Y;
    if (left + t.width > rect.width - EDGE_PADDING) {
      left = rect.width - t.width - EDGE_PADDING;
    }
    if (top + t.height > rect.height - EDGE_PADDING) {
      top = rect.height - t.height - EDGE_PADDING;
    }
    if (left < EDGE_PADDING) left = EDGE_PADDING;
    if (top < EDGE_PADDING) top = EDGE_PADDING;
    setPos({ left, top });
  }, [last, containerRef]);

  if (!last) return null;

  return (
    <div
      ref={tooltipRef}
      className="pointer-events-none absolute z-20 min-w-[160px] max-w-[260px] rounded-md border border-border-subtle bg-[rgba(15,15,20,0.94)] px-2.5 py-1.5 font-mono text-xs text-gray-200 shadow-lg backdrop-blur-sm"
      style={pos ?? { left: -9999, top: -9999 }}
      role="tooltip"
    >
      {!isHover && selections.length > 1 ? (
        <MultiTooltip selections={selections} />
      ) : (
        <SingleTooltip selection={last} isHover={isHover} />
      )}
    </div>
  );
}

function SingleTooltip({ selection, isHover }: { selection: Selection; isHover: boolean }) {
  // Selection state previews the finder predicate as a hint that right-click
  // → "Copy finder predicate" will copy it. Hover state hides the preview
  // because the user hasn't committed to anything yet.
  if (selection.kind === 'face') {
    const f = selection.info;
    return (
      <div className="flex flex-col gap-0.5">
        <div className="font-semibold text-teal-light">{formatSurfaceType(f.surfaceType)}</div>
        <div className="text-gray-400">Area: {formatArea(f.area)}</div>
        <div className="text-gray-400">Facing: {formatNormalDirection(f.normal)}</div>
        {!isHover && <SnippetPreview snippet={buildFaceFinderSnippet(f)} />}
      </div>
    );
  }
  const e = selection.info;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="font-semibold text-teal-light">{formatCurveType(e.curveType)}</div>
      <div className="text-gray-400">Length: {formatLength(e.length)}</div>
      {!isHover && <SnippetPreview snippet={buildEdgeFinderSnippet(e)} />}
    </div>
  );
}

function SnippetPreview({ snippet }: { snippet: string }) {
  return (
    <div className="mt-1 border-t border-border-subtle pt-1">
      <div className="mb-0.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-gray-500">
        <span>Finder predicate</span>
        <span className="normal-case tracking-normal">right-click to copy</span>
      </div>
      <pre className="whitespace-pre-wrap break-words text-[10.5px] leading-snug text-teal-light/90">
        {snippet}
      </pre>
    </div>
  );
}

function MultiTooltip({ selections }: { selections: Selection[] }) {
  const faceCount = selections.filter((s) => s.kind === 'face').length;
  const edgeCount = selections.length - faceCount;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="font-semibold text-teal-light">{selections.length} selected</div>
      {faceCount > 0 && (
        <div className="text-gray-400">
          {faceCount} face{faceCount === 1 ? '' : 's'}
        </div>
      )}
      {edgeCount > 0 && (
        <div className="text-gray-400">
          {edgeCount} edge{edgeCount === 1 ? '' : 's'}
        </div>
      )}
      <div className="mt-1 border-t border-border-subtle pt-1 text-[10px] text-gray-500">
        Right-click any face or edge to copy its finder
      </div>
    </div>
  );
}
