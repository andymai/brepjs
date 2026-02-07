import { useToastStore } from '../../stores/toastStore';

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-12 right-4 z-50 flex flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="animate-toast-in rounded-lg border border-border-subtle bg-surface-raised px-4 py-2.5 text-sm text-gray-200 shadow-lg"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
