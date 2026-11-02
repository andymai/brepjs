/// <reference types="vite/client" />

declare module 'occt-wasm/dist/occt-wasm.js' {
  const createModule: import('occt-wasm').OcctModuleFactory;
  export default createModule;
}
