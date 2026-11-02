import type { ConversionReport, MeshInspection, MeshUnit } from 'brepjs-mesh2solid';

export type ToWorker =
  | {
      readonly id: number;
      readonly type: 'inspect';
      readonly bytes: ArrayBuffer;
      readonly name: string;
    }
  | {
      readonly id: number;
      readonly type: 'convert';
      readonly bytes: ArrayBuffer;
      readonly name: string;
      readonly units: MeshUnit;
    };

/** The rebuilt part as the viewer draws it. */
export interface PartMesh {
  readonly position: Float32Array;
  readonly normal: Float32Array;
  readonly index: Uint32Array;
  readonly edges: Float32Array;
}

/** The input mesh with each vertex's distance to the result, in millimeters. */
export interface Heatmap {
  readonly position: Float32Array;
  readonly index: Uint32Array;
  readonly deviation: Float32Array;
}

export interface Conversion {
  readonly part: PartMesh;
  readonly heatmap: Heatmap | null;
  readonly step: ArrayBuffer | null;
  readonly code: string | null;
  readonly solid: boolean;
  readonly report: ConversionReport;
}

export type FromWorker =
  | { readonly id: number; readonly type: 'inspected'; readonly info: MeshInspection }
  | { readonly id: number; readonly type: 'converted'; readonly result: Conversion }
  | { readonly id: number; readonly type: 'error'; readonly message: string };
