import * as vscode from 'vscode';
import { basename } from 'node:path';
import { BrepPreviewManager } from './preview.js';
import { BrepCodeLensProvider } from './codelens.js';
import { BrepHoverProvider } from './hover.js';
import { ReportCache } from './reportCache.js';
import { registerCommands } from './commands.js';
import { runVerify } from './cli.js';

// Only activate brepjs features for TypeScript files matching *.brep.ts
const BREP_SELECTOR: vscode.DocumentSelector = {
  language: 'typescript',
  pattern: '**/*.brep.ts',
};

// One AbortController per document URI so saving file B never cancels file A's verify
const abortMap = new Map<string, AbortController>();

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('brepjs');
  const cache = new ReportCache();
  const preview = new BrepPreviewManager(context);

  context.subscriptions.push(
    output,
    cache,
    preview,

    // Register as sidebar WebviewViewProvider
    vscode.window.registerWebviewViewProvider('brepjs.previewView', preview, {
      webviewOptions: { retainContextWhenHidden: true },
    }),

    // Inline measurements above "export default"
    vscode.languages.registerCodeLensProvider(BREP_SELECTOR, new BrepCodeLensProvider(cache)),

    // Hover shows last CAD metrics on the "export default" line
    vscode.languages.registerHoverProvider(BREP_SELECTOR, new BrepHoverProvider(cache)),

    // Run verify on every save of a .brep.ts file
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!isBrepFile(doc.fileName)) return;
      void handleSave(doc, cache, preview, output);
    }),

    ...registerCommands(context, preview, cache, output),
  );

  // If a .brep.ts file is already open when the extension activates, verify it immediately
  const active = vscode.window.activeTextEditor;
  if (active && isBrepFile(active.document.fileName)) {
    void handleSave(active.document, cache, preview, output);
  }
}

export function deactivate(): void {
  for (const controller of abortMap.values()) controller.abort();
  abortMap.clear();
}

function isBrepFile(filePath: string): boolean {
  return filePath.endsWith('.brep.ts');
}

async function handleSave(
  doc: vscode.TextDocument,
  cache: ReportCache,
  preview: BrepPreviewManager,
  output: vscode.OutputChannel,
): Promise<void> {
  // Cancel any prior in-flight verify for this specific file, leaving other files unaffected
  const key = doc.uri.toString();
  abortMap.get(key)?.abort();
  const controller = new AbortController();
  abortMap.set(key, controller);
  const { signal } = controller;

  const name = basename(doc.fileName);
  preview.showLoading(doc.fileName);
  output.appendLine(`[brepjs] verifying ${name}…`);

  try {
    const result = await runVerify(doc.fileName, signal);

    if (signal.aborted) return; // superseded by a newer save

    const { report, glbPath, stderr } = result;
    if (stderr.trim()) output.appendLine(stderr.trim());
    output.appendLine(
      `[brepjs] ${name}: ok=${String(report.ok)} shape=${report.shapeType ?? 'null'}` +
        (report.measurements.volume !== undefined
          ? ` vol=${report.measurements.volume.toFixed(2)}`
          : ''),
    );

    cache.set(doc.uri, report);
    preview.update(doc.fileName, report, glbPath);
  } catch (e) {
    if (signal.aborted) return;
    const msg = e instanceof Error ? e.message : String(e);
    output.appendLine(`[brepjs] error: ${msg}`);
    preview.showError(msg, doc.fileName);
  }
}
