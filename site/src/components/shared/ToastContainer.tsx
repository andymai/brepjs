import { useToastStore } from '../../stores/toastStore';

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-12 right-4 z-50 flex flex-col gap-2"
      // The wrapper is just a layout anchor. Each toast carries its own
      // role=status / aria-live so screen readers announce the messages
      // individually instead of as one running region update.
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          aria-live="polite"
          className="animate-toast-in flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-raised pr-2 pl-4 py-2.5 text-sm text-gray-200 shadow-lg"
        >
          <span>{t.message}</span>
          <button
            type="button"
            onClick={() => {
              removeToast(t.id);
            }}
            aria-label={`Dismiss notification: ${t.message}`}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-surface-overlay hover:text-white focus:outline-none focus:ring-1 focus:ring-teal-primary"
          >
            <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
              <path
                d="M2 2l8 8M10 2L2 10"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
