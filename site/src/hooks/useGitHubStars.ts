import { useEffect, useRef, useState } from 'react';

const CACHE_KEY = 'brepjs-gh-stars';
const CACHE_TTL = 1000 * 60 * 30; // 30 min

export function useGitHubStars(repo: string): number | null {
  const [stars, setStars] = useState<number | null>(() => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { count, ts } = JSON.parse(cached) as { count: number; ts: number };
        if (Date.now() - ts < CACHE_TTL) return count;
      }
    } catch {
      // ignore
    }
    return null;
  });

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (stars !== null) return;

    const controller = new AbortController();
    abortRef.current = controller;

    fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { stargazers_count: number }) => {
        const count = data.stargazers_count;
        setStars(count);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ count, ts: Date.now() }));
        } catch {
          // ignore
        }
      })
      .catch(() => {
        // Silently fail — badge just won't show
      });

    return () => controller.abort();
  }, [repo, stars]);

  return stars;
}
