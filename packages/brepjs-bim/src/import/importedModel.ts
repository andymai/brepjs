import type { ValidSolid } from 'brepjs';
import type { ValidationReport } from '../validation/severity.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import type { ImportedSchema } from './spfReader.js';

export type { ImportedSchema } from './spfReader.js';

/**
 * How faithfully a product's body geometry was reconstructed:
 * - `PARAMETRIC` — rebuilt losslessly from a swept solid (extrude/revolve).
 * - `TESSELLATED_MANIFOLD` — a tessellated mesh was recovered as a closed solid
 *   via an STL round-trip; geometrically faithful but topology was re-derived.
 * - `TESSELLATED_LOSSY` — geometry exists only as raw triangles (mesh did not
 *   close into a solid); `solid` is null, `meshVertices`/`meshIndices` carry it.
 * - `NONE` — no recognised body representation was found.
 */
export type GeometryFidelity =
  | 'PARAMETRIC'
  | 'TESSELLATED_MANIFOLD'
  | 'TESSELLATED_LOSSY'
  | 'NONE';

export interface ImportedGeometry {
  readonly fidelity: GeometryFidelity;
  /** The reconstructed solid; null when fidelity is `NONE` or `TESSELLATED_LOSSY`. */
  readonly solid: ValidSolid | null;
  /** Raw triangle vertices (interleaved xyz), present only for `TESSELLATED_LOSSY`. */
  readonly meshVertices?: Float32Array | undefined;
  /** Raw triangle indices, present only for `TESSELLATED_LOSSY`. */
  readonly meshIndices?: Uint32Array | undefined;
}

export interface ImportedPset {
  readonly name: string;
  /** `true` when sourced from an IfcElementQuantity rather than an IfcPropertySet. */
  readonly isQuantity: boolean;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
  /**
   * Per-property IFC measure-type codes (web-ifc type constants), keyed by the
   * same property name as `properties`. Lets callers distinguish e.g. an
   * IfcThermalTransmittanceMeasure from a plain IfcReal. Absent entries fall back
   * to the value's JS type.
   */
  readonly measureTypes: Readonly<Record<string, number>>;
}

export interface ImportedMaterial {
  readonly kind: 'SIMPLE' | 'LAYER_SET';
  readonly name: string;
  readonly layers?:
    | readonly { readonly name: string; readonly thicknessMm: number }[]
    | undefined;
}

export interface ImportedClassification {
  readonly system: string;
  readonly code: string;
  readonly description?: string | undefined;
}

export type ImportedElementCategory =
  | 'WALL'
  | 'SLAB'
  | 'BEAM'
  | 'COLUMN'
  | 'DOOR'
  | 'WINDOW'
  | 'OPENING'
  | 'SPACE'
  | 'ROOF'
  | 'CURTAIN_WALL'
  | 'FOOTING'
  | 'PILE'
  | 'STAIR'
  | 'RAMP'
  | 'RAILING'
  | 'COVERING'
  | 'ELEMENT_ASSEMBLY'
  | 'PROXY';

export interface ImportedElement {
  readonly expressId: number;
  readonly guid: IfcGuid;
  readonly name: string;
  readonly category: ImportedElementCategory;
  readonly predefinedType?: string | undefined;
  readonly storeyExpressId?: number | undefined;
  readonly geometry: ImportedGeometry;
  readonly psets: readonly ImportedPset[];
  readonly material: ImportedMaterial | null;
  readonly classification: ImportedClassification | null;
  /** Express ids of opening elements that void this element. */
  readonly voidedBy: readonly number[];
  /** Express id of the opening this element fills (doors/windows only). */
  readonly fills?: number | undefined;
}

export interface ImportedSpatialNode {
  readonly expressId: number;
  readonly guid: IfcGuid;
  readonly name: string;
  readonly category: 'PROJECT' | 'SITE' | 'BUILDING' | 'STOREY';
  readonly elevationMm?: number | undefined;
  readonly children: readonly ImportedSpatialNode[];
  readonly containedElements: readonly number[];
}

/**
 * Frees every reconstructed solid handle held by an imported model. The
 * geometry are live WASM handles, so callers MUST call this once they are done
 * with the model (it is not reclaimed automatically when the model is GC'd).
 */
export function disposeImportedModel(model: ImportedModel): void {
  for (const el of model.elements) {
    el.geometry.solid?.[Symbol.dispose]();
  }
}

/**
 * The reconstructed model. Holds live WASM solid handles in `elements[].geometry`;
 * call {@link disposeImportedModel} when finished to avoid leaking them.
 */
export interface ImportedModel {
  readonly schema: ImportedSchema;
  readonly spatialTree: ImportedSpatialNode | null;
  readonly elements: readonly ImportedElement[];
  /** Express id → ImportedElement for fast lookup. */
  readonly byExpressId: ReadonlyMap<number, ImportedElement>;
  readonly diagnostics: ValidationReport;
  readonly applicationName?: string | undefined;
}
