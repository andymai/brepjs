import { useEffect, useRef } from 'react';
import { usePlaygroundStore } from '../stores/playgroundStore';
import { useToastStore } from '../stores/toastStore';
import {
  decodeShare,
  encodeCodeQuery,
  hasShareParams,
  type SharedSelection,
} from '../lib/urlCodec';

function selectionsForUrl(): SharedSelection[] {
  return usePlaygroundStore
    .getState()
    .selections.map((s) =>
      s.kind === 'face'
        ? { kind: 'face' as const, id: s.info.faceId }
        : { kind: 'edge' as const, id: s.info.edgeId }
    );
}

export function useUrlState() {
  const setCode = usePlaygroundStore((s) => s.setCode);
  const setPendingSharedSelections = usePlaygroundStore((s) => s.setPendingSharedSelections);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const url = new URL(window.location.href);
    const addToast = useToastStore.getState().addToast;
    const result = decodeShare(url);
    if (!result) {
      // Toast on a present-but-undecodable share param so the user knows why
      // the default code loaded; default-loaded sessions (no params) pass
      // through silently.
      if (hasShareParams(url)) {
        addToast("Couldn't read the shared link — loaded the default code instead.");
      }
      return;
    }

    setCode(result.code);
    if (result.selections.length > 0) {
      setPendingSharedSelections(result.selections);
    }

    if (result.legacy) {
      const next = `${url.pathname}${encodeCodeQuery(result.code)}`;
      history.replaceState(null, '', next);
    }
  }, [setCode, setPendingSharedSelections]);

  const updateUrl = (code: string) => {
    const query = encodeCodeQuery(code, selectionsForUrl());
    history.replaceState(null, '', `${window.location.pathname}${query}`);
  };

  // Build the canonical permalink and sync it into the address bar, returning
  // the absolute URL so callers can hand it to the native share sheet.
  const buildShareUrl = (code: string): string => {
    const query = encodeCodeQuery(code, selectionsForUrl());
    const url = `${window.location.origin}${window.location.pathname}${query}`;
    history.replaceState(null, '', `${window.location.pathname}${query}`);
    return url;
  };

  const copyShareUrl = async (code: string) => {
    const url = buildShareUrl(code);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- intentional fallback for older browsers
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  };

  return { updateUrl, copyShareUrl, buildShareUrl };
}
