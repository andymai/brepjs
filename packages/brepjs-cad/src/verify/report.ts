export interface VerifyCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface VerifyMeasurements {
  volume?: number;
  area?: number;
  bounds?: { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number };
}

export interface VerifyReport {
  shapeType: string | null;
  checks: VerifyCheck[];
  measurements: VerifyMeasurements;
  errors: string[];
}

export interface BoundsDelta {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}

export interface DiffReport {
  volumeDelta: number;
  areaDelta: number;
  bboxDelta: BoundsDelta;
  symmetricDifferenceVolume: number;
  errors: string[];
}

export function emptyReport(): VerifyReport {
  return { shapeType: null, checks: [], measurements: {}, errors: [] };
}

export function reportOk(r: VerifyReport): boolean {
  return r.errors.length === 0 && r.checks.every((c) => c.passed);
}

export function serializeReport(r: VerifyReport): string {
  return JSON.stringify({ ok: reportOk(r), ...r }, null, 2);
}
