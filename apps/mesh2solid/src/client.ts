import type { MeshInspection, MeshUnit } from 'brepjs-mesh2solid';
import type { Conversion, FromWorker, ToWorker } from './protocol';

type Pending = { resolve: (msg: FromWorker) => void };

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
  }

  #send(msg: ToWorker, transfer: Transferable[]): Promise<FromWorker> {
    return new Promise((resolve) => {
      this.#pending.set(msg.id, { resolve });
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
