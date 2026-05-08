import { useEffect, useState } from 'react';

// Tracks Tailwind's `sm` breakpoint so the playground can swap the
// horizontal split-panel layout for a tabbed mobile shell.
const QUERY = '(max-width: 640px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };
    mq.addEventListener('change', handler);
    return () => {
      mq.removeEventListener('change', handler);
    };
  }, []);

  return isMobile;
}
