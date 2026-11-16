import type { MeshData } from 'brepjs-viewer';
import type { ModelMeasurements } from '../loaders.js';

export type ParamValue = number | boolean | string;
export type ParamInput = Readonly<Record<string, ParamValue>>;

interface ParamDefBase {
  readonly label?: string;
  readonly description?: string;
  readonly group?: string;
}
export type ParamDef =
  | (ParamDefBase & {
      readonly type: 'number';
      readonly default: number;
      readonly min?: number;
      readonly max?: number;
      readonly step?: number;
      readonly integer?: boolean;
      readonly unit?: string;
    })
  | (ParamDefBase & { readonly type: 'boolean'; readonly default: boolean })
  | (ParamDefBase & {
      readonly type: 'string';
      readonly default: string;
      readonly maxLength?: number;
    })
  | (ParamDefBase & {
      readonly type: 'choice';
      readonly default: string;
      readonly options: readonly string[];
    });
export type ParamDefs = Readonly<Record<string, ParamDef>>;
export type Presets = Readonly<Record<string, ParamInput>>;

export type ExportFormat = 'step' | '3mf' | 'stl';

export type ToWorker =
  | { type: 'init'; base: string; entry: string }
  | { type: 'build'; id: number; input: ParamInput }
  | { type: 'export'; id: number; format: ExportFormat; name: string };

export type FromWorker =
  | { type: 'ready'; defs: ParamDefs; presets: Presets }
  | { type: 'fatal'; message: string }
  | {
      type: 'built';
      id: number;
      meshData: MeshData;
      measurements: ModelMeasurements;
      values: ParamInput;
    }
  | { type: 'failed'; id: number; message: string; code?: string }
  | { type: 'exported'; id: number; bytes: ArrayBuffer; filename: string; mime: string }
  | { type: 'export-failed'; id: number; message: string };
