import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string) => void;
  removeToast: (id: string) => void;
}

let toastCounter = 0;
const MAX_TOASTS = 4;
const TOAST_TTL_MS = 3500;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message) => {
    const id = `toast-${++toastCounter}`;
    set((s) => {
      // Collapse repeated identical messages — spamming Share shouldn't pile
      // up vertical "Link copied" toasts. Re-issuing the most recent toast
      // also resets its TTL implicitly via the new setTimeout below.
      let next = s.toasts.filter((t) => t.message !== message);
      if (next.length >= MAX_TOASTS) {
        next = next.slice(-(MAX_TOASTS - 1));
      }
      return { toasts: [...next, { id, message }] };
    });
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, TOAST_TTL_MS);
  },
  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));
