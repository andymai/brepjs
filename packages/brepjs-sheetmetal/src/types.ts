import type { Solid, Wire, Edge, Bounds3D } from 'brepjs';

/** Which edge of a flat a child flange folds off. */
export type FlatSide = 'xmin' | 'xmax' | 'ymin' | 'ymax';

/**
 * Reference to the parent edge a flange folds from. `faceIndex` keeps the legacy
 * construction-order scheme (`face-0` = base flat). `parentId` names the parent
 * flat directly (a flange id for chained flanges, or undefined for the base) and
 * `side`/`offset`/`extent` locate the flange along that parent edge — the data
 * the recursive unfold walk and the feature tree consume.
 */
export type EdgeRef = {
  kind: 'index';
  faceIndex: number;
  edgeIndex: number;
  parentId?: string | undefined;
  side?: FlatSide | undefined;
  offset?: number | undefined;
  extent?: number | undefined;
};

export interface BendRule {
  innerRadius: number;
  kFactor: number;
  allowance?: number | undefined;
  deduction?: number | undefined;
  bendTableRef?: string | undefined;
}

export interface MaterialSpec {
  name: string;
  thickness: number;
  defaultRule: BendRule;
}

export interface MiterSpec {
  gap: number;
  style: 'auto';
}

export interface BendFeature {
  id: string;
  axisOrigin: [number, number, number];
  axisDir: [number, number, number];
  angleDeg: number;
  direction: 'up' | 'down';
  rule: BendRule;
}

export interface FlangeFeature {
  id: string;
  baseEdge: EdgeRef;
  length: number;
  /** Extent along the bend axis — the flange's cross-width in the developed strip. */
  span: number;
  /** Start position of the flange measured along the parent edge (0 = edge start). */
  offset?: number | undefined;
  angleDeg: number;
  direction?: 'up' | 'down' | undefined;
  rule: BendRule;
  /** World-space AABB of the folded flange, recorded by {@link authorPart} from the
   * real placed geometry. The collision check prefers this over an analytic re-fold,
   * which is only correct for root flanges (chained flanges fold off an off-plane edge). */
  foldedBounds?: Bounds3D | undefined;
  miter?: MiterSpec | undefined;
}

/** A recorded corner miter between two perpendicular flanges. */
export interface CornerMiter {
  flangeA: string;
  flangeB: string;
  gap: number;
}

export interface SheetMetalPart {
  thickness: number;
  /** Base flat extent along +X (x∈[0, baseLength]); the east-run length. */
  baseLength: number;
  /** Base flat cross-width (extent perpendicular to the run); the developed-strip width. */
  width: number;
  material?: MaterialSpec | undefined;
  flanges: FlangeFeature[];
  bends: BendFeature[];
  solid?: Solid | undefined;
  miters?: CornerMiter[] | undefined;
}

export interface FlatPattern {
  outline: Wire;
  bendLines: { line: Edge; angleDeg: number; direction: 'up' | 'down' }[];
  developedArea: number;
}

export interface BendReport {
  bends: {
    id: string;
    angleDeg: number;
    radius: number;
    allowance: number;
    flatLength: number;
    direction: 'up' | 'down';
  }[];
  totalFlatSize: [number, number];
}

export type SheetMetalWarning = {
  code: 'COLLISION' | 'SEAM_CUT' | 'MIN_RADIUS' | 'INVALID_SOLID';
  message: string;
  featureId?: string | undefined;
};

export interface UnfoldResult {
  pattern: FlatPattern;
  report: BendReport;
  warnings: SheetMetalWarning[];
}
