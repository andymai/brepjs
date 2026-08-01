import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';

// Without this, @monaco-editor/react falls back to its default loader, which
// fetches the editor from cdn.jsdelivr.net at runtime. That made the
// monaco-editor version in package.json cosmetic: the pin only supplied types
// while users ran whatever version the loader defaulted to, which lagged the
// pin and shipped an older bundled DOMPurify. It also put editor execution
// outside the lockfile, where no dependency scanner could see it.
//
// No MonacoEnvironment.getWorker shim is needed: monaco 0.56 spawns its own
// workers with `new Worker(new URL('...', import.meta.url), {type:'module'})`,
// which Vite resolves and emits at build time.
loader.config({ monaco });
