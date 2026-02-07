import { examples } from '../../lib/examples';
import { usePlaygroundStore } from '../../stores/playgroundStore';

interface ExamplePickerProps {
  onClose: () => void;
  onSelect: (code: string) => void;
}

export default function ExamplePicker({ onClose, onSelect }: ExamplePickerProps) {
  const setCode = usePlaygroundStore((s) => s.setCode);

  const handleSelect = (code: string) => {
    setCode(code);
    onSelect(code);
    onClose();
  };

  return (
    <div className="absolute left-0 top-full z-40 mt-1 w-72 rounded-lg border border-border-subtle bg-surface-raised p-2 shadow-xl">
      {examples.map((ex) => (
        <button
          key={ex.id}
          onClick={() => handleSelect(ex.code)}
          className="w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-surface-overlay"
        >
          <div className="flex items-center gap-2">
            <span className="rounded bg-surface-overlay px-1.5 py-0.5 text-[10px] text-teal-light">
              {ex.category}
            </span>
            <span className="text-sm font-medium text-white">{ex.title}</span>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{ex.description}</p>
        </button>
      ))}
    </div>
  );
}
