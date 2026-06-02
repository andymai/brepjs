import { IfcAPI, Handle } from 'web-ifc';
import type { BimError } from '../errors/bimError.js';
import { ifcError } from '../errors/bimError.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import { deriveIfcGuidSync, makeLineKey } from '../identity/guidDerivation.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';

/** Default MVD ViewDefinition declared in the STEP FILE_DESCRIPTION header. */
export const DEFAULT_MVD_VIEW_DEFINITION = 'ReferenceView_v1.2';

// web-ifc emits a default ViewDefinition (e.g. "[CoordinationView]") in the STEP
// FILE_DESCRIPTION; we rewrite whatever is between the brackets with our MVD.
const VIEW_DEFINITION_RE = /ViewDefinition \[[^\]]*\]/;

export class IfcWriter {
  readonly #api: IfcAPI;
  readonly #modelId: number;
  readonly #mvdViewDefinition: string;
  #nextExpressId = 1;
  #closed = false;
  // Per-model scope mixed into writer-minted GUIDs (psets/quantities/rels) so
  // they stay globally unique across models, matching element/rel/type scoping.
  #modelScope = '';

  private constructor(api: IfcAPI, modelId: number, mvdViewDefinition: string) {
    this.#api = api;
    this.#modelId = modelId;
    this.#mvdViewDefinition = mvdViewDefinition;
  }

  static async create(
    mvdViewDefinition: string = DEFAULT_MVD_VIEW_DEFINITION
  ): Promise<Result<IfcWriter, BimError>> {
    try {
      const api = new IfcAPI();
      await api.Init();
      const modelId = api.CreateModel({ schema: 'IFC4' });
      return ok(new IfcWriter(api, modelId, mvdViewDefinition));
    } catch (e) {
      return err(ifcError('IFC_INIT_FAILED', 'Failed to initialize web-ifc', e));
    }
  }

  nextId(): number {
    return this.#nextExpressId++;
  }

  /**
   * Deterministic GlobalId for a writer-minted line, keyed on its express ID.
   * Express IDs are assigned in a fixed serialization order, so an identical
   * model produces identical GlobalIds for its psets/quantities/rels.
   */
  /** Sets the per-model scope mixed into writer-minted GlobalIds. */
  setModelScope(scope: string): void {
    this.#modelScope = scope;
  }

  guidFor(expressId: number): IfcGuid {
    return deriveIfcGuidSync(makeLineKey(this.#modelScope, expressId));
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
      return ok(this.#patchMvd(bytes));
    } catch (e) {
      return err(ifcError('IFC_SAVE_FAILED', 'Failed to serialize IFC model', e));
    } finally {
      // CloseModel always runs to prevent WASM handle leaks; a failed save is therefore terminal.
      this.#api.CloseModel(this.#modelId);
      this.#closed = true;
    }
  }

  /**
   * Injects the declared MVD into the STEP FILE_DESCRIPTION header. web-ifc does
   * not expose the header's ViewDefinition for configuration, so we rewrite the
   * empty default in the ASCII header region. If the expected pattern is absent
   * (e.g. a future web-ifc default change) the bytes are returned unchanged.
   */
  #patchMvd(bytes: Uint8Array): Uint8Array {
    if (this.#mvdViewDefinition.length === 0) return bytes;
    // The FILE_DESCRIPTION line lives near the top, after web-ifc's comment block.
    const HEADER_SCAN = Math.min(bytes.byteLength, 2048);
    const head = new TextDecoder().decode(bytes.subarray(0, HEADER_SCAN));
    if (!VIEW_DEFINITION_RE.test(head)) {
      console.warn(
        `IfcWriter: FILE_DESCRIPTION ViewDefinition not found; MVD "${this.#mvdViewDefinition}" not declared`
      );
      return bytes;
    }
    const patchedHead = head.replace(
      VIEW_DEFINITION_RE,
      `ViewDefinition [${this.#mvdViewDefinition}]`
    );
    const patchedHeadBytes = new TextEncoder().encode(patchedHead);
    const tail = bytes.subarray(HEADER_SCAN);
    const out = new Uint8Array(patchedHeadBytes.byteLength + tail.byteLength);
    out.set(patchedHeadBytes, 0);
    out.set(tail, patchedHeadBytes.byteLength);
    return out;
  }
}
