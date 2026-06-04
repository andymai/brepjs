export const DEFAULT_DEBOUNCE_MS = 150;

// fs.watch fires twice per save on many platforms; debounce collapses bursts to one trailing call.
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
