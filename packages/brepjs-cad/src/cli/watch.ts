export const DEFAULT_DEBOUNCE_MS = 150;

/**
 * Wraps a handler so bursts of rapid calls collapse into a single trailing
 * invocation after `delayMs` of quiet — fs.watch fires twice per save on many
 * platforms, so the model is re-run once rather than per raw event.
 */
export function debounce(
  fn: () => void | Promise<void>,
  delayMs: number = DEFAULT_DEBOUNCE_MS,
): { trigger: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  const trigger = () => {
    cancel();
    timer = setTimeout(() => {
      timer = undefined;
      void fn();
    }, delayMs);
  };
  return { trigger, cancel };
}
