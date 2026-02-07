import Editor, { type OnMount } from '@monaco-editor/react';
import { useCallback, useEffect, useRef } from 'react';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { setupMonaco } from '../../lib/monacoSetup';

interface EditorPanelProps {
  onCodeChange: (code: string) => void;
  onFormat?: { current: (() => void) | null };
}

export default function EditorPanel({ onCodeChange, onFormat }: EditorPanelProps) {
  const code = usePlaygroundStore((s) => s.code);
  const setCode = usePlaygroundStore((s) => s.setCode);
  const error = usePlaygroundStore((s) => s.error);
  const errorLine = usePlaygroundStore((s) => s.errorLine);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  // Track last code from user typing to distinguish from external updates
  const lastUserCodeRef = useRef(code);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      setupMonaco(monaco);
      monaco.editor.setTheme('brepjs-dark');

      // Register format function for external access
      if (onFormat) {
        onFormat.current = () => {
          void editor.getAction('editor.action.formatDocument')?.run();
        };
      }
    },
    [onFormat]
  );

  const handleChange = useCallback(
    (value: string | undefined) => {
      const newCode = value ?? '';
      lastUserCodeRef.current = newCode;
      setCode(newCode);
      onCodeChange(newCode);
    },
    [setCode, onCodeChange]
  );

  // Sync external code changes (example picker, URL state) to editor
  useEffect(() => {
    if (!editorRef.current) return;
    if (code !== lastUserCodeRef.current) {
      lastUserCodeRef.current = code;
      editorRef.current.setValue(code);
    }
  }, [code]);

  // Update error markers
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    try {
      const model = editor.getModel();
      if (!model) return;

      if (error && errorLine) {
        monaco.editor.setModelMarkers(model, 'brepjs', [
          {
            severity: monaco.MarkerSeverity.Error,
            message: error,
            startLineNumber: errorLine,
            startColumn: 1,
            endLineNumber: errorLine,
            endColumn: model.getLineMaxColumn(errorLine),
          },
        ]);
      } else {
        monaco.editor.setModelMarkers(model, 'brepjs', []);
      }
    } catch {
      // Editor may be disposed during StrictMode remount — ignore
    }
  }, [error, errorLine]);

  return (
    <Editor
      height="100%"
      defaultLanguage="typescript"
      path="playground.ts"
      defaultValue={code}
      keepCurrentModel
      onChange={handleChange}
      onMount={handleMount}
      theme="brepjs-dark"
      options={{
        fontSize: 14,
        lineHeight: 22,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        padding: { top: 12, bottom: 12 },
        wordWrap: 'on',
        tabSize: 2,
        automaticLayout: true,
        suggestOnTriggerCharacters: true,
      }}
    />
  );
}
