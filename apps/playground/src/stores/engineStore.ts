import { create } from 'zustand';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

interface EngineState {
  status: EngineStatus;
  stage: string;
  progress: number;
  error: string | null;
  recoveryAttempts: number;
  setStatus: (status: EngineStatus) => void;
  setProgress: (stage: string, progress: number) => void;
  setError: (error: string) => void;
  incrementRecoveryAttempts: () => void;
  resetRecoveryAttempts: () => void;
}

export const useEngineStore = create<EngineState>((set) => ({
  status: 'idle',
  stage: '',
  progress: 0,
  error: null,
  recoveryAttempts: 0,
  setStatus: (status) => set({ status }),
  setProgress: (stage, progress) => set({ stage, progress, status: 'loading' }),
  setError: (error) => set({ error, status: 'error' }),
  incrementRecoveryAttempts: () => set((state) => ({ recoveryAttempts: state.recoveryAttempts + 1 })),
  resetRecoveryAttempts: () => set({ recoveryAttempts: 0 }),
}));
