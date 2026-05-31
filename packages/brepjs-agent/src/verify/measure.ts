import { measureDistance, measureLength, isOk } from 'brepjs';
import { runPart } from './runPart.js';

export interface MeasureReport {
  length?: number;
  distance?: number;
  errors: string[];
}

export async function runMeasure(aPath: string, bPath?: string): Promise<MeasureReport> {
  const errors: string[] = [];
  const a = await runPart(aPath);
  errors.push(...a.report.errors);
  if (!a.shape) return { errors };

  if (bPath === undefined) {
    const len = measureLength(a.shape);
    if (isOk(len)) return { length: len.value, errors };
    errors.push(`measureLength: ${String(len.error)}`);
    return { errors };
  }

  const b = await runPart(bPath);
  errors.push(...b.report.errors);
  if (!b.shape) return { errors };

  const dist = measureDistance(a.shape, b.shape);
  if (isOk(dist)) return { distance: dist.value, errors };
  errors.push(`measureDistance: ${String(dist.error)}`);
  return { errors };
}
