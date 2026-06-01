import * as vscode from 'vscode';
import type { ReportCache } from './reportCache.js';

/**
 * Additive hover on the "export default" line of .brep.ts files.
 * The TypeScript language server already provides type hover; this appends
 * the last measured CAD metrics (volume, area, bounds, validity checks) which
 * the TS server has no concept of.
 */
export class BrepHoverProvider implements vscode.HoverProvider {
  constructor(private readonly cache: ReportCache) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    const line = document.lineAt(position.line).text;
    if (!line.startsWith('export default')) return undefined;

    const report = this.cache.get(document.uri);
    if (!report) return undefined;

    const md = new vscode.MarkdownString('', true);
    md.supportHtml = false;
    md.isTrusted = false;

    md.appendMarkdown(`**brepjs** — last verify: ${report.ok ? '✓ valid' : '✗ invalid'}\n\n`);

    if (report.shapeType) {
      md.appendMarkdown(`Shape: \`${report.shapeType}\`\n\n`);
    }

    const { measurements } = report;
    if (measurements.volume !== undefined) {
      md.appendMarkdown(
        `Volume: \`${measurements.volume.toLocaleString(undefined, { maximumFractionDigits: 3 })} mm³\`\n\n`,
      );
    }
    if (measurements.area !== undefined) {
      md.appendMarkdown(
        `Area: \`${measurements.area.toLocaleString(undefined, { maximumFractionDigits: 3 })} mm²\`\n\n`,
      );
    }
    if (measurements.bounds !== undefined) {
      const { xMin, xMax, yMin, yMax, zMin, zMax } = measurements.bounds;
      const fmt = (n: number) =>
        n.toLocaleString(undefined, { maximumFractionDigits: 2 });
      md.appendMarkdown(
        `Bounds: \`${fmt(xMax - xMin)} × ${fmt(yMax - yMin)} × ${fmt(zMax - zMin)} mm\`\n\n`,
      );
    }

    for (const check of report.checks) {
      md.appendMarkdown(`${check.passed ? '✓' : '✗'} \`${check.name}\``);
      if (!check.passed && check.detail) md.appendMarkdown(` — ${check.detail}`);
      md.appendMarkdown('\n\n');
    }

    if (report.errors.length > 0) {
      md.appendMarkdown('**Errors:**\n\n');
      for (const e of report.errors) {
        md.appendMarkdown(`- ${e}\n`);
      }
    }

    return new vscode.Hover(md);
  }
}
