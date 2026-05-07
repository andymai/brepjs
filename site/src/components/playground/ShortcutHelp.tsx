import { useEffect } from 'react';
import { SHORTCUTS, formatShortcut, isMac } from '../../lib/shortcuts';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Row {
  label: string;
  keys: string;
}

const VIEWPORT_ROWS: Row[] = [
  { label: 'Pick face/edge', keys: 'Click' },
  { label: 'Add to selection', keys: 'Shift+Click' },
  { label: 'Clear selection', keys: 'Click empty space' },
];

export default function ShortcutHelp({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [open, onClose]);

  if (!open) return null;

  const editorRows: Row[] = Object.values(SHORTCUTS).map((def) => ({
    label: def.label,
    keys: formatShortcut(def),
  }));
  const helpRow: Row = {
    label: 'Show this help',
    keys: '?',
  };
  const paletteRow: Row = {
    label: 'Command palette',
    keys: isMac ? '⌘+K' : 'Ctrl+K',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="w-full max-w-md rounded-lg border border-border-subtle bg-surface p-5 shadow-xl"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-200">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-300"
            aria-label="Close shortcut help"
          >
            Esc
          </button>
        </div>
        <Section title="Actions" rows={[...editorRows, paletteRow, helpRow]} />
        <Section title="Viewport" rows={VIEWPORT_ROWS} />
      </div>
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {title}
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-xs">
            <span className="text-gray-300">{r.label}</span>
            <kbd className="rounded border border-border-subtle bg-surface-overlay px-1.5 py-0.5 font-mono text-[10px] text-gray-300">
              {r.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
