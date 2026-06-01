import * as vscode from 'vscode';
import type { VerifyReport } from './types.js';

export class ReportCache implements vscode.Disposable {
  private readonly cache = new Map<string, VerifyReport>();
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidUpdate: vscode.Event<vscode.Uri> = this.emitter.event;

  set(uri: vscode.Uri, report: VerifyReport): void {
    this.cache.set(uri.toString(), report);
    this.emitter.fire(uri);
  }

  get(uri: vscode.Uri): VerifyReport | undefined {
    return this.cache.get(uri.toString());
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
