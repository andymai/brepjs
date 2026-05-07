import { useEffect, useRef } from 'react';
import { usePlaygroundStore } from '../stores/playgroundStore';
import { DEFAULT_CODE } from '../lib/constants';
import { hasShareParams } from '../lib/urlCodec';

const DRAFT_KEY = 'brepjs-playground-draft';
const DEBOUNCE_MS = 500;

/**
 * Persists the editor code to localStorage so an accidental tab close doesn't
 * lose unrun work. On mount, restores the draft only when the URL has no
 * share params — share links always win because they were chosen explicitly.
 *
 * Pair with useUrlState: that hook runs first and has already settled any
 * URL-decoded code by the time this effect's restore branch checks the URL.
 */
export function useDraftPersistence() {
  const code = usePlaygroundStore((s) => s.code);
  const setCode = usePlaygroundStore((s) => s.setCode);

  // One-shot: restore from draft on mount if appropriate.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (hasShareParams(url)) return;

    let draft: string | null = null;
    try {
      draft = localStorage.getItem(DRAFT_KEY);
    } catch {
      return;
    }
    // Skip restore when the draft matches the default — that's just noise
    // (user never edited last time).
    if (!draft || draft === DEFAULT_CODE) return;
    setCode(draft);
  }, [setCode]);

  // Debounced save on every code change. Two guards:
  //   1. savedOnce: skip the very first call so we don't write the default
  //      (or a freshly-restored draft) right back. The previous version used
  //      the restore effect's `initialized` ref, but React fires effects in
  //      declaration order so that ref was always `true` by the time this
  //      effect ran — making the guard dead.
  //   2. hasShareParams: when the URL carries `?code=` or `#code/`, the
  //      pending `code` is the shared payload, not the user's own work.
  //      Writing it would silently clobber whatever draft they had on a
  //      future fresh visit.
  const savedOnce = useRef(false);
  useEffect(() => {
    if (!savedOnce.current) {
      savedOnce.current = true;
      return;
    }
    if (hasShareParams(new URL(window.location.href))) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, code);
      } catch {
        // localStorage can throw under quota or privacy settings — silently
        // give up; the draft is best-effort, not load-bearing.
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
    };
  }, [code]);
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // best-effort
  }
}
