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
  using sa = a.shape; // runPart hands back a live kernel shape; dispose it on every exit path

  if (bPath === undefined) {
    const len = measureLength(sa);
    if (isOk(len)) return { length: len.value, errors };
    errors.push(`measureLength: ${len.error.message}`);
    return { errors };
  }

  const b = await runPart(bPath);
  errors.push(...b.report.errors);
  if (!b.shape) return { errors };
  using sb = b.shape;

  const dist = measureDistance(sa, sb);
  if (isOk(dist)) return { distance: dist.value, errors };
  errors.push(`measureDistance: ${dist.error.message}`);
  return { errors };
}
