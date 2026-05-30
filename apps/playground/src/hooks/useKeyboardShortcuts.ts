import { useEffect, useRef } from 'react';
import type { ShortcutDef } from '../lib/shortcuts';

type ShortcutActions = Record<string, () => void>;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  // Monaco renders a textarea inside `.monaco-editor`, but the focused element
  // can be an inner div with role="textbox" — cover both.
  return target.closest('.monaco-editor') !== null;
}

export function useKeyboardShortcuts(actions: ShortcutActions, shortcuts: ShortcutDef[]) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const inEditable = isEditableTarget(e.target);
      for (const def of shortcutsRef.current) {
        // Shift changes the printed char (Shift+\ → '|'), so a `\` binding can
        // never match on e.key when it requires Shift — match the physical key.
        const keyMatches =
          def.key === '\\' ? e.code === 'Backslash' : e.key.toLowerCase() === def.key.toLowerCase();
        if (ctrl === def.ctrl && e.shiftKey === def.shift && keyMatches) {
          // Skip layout toggles (Ctrl+B / Ctrl+\\) when the user is typing —
          // those overlap with Monaco's own keybindings.
          if (inEditable && def.inEditor === false) return;
          e.preventDefault();
          const action = actionsRef.current[def.id] as (() => void) | undefined;
          if (action) action();
          return;
        }
      }
    };
    // Bubble phase, not capture: lets Monaco handle text-editing keys first
    // (e.g. Backspace, arrow keys) without our handler ever seeing them.
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, []);
}
