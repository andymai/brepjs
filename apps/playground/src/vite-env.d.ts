/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POSTHOG_PROJECT_TOKEN?: string;
  readonly VITE_POSTHOG_HOST?: string;
}

declare module '*.d.ts?raw' {
  const content: string;
  export default content;
}

// Build-time constant injected via Vite's `define`. Sourced from the brepjs
// monorepo's root package.json at build time.
declare const __BREPJS_VERSION__: string;

// Content hash of each file served under `${BASE_URL}wasm/`, keyed by file name.
// Injected by vite.config.ts; see wasmUrl().
declare const __WASM_ASSET_HASHES__: Record<string, string>;
