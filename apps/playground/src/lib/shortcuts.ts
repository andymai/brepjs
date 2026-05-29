export interface ShortcutDef {
  id: string;
  key: string;
  ctrl: boolean;
  shift: boolean;
  label: string;
  /**
   * Whether the shortcut should fire while the user is typing in an editable
   * surface (Monaco editor, input, contenteditable). Defaults to true for
   * action shortcuts that the user expects to invoke from anywhere; layout
   * toggles set this false so they don't fight Monaco's own bindings
   * (e.g. Ctrl+B, Ctrl+\\).
   */
  inEditor?: boolean;
}

export const SHORTCUTS = {
  run: { id: 'run', key: 'Enter', ctrl: true, shift: false, label: 'Run Code' },
  share: { id: 'share', key: 's', ctrl: true, shift: true, label: 'Share' },
  exportSTL: { id: 'exportSTL', key: 'e', ctrl: true, shift: false, label: 'Export STL' },
  exportSTEP: { id: 'exportSTEP', key: 'e', ctrl: true, shift: true, label: 'Export STEP' },
  formatCode: { id: 'formatCode', key: 'f', ctrl: true, shift: true, label: 'Format Code' },
  toggleOutput: {
    id: 'toggleOutput',
    key: 'b',
    ctrl: true,
    shift: false,
    label: 'Toggle Console',
    inEditor: false,
  },
  toggleViewer: {
    id: 'toggleViewer',
    key: '\\',
    ctrl: true,
    shift: false,
    label: 'Toggle Viewer',
    inEditor: false,
  },
  toggleEditor: {
    id: 'toggleEditor',
    key: '\\',
    ctrl: true,
    shift: true,
    label: 'Toggle Editor',
    inEditor: false,
  },
  commandPalette: {
    id: 'commandPalette',
    key: 'k',
    ctrl: true,
    shift: false,
    label: 'Command Palette',
  },
  examples: {
    id: 'examples',
    key: 'o',
    ctrl: true,
    shift: true,
    label: 'Browse Examples',
  },
  cycleViewMode: {
    id: 'cycleViewMode',
    key: 'v',
    ctrl: false,
    shift: false,
    label: 'Cycle View Mode',
    // Plain `v` would clobber the user typing the letter inside the editor;
    // restrict to the viewport / outside Monaco.
    inEditor: false,
  },
} as const satisfies Record<string, ShortcutDef>;

export const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

export function formatShortcut(def: ShortcutDef): string {
  const mod = def.ctrl ? (isMac ? '\u2318+' : 'Ctrl+') : '';
  const shift = def.shift ? (isMac ? '\u21E7+' : 'Shift+') : '';
  const key = def.key === 'Enter' ? '\u21B5' : def.key === '\\' ? '\\' : def.key.toUpperCase();
  return `${mod}${shift}${key}`;
}
