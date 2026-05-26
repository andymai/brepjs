import { IfcAPI } from 'web-ifc';
import type { BimError } from '../errors/bimError.js';
import { ifcError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';

export class IfcWriter {
  readonly #api: IfcAPI;
  readonly #modelId: number;
  #nextExpressId = 1;

  private constructor(api: IfcAPI, modelId: number) {
    this.#api = api;
    this.#modelId = modelId;
  }

  static async create(): Promise<Result<IfcWriter, BimError>> {
    try {
      const api = new IfcAPI();
      await api.Init();
      const modelId = api.CreateModel({ schema: 'IFC4' });
      return ok(new IfcWriter(api, modelId));
    } catch (e) {
      return err(ifcError('IFC_INIT_FAILED', 'Failed to initialize web-ifc', e));
    }
  }

  nextId(): number {
    return this.#nextExpressId++;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- web-ifc WASM type gap
  writeLine(entity: Record<string, unknown>): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- web-ifc WASM type gap
    this.#api.WriteLine(this.#modelId, entity as any);
    return entity['expressID'] as number;
  }

  mkType(type: number, value: unknown): Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- web-ifc WASM type gap
    return this.#api.CreateIfcType(this.#modelId, type, value as any) as Record<string, unknown>;
  }

  mkEntity(type: number, ...args: unknown[]): Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- web-ifc WASM type gap
    return this.#api.CreateIfcEntity(this.#modelId, type, ...(args as any[])) as unknown as Record<
      string,
      unknown
    >;
  }

  save(): Result<Uint8Array, BimError> {
    try {
      const bytes = this.#api.SaveModel(this.#modelId);
      this.#api.CloseModel(this.#modelId);
      return ok(bytes);
    } catch (e) {
      return err(ifcError('IFC_SAVE_FAILED', 'Failed to serialize IFC model', e));
    }
  }
}
