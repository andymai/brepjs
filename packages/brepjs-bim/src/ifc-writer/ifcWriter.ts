import { IfcAPI, Handle } from 'web-ifc';
import type { BimError } from '../errors/bimError.js';
import { ifcError } from '../errors/bimError.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import { deriveIfcGuidSync, makeLineKey } from '../identity/guidDerivation.js';
import type { IfcSchema } from './schemaVersion.js';
import { DEFAULT_IFC_SCHEMA, fileSchemaString } from './schemaVersion.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';

/** Default MVD ViewDefinition declared in the STEP FILE_DESCRIPTION header. */
export const DEFAULT_MVD_VIEW_DEFINITION = 'ReferenceView_v1.2';

// web-ifc emits a default ViewDefinition (e.g. "[CoordinationView]") in the STEP
// FILE_DESCRIPTION; we rewrite whatever is between the brackets with our MVD.
const VIEW_DEFINITION_RE = /ViewDefinition \[[^\]]*\]/;

// web-ifc writes FILE_NAME author/organization as `($)` (a list whose sole entry
// is null) and authorization as bare `$`. ISO 10303-21 types author/organization
// as LIST [1:?] OF STRING and authorization as STRING, so a null list element /
// `$` is non-conformant and real IFC validators (IfcOpenShell, Solibri) reject
// it. We rewrite those three fields post-save, tolerating either the `($)` or a
// bare `$` form across web-ifc versions.
// Captures: 1 = `FILE_NAME('name','timestamp',`, 2 = `'preproc','originating'`.
const FILE_NAME_RE =
  /(FILE_NAME\('[^']*','[^']*',)(?:\$|\(\$\)),(?:\$|\(\$\)),('[^']*','[^']*'),\$\)/;

/** STEP single-quoted string literal with embedded quotes doubled per ISO 10303-21. */
function stepString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export interface IfcHeaderMeta {
  readonly author?: string | undefined;
  readonly organization?: string | undefined;
}

export class IfcWriter {
  readonly #api: IfcAPI;
  readonly #modelId: number;
  readonly #mvdViewDefinition: string;
  readonly #author: string;
  readonly #organization: string;
  #nextExpressId = 1;
  #closed = false;
  // Per-model scope mixed into writer-minted GUIDs (psets/quantities/rels) so
  // they stay globally unique across models, matching element/rel/type scoping.
  #modelScope = '';

  private constructor(
    api: IfcAPI,
    modelId: number,
    mvdViewDefinition: string,
    header: IfcHeaderMeta
  ) {
    this.#api = api;
    this.#modelId = modelId;
    this.#mvdViewDefinition = mvdViewDefinition;
    this.#author = header.author ?? '';
    this.#organization = header.organization ?? '';
  }

  static async create(
    mvdViewDefinition: string = DEFAULT_MVD_VIEW_DEFINITION,
    ifcSchema: IfcSchema = DEFAULT_IFC_SCHEMA,
    header: IfcHeaderMeta = {}
  ): Promise<Result<IfcWriter, BimError>> {
    try {
      const api = new IfcAPI();
      await api.Init();
      const modelId = api.CreateModel({ schema: fileSchemaString(ifcSchema) });
      return ok(new IfcWriter(api, modelId, mvdViewDefinition, header));
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
      return ok(this.#patchHeader(bytes));
    } catch (e) {
      return err(ifcError('IFC_SAVE_FAILED', 'Failed to serialize IFC model', e));
    } finally {
      // CloseModel always runs to prevent WASM handle leaks; a failed save is therefore terminal.
      this.#api.CloseModel(this.#modelId);
      this.#closed = true;
    }
  }

  /**
   * Rewrites the STEP header in the ASCII region web-ifc emits: declares the MVD
   * in FILE_DESCRIPTION and makes FILE_NAME's author/organization/authorization
   * spec-conformant (web-ifc leaves them as bare `$`). web-ifc exposes neither
   * for configuration. If an expected pattern is absent (e.g. a future web-ifc
   * default change) that part is skipped and the bytes returned unchanged.
   */
  #patchHeader(bytes: Uint8Array): Uint8Array {
    // The FILE_DESCRIPTION / FILE_NAME lines live near the top, after web-ifc's
    // comment block; scan a bounded prefix so we never decode the whole model.
    const HEADER_SCAN = Math.min(bytes.byteLength, 2048);
    let head = new TextDecoder().decode(bytes.subarray(0, HEADER_SCAN));

    // author / organization are LIST [1:?], so at least one entry is required —
    // an empty list still violates the cardinality. Fall back to '' when unset.
    // Warn (don't silently no-op) if a future web-ifc default breaks the pattern,
    // mirroring the MVD patch below — a missed match means non-conformant output.
    if (FILE_NAME_RE.test(head)) {
      head = head.replace(
        FILE_NAME_RE,
        (_m, prefix: string, systems: string) =>
          `${prefix}(${stepString(this.#author)}),(${stepString(this.#organization)}),` +
          `${systems},${stepString('')})`
      );
    } else {
      console.warn(
        'IfcWriter: FILE_NAME null-field pattern not found; author/organization/authorization left unpatched'
      );
    }

    if (this.#mvdViewDefinition.length > 0) {
      if (VIEW_DEFINITION_RE.test(head)) {
        head = head.replace(VIEW_DEFINITION_RE, `ViewDefinition [${this.#mvdViewDefinition}]`);
      } else {
        console.warn(
          `IfcWriter: FILE_DESCRIPTION ViewDefinition not found; MVD "${this.#mvdViewDefinition}" not declared`
        );
      }
    }

    const patchedHeadBytes = new TextEncoder().encode(head);
    const tail = bytes.subarray(HEADER_SCAN);
    const out = new Uint8Array(patchedHeadBytes.byteLength + tail.byteLength);
    out.set(patchedHeadBytes, 0);
    out.set(tail, patchedHeadBytes.byteLength);
    return out;
  }
}
