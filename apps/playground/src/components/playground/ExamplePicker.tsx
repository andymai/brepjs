import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, EXAMPLES, type Example } from '../../lib/examples';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (example: Example) => void;
}

const THUMB_BASE = `${import.meta.env.BASE_URL}example-thumbs/`;

// 'all' plus one id per category; derived from the library so new categories
// appear automatically.
const FILTERS = [
  { id: 'all', label: 'All' },
  ...CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
];

export default function ExamplePicker({ open, onClose, onSelect }: Props) {
  const [filter, setFilter] = useState('all');
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Reset to the full set each time the modal opens.
  useEffect(() => {
    if (open) setFilter('all');
  }, [open]);

  // Focus management: move focus into the dialog on open, trap Tab within it
  // (aria-modal is only honoured by assistive tech when focus starts inside),
  // and restore focus to the previously-focused element on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      // Wrap focus at the boundaries so Tab can't escape behind the overlay.
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  const shown = useMemo(() => {
    if (filter === 'all') return EXAMPLES;
    return CATEGORIES.find((c) => c.id === filter)?.examples ?? EXAMPLES;
  }, [filter]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Example picker"
    >
      <div
        ref={panelRef}
        className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-2xl"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {/* Header: title + filter pills + close */}
        <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-200">Examples</h2>
          <div className="flex flex-1 flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setFilter(f.id);
                }}
                aria-pressed={filter === f.id}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f.id
                    ? 'bg-teal-primary/20 text-teal-light'
                    : 'text-gray-400 hover:bg-surface-overlay hover:text-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-gray-400 transition-colors hover:bg-surface-overlay hover:text-white"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
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

        {/* Card grid */}
        <div className="grid grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((ex) => (
            <button
              key={ex.id}
              onClick={() => {
                onSelect(ex);
                onClose();
              }}
              className="group flex flex-col overflow-hidden rounded-lg border-2 border-transparent bg-surface-overlay/40 text-left transition-colors hover:border-teal-primary/50 focus:outline-none focus-visible:border-teal-primary"
            >
              <div className="flex aspect-square items-center justify-center overflow-hidden bg-black/30">
                <img
                  src={`${THUMB_BASE}${ex.id}.webp`}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="flex flex-col gap-0.5 p-2.5">
                <span className="truncate text-sm font-medium text-gray-200" title={ex.label}>
                  {ex.label}
                </span>
                <span className="line-clamp-2 text-xs leading-snug text-gray-500">
                  {ex.description}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
