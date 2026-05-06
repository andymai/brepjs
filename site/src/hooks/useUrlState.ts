import { useEffect, useRef } from 'react';
import { usePlaygroundStore } from '../stores/playgroundStore';
import { decodeShare, encodeCodeQuery } from '../lib/urlCodec';
import { findExample } from '../lib/examples';

export function useUrlState() {
  const setCode = usePlaygroundStore((s) => s.setCode);
  const setPendingReview = usePlaygroundStore((s) => s.setPendingReview);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const url = new URL(window.location.href);
    const result = decodeShare(url);
    if (!result) return;

    if (result.type === 'code') {
      setCode(result.code);
      setPendingReview(true); // shared links require review before run
    } else {
      const ex = findExample(result.id);
      if (ex) setCode(ex.code);
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
