import { IfcAPI } from 'web-ifc';
import type { FlatMesh, IfcGeometry } from 'web-ifc';
import type { BimError } from '../errors/bimError.js';
import { importError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';

/** Schema strings web-ifc reports and this reader supports. */
export type ImportedSchema = 'IFC2X3' | 'IFC4' | 'IFC4X3';

const SUPPORTED_SCHEMAS: readonly string[] = ['IFC2X3', 'IFC4', 'IFC4X3'];

export interface SpfReaderSettings {
  /**
   * Activate web-ifc's built-in large-coordinate recentering on open. Defaults
   * to false; set true for georeferenced models with far-from-origin geometry.
   */
  readonly coordinateToOrigin?: boolean;
}

/**
 * Foundation layer of the IFC reader: owns the web-ifc WASM model handle and
 * exposes typed line access, GUID↔expressId lookup, world-transform composition,
 * geometry-engine access and STEP string decoding.
 *
 * Lifecycle: created via the static async {@link SpfReader.create}; the caller
 * MUST call {@link SpfReader.close} (it always issues `CloseModel`, preventing
 * WASM handle leaks). The handle is `using`-friendly via `Symbol.dispose`.
 */
// web-ifc's Emscripten-bound vectors expose `.delete()` at runtime to free WASM
// heap memory, but the type does not declare it. The optional-method parameter
// type accepts any object and calls delete() when present — no cast, no `any`.
function deleteVector(vec: unknown): void {
  (vec as { delete?: () => void }).delete?.();
}

export class SpfReader {
  readonly schema: ImportedSchema;
  readonly modelId: number;
  readonly #api: IfcAPI;
  #closed = false;
  // Caches GetLineIDsWithType results per type code. The model is read-only
  // during import, so this is safe and removes the per-element WASM round-trip.
  readonly #linesByType = new Map<number, number[]>();

  private constructor(api: IfcAPI, modelId: number, schema: ImportedSchema) {
    this.#api = api;
    this.modelId = modelId;
    this.schema = schema;
  }

  static async create(
    bytes: Uint8Array,
    settings: SpfReaderSettings = {}
  ): Promise<Result<SpfReader, BimError>> {
    let api: IfcAPI;
    try {
      api = new IfcAPI();
      await api.Init();
    } catch (e) {
      return err(importError('OPEN_MODEL_FAILED', 'Failed to initialize web-ifc', e));
    }

    let modelId: number;
    try {
      modelId = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: settings.coordinateToOrigin ?? false });
    } catch (e) {
      return err(importError('OPEN_MODEL_FAILED', 'web-ifc OpenModel threw', e));
    }

    if (modelId < 0 || !api.IsModelOpen(modelId)) {
      if (modelId >= 0) api.CloseModel(modelId);
      return err(importError('OPEN_MODEL_FAILED', 'web-ifc OpenModel returned an invalid model id'));
    }

    const schemaRaw = api.GetModelSchema(modelId);
    if (!SUPPORTED_SCHEMAS.includes(schemaRaw)) {
      api.CloseModel(modelId);
      return err(
        importError('SCHEMA_UNSUPPORTED', `Unsupported IFC schema "${schemaRaw}"`)
      );
    }

    return ok(new SpfReader(api, modelId, schemaRaw as ImportedSchema));
  }

  /** Always issues CloseModel; safe to call more than once. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#api.CloseModel(this.modelId);
  }

  [Symbol.dispose](): void {
    this.close();
  }

  /**
   * Raw line object for an express id. With `flatten=false` (default) references
   * appear as `{ type, value }` wrappers and nested entities are not resolved;
   * pass `flatten=true` to recursively inline referenced lines.
   */
  getLine<T = unknown>(expressId: number, flatten = false): T | null {
    const line = this.#api.GetLine(this.modelId, expressId, flatten) as T | null | undefined;
    return line ?? null;
  }

  /** Express ids of every line whose type equals `type` (no inherited types). */
  getLinesOfType(type: number): number[] {
    // Memoized: the WASM vector returned by GetLineIDsWithType is allocated on
    // the WASM heap and must be .delete()'d (CloseModel does NOT free it).
    // Callers hit this once per element during import, so caching both stops the
    // per-call leak and removes the repeated O(n) WASM round-trip.
    const cached = this.#linesByType.get(type);
    if (cached !== undefined) return cached;
    const vec = this.#api.GetLineIDsWithType(this.modelId, type);
    const out: number[] = [];
    for (let i = 0; i < vec.size(); i++) {
      out.push(vec.get(i));
    }
    deleteVector(vec);
    this.#linesByType.set(type, out);
    return out;
  }

  /** Express ids of every line in the model. */
  getAllLines(): number[] {
    const vec = this.#api.GetAllLines(this.modelId);
    const out: number[] = [];
    for (let i = 0; i < vec.size(); i++) {
      out.push(vec.get(i));
    }
    // Free the WASM-heap vector; CloseModel does not reclaim it.
    deleteVector(vec);
    return out;
  }

  /** IFC type code for an express id. */
  getLineType(expressId: number): number {
    const t: unknown = this.#api.GetLineType(this.modelId, expressId);
    return typeof t === 'number' ? t : Number((t as { value?: unknown } | undefined)?.value ?? t);
  }

  /** Builds web-ifc's internal GUID→expressId index; call before guid lookups. */
  buildGuidMap(): void {
    this.#api.CreateIfcGuidToExpressIdMapping(this.modelId);
  }

  /** expressId for a GlobalId, or undefined. Requires {@link buildGuidMap} first. */
  expressIdFromGuid(guid: string): number | undefined {
    const id = this.#api.GetExpressIdFromGuid(this.modelId, guid);
    return typeof id === 'number' ? id : undefined;
  }

  /** GlobalId for an express id, or undefined. Requires {@link buildGuidMap} first. */
  guidFromExpressId(expressId: number): string | undefined {
    const guid = this.#api.GetGuidFromExpressId(this.modelId, expressId);
    return typeof guid === 'string' ? guid : undefined;
  }

  /**
   * Composed world transform (column-major 16-float matrix) for a placement
   * express id, resolving the full IfcLocalPlacement chain.
   */
  getWorldTransform(placementExpressId: number): number[] {
    return this.#api.GetWorldTransformMatrix(this.modelId, placementExpressId);
  }

  /** Streams placed meshes for the given product express ids. */
  streamMeshes(
    expressIds: number[],
    cb: (mesh: FlatMesh, index: number, total: number) => void
  ): void {
    this.#api.StreamMeshes(this.modelId, expressIds, cb);
  }

  /** Geometry buffers for a geometry express id; caller MUST call `.delete()`. */
  getGeometry(geometryExpressId: number): IfcGeometry {
    return this.#api.GetGeometry(this.modelId, geometryExpressId);
  }

  /** Reads a Float32Array view of vertex data from a WASM pointer. */
  getVertexArray(ptr: number, size: number): Float32Array {
    return this.#api.GetVertexArray(ptr, size);
  }

  /** Reads a Uint32Array view of index data from a WASM pointer. */
  getIndexArray(ptr: number, size: number): Uint32Array {
    return this.#api.GetIndexArray(ptr, size);
  }

  /** Decodes IFC STEP string escapes (`\X2\`, `\S\`, `\X\`) in a raw value. */
  decodeText(s: string): string {
    const decoded = this.#api.DecodeText(s) as unknown;
    return typeof decoded === 'string' ? decoded : s;
  }
}
