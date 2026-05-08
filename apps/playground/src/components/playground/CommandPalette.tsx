import { useEffect, useMemo, useRef, useState } from 'react';

export interface Command {
  id: string;
  label: string;
  group?: string;
  keys?: string;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

// Subsequence match scorer: every char of `q` must appear in `text` in order.
// Lower = closer match. Returns null when no match. Used for fuzzy filtering
// without pulling in a heavier library like fuse.js — palette has <30 entries.
function fuzzyScore(text: string, q: string): number | null {
  if (!q) return 0;
  const lower = text.toLowerCase();
  let ti = 0;
  let lastMatch = -1;
  let runs = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const target = q[qi];
    if (target === undefined) continue;
    const found = lower.indexOf(target, ti);
    if (found === -1) return null;
    if (found !== lastMatch + 1) runs++;
    lastMatch = found;
    ti = found + 1;
  }
  return runs * 10 + lastMatch;
}

export default function CommandPalette({ open, onClose, commands }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Reset transient palette state every time it opens so the user always
  // starts at the first match with an empty query.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!open) return [];
    const q = query.trim().toLowerCase();
    const scored = commands
      .map((c) => ({ c, score: fuzzyScore(`${c.group ?? ''} ${c.label}`, q) }))
      .filter((x): x is { c: Command; score: number } => x.score !== null);
    scored.sort((a, b) => a.score - b.score);
    return scored.map((x) => x.c);
  }, [open, query, commands]);

  // Clamp the active index when the filtered list shrinks below it.
  useEffect(() => {
    if (active >= filtered.length) setActive(0);
  }, [filtered.length, active]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(filtered.length - 1, a + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[active];
        if (cmd) {
          cmd.run();
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [open, filtered, active, onClose]);

  // Keep the active row scrolled into view as the user navigates.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[15vh] backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border border-border-subtle bg-surface shadow-xl"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          placeholder="Search actions..."
          className="w-full border-b border-border-subtle bg-transparent px-3 py-2.5 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none"
        />
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">No matching action</div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                data-index={i}
                onClick={() => {
                  cmd.run();
                  onClose();
                }}
                onMouseEnter={() => {
                  setActive(i);
                }}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm ${
                  i === active ? 'bg-teal-primary/15 text-teal-light' : 'text-gray-300'
                }`}
              >
                <span className="truncate">
                  {cmd.group && (
                    <span className="mr-1.5 text-[10px] uppercase tracking-wider text-gray-500">
                      {cmd.group}
                    </span>
                  )}
                  {cmd.label}
                </span>
                {cmd.keys && (
                  <kbd className="ml-2 shrink-0 rounded border border-border-subtle bg-surface-overlay px-1.5 py-0.5 font-mono text-[10px] text-gray-400">
                    {cmd.keys}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
