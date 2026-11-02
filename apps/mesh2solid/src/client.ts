import type { MeshInspection, MeshUnit } from 'brepjs-mesh2solid';
import type { Conversion, FromWorker, ToWorker } from './protocol.js';

type Pending = { resolve: (msg: FromWorker) => void; reject: (e: Error) => void };

/** Requests to the conversion worker, one promise per message. */
export class ConversionClient {
  readonly #worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  readonly #pending = new Map<number, Pending>();
  #next = 1;

  constructor() {
    this.#worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const p = this.#pending.get(e.data.id);
      this.#pending.delete(e.data.id);
      p?.resolve(e.data);
    };
    // A worker that fails to load (or a reply that can't be decoded) never
    // answers; fail what is waiting instead of leaving the page spinning.
    this.#worker.onerror = (e) =>
      this.#failAll(new Error(e.message || 'the worker failed to load'));
    this.#worker.onmessageerror = () =>
      this.#failAll(new Error('the worker sent an unreadable reply'));
  }

  #failAll(error: Error): void {
    for (const p of this.#pending.values()) p.reject(error);
    this.#pending.clear();
  }

  /** Stop the worker and fail anything still waiting on it. */
  terminate(): void {
    this.#worker.terminate();
    this.#failAll(new Error('the conversion was stopped'));
  }

  #send(msg: ToWorker, transfer: Transferable[]): Promise<FromWorker> {
    return new Promise((resolve, reject) => {
      this.#pending.set(msg.id, { resolve, reject });
      this.#worker.postMessage(msg, transfer);
    });
  }

  async inspect(file: File): Promise<MeshInspection> {
    const bytes = await file.arrayBuffer();
    const reply = await this.#send({ id: this.#next++, type: 'inspect', bytes, name: file.name }, [
      bytes,
    ]);
    if (reply.type === 'error') throw new Error(reply.message);
    if (reply.type !== 'inspected') throw new Error('unexpected reply from the worker');
    return reply.info;
  }

  async convert(file: File, units: MeshUnit): Promise<Conversion> {
    const bytes = await file.arrayBuffer();
    const reply = await this.#send(
      { id: this.#next++, type: 'convert', bytes, name: file.name, units },
      [bytes]
    );
    if (reply.type === 'error') throw new Error(reply.message);
    if (reply.type !== 'converted') throw new Error('unexpected reply from the worker');
    return reply.result;
  }
}
