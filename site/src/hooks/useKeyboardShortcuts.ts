import { useEffect, useRef } from 'react';
import type { ShortcutDef } from '../lib/shortcuts';

type ShortcutActions = Record<string, () => void>;

export function useKeyboardShortcuts(actions: ShortcutActions, shortcuts: ShortcutDef[]) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      for (const def of shortcutsRef.current) {
        if (
          ctrl === def.ctrl &&
          e.shiftKey === def.shift &&
          e.key.toLowerCase() === def.key.toLowerCase()
        ) {
          e.preventDefault();
          const action = actionsRef.current[def.id] as (() => void) | undefined;
          if (action) action();
          return;
        }
      }
    };
    document.addEventListener('keydown', handler, { capture: true });
    return () => {
      document.removeEventListener('keydown', handler, { capture: true });
    };
  }, []);
}
