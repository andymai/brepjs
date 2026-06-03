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

/**
 * A relief cut to make a multi-bend part manufacturable. `shape` records the intent:
 * `rectangular` is a plain slot, `obround` the rounded-slot (semicircular-ended,
 * lower-stress) standard relief. In this version both produce rectangular geometry —
 * `obround` only carries the rounded-end intent onto the recorded feature; the
 * developed notch and 3D cut are rectangular for both. `width` runs along the parent
 * edge (the slot's narrow extent, default ≈ material thickness); `depth` cuts
 * perpendicular into the parent flat (default ≈ the bend's developed length plus a
 * small clearance). For a corner relief, `width` sets the square notch side (default
 * ≈ depth).
 */
export interface ReliefSpec {
  shape: 'rectangular' | 'obround';
  width?: number | undefined;
  depth?: number | undefined;
}

/**
 * A recorded relief, mirroring {@link CornerMiter}: enough information for the
 * unfold to replay the 2D notch without reparsing geometry. `kind` distinguishes a
 * bend relief (a slot at each end of a partial bend line, into the parent flat)
 * from a corner relief (a notch at the shared corner of two flanges). `notches`
 * are the developed-plane (flat-pattern) rectangles to subtract from the outline;
 * each is also cut from the 3D solid. `shape` carries the rounded-end option onto
 * the developed outline.
 */
export interface ReliefFeature {
  kind: 'bend' | 'corner';
  shape: 'rectangular' | 'obround';
  /** The flange the relief was applied to (bend relief) or the first flange (corner relief). */
  flangeA: string;
  /** The second flange of a corner relief; undefined for a bend relief. */
  flangeB?: string | undefined;
  width: number;
  depth: number;
  /** Developed-plane notch rectangles `[x0, y0, x1, y1]` subtracted from the outline. */
  notches: [number, number, number, number][];
}

/**
 * A 2D feature punched through a named flat region's thickness, in that region's
 * LOCAL frame: the origin is the region frame origin, `+x` runs along the region's
 * `u` axis and `+y` along its `v` axis (so `(0,0)` is the region's near corner).
 * `region` is a flange id, or `'root'`/`'base'` for the base flat.
 *
 * - `hole`   — a circular hole centred at `(x, y)`.
 * - `slot`   — a slot centred at `(x, y)`, `length` along the slot axis by `width`
 *              across; `angleDeg` rotates the slot in-plane (CCW about its centre);
 *              `round` makes the ends semicircular (obround) rather than square.
 * - `polygon`— an arbitrary closed polygon given by its local `points` (≥ 3).
 *
 * `region` names the flat the cutout sits on: a flange id, or `'root'`/`'base'`/
 * `'face-0'` for the base flat (the three base aliases the rest of the package
 * accepts). Coordinates are region-local: `+x` along the bend axis, `+y` along the
 * run, origin at the region's frame origin.
 */
export type CutoutSpec =
  | { kind: 'hole'; region: string; x: number; y: number; diameter: number }
  | {
      kind: 'slot';
      region: string;
      x: number;
      y: number;
      length: number;
      width: number;
      angleDeg?: number | undefined;
      round?: boolean | undefined;
    }
  | { kind: 'polygon'; region: string; points: [number, number][] };

/**
 * A recorded cutout, mirroring {@link ReliefFeature}: enough to replay the 2D loop
 * in the developed pattern without re-deriving geometry. `spec` is the original
 * region-local feature (so {@link FoldRegion} can re-apply it on a re-fold); `loop`
 * is the closed cutout boundary already mapped into developed-plane coordinates via
 * the region's unfold frame; `area` is the loop's enclosed area, subtracted from the
 * developed area.
 */
export interface CutoutFeature {
  spec: CutoutSpec;
  /** The region (flange id, or `'root'`) the cutout was applied to. */
  region: string;
  /** Closed cutout boundary `[x, y]` in the developed (flat-pattern) plane. */
  loop: [number, number][];
  /** Enclosed area of the loop. */
  area: number;
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
  reliefs?: ReliefFeature[] | undefined;
  cutouts?: CutoutFeature[] | undefined;
}

export interface FlatPattern {
  outline: Wire;
  bendLines: {
    id: string;
    line: Edge;
    angleDeg: number;
    direction: 'up' | 'down';
    /** Unit direction in the developed plane pointing into the parent flat (the
     * side a bend relief notches), opposite the develop-out direction. */
    inward: [number, number];
  }[];
  /** Interior cutout loops (holes/slots/polygons) as closed wires in the developed plane. */
  holes: Wire[];
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

/**
 * One fold-up region in a {@link FlatInput}: a rectangle in the flat pattern that
 * folds about a fold line off its parent region (the base by default, or another
 * region via `parent`). The region-tree is the inverse of the unfold layout, and is
 * recovered purely from the 2D flat-pattern geometry by `patternToFlatInput` — so
 * folding it up just re-runs the forward author geometry. `side`/`offset`/`width`
 * locate the fold line along the parent edge exactly as the authoring `FlangeSpec`
 * does (`side` is expressed in the parent region's local frame).
 */
export interface FoldRegion {
  id: string;
  /** Flat extent of the region away from the fold line (becomes the flange length). */
  length: number;
  angleDeg: number;
  direction: 'up' | 'down';
  rule: BendRule;
  /** Which edge of the parent region this region folds off. Default `'xmax'`. */
  side?: FlatSide | undefined;
  /** Id of another fold region this one chains off. Default = base region. */
  parent?: string | undefined;
  /** Start position along the parent edge. Default `0`. */
  offset?: number | undefined;
  /** Extent along the parent edge. Default = full parent-edge length. */
  width?: number | undefined;
  miter?: MiterSpec | undefined;
  /** Bend relief to add at this region's partial-span fold-line ends after folding. */
  bendRelief?: ReliefSpec | undefined;
  /** Cutouts to punch into this region (in region-local coords) after folding. */
  cutouts?: CutoutSpec[] | undefined;
}

/**
 * A flat pattern to fold up into a 3D part: the base region (a rectangle) plus a
 * tree of {@link FoldRegion}s, each folding off its parent about a fold line. This
 * is the inverse of {@link unfold}: a region-tree rather than a 2D outline, which
 * avoids fragile auto-partitioning of an arbitrary developed polygon and maps
 * one-to-one onto the authored feature tree.
 */
export interface FlatInput {
  thickness: number;
  /** Base region extent along +X (the run). */
  baseLength: number;
  /** Base region extent along +Y (the developed-strip width). */
  width: number;
  material?: MaterialSpec | undefined;
  regions: FoldRegion[];
  /** Cutouts to punch into the base region (in base-local coords) after folding. */
  baseCutouts?: CutoutSpec[] | undefined;
}
