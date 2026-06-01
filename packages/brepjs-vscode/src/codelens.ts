import * as vscode from 'vscode';
import type { ReportCache } from './reportCache.js';
import type { VerifyReport } from './types.js';

function formatLens(report: VerifyReport): string {
  const { ok, shapeType, measurements } = report;
  const parts: string[] = [];

  parts.push(ok ? '✓' : '✗');
  if (shapeType) parts.push(shapeType);

  if (measurements.volume !== undefined) {
    parts.push(`${measurements.volume.toLocaleString(undefined, { maximumFractionDigits: 1 })} mm³`);
  }
  if (measurements.area !== undefined) {
    parts.push(`${measurements.area.toLocaleString(undefined, { maximumFractionDigits: 1 })} mm²`);
  }
  if (measurements.bounds !== undefined) {
    const { xMin, xMax, yMin, yMax, zMin, zMax } = measurements.bounds;
    const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
    parts.push(`${fmt(xMax - xMin)} × ${fmt(yMax - yMin)} × ${fmt(zMax - zMin)} mm`);
  }

  if (!ok && report.errors.length > 0) {
    const first = report.errors[0];
    if (first !== undefined) parts.push(`— ${first.slice(0, 60)}${first.length > 60 ? '…' : ''}`);
  }

  return parts.join('  |  ');
}

export class BrepCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses: vscode.Event<void> = this.changeEmitter.event;
  private readonly cacheSubscription: vscode.Disposable;

  constructor(private readonly cache: ReportCache) {
    this.cacheSubscription = cache.onDidUpdate(() => this.changeEmitter.fire());
  }

  dispose(): void {
    this.cacheSubscription.dispose();
    this.changeEmitter.dispose();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const report = this.cache.get(document.uri);
    if (!report) return [];

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      if (line.text.startsWith('export default')) {
        const range = new vscode.Range(i, 0, i, 0);
        return [
          new vscode.CodeLens(range, {
            title: formatLens(report),
            command: 'brepjs.openPreviewColumn',
            tooltip: 'Click to open 3D preview',
          }),
        ];
      }
    }
    return [];
  }
}
