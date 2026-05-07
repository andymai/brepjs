import { useEffect, useRef } from 'react';
import { usePlaygroundStore } from '../stores/playgroundStore';
import { DEFAULT_CODE } from '../lib/constants';

const DRAFT_KEY = 'brepjs-playground-draft';
const DEBOUNCE_MS = 500;

function hasShareParams(url: URL): boolean {
  return url.searchParams.has('code') || url.hash.startsWith('#code/');
}

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
  const initialized = useRef(false);

  // One-shot: restore from draft on mount if appropriate.
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

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

  // Debounced save on every code change. Skip the very first synchronous
  // tick so we don't write the default before any user input.
  useEffect(() => {
    if (!initialized.current) return;
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
