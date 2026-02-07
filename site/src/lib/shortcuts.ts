export interface ShortcutDef {
  id: string;
  key: string;
  ctrl: boolean;
  shift: boolean;
  label: string;
}

export const SHORTCUTS: Record<string, ShortcutDef> = {
  run: { id: 'run', key: 'Enter', ctrl: true, shift: false, label: 'Run Code' },
  share: { id: 'share', key: 's', ctrl: true, shift: false, label: 'Share' },
  exportSTL: { id: 'exportSTL', key: 'e', ctrl: true, shift: false, label: 'Export STL' },
  formatCode: { id: 'formatCode', key: 'f', ctrl: true, shift: true, label: 'Format Code' },
  toggleOutput: { id: 'toggleOutput', key: 'b', ctrl: true, shift: false, label: 'Toggle Console' },
  toggleViewer: { id: 'toggleViewer', key: '\\', ctrl: true, shift: false, label: 'Toggle Viewer' },
};

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

export function formatShortcut(def: ShortcutDef): string {
  const mod = isMac ? '\u2318' : 'Ctrl';
  const shift = def.shift ? (isMac ? '\u21E7+' : 'Shift+') : '';
  const key =
    def.key === 'Enter'
      ? '\u21B5'
      : def.key === '\\'
        ? '\\'
        : def.key.toUpperCase();
  return `${mod}+${shift}${key}`;
}
