import * as vscode from 'vscode';
import { tmpdir } from 'node:os';
import type { VerifyReport, ToWebview } from './types.js';
import { getWebviewHtml } from './webviewHtml.js';

function localResourceRoots(extensionUri: vscode.Uri): vscode.Uri[] {
  return [
    vscode.Uri.file(tmpdir()),
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
  ];
}

/**
 * Manages both the sidebar WebviewView and the optional editor-column WebviewPanel.
 * Sends identical messages to whichever views are currently alive.
 *
 * Also implements WebviewViewProvider so it can be registered directly with VS Code
 * for the "brepjs.previewView" sidebar view.
 */
export class BrepPreviewManager implements vscode.Disposable, vscode.WebviewViewProvider {
  // Explicit `| undefined` (not `?`) satisfies exactOptionalPropertyTypes when clearing on dispose
  private sidebarView: vscode.WebviewView | undefined;
  private columnPanel: vscode.WebviewPanel | undefined;
  // Last verify result kept so the sidebar can replay it when it initializes late
  private lastUpdate: { filePath: string; report: VerifyReport; glbPath: string | null } | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  // ── WebviewViewProvider ──────────────────────────────────────────────────

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: localResourceRoots(this.context.extensionUri),
    };
    webviewView.webview.html = getWebviewHtml(webviewView.webview, this.context.extensionUri);
    this.sidebarView = webviewView;

    // When the webview signals it is ready, replay the last cached result so the
    // sidebar is not stuck in idle state when it initializes after the first verify
    // (VS Code lazy-initializes sidebar views, so resolveWebviewView often runs after
    // the first save-triggered verify has already completed).
    webviewView.webview.onDidReceiveMessage((msg: { type: string }) => {
      if (msg.type === 'ready' && this.lastUpdate !== undefined) {
        const { filePath, report, glbPath } = this.lastUpdate;
        const glbUri = glbPath
          ? webviewView.webview.asWebviewUri(vscode.Uri.file(glbPath)).toString()
          : null;
        this.postTo(webviewView.webview, { type: 'update', glbUri, report, filePath });
      }
    });

    webviewView.onDidDispose(() => {
      this.sidebarView = undefined;
    });
  }

  // ── Column panel ─────────────────────────────────────────────────────────

  openInColumn(): void {
    if (this.columnPanel) {
      this.columnPanel.reveal(vscode.ViewColumn.Beside);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'brepjsPreview',
      'brepjs Preview',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: localResourceRoots(this.context.extensionUri),
      },
    );
    panel.webview.html = getWebviewHtml(panel.webview, this.context.extensionUri);
    this.columnPanel = panel;
    panel.onDidDispose(() => {
      this.columnPanel = undefined;
    });
    this.context.subscriptions.push(panel);
  }

  // ── Messaging ────────────────────────────────────────────────────────────

  showLoading(filePath: string): void {
    this.post({ type: 'loading', filePath });
  }

  showError(message: string, filePath: string): void {
    this.post({ type: 'error', message, filePath });
  }

  update(filePath: string, report: VerifyReport, glbPath: string | null): void {
    this.lastUpdate = { filePath, report, glbPath };
    if (this.sidebarView) {
      const glbUri = glbPath
        ? this.sidebarView.webview.asWebviewUri(vscode.Uri.file(glbPath)).toString()
        : null;
      this.postTo(this.sidebarView.webview, { type: 'update', glbUri, report, filePath });
    }
    if (this.columnPanel) {
      const glbUri = glbPath
        ? this.columnPanel.webview.asWebviewUri(vscode.Uri.file(glbPath)).toString()
        : null;
      this.postTo(this.columnPanel.webview, { type: 'update', glbUri, report, filePath });
    }
  }

  private post(message: ToWebview): void {
    if (this.sidebarView) this.postTo(this.sidebarView.webview, message);
    if (this.columnPanel) this.postTo(this.columnPanel.webview, message);
  }

  private postTo(webview: vscode.Webview, message: ToWebview): void {
    void webview.postMessage(message);
  }

  dispose(): void {
    this.columnPanel?.dispose();
  }
}
