import { useEffect, useRef } from 'react';
import { useEngineStore } from '../../stores/engineStore';
import { usePlaygroundStore } from '../../stores/playgroundStore';

interface MobileActionSheetProps {
  open: boolean;
  onClose: () => void;
  onShare: () => void;
  onExportSTL: () => void;
  onExportSTEP: () => void;
  onExportDXF: () => void;
  onExportIFC: () => void;
}

interface ActionDef {
  label: string;
  hint: string;
  onSelect: () => void;
  disabled: boolean;
}

// Bottom sheet that surfaces the share/export actions hidden from the compact
// mobile toolbar. Replaces the command palette as the primary way to reach
// these on a phone, where there's no keyboard to trigger Cmd+K.
export default function MobileActionSheet({
  open,
  onClose,
  onShare,
  onExportSTL,
  onExportSTEP,
  onExportDXF,
  onExportIFC,
}: MobileActionSheetProps) {
  const engineReady = useEngineStore((s) => s.status === 'ready');
  const isRunning = usePlaygroundStore((s) => s.isRunning);
  const canExportDXF = usePlaygroundStore((s) => s.availableArtifacts.includes('dxf'));
  const canExportIFC = usePlaygroundStore((s) => s.availableArtifacts.includes('ifc'));
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    // Move focus into the sheet so the next Tab stays inside it and screen
    // readers announce the dialog.
    sheetRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const exportDisabled = !engineReady || isRunning;
  const actions: ActionDef[] = [
    {
      label: 'Share link',
      hint: 'Copy or send a permalink',
      onSelect: onShare,
      disabled: !engineReady,
    },
    {
      label: 'Export STL',
      hint: 'Mesh for 3D printing',
      onSelect: onExportSTL,
      disabled: exportDisabled,
    },
    {
      label: 'Export STEP',
      hint: 'B-Rep for CAD',
      onSelect: onExportSTEP,
      disabled: exportDisabled,
    },
    ...(canExportDXF
      ? [
          {
            label: 'Export DXF',
            hint: 'Flat-pattern drawing',
            onSelect: onExportDXF,
            disabled: exportDisabled,
          },
        ]
      : []),
    ...(canExportIFC
      ? [
          {
            label: 'Export IFC',
            hint: 'BIM model',
            onSelect: onExportIFC,
            disabled: exportDisabled,
          },
        ]
      : []),
  ];

  const runAndClose = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Actions"
    >
      <button
        type="button"
        aria-label="Close actions"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div
        ref={sheetRef}
        tabIndex={-1}
        className="animate-reveal-up pb-safe relative w-full rounded-t-2xl border-t border-border-subtle bg-surface shadow-2xl outline-none"
      >
        <div className="flex justify-center pt-2.5">
          <span className="h-1 w-9 rounded-full bg-gray-600" aria-hidden="true" />
        </div>
        <div className="px-3 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Actions
        </div>
        <div className="pb-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={runAndClose(a.onSelect)}
              disabled={a.disabled}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-overlay active:bg-surface-overlay disabled:opacity-40"
            >
              <span className="text-sm font-medium text-gray-100">{a.label}</span>
              <span className="text-xs text-gray-500">{a.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
