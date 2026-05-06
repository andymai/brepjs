import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
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

  // beforeMount fires before the Editor instance is created, so the theme is
  // registered ahead of first paint and we no longer flash from `vs-dark`.
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    setupMonaco(monaco);
  }, []);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

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

  // Sync external code changes (example picker, URL state) to editor.
  // We replace the model contents through pushEditOperations so the user's
  // undo stack survives loading an example.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (code === lastUserCodeRef.current) return;

    lastUserCodeRef.current = code;
    const model = editor.getModel();
    if (!model) {
      editor.setValue(code);
      return;
    }
    model.pushEditOperations(
      [],
      [{ range: model.getFullModelRange(), text: code }],
      () => null
    );
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
        // Clamp to the current line count — a stale error line from a previous
        // run can exceed the buffer after the user shortens the file.
        const lineCount = model.getLineCount();
        const line = Math.min(Math.max(errorLine, 1), lineCount);
        monaco.editor.setModelMarkers(model, 'brepjs', [
          {
            severity: monaco.MarkerSeverity.Error,
            message: error,
            startLineNumber: line,
            startColumn: 1,
            endLineNumber: line,
            endColumn: model.getLineMaxColumn(line),
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
      beforeMount={handleBeforeMount}
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
        renderLineHighlight: 'none',
      }}
    />
  );
}
