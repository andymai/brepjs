import { useEffect, useRef } from 'react';
import { usePlaygroundStore } from '../stores/playgroundStore';
import { DEFAULT_CODE } from '../lib/constants';
import { hasShareParams } from '../lib/urlCodec';

// v2 carries `{ code, hasUserEdit }`; v1 was a bare string. The v1 key is
// dropped on first read so a saved old default never sticks to the user
// after DEFAULT_CODE changes.
const DRAFT_KEY = 'brepjs-playground-draft-v2';
const LEGACY_DRAFT_KEY = 'brepjs-playground-draft';
const DEBOUNCE_MS = 500;

interface Draft {
  code: string;
  hasUserEdit: boolean;
}

function readDraft(): Draft | null {
  try {
    // Migrate v1 user work into v2 before deleting the legacy key — otherwise
    // anyone with a non-default v1 draft loses their code on first load.
    const legacyRaw = localStorage.getItem(LEGACY_DRAFT_KEY);
    localStorage.removeItem(LEGACY_DRAFT_KEY);

    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Draft>;
      if (typeof parsed.code !== 'string') return null;
      return { code: parsed.code, hasUserEdit: !!parsed.hasUserEdit };
    }

    if (typeof legacyRaw === 'string' && legacyRaw && legacyRaw !== DEFAULT_CODE) {
      return { code: legacyRaw, hasUserEdit: true };
    }
    return null;
  } catch {
    return null;
  }
}

function writeDraft(code: string): void {
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ code, hasUserEdit: code !== DEFAULT_CODE })
    );
  } catch {
    // best-effort: localStorage can throw under quota or privacy settings.
  }
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

  // One-shot: restore from draft on mount if appropriate.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (hasShareParams(url)) return;

    const draft = readDraft();
    if (!draft) return;
    // `hasUserEdit:false` means the draft was the default at save time, so a
    // newer DEFAULT_CODE shipping in this build should win — restoring would
    // pin the user to a stale (and possibly broken) example.
    if (!draft.hasUserEdit) return;
    if (draft.code === DEFAULT_CODE) return;
    setCode(draft.code);
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
      writeDraft(code);
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
    };
  }, [code]);
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(LEGACY_DRAFT_KEY);
  } catch {
    // best-effort
  }
}
