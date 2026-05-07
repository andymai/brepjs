import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { useToastStore } from '../../stores/toastStore';
import { buildEdgeFinderSnippet, buildFaceFinderSnippet } from '../../lib/finderSnippet';
import { copyToClipboard } from '../../lib/copyToClipboard';
import type { Selection } from '../../stores/playgroundStore';

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const OFFSET_X = 4;
const OFFSET_Y = 4;
const EDGE_PADDING = 8;

export default function ContextMenu({ containerRef }: Props) {
  const contextMenu = usePlaygroundStore((s) => s.contextMenu);
  const closeContextMenu = usePlaygroundStore((s) => s.closeContextMenu);
  const addToast = useToastStore((s) => s.addToast);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Position the menu next to the cursor, then clamp to the viewport panel
  // so it never spills out of the canvas. useLayoutEffect avoids a flash at
  // (0,0) before clamping resolves.
  useLayoutEffect(() => {
    if (!contextMenu || !containerRef.current || !menuRef.current) {
      setPos(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    let left = contextMenu.screenPos.x - rect.left + OFFSET_X;
    let top = contextMenu.screenPos.y - rect.top + OFFSET_Y;
    if (left + m.width > rect.width - EDGE_PADDING) {
      left = rect.width - m.width - EDGE_PADDING;
    }
    if (top + m.height > rect.height - EDGE_PADDING) {
      top = rect.height - m.height - EDGE_PADDING;
    }
    if (left < EDGE_PADDING) left = EDGE_PADDING;
    if (top < EDGE_PADDING) top = EDGE_PADDING;
    setPos({ left, top });
  }, [contextMenu, containerRef]);

  // Dismiss on outside click, Escape, scroll, or resize. The mousedown
  // listener uses capture so a click that lands on the menu's own buttons
  // hits the button handler first (which closes the menu itself).
  useEffect(() => {
    if (!contextMenu) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      closeContextMenu();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    const handleScrollOrResize = () => closeContextMenu();

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [contextMenu, closeContextMenu]);

  if (!contextMenu) return null;

  const handleCopyFinder = () => {
    const snippet = buildSnippet(contextMenu.entity);
    void copyToClipboard(snippet).then((copied) =>
      addToast(copied ? 'Finder copied' : 'Clipboard unavailable')
    );
    closeContextMenu();
  };

  return (
    <div
      ref={menuRef}
      className="absolute z-30 min-w-[180px] overflow-hidden rounded-md border border-border-subtle bg-[rgba(15,15,20,0.96)] py-1 font-mono text-xs text-gray-200 shadow-xl backdrop-blur-sm"
      style={pos ?? { left: -9999, top: -9999 }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        onClick={handleCopyFinder}
        className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left transition-colors hover:bg-surface-overlay focus:bg-surface-overlay focus:outline-none"
      >
        <span>Copy finder predicate</span>
        <span className="text-[10px] uppercase tracking-wider text-gray-500">
          {contextMenu.entity.kind === 'face' ? 'face' : 'edge'}
        </span>
      </button>
    </div>
  );
}

function buildSnippet(entity: Selection): string {
  return entity.kind === 'face'
    ? buildFaceFinderSnippet(entity.info)
    : buildEdgeFinderSnippet(entity.info);
}
