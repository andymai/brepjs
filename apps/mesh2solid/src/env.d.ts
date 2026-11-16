/// <reference types="vite/client" />

declare module 'occt-wasm/dist/occt-wasm.js' {
  const createModule: import('occt-wasm').OcctModuleFactory;
  export default createModule;
}

interface ImportMetaEnv {
  readonly VITE_POSTHOG_PROJECT_TOKEN?: string;
  readonly VITE_POSTHOG_HOST?: string;
}
