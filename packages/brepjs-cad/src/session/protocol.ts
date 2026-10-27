import type { BuildOutcome, SessionKind } from './records.js';
import type { EvalOutcome } from './evalCode.js';
import type { ExportIfcArgs, ExportIfcOutcome } from './exportIfc.js';
import type { QuantitiesOutcome } from './quantities.js';
import type { CheckName, ValidateOutcome } from './validate.js';
import type { CobieArgs, CobieOutcome } from './cobie.js';
import type { Bounds2D, DrawingSpec } from './drawing.js';
import type { SpaceGeometry } from './spaces.js';
import type { RenderRequest, ShotCamera } from './render.js';

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
    readonly result: {
      readonly pngs: readonly Uint8Array[];
      readonly cameras: readonly (ShotCamera | null)[];
      readonly drawable: readonly string[];
    };
  };
  readonly exportIfc: {
    readonly args: ExportIfcArgs;
    readonly result: ExportIfcOutcome;
  };
  readonly quantities: {
    readonly args: Record<string, never>;
    readonly result: QuantitiesOutcome;
  };
  readonly validate: {
    readonly args: { readonly checks: readonly CheckName[] };
    readonly result: ValidateOutcome;
  };
  readonly eval: {
    readonly args: { readonly code: string };
    readonly result: EvalOutcome;
  };
  readonly drawing: {
    readonly args: DrawingArgs;
    readonly result: DrawingOutcome;
  };
  readonly spaces: {
    readonly args: { readonly ids: readonly string[] };
    readonly result: readonly SpaceGeometry[];
  };
  readonly cobie: {
    readonly args: CobieArgs;
    readonly result: CobieOutcome;
  };
  readonly payload: {
    readonly args: Record<string, never>;
    /** encodePreviewPayload of the build. */
    readonly result: Uint8Array;
  };
}

export interface DrawingArgs {
  readonly spec: DrawingSpec;
  /** The elements to draw. */
  readonly ids: readonly string[];
  readonly title: string;
  readonly dxf: boolean;
  readonly png: boolean;
}

export interface DrawingOutcome {
  readonly svg: string;
  readonly dxf?: string;
  readonly png?: Uint8Array;
  /** Why the PNG preview is missing, when it was asked for. */
  readonly pngError?: string;
  readonly bounds?: Bounds2D;
  /** Polylines per layer. */
  readonly layers: Readonly<Record<string, number>>;
  readonly cut: readonly string[];
  readonly beyond: readonly string[];
  readonly skipped: readonly { readonly id: string; readonly reason: string }[];
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
