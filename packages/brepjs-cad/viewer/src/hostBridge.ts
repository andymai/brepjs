/**
 * Just enough of the MCP Apps view protocol (SEP-1865) for the inline viewer: JSON-RPC 2.0 over
 * postMessage to the host, the ui/initialize handshake, the tool-input and tool-result
 * notifications, and tools/call to brep-mcp's app-only tools through the host.
 */

type Json = Record<string, unknown>;
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export interface CallToolResultLike {
  readonly content?: readonly { readonly type: string; readonly text?: string }[];
  readonly structuredContent?: Json;
  readonly isError?: boolean;
}

export class HostBridge {
  #next = 1;
  readonly #pending = new Map<number, Pending>();
  readonly #listeners = new Map<string, ((params: Json) => void)[]>();

  constructor(private readonly target: Window = window.parent) {
    window.addEventListener('message', (event: MessageEvent<unknown>) => {
      // Only the host speaks to the view; anything else posting to this window is ignored.
      if (event.source !== this.target) return;
      const msg = event.data as Json | null;
      if (msg === null || typeof msg !== 'object' || msg['jsonrpc'] !== '2.0') return;
      const id = msg['id'];
      if (typeof id === 'number' && !('method' in msg)) {
        const p = this.#pending.get(id);
        if (p === undefined) return;
        this.#pending.delete(id);
        const error = msg['error'] as { message?: string } | undefined;
        if (error) p.reject(new Error(error.message ?? 'host error'));
        else p.resolve(msg['result']);
        return;
      }
      const method = msg['method'];
      if (typeof method === 'string') {
        for (const fn of this.#listeners.get(method) ?? []) fn((msg['params'] as Json) ?? {});
      }
    });
  }

  request<T>(method: string, params: Json): Promise<T> {
    const id = this.#next++;
    this.target.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    });
  }

  notify(method: string, params: Json = {}): void {
    this.target.postMessage({ jsonrpc: '2.0', method, params }, '*');
  }

  on(method: string, fn: (params: Json) => void): void {
    this.#listeners.set(method, [...(this.#listeners.get(method) ?? []), fn]);
  }

  async connect(): Promise<void> {
    await this.request('ui/initialize', {
      protocolVersion: '2026-01-26',
      clientInfo: { name: 'brep-mcp-viewer', version: '1' },
      appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
    });
    this.notify('ui/notifications/initialized');
  }

  callTool(name: string, args: Json): Promise<CallToolResultLike> {
    return this.request<CallToolResultLike>('tools/call', { name, arguments: args });
  }
}
