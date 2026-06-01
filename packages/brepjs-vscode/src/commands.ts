import * as vscode from 'vscode';
import { basename } from 'node:path';
import type { BrepPreviewManager } from './preview.js';
import type { ReportCache } from './reportCache.js';
import { runExportStep, runExportGlb, runDiff } from './cli.js';

export function registerCommands(
  _context: vscode.ExtensionContext,
  preview: BrepPreviewManager,
  _cache: ReportCache,
  output: vscode.OutputChannel,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('brepjs.openPreviewColumn', () => {
      preview.openInColumn();
    }),

    vscode.commands.registerCommand('brepjs.exportStep', async () => {
      const src = activeBrep();
      if (!src) return;
      const dest = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(src.replace(/\.brep\.ts$/, '.step')),
        filters: { STEP: ['step', 'stp'] },
        title: 'Export to STEP',
      });
      if (!dest) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `brepjs: exporting STEP…` },
        async () => {
          try {
            await runExportStep(src, dest.fsPath);
            output.appendLine(`[brepjs] exported STEP → ${dest.fsPath}`);
            void vscode.window.showInformationMessage(`STEP exported: ${basename(dest.fsPath)}`);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            output.appendLine(`[brepjs] export STEP failed: ${msg}`);
            void vscode.window.showErrorMessage(`brepjs: STEP export failed — ${msg}`);
          }
        },
      );
    }),

    vscode.commands.registerCommand('brepjs.exportGlb', async () => {
      const src = activeBrep();
      if (!src) return;
      const dest = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(src.replace(/\.brep\.ts$/, '.glb')),
        filters: { GLB: ['glb'] },
        title: 'Export to GLB',
      });
      if (!dest) return;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `brepjs: exporting GLB…` },
        async () => {
          try {
            await runExportGlb(src, dest.fsPath);
            output.appendLine(`[brepjs] exported GLB → ${dest.fsPath}`);
            void vscode.window.showInformationMessage(`GLB exported: ${basename(dest.fsPath)}`);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            output.appendLine(`[brepjs] export GLB failed: ${msg}`);
            void vscode.window.showErrorMessage(`brepjs: GLB export failed — ${msg}`);
          }
        },
      );
    }),

    vscode.commands.registerCommand('brepjs.diffFiles', async () => {
      const brepFiles = await vscode.workspace.findFiles('**/*.brep.ts', '**/node_modules/**');
      if (brepFiles.length === 0) {
        void vscode.window.showWarningMessage('No .brep.ts files found in workspace');
        return;
      }
      const items = brepFiles.map((u) => ({
        label: basename(u.fsPath),
        description: vscode.workspace.asRelativePath(u),
        fsPath: u.fsPath,
      }));

      const a = await vscode.window.showQuickPick(items, { title: 'Diff: select baseline part' });
      if (!a) return;
      const b = await vscode.window.showQuickPick(
        items.filter((i) => i.fsPath !== a.fsPath),
        { title: 'Diff: select comparison part' },
      );
      if (!b) return;

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'brepjs: computing diff…' },
        async () => {
          try {
            const result = await runDiff(a.fsPath, b.fsPath);
            output.appendLine(`[brepjs] diff ${a.label} → ${b.label}`);
            output.appendLine(`  volumeDelta: ${result.volumeDelta.toFixed(3)} mm³`);
            output.appendLine(`  areaDelta: ${result.areaDelta.toFixed(3)} mm²`);
            output.appendLine(
              `  symmetricDiff: ${result.symmetricDifferenceVolume.toFixed(3)} mm³`,
            );
            if (!result.ok)
              output.appendLine(`  errors: ${result.errors.join(', ')}`);
            output.show(true);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            void vscode.window.showErrorMessage(`brepjs: diff failed — ${msg}`);
          }
        },
      );
    }),
  ];
}

function activeBrep(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage('Open a .brep.ts file first');
    return undefined;
  }
  const { fsPath } = editor.document.uri;
  if (!fsPath.endsWith('.brep.ts')) {
    void vscode.window.showWarningMessage('Active file is not a .brep.ts file');
    return undefined;
  }
  return fsPath;
}
