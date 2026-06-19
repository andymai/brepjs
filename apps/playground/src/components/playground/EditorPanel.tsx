import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import { useCallback, useEffect, useRef } from 'react';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { setupMonaco } from '../../lib/monacoSetup';

interface EditorPanelProps {
  onCodeChange: (code: string, opts?: { immediate?: boolean }) => void;
  onFormat?: { current: (() => void) | null };
  jumpToLineRef?: { current: ((line: number) => void) | null };
}

export default function EditorPanel({ onCodeChange, onFormat, jumpToLineRef }: EditorPanelProps) {
  const code = usePlaygroundStore((s) => s.code);
  const setCode = usePlaygroundStore((s) => s.setCode);
  const error = usePlaygroundStore((s) => s.error);
  const errorLine = usePlaygroundStore((s) => s.errorLine);
  const isMobile = useIsMobile();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  // Mirrors the last value we know the model holds. The sync effect and the
  // mount reconcile set it to a programmatically-pushed value before the edit;
  // genuine typing changes the model to something else. handleChange uses the
  // equality to tell an echoed buffer swap (run immediately) from typing
  // (debounce).
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

      // A setCode (share link / draft restore / example) can land before Monaco
      // finishes its async mount; the sync effect early-returns while editorRef
      // is null and never re-runs, leaving the buffer stale. Reconcile to the
      // authoritative store code now. The echoed change runs immediately via
      // handleChange's external-equality check.
      const current = usePlaygroundStore.getState().code;
      if (editor.getValue() !== current) {
        lastUserCodeRef.current = current;
        editor.setValue(current);
      }

      // Register format function for external access
      if (onFormat) {
        onFormat.current = () => {
          void editor.getAction('editor.action.formatDocument')?.run();
        };
      }
      // Expose a jump-to-line bridge so the console panel's "Go to line"
      // button can scroll the editor to the offending line and focus it.
      if (jumpToLineRef) {
        jumpToLineRef.current = (line: number) => {
          const model = editor.getModel();
          if (!model) return;
          const lineCount = model.getLineCount();
          const target = Math.min(Math.max(line, 1), lineCount);
          editor.revealLineInCenter(target);
          editor.setPosition({ lineNumber: target, column: 1 });
          editor.focus();
        };
      }
    },
    [onFormat, jumpToLineRef]
  );

  const handleChange = useCallback(
    (value: string | undefined) => {
      const newCode = value ?? '';
      // An echo of a programmatic buffer swap arrives equal to the value the
      // sync effect/mount reconcile just recorded; typing differs from it.
      const isExternal = newCode === lastUserCodeRef.current;
      lastUserCodeRef.current = newCode;
      setCode(newCode);
      onCodeChange(newCode, { immediate: isExternal });
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
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: code }], () => null);
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
        // 16px on phones: below 16px, iOS Safari auto-zooms the whole page when
        // the editor gains focus, which breaks the fixed full-height layout.
        fontSize: isMobile ? 16 : 14,
        lineHeight: isMobile ? 24 : 22,
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
