/// <reference types="vite/client" />

declare module '*.d.ts?raw' {
  const content: string;
  export default content;
}

// Build-time constant injected via Vite's `define`. Sourced from the brepjs
// monorepo's root package.json at build time.
declare const __BREPJS_VERSION__: string;
