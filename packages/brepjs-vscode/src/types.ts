// Types mirroring brepjs-cad's verify report shape. Kept local so the extension host
// has zero runtime imports from the CAD library — it only spawns the CLI as a subprocess.

export interface VerifyBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}

export interface VerifyMeasurements {
  volume?: number;
  area?: number;
  bounds?: VerifyBounds;
}

export interface VerifyCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface VerifyReport {
  ok: boolean;
  shapeType: string | null;
  checks: VerifyCheck[];
  measurements: VerifyMeasurements;
  errors: string[];
}

// postMessage protocol: extension host → webview
export type ToWebview =
  | { type: 'loading'; filePath: string }
  | { type: 'update'; glbUri: string | null; report: VerifyReport; filePath: string }
  | { type: 'error'; message: string; filePath: string };
