import type { Monaco } from '@monaco-editor/react';
// Vite ?raw import — gets file contents as string
import ambientTypes from '../types/brepjs-ambient.d.ts?raw';

export function setupMonaco(monaco: Monaco) {
  // Define dark theme matching site colors
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
      'editor.selectionBackground': '#6366f140',
      'editorCursor.foreground': '#6366f1',
      'editorGutter.background': '#0f0f14',
      'editorLineNumber.foreground': '#4b5563',
      'editorLineNumber.activeForeground': '#9ca3af',
    },
  });

  // Configure TypeScript compiler options
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2022,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    strict: true,
    noEmit: true,
    allowJs: true,
    lib: ['es2022'],
  });

  // Disable diagnostic errors that don't make sense for eval'd code
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  // Register brepjs ambient type declarations
  monaco.languages.typescript.typescriptDefaults.addExtraLib(ambientTypes, 'brepjs-ambient.d.ts');
}
