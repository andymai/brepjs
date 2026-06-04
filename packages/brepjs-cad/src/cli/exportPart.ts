import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { exportSTL, isOk } from 'brepjs';
import { runPart } from '../verify/runPart.js';
import { reportOk, type VerifyReport } from '../verify/report.js';
import { disposeShape } from '../disposeShape.js';

export interface ExportFormats {
  step?: boolean;
  glb?: boolean;
  stl?: boolean;
}

export interface ExportResult {
  ok: boolean;
  report: VerifyReport;
  written: string[];
  errors: string[];
}

function stem(file: string): string {
  return basename(file).replace(/\.brep\.ts$/, '').replace(/\.ts$/, '');
}

export async function exportPart(
  modulePath: string,
  formats: ExportFormats,
  outDir: string,
): Promise<ExportResult> {
  const wantStl = Boolean(formats.stl);
  const { shape, report, step, glb } = await runPart(modulePath, {
    step: Boolean(formats.step),
    glb: Boolean(formats.glb),
  });
  const errors: string[] = [];
  const written: string[] = [];

  // Validity gate: never emit artifacts for an invalid part.
  const valid = reportOk(report) && shape !== null;
  if (!valid) {
    disposeShape(shape); // live WASM handle owned by this fn
    return { ok: false, report, written, errors: report.errors };
  }

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const base = stem(modulePath);

  if (formats.step) {
    if (step) {
      const p = join(outDir, `${base}.step`);
      writeFileSync(p, Buffer.from(step));
      written.push(p);
    } else {
      errors.push('STEP export produced no data');
    }
  }
  if (formats.glb) {
    if (glb) {
      const p = join(outDir, `${base}.glb`);
      writeFileSync(p, Buffer.from(glb));
      written.push(p);
    } else {
      errors.push('GLB export produced no data');
    }
  }
  if (wantStl) {
    const r = exportSTL(shape);
    if (isOk(r)) {
      const p = join(outDir, `${base}.stl`);
      writeFileSync(p, Buffer.from(await r.value.arrayBuffer()));
      written.push(p);
    } else {
      errors.push(`STL export: ${r.error.message}`);
    }
  }

  disposeShape(shape);
  return { ok: errors.length === 0, report, written, errors };
}
