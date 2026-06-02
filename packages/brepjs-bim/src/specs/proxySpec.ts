import type { ValidSolid } from 'brepjs';

/**
 * Specification for an IfcBuildingElementProxy — arbitrary geometry that does
 * not map to a typed element (wall/slab/beam/column). The solid is exported via
 * the tessellation path (IfcTriangulatedFaceSet). All custom-property values are
 * grouped by pset name. The solid is a brepjs ValidSolid handle, so this spec is
 * not a plain serializable object and is validated structurally, not via Zod.
 */
export interface ProxySpec {
  readonly name: string;
  /**
   * The proxy body. OWNERSHIP TRANSFERS to the BimModel on addProxy(): the model
   * disposes this handle when it is disposed, so the caller MUST NOT dispose it
   * itself (no `using`) — doing so double-frees the underlying WASM shape.
   */
  readonly solid: ValidSolid;
  readonly materialName?: string | undefined;
  readonly predefinedType?: 'COMPLEX' | 'ELEMENT' | 'NOTDEFINED' | 'PARTIAL' | undefined;
  readonly customProperties?:
    | Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>>
    | undefined;
}
