import posthog from 'posthog-js';

const KEY = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;
const HOST = import.meta.env.VITE_POSTHOG_HOST ?? '/ingest';

let enabled = false;

export function initPostHog(): void {
  // No key (local dev, forks without the env var) → stay disabled so
  // captureEvent() becomes a no-op instead of warning on every action.
  if (!KEY) return;

  posthog.init(KEY, {
    // api_host is a same-origin Vercel reverse proxy (see vercel.json rewrites),
    // so ingestion dodges the ad blockers that block posthog.com directly —
    // brepjs's developer audience runs them heavily. ui_host keeps the toolbar
    // and "view in PostHog" links pointing at the real app.
    api_host: HOST,
    ui_host: 'https://us.posthog.com',
    defaults: '2025-05-24',
    // We never call identify(), so don't mint a person profile per anonymous
    // visitor — keeps this to pageview/event analytics only.
    person_profiles: 'identified_only',
  });
  enabled = true;
}

export function captureEvent(
  event: string,
  props?: Record<string, string | number | boolean>
): void {
  if (!enabled) return;
  posthog.capture(event, props);
}
