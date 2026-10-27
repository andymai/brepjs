import type { BuildOutcome, SessionKind } from './records.js';
import type { RenderRequest } from './render.js';

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
  readonly render: {
    readonly args: RenderRequest;
    readonly result: { readonly pngs: readonly Uint8Array[] };
  };
}

export type WorkerOp = keyof WorkerOps;

/** One request per op, discriminated on `op` so a handler's `args` narrow with it. */
export type WorkerRequest = {
  readonly [K in WorkerOp]: {
    readonly id: number;
    readonly op: K;
    readonly args: WorkerOps[K]['args'];
  };
}[WorkerOp];

export type WorkerMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'reply'; readonly id: number; readonly result: unknown }
  | { readonly type: 'reply'; readonly id: number; readonly error: string };
