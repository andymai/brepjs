import { useCallback, useEffect, useRef, useState } from 'react';
import EditorPanel from './EditorPanel';
import ViewerPanel from './ViewerPanelLazy';
import OutputPanel from './OutputPanel';
import { usePlaygroundStore } from '../../stores/playgroundStore';

type Tab = 'editor' | 'viewer' | 'console';

interface MobileLayoutProps {
  onCodeChange: (code: string, opts?: { immediate?: boolean }) => void;
  editorFormatRef: { current: (() => void) | null };
  editorJumpToLineRef: { current: ((line: number) => void) | null };
}

// Single-tab-at-a-time mobile shell. All three panels stay mounted so Monaco's
// undo stack and the R3F viewer's camera survive a tab switch — non-active
// panes get `visibility: hidden` (so the elements stay in layout). The hidden
// viewer doesn't burn frames because its Canvas uses `frameloop="demand"`,
// so WebGL only renders on explicit invalidation, not while the user is on
// another tab.
export default function MobileLayout({
  onCodeChange,
  editorFormatRef,
  editorJumpToLineRef,
}: MobileLayoutProps) {
  const [tab, setTab] = useState<Tab>('viewer');
  const error = usePlaygroundStore((s) => s.error);
  const runSeq = usePlaygroundStore((s) => s.runSeq);

  // Flag the Viewer tab when a run lands while the user is elsewhere, so they
  // know their edit took effect without yanking them off the tab they're on.
  // Switching to Viewer marks the current result seen and clears the flag.
  const [viewerDirty, setViewerDirty] = useState(false);
  const seenSeqRef = useRef(runSeq);
  useEffect(() => {
    if (tab === 'viewer') {
      seenSeqRef.current = runSeq;
      setViewerDirty(false);
    } else if (runSeq !== seenSeqRef.current) {
      setViewerDirty(true);
    }
  }, [runSeq, tab]);

  // Errors never auto-switch the tab on mobile — the Console tab's red badge
  // handles discoverability, and yanking the user off Viewer/Editor mid-task
  // (the debounced auto-run fires an error on every transient typo) is jarring
  // on a phone. The user opens Console themselves.

  const dismissConsole = useCallback(() => {
    setTab('viewer');
  }, []);

  const jumpAndOpenEditor = useCallback(
    (line: number) => {
      setTab('editor');
      // Defer until the editor pane is visible — Monaco's reveal calls are
      // a no-op while the wrapping div is `invisible`.
      setTimeout(() => editorJumpToLineRef.current?.(line), 0);
    },
    [editorJumpToLineRef]
  );

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <div className="relative flex-1 overflow-hidden">
        <PaneShell active={tab === 'editor'}>
          <EditorPanel
            onCodeChange={onCodeChange}
            onFormat={editorFormatRef}
            jumpToLineRef={editorJumpToLineRef}
          />
        </PaneShell>
        <PaneShell active={tab === 'viewer'}>
          <ViewerPanel />
        </PaneShell>
        <PaneShell active={tab === 'console'}>
          <OutputPanel onCollapse={dismissConsole} onJumpToLine={jumpAndOpenEditor} />
        </PaneShell>
      </div>

      <nav
        className="pb-safe shrink-0 border-t border-border-subtle bg-surface"
        aria-label="Playground panels"
      >
        <div className="flex h-12 items-stretch" role="tablist">
          <TabButton
            label="Editor"
            active={tab === 'editor'}
            onClick={() => {
              setTab('editor');
            }}
          />
          <TabButton
            label="Viewer"
            active={tab === 'viewer'}
            onClick={() => {
              setTab('viewer');
            }}
            dot={viewerDirty}
          />
          <TabButton
            label="Console"
            active={tab === 'console'}
            onClick={() => {
              setTab('console');
            }}
            badge={error ? '!' : undefined}
          />
        </div>
      </nav>
    </div>
  );
}

function PaneShell({ active, children }: { active: boolean; children: React.ReactNode }) {
  // `inert` removes the subtree from the tab order and accessibility tree —
  // critical for hidden Monaco / focusable buttons. `visibility: hidden`
  // alone leaves them in the focus order, so a user pressing Tab could land
  // on something they can't see.
  return (
    <div className={`absolute inset-0 ${active ? '' : 'invisible'}`} inert={!active}>
      {children}
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
  badge,
  dot,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: string;
  dot?: boolean;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative flex flex-1 items-center justify-center gap-1 text-xs font-medium transition-colors ${
        active
          ? 'border-t-2 border-teal-primary text-white'
          : 'border-t-2 border-transparent text-gray-400 hover:text-gray-200'
      }`}
    >
      {label}
      {badge !== undefined && (
        <span className="absolute right-[28%] top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
          {badge}
        </span>
      )}
      {dot && badge === undefined && (
        <span
          className="animate-tab-cue absolute right-[30%] top-2 h-2 w-2 rounded-full bg-teal-primary"
          aria-label="Result updated"
        />
      )}
    </button>
  );
}
