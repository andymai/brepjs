type Props = Record<string, string | number | boolean>;

let send: (event: string, props: Props) => void = () => undefined;

/**
 * Page views and conversion counts, in production only. An event carries the
 * outcome of a conversion (tier, size class, time) and never the file or its name.
 */
export function initAnalytics(): void {
  if (!import.meta.env.PROD) return;
  const sinks: ((event: string, props: Props) => void)[] = [];
  send = (event, props) => {
    for (const sink of sinks) sink(event, props);
  };
  void import('@vercel/analytics').then(({ inject, track }) => {
    inject();
    sinks.push(track);
  });
  const key = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;
  if (!key) return;
  void import('posthog-js').then(({ default: posthog }) => {
    posthog.init(key, {
      // Same-origin proxy (see the rewrites in vercel.json), as on the rest of the site.
      api_host: import.meta.env.VITE_POSTHOG_HOST ?? '/ingest',
      ui_host: 'https://us.posthog.com',
      defaults: '2025-05-24',
      person_profiles: 'identified_only',
      // The page promises that a file stays in the browser. Autocapture and
      // session replay read page text, which includes the file name.
      autocapture: false,
      disable_session_recording: true,
    });
    sinks.push((event, props) => posthog.capture(event, props));
  });
}

export function track(event: string, props: Props = {}): void {
  send(event, props);
}
