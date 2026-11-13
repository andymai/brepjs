import type * as monacoApi from 'monaco-editor';
import ambientTypes from '../types/brepjs-ambient.d.ts?raw';
import sheetmetalAmbientTypes from '../types/brepjs-sheetmetal-ambient.d.ts?raw';
import bimAmbientTypes from '../types/brepjs-bim-ambient.d.ts?raw';
import familiesAmbientTypes from '../types/brepjs-families-ambient.d.ts?raw';
import { buildBrepjsModuleDts } from './ambientModule';

let initialized = false;

// `Monaco` from @monaco-editor/react is `any` here: it imports its types from a
// monaco path that the package does not export. The real namespace type makes
// tsc reject a compiler option that monaco does not have.
export function setupMonaco(monaco: typeof monacoApi) {
  if (initialized) return;
  initialized = true;

  monaco.editor.defineTheme('brepjs-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'c084fc' },
      { token: 'string', foreground: '4ade80' },
      { token: 'number', foreground: 'fbbf24' },
      { token: 'comment', foreground: '6b7280' },
      { token: 'type', foreground: '60a5fa' },
    ],
    colors: {
      'editor.background': '#0f0f14',
      'editor.foreground': '#e5e7eb',
      'editor.lineHighlightBackground': '#1a1a24',
      'editor.selectionBackground': '#4ACECC40',
      'editorCursor.foreground': '#4ACECC',
      'editorGutter.background': '#0f0f14',
      'editorLineNumber.foreground': '#4b5563',
      'editorLineNumber.activeForeground': '#9ca3af',
    },
  });

  // monaco's ScriptTarget has no member between ES2020 and ESNext. A member
  // that does not exist reads as undefined, and the worker then checks the code
  // as ES5.
  // We omit `lib` so Monaco's TS worker uses the default lib for the target
  // (lib.esnext.full.d.ts), which transitively pulls in lib.es5.d.ts — the
  // file declaring `Math`, `Array<T>`, etc. Passing `lib: ['es2022']`
  // explicitly hits a Monaco bug where the reference isn't expanded
  // transitively, leaving user code with "Cannot find name 'Math'" errors
  // (issue #761).
  // monaco 0.56 moved the TypeScript language service off `languages.typescript`
  // to a top-level `typescript` namespace. The old path silently reads
  // undefined, so setupMonaco throws and the editor never mounts.
  monaco.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.typescript.ScriptTarget.ESNext,
    module: monaco.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    strict: true,
    noEmit: true,
    allowJs: true,
  });

  monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  monaco.typescript.typescriptDefaults.addExtraLib(
    buildBrepjsModuleDts(ambientTypes, sheetmetalAmbientTypes, bimAmbientTypes, familiesAmbientTypes),
    'file:///node_modules/@types/brepjs/index.d.ts'
  );
}
