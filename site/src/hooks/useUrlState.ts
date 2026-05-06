import { useEffect, useRef } from 'react';
import { usePlaygroundStore } from '../stores/playgroundStore';
import { useToastStore } from '../stores/toastStore';
import { decodeShare, encodeCodeQuery } from '../lib/urlCodec';
import { findExample } from '../lib/examples';

function hasShareParams(url: URL): boolean {
  return (
    url.searchParams.has('code') ||
    url.searchParams.has('example') ||
    url.hash.startsWith('#code/') ||
    url.hash.startsWith('#example/')
  );
}

export function useUrlState() {
  const setCode = usePlaygroundStore((s) => s.setCode);
  const setPendingReview = usePlaygroundStore((s) => s.setPendingReview);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const url = new URL(window.location.href);
    const addToast = useToastStore.getState().addToast;
    const result = decodeShare(url);
    if (!result) {
      // The URL had a share param but it failed to decode — tell the user
      // instead of silently dropping it. Default-loaded sessions (no params)
      // pass through without a toast.
      if (hasShareParams(url)) {
        addToast("Couldn't read the shared link — loaded the default code instead.");
      }
      return;
    }

    if (result.type === 'code') {
      setCode(result.code);
      setPendingReview(true); // shared links require review before run
    } else {
      const ex = findExample(result.id);
      if (ex) {
        setCode(ex.code);
      } else {
        addToast(`Example "${result.id}" not found — loaded the default code instead.`);
      }
    }

    // Migrate legacy hash URLs to the new query format so further updates
    // and clipboard copies pick up the canonical form.
    if (result.legacy) {
      const next =
        result.type === 'code'
          ? `${url.pathname}${encodeCodeQuery(result.code)}`
          : `${url.pathname}?example=${encodeURIComponent(result.id)}`;
      history.replaceState(null, '', next);
    }
  }, [setCode, setPendingReview]);

  // Update URL on successful eval (called manually, not on every code change).
  const updateUrl = (code: string) => {
    const query = encodeCodeQuery(code);
    history.replaceState(null, '', `${window.location.pathname}${query}`);
  };

  const copyShareUrl = async (code: string) => {
    const query = encodeCodeQuery(code);
    const url = `${window.location.origin}${window.location.pathname}${query}`;
    history.replaceState(null, '', `${window.location.pathname}${query}`);
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

  return { updateUrl, copyShareUrl };
}
