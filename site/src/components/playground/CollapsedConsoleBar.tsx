interface CollapsedConsoleBarProps {
  onExpand: () => void;
}

export default function CollapsedConsoleBar({ onExpand }: CollapsedConsoleBarProps) {
  return (
    <button
      onClick={onExpand}
      className="flex h-full w-full items-center gap-2 px-3 text-xs text-gray-500 transition-colors hover:text-gray-300"
    >
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
        <path d="M4.5 10.5L8 7l3.5 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
      Console
    </button>
  );
}
