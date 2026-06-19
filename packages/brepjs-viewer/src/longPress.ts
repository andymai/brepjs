import { useCallback, useEffect, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { ScreenPos } from './types.js';

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

// Touch has no right-click, so a stationary finger held on an entity stands in
// for the desktop context-menu gesture. A press that moves past the tolerance
// (i.e. an orbit drag) cancels it, and the `consumeFired` flag lets the caller
// swallow the select-on-release the browser synthesizes after a long press.
export function useTouchLongPress<T>(
  resolve: (event: ThreeEvent<PointerEvent>) => T | null,
  onLongPress: ((info: T, pos: ScreenPos) => void) | undefined
) {
  const state = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    x: number;
    y: number;
    fired: boolean;
  }>({ timer: null, x: 0, y: 0, fired: false });

  const cancel = useCallback(() => {
    if (state.current.timer) {
      clearTimeout(state.current.timer);
      state.current.timer = null;
    }
  }, []);

  const start = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (event.nativeEvent.pointerType !== 'touch' || !onLongPress) return;
      const info = resolve(event);
      if (!info) return;
      const x = event.clientX;
      const y = event.clientY;
      cancel();
      state.current.x = x;
      state.current.y = y;
      state.current.fired = false;
      state.current.timer = setTimeout(() => {
        state.current.fired = true;
        state.current.timer = null;
        onLongPress(info, { x, y });
      }, LONG_PRESS_MS);
    },
    [resolve, onLongPress, cancel]
  );

  const trackMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const s = state.current;
      if (!s.timer) return;
      if (
        Math.abs(event.clientX - s.x) > MOVE_TOLERANCE_PX ||
        Math.abs(event.clientY - s.y) > MOVE_TOLERANCE_PX
      ) {
        cancel();
      }
    },
    [cancel]
  );

  const consumeFired = useCallback(() => {
    if (state.current.fired) {
      state.current.fired = false;
      return true;
    }
    return false;
  }, []);

  useEffect(() => cancel, [cancel]);

  return { start, cancel, trackMove, consumeFired };
}
