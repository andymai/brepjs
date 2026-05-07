import { useEffect, useState } from 'react';
import { usePlaygroundStore } from '../../stores/playgroundStore';

const STORAGE_KEY = 'brepjs-playground-onboarded';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // best-effort: privacy mode / quota / etc.
  }
}

/**
 * Small pill at the bottom-center of the viewport that teaches first-time
 * visitors about the click-to-copy flow. Auto-dismisses on the first
 * selection (the user found it on their own) or on click.
 */
export default function OnboardingHint() {
  const [visible, setVisible] = useState(false);
  const selectionCount = usePlaygroundStore((s) => s.selections.length);

  useEffect(() => {
    if (!readDismissed()) setVisible(true);
  }, []);

  // Auto-dismiss the moment the user makes their first selection — no need
  // to lecture them about a flow they've already discovered.
  useEffect(() => {
    if (selectionCount > 0 && visible) {
      writeDismissed();
      setVisible(false);
    }
  }, [selectionCount, visible]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-teal-primary/30 bg-[rgba(15,15,20,0.92)] px-3 py-1.5 text-xs text-gray-300 shadow-lg backdrop-blur-sm">
        <span aria-hidden="true">💡</span>
        <span>Click a face or edge to copy a finder predicate</span>
        <button
          onClick={() => {
            writeDismissed();
            setVisible(false);
          }}
          aria-label="Dismiss tip"
          className="ml-1 rounded p-0.5 text-gray-500 transition-colors hover:bg-surface-overlay hover:text-gray-300"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
            <path
              d="M3 3l10 10M13 3L3 13"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
