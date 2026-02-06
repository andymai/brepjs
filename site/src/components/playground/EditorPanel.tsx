import Editor, { type OnMount } from '@monaco-editor/react';
import { useCallback, useEffect, useRef } from 'react';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { setupMonaco } from '../../lib/monacoSetup';

interface EditorPanelProps {
  onCodeChange: (code: string) => void;
}

export default function EditorPanel({ onCodeChange }: EditorPanelProps) {
  const code = usePlaygroundStore((s) => s.code);
  const setCode = usePlaygroundStore((s) => s.setCode);
  const error = usePlaygroundStore((s) => s.error);
  const errorLine = usePlaygroundStore((s) => s.errorLine);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      setupMonaco(monaco);
      monaco.editor.setTheme('brepjs-dark');
    },
    [],
  );

  const handleChange = useCallback(
    (value: string | undefined) => {
      const newCode = value ?? '';
      setCode(newCode);
      onCodeChange(newCode);
    },
    [setCode, onCodeChange],
  );

  const handleBeforeMount = useCallback((monaco: Parameters<OnMount>[1]) => {
    monacoRef.current = monaco;
  }, []);

  // Update error markers in useEffect
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    if (error && errorLine) {
      monacoRef.current.editor.setModelMarkers(model, 'brepjs', [
        {
          severity: monacoRef.current.MarkerSeverity.Error,
          message: error,
          startLineNumber: errorLine,
          startColumn: 1,
          endLineNumber: errorLine,
          endColumn: model.getLineMaxColumn(errorLine),
        },
      ]);
    } else {
      monacoRef.current.editor.setModelMarkers(model, 'brepjs', []);
    }
  }, [error, errorLine]);

  return (
    <Editor
      height="100%"
      defaultLanguage="typescript"
      value={code}
      onChange={handleChange}
      onMount={handleMount}
      beforeMount={handleBeforeMount}
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
