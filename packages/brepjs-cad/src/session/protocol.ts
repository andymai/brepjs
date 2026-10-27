import type { BuildOutcome, SessionKind } from './records.js';
import type { EvalOutcome } from './evalCode.js';
import type { ExportIfcArgs, ExportIfcOutcome } from './exportIfc.js';
import type { QuantitiesOutcome } from './quantities.js';
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
    /** `drawable` lists every id the payload carries a mesh for, so callers can count truly. */
    readonly result: { readonly pngs: readonly Uint8Array[]; readonly drawable: readonly string[] };
  };
  readonly exportIfc: {
    readonly args: ExportIfcArgs;
    readonly result: ExportIfcOutcome;
  };
  readonly quantities: {
    readonly args: Record<string, never>;
    readonly result: QuantitiesOutcome;
  };
  readonly eval: {
    readonly args: { readonly code: string };
    readonly result: EvalOutcome;
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
