import { useEffect } from 'react';

// `?` opens the shortcut help. Lives outside useKeyboardShortcuts because it
// has no modifier, so it would clobber typed `?` characters in the editor.
export function useShortcutHelpKey(toggle: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '?') return;
      const target = e.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable) return;
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (target.closest('.monaco-editor')) return;
      }
      e.preventDefault();
      toggle();
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [toggle]);
}
