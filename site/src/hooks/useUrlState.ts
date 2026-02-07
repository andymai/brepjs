import { useEffect, useRef } from 'react';
import { usePlaygroundStore } from '../stores/playgroundStore';
import { decodeHash, encodeCode } from '../lib/urlCodec';
import { findExample } from '../lib/examples';

export function useUrlState() {
  const setCode = usePlaygroundStore((s) => s.setCode);
  const setPendingReview = usePlaygroundStore((s) => s.setPendingReview);
  const initialized = useRef(false);

  // On mount: read URL hash and set code
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const result = decodeHash(window.location.hash);
    if (!result) return;

    if (result.type === 'code') {
      setCode(result.code);
      setPendingReview(true); // Don't auto-run shared links — user must review first
    } else {
      const ex = findExample(result.id);
      if (ex) setCode(ex.code);
    }
  }, [setCode, setPendingReview]);

  // Update URL on successful eval (called manually, not on every code change)
  const updateUrl = (code: string) => {
    const hash = encodeCode(code);
    history.replaceState(null, '', hash);
  };

  const copyShareUrl = async (code: string) => {
    const hash = encodeCode(code);
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    history.replaceState(null, '', hash);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for browsers without clipboard API
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
