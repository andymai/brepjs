import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, type Example } from '../../lib/examples';
import { buildSearchIndex, searchExamples } from '../../lib/examples/search';

interface Props {
  open: boolean;
  focusedId?: string | null;
  onClose: () => void;
  onSelect: (example: Example) => void;
  onFocusExample?: (id: string) => void;
}

const THUMB_BASE = `${import.meta.env.BASE_URL}example-thumbs/`;
const ALL = 'all';
const SEARCH_INDEX = buildSearchIndex(CATEGORIES);

export default function ExampleGallery({
  open,
  focusedId,
  onClose,
  onSelect,
  onFocusExample,
}: Props) {
  const [category, setCategory] = useState(ALL);
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // Turntable ids that 404'd, kept across card remounts (filter/search changes
  // re-key the grid) so a missing turntable is never re-requested.
  const failedTurntables = useRef<Set<string>>(new Set());

  // Reset scope + focus the search box each time the gallery opens.
  useEffect(() => {
    if (!open) return;
    setCategory(ALL);
    setQuery('');
    const id = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open]);

  // Focus trap + Esc: aria-modal only reaches assistive tech once focus is
  // inside, so trap Tab within the panel and restore focus on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
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
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
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

  const hits = useMemo(() => searchExamples(SEARCH_INDEX, query), [query]);

  // Per-category match counts that respect the active query, so the rail tells
  // the user where their search lives.
  const counts = useMemo(() => {
    const m: Record<string, number> = { [ALL]: hits.length };
    for (const c of CATEGORIES) m[c.id] = 0;
    for (const hit of hits) m[hit.entry.categoryId] = (m[hit.entry.categoryId] ?? 0) + 1;
    return m;
  }, [hits]);

  // Active set = category ∩ query, best match first when searching.
  const shown = useMemo(
    () => (category === ALL ? hits : hits.filter((hit) => hit.entry.categoryId === category)),
    [category, hits]
  );

  // Deep-linked focus (/examples/<id>): scroll the card into view and focus it.
  useEffect(() => {
    if (!open || !focusedId) return;
    // CSS.escape: focusedId is a URL path segment, so guard the selector against
    // metacharacters that would otherwise throw a DOMException.
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(focusedId)}"]`);
    el?.scrollIntoView({ block: 'center' });
    el?.focus();
  }, [open, focusedId, shown]);

  if (!open) return null;

  const rail = [
    { id: ALL, label: 'All' },
    ...CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Example gallery"
    >
      <div
        ref={panelRef}
        className="flex h-full max-h-[94dvh] w-full max-w-[110rem] flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-2xl sm:flex-row"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {/* Category rail — vertical on desktop, horizontal scroll strip on mobile */}
        <nav
          aria-label="Categories"
          className="scrollbar-thin flex shrink-0 gap-1 overflow-x-auto border-b border-border-subtle p-2 sm:w-52 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:border-b-0 sm:border-r sm:p-3"
        >
          <div className="hidden px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:block">
            Examples
          </div>
          {rail.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setCategory(r.id);
              }}
              aria-pressed={category === r.id}
              className={`flex shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium transition-colors sm:py-1.5 ${
                category === r.id
                  ? 'bg-teal-primary/20 text-teal-light'
                  : 'text-gray-400 hover:bg-surface-overlay hover:text-gray-200'
              }`}
            >
              <span>{r.label}</span>
              <span
                className={`text-xs tabular-nums ${
                  category === r.id ? 'text-teal-light/70' : 'text-gray-600'
                }`}
              >
                {counts[r.id] ?? 0}
              </span>
            </button>
          ))}
        </nav>

        {/* Main: search header + card grid */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2.5">
            <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path
                d="M10.5 10.5L14 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              placeholder="Search by name or function (gear, loft, m6 screw)…"
              aria-label="Search examples"
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none"
            />
            <span className="shrink-0 text-xs tabular-nums text-gray-500">{shown.length}</span>
            <button
              onClick={onClose}
              aria-label="Close"
              className="ml-1 shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-surface-overlay hover:text-white"
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

          {shown.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="text-sm text-gray-400">No examples match “{query}”.</p>
              {category !== ALL && (
                <button
                  onClick={() => {
                    setCategory(ALL);
                  }}
                  className="text-xs font-medium text-teal-light hover:underline"
                >
                  Search all categories
                </button>
              )}
            </div>
          ) : (
            // Scroll container kept separate from the grid: a flex-1 element
            // that is itself the grid gives the rows a definite height, which
            // stops aspect-ratio thumbnails from resolving and collapses them.
            <div ref={gridRef} className="scrollbar-thin pb-safe min-h-0 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 content-start gap-3 p-3 sm:grid-cols-3 sm:p-4 lg:grid-cols-4 2xl:grid-cols-5">
                {shown.map(({ entry, matchedApi }) => (
                  <ExampleCard
                    key={entry.example.id}
                    example={entry.example}
                    categoryLabel={category === ALL ? entry.categoryLabel : null}
                    matchedApi={matchedApi}
                    focused={entry.example.id === focusedId}
                    failedTurntables={failedTurntables}
                    onSelect={() => onSelect(entry.example)}
                    onFocus={() => onFocusExample?.(entry.example.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface CardProps {
  example: Example;
  /** Shown only in the All view, where the rail does not name the category. */
  categoryLabel: string | null;
  /** Imported functions the query matched, so an API hit explains itself. */
  matchedApi: readonly string[];
  focused: boolean;
  failedTurntables: { current: Set<string> };
  onSelect: () => void;
  onFocus: () => void;
}

function ExampleCard({
  example,
  categoryLabel,
  matchedApi,
  focused,
  failedTurntables,
  onSelect,
  onFocus,
}: CardProps) {
  const [hovered, setHovered] = useState(false);
  // Turntable assets may not exist for every example; fall back to the static
  // thumbnail on the first load error so the grid never breaks. Seed from the
  // shared failed set so a once-404'd turntable isn't re-requested on remount.
  const [failed, setFailed] = useState(() => failedTurntables.current.has(example.id));

  return (
    <button
      data-id={example.id}
      onClick={onSelect}
      onFocus={onFocus}
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
      title={example.label}
      className={`group block overflow-hidden rounded-lg border-2 bg-surface-overlay/40 text-left transition-colors focus:outline-none ${
        focused
          ? 'border-teal-primary'
          : 'border-transparent hover:border-teal-primary/50 focus-visible:border-teal-primary'
      }`}
    >
      {/* The square thumbnail img sizes the box in normal flow (replaced elements
          carry intrinsic dimensions), so the card and grid row grow to fit; the
          hover turntable overlays it absolutely. An aspect-square box with a
          percentage width can't resolve its height during grid track sizing and
          collapses the thumbnail to a sliver. */}
      <div className="relative overflow-hidden bg-black/30">
        <img
          src={`${THUMB_BASE}${example.id}.webp`}
          alt=""
          loading="lazy"
          className="block aspect-square w-full object-contain"
        />
        {/* Lazy turntable: only mounted (and thus fetched) on hover/focus. */}
        {hovered && !failed && (
          <img
            src={`${THUMB_BASE}${example.id}.turntable.webp`}
            alt=""
            aria-hidden="true"
            onError={() => {
              failedTurntables.current.add(example.id);
              setFailed(true);
            }}
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-2.5">
        <span className="truncate text-sm font-medium text-gray-200">{example.label}</span>
        <span className="line-clamp-2 text-xs leading-snug text-gray-500">
          {example.description}
        </span>
        {(categoryLabel !== null || matchedApi.length > 0) && (
          <span className="mt-1 flex flex-wrap gap-1">
            {categoryLabel !== null && (
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                {categoryLabel}
              </span>
            )}
            {matchedApi.slice(0, 3).map((name) => (
              <span
                key={name}
                className="rounded bg-teal-primary/15 px-1.5 py-0.5 font-mono text-[10px] text-teal-light"
              >
                {name}()
              </span>
            ))}
          </span>
        )}
      </div>
    </button>
  );
}
