import type { Solid, Wire, Edge } from 'brepjs';

export type EdgeRef = { kind: 'index'; faceIndex: number; edgeIndex: number };

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
  angleDeg: number;
  rule: BendRule;
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
