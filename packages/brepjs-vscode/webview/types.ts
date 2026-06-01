// Mirror of src/types.ts — kept in sync manually since the webview is a separate Vite build
// that cannot import from the extension host's src/ directory.

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

export type ToWebview =
  | { type: 'loading'; filePath: string }
  | { type: 'update'; glbUri: string | null; report: VerifyReport; filePath: string }
  | { type: 'error'; message: string; filePath: string };
