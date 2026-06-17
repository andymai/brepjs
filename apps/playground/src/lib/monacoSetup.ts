import type { Monaco } from '@monaco-editor/react';
import ambientTypes from '../types/brepjs-ambient.d.ts?raw';
import sheetmetalAmbientTypes from '../types/brepjs-sheetmetal-ambient.d.ts?raw';
import bimAmbientTypes from '../types/brepjs-bim-ambient.d.ts?raw';
import { buildBrepjsModuleDts } from './ambientModule';

let initialized = false;

export function setupMonaco(monaco: Monaco) {
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

  // We omit `lib` so Monaco's TS worker uses the default lib for the target
  // (lib.es2022.full.d.ts), which transitively pulls in lib.es5.d.ts — the
  // file declaring `Math`, `Array<T>`, etc. Passing `lib: ['es2022']`
  // explicitly hits a Monaco bug where the reference isn't expanded
  // transitively, leaving user code with "Cannot find name 'Math'" errors
  // (issue #761).
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2022,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    strict: true,
    noEmit: true,
    allowJs: true,
  });

  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    buildBrepjsModuleDts(ambientTypes, sheetmetalAmbientTypes, bimAmbientTypes),
    'file:///node_modules/@types/brepjs/index.d.ts'
  );
}
