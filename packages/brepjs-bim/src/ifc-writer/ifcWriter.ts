import { IfcAPI, Handle } from 'web-ifc';
import type { BimError } from '../errors/bimError.js';
import { ifcError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';

export class IfcWriter {
  readonly #api: IfcAPI;
  readonly #modelId: number;
  #nextExpressId = 1;
  #closed = false;

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

  writeLine(entity: { expressID: number } & Record<string, unknown>): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- web-ifc WASM type gap
    this.#api.WriteLine(this.#modelId, entity as any);
    return entity.expressID;
  }

  ref(id: number): InstanceType<typeof Handle> {
    // web-ifc 0.0.77 identifies references by the Handle class (not a {type:5,value}
    // shape); plain objects break serialization of SELECT-typed sets like
    // IfcUnitAssignment.Units ("Cannot pass non-string to std::string").
    return new Handle(id);
  }

  mkType(type: number, value: unknown): Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- web-ifc WASM type gap
    return this.#api.CreateIfcType(this.#modelId, type, value as any) as Record<string, unknown>;
  }

  save(): Result<Uint8Array, BimError> {
    if (this.#closed) {
      return err(ifcError('IFC_ALREADY_SAVED', 'Model has already been saved and closed'));
    }
    try {
      const bytes = this.#api.SaveModel(this.#modelId);
      return ok(bytes);
    } catch (e) {
      return err(ifcError('IFC_SAVE_FAILED', 'Failed to serialize IFC model', e));
    } finally {
      // CloseModel always runs to prevent WASM handle leaks; a failed save is therefore terminal.
      this.#api.CloseModel(this.#modelId);
      this.#closed = true;
    }
  }
}
