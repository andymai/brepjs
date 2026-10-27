import type { BuildOutcome, SessionKind } from './records.js';

/** Operations a session worker answers: each op's arguments and reply. */
export interface WorkerOps {
  readonly build: {
    readonly args: {
      readonly kind: SessionKind;
      readonly path: string;
      readonly typecheck: boolean;
    };
    readonly result: BuildOutcome;
  };
}

export type WorkerOp = keyof WorkerOps;

export interface WorkerRequest<K extends WorkerOp = WorkerOp> {
  readonly id: number;
  readonly op: K;
  readonly args: WorkerOps[K]['args'];
}

export type WorkerMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'reply'; readonly id: number; readonly result: unknown }
  | { readonly type: 'reply'; readonly id: number; readonly error: string };
