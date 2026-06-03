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

/**
 * A rectangular tab: additive material extending OUTWARD from a flat region's edge
 * (the additive counterpart of a cutout). `region` names the flat (a flange id, or
 * `'base'`/`'root'` for the base); `side` is the region-local edge it protrudes
 * from; `offset` is its start position along that edge and `width` its extent along
 * it; `length` is how far it sticks out past the edge. The tab is full thickness.
 */
export interface TabSpec {
  region: string;
  side: FlatSide;
  offset: number;
  width: number;
  length: number;
}

/**
 * A recorded tab, mirroring {@link CutoutFeature}: enough to replay the developed
 * protrusion and re-fuse the 3D material on a re-fold. `rect` is the developed-plane
 * rectangle `[x0, y0, x1, y1]` added to the outer outline; `area` is its area, added
 * to the developed area.
 */
export interface TabFeature {
  spec: TabSpec;
  /** The region (flange id, or `'root'`) the tab protrudes from. */
  region: string;
  /** Developed-plane protrusion rectangle `[x0, y0, x1, y1]`. */
  rect: [number, number, number, number];
  /** Area of the protrusion rectangle (`width · length`). */
  area: number;
}

/**
 * A form feature: a louver (vent flap) or an emboss/dimple (round bump), formed
 * locally on a flat region's face. Forms do not remove or add net material, so the
 * developed outline is unchanged; the flat pattern carries the fabrication markers
 * (the louver U-cut + hinge line, the emboss footprint circle) on a FORM layer.
 *
 * - `louver` — a vent cut on three sides with the flap formed up along the hinge.
 *   `length` runs along the hinge, `width` is the flap depth (perpendicular), and
 *   `height` is how far the flap rises. `direction` picks the formed face (`up` =
 *   +n, the default).
 * - `emboss` / `dimple` — a round local form of `diameter` rising (`emboss`) or
 *   recessed (`dimple`) by `height`.
 *
 * Coordinates are region-local: `(x, y)` is the form centre, `+x` along the region
 * `u` axis, `+y` along `v`.
 */
export type FormSpec =
  | {
      kind: 'louver';
      region: string;
      x: number;
      y: number;
      length: number;
      width: number;
      height: number;
      direction?: 'up' | 'down' | undefined;
    }
  | {
      kind: 'emboss';
      region: string;
      x: number;
      y: number;
      diameter: number;
      height: number;
      form: 'dimple' | 'emboss';
    };

/**
 * A recorded form feature, mirroring {@link CutoutFeature}. `spec` is the original
 * region-local feature (so {@link FoldRegion} can re-apply it on a re-fold). `cuts`
 * are OPEN developed-plane cut paths: the louver's three cut sides — all but the
 * {@link FormFeature.hinge} side — as an open polyline the fabricator cuts to free
 * the flap; empty for an emboss/dimple, which removes no material. `markers` are
 * closed developed-plane marker loops (the emboss/dimple footprint circle; empty for
 * a louver). `hinge` is the developed-plane fold segment of a louver — the one
 * footprint side NOT cut — and is `undefined` for an emboss/dimple.
 */
export interface FormFeature {
  spec: FormSpec;
  /** The region (flange id, or `'root'`) the form sits on. */
  region: string;
  /** Developed-plane cut paths (open) a fabricator cuts; empty for embosses. */
  cuts: [number, number][][];
  /** Developed-plane marker loops (closed) for the FORM layer. */
  markers: [number, number][][];
  /** Developed-plane hinge segment `[a, b]` for a louver; undefined otherwise. */
  hinge?: [[number, number], [number, number]] | undefined;
}

/**
 * One segment of a contour-flange profile: an open 2D polyline of straight `line`
 * runs joined by circular-`arc` bends, swept along a straight base edge. A `line`
 * is a flat leg of `length`; an `arc` is a bend of `radius` turning `angleDeg`
 * either `up` (toward the parent normal) or `down`. Each arc becomes a recorded
 * {@link BendFeature}; each line a flat leg of the developed strip.
 */
export type ProfileSegment =
  | { kind: 'line'; length: number }
  | { kind: 'arc'; radius: number; angleDeg: number; direction: 'up' | 'down' };

/**
 * A contour flange: an OPEN 2D profile (alternating line/arc {@link ProfileSegment}s)
 * swept along a straight edge of the base flat (`side`). Unlike a plain flange (one
 * bend + one flat) this chains an arbitrary multi-bend cross-section — a return, a
 * hat/top-hat, a J — in one feature. The development is EXACT: the developed strip
 * length is the sum of each segment's developed length (lines: `length`; arcs: the
 * canonical {@link bendAllowance}).
 */
export interface ContourFlangeSpec {
  id: string;
  side: FlatSide;
  profile: ProfileSegment[];
  rule?: BendRule | undefined;
  /** Extent along the base edge (the bend-axis width). Default = full edge length. */
  width?: number | undefined;
  /** Start position along the base edge. Default `0`. */
  offset?: number | undefined;
}

/**
 * A recorded contour flange, mirroring {@link FlangeFeature}: enough for the unfold
 * to lay the developed strip out straight along the base edge without re-deriving
 * the 3D geometry. `segments` carries each developed segment in order (a flat leg or
 * a developed bend arc); `developedLength` is their exact sum (the strip length out
 * from the base edge); `span`/`offset` locate the strip along the base edge.
 */
export interface ContourFlangeFeature {
  id: string;
  side: FlatSide;
  /** Start position along the base edge. */
  offset: number;
  /** Extent along the base edge (the developed strip width). */
  span: number;
  /** Exact developed length out from the base edge (Σ segment developed lengths). */
  developedLength: number;
  segments: {
    kind: 'line' | 'arc';
    /** Developed length of this segment along the strip. */
    dev: number;
    angleDeg?: number | undefined;
    direction?: 'up' | 'down' | undefined;
    /** Id of the recorded {@link BendFeature} for an arc segment. */
    bendId?: string | undefined;
  }[];
}

/**
 * A lofted / ruled transition flange: a ruled surface lofted between two parallel
 * OPEN profiles (`profileA`, `profileB`) separated by `height` along +Z, thickened
 * to a valid solid. The development is by TRIANGULATION — the standard sheet-metal
 * transition development pairing profile vertices into triangles laid flat
 * preserving edge lengths. Exact to tolerance for a genuinely developable (single-
 * curvature, straight-generator) transition; an approximation otherwise, in which
 * case the unfold emits a {@link SheetMetalWarning} `DEVELOPMENT_APPROXIMATE`.
 */
export interface LoftedFlangeSpec {
  id: string;
  /** Open polyline of the near profile, in the base plane (z = 0). */
  profileA: [number, number][];
  /** Open polyline of the far profile (its z is `height`). */
  profileB: [number, number][];
  height: number;
  thickness?: number | undefined;
}

/**
 * A recorded lofted flange, mirroring {@link ContourFlangeFeature}. `developedLoop`
 * is the triangulated flat boundary (a closed developed-plane polygon); `developedArea`
 * the summed triangle areas; `approximate` flags a non-developable transition the
 * triangulated development only approximates (the unfold emits the warning).
 */
export interface LoftedFlangeFeature {
  id: string;
  /** Triangulated developed boundary `[x, y]` (closed) in the developed plane. */
  developedLoop: [number, number][];
  /** Summed area of the triangulated development. */
  developedArea: number;
  /** True when the transition is not developable; the development is an approximation. */
  approximate: boolean;
}

/**
 * A hem: an edge folded back ~180°+ onto its parent flat, then running a short
 * return leg. `region` names the flat the hem folds off (a flange id, or
 * `'base'`/`'root'` for the base flat); `side` is that region's local edge. The
 * four `type`s set the curl angle and the gap between the return and the parent:
 *
 * - `closed`   — a tight ~180° fold, the return runs flat against the parent
 *   (`gap ≈ 0`; a HAIR clearance keeps the fused solid valid). `length` is the
 *   return-leg length out along the parent.
 * - `open`     — a ~180° fold with a `gap` (defaults to `radius`) between the
 *   return and the parent, the return running parallel offset by the gap.
 * - `teardrop` — a >180° curl leaving a small teardrop opening, then a short
 *   return tangent to the curl.
 * - `rolled`   — a full ~270° circular roll (a curled edge / safe edge), no return.
 *
 * `radius` is the inner bend radius (defaults to one material thickness). `gap`
 * applies to `open` only. `rule` overrides the part's per-bend allowance rule.
 */
export interface HemSpec {
  region: string;
  side: FlatSide;
  type: 'closed' | 'open' | 'teardrop' | 'rolled';
  /** Optional unique id; defaults to `hem-<region>-<side>-<type>`. Set this to
   * place more than one hem of the same type on the same region edge (e.g. at
   * different offsets). Must not contain `::`. */
  id?: string | undefined;
  /** Return-leg length out along the parent. Required for closed/open/teardrop. */
  length?: number | undefined;
  /** Inner bend radius. Default = one thickness (closed defaults to ≈0, just the
   * HAIR clearance, so it folds flat). */
  radius?: number | undefined;
  /** Open-hem physical clear distance between the return and the parent (the inner
   * radius is set to gap/2). Default = one thickness. */
  gap?: number | undefined;
  /** Start position along the region edge. Default `0`. */
  offset?: number | undefined;
  /** Extent along the region edge. Default = full edge length. */
  width?: number | undefined;
  rule?: BendRule | undefined;
}

/**
 * A recorded hem, mirroring {@link ContourFlangeFeature}: enough for the unfold to
 * lay its developed strip out straight along the parent edge. `subBends` are the
 * `hem::<id>::<n>` curl bends (one per ≤180° sub-arc); `returnLength` is the flat
 * return leg past the curl. `developedLength` is the EXACT strip length out from
 * the edge: Σ curl bend allowances + `returnLength`. `segments` mirrors the
 * contour-flange developed segment list (a flat leg or a developed bend arc), so
 * the unfold lays bend lines at their exact cumulative developed offsets.
 */
export interface HemFeature {
  id: string;
  type: HemSpec['type'];
  /** The flat region the hem folds off (a flange id, or `'root'` for the base). */
  region: string;
  side: FlatSide;
  /** Start position along the parent edge. */
  offset: number;
  /** Extent along the parent edge (the developed strip width). */
  span: number;
  /** Flat return-leg length past the curl (0 for a rolled hem). */
  returnLength: number;
  /** Exact developed length out from the parent edge (Σ curl allowances + return). */
  developedLength: number;
  subBends: string[];
  segments: {
    kind: 'line' | 'arc';
    /** Developed length of this segment along the strip. */
    dev: number;
    angleDeg?: number | undefined;
    direction?: 'up' | 'down' | undefined;
    /** Id of the recorded {@link BendFeature} for an arc segment. */
    bendId?: string | undefined;
  }[];
}

/**
 * A jog (joggle): two opposite bends (`+θ` then `−θ`) that step a flat by
 * `offsetHeight` perpendicular to its plane, then continue parallel past the step.
 * `region` names the flat the jog runs across (a flange id, or `'base'`/`'root'`);
 * `side` is the region edge the jog develops out from; `position` is how far out
 * along the run the jog sits; `offsetHeight` is the Z-step the two bends produce.
 * `angle` (default 45°) is the magnitude of each bend — a shallower angle gives a
 * longer, gentler step; the connecting step run is `offsetHeight / sin(angle)`.
 * `runOut` is the flat leg continuing past the second bend. `rule` overrides the
 * per-bend allowance rule.
 */
export interface JogSpec {
  region: string;
  side: FlatSide;
  /** Optional unique id; defaults to `jog-<region>-<side>`. Set this to place more
   * than one jog on the same region edge (e.g. at different positions). Must not
   * contain `::`. */
  id?: string | undefined;
  /** Distance out along the run from the region edge to the first bend. */
  position: number;
  /** The perpendicular step the two opposite bends produce. Must be > 0. */
  offsetHeight: number;
  /** Magnitude of each opposite bend, in degrees (0, 90). Default `45`. */
  angle?: number | undefined;
  /** Flat leg continuing past the second bend. Default = `position`. */
  runOut?: number | undefined;
  /** Inner bend radius. Default = one material thickness. */
  radius?: number | undefined;
  /** Start position along the region edge. Default `0`. */
  offset?: number | undefined;
  /** Extent along the region edge. Default = full edge length. */
  width?: number | undefined;
  rule?: BendRule | undefined;
}

/**
 * A recorded jog, mirroring {@link HemFeature}. `bends` are the two opposite curl
 * bends (`jog::<id>::0` up, `jog::<id>::1` down); `offsetHeight` is the requested
 * perpendicular step; `segments` is the developed leg/arc list (position leg →
 * up bend → step run → down bend → runOut leg). `developedLength` is the exact
 * strip length out from the edge (Σ legs + Σ bend allowances).
 */
export interface JogFeature {
  id: string;
  /** The flat region the jog runs across (a flange id, or `'root'` for the base). */
  region: string;
  side: FlatSide;
  offset: number;
  span: number;
  offsetHeight: number;
  angleDeg: number;
  developedLength: number;
  bends: string[];
  segments: {
    kind: 'line' | 'arc';
    dev: number;
    angleDeg?: number | undefined;
    direction?: 'up' | 'down' | undefined;
    bendId?: string | undefined;
  }[];
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
  tabs?: TabFeature[] | undefined;
  forms?: FormFeature[] | undefined;
  contourFlanges?: ContourFlangeFeature[] | undefined;
  loftedFlanges?: LoftedFlangeFeature[] | undefined;
  hems?: HemFeature[] | undefined;
  jogs?: JogFeature[] | undefined;
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
  /** Form cut paths (louver U-cuts) a fabricator cuts before forming, as open wires
   * (the three non-hinge sides; the hinge rides in {@link FlatPattern.formHinges}). */
  formCuts: Wire[];
  /** Form marker loops (emboss/dimple footprints) for annotation, as closed wires. */
  formMarkers: Wire[];
  /** Form hinge lines (louver fold lines) for annotation, as edges. */
  formHinges: Edge[];
  /**
   * Lofted/ruled transition developed boundaries, as closed wires in the developed
   * plane (one per recorded {@link LoftedFlangeFeature}). The outline laid out by the
   * rectilinear union covers the base + straight flanges; a ruled transition's
   * triangulated development is non-rectilinear and rides here instead.
   */
  loftedDevelopments: Wire[];
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
  code:
    | 'COLLISION'
    | 'SEAM_CUT'
    | 'MIN_RADIUS'
    | 'INVALID_SOLID'
    | 'MITER_NOT_DEVELOPED'
    | 'DEVELOPMENT_APPROXIMATE'
    /** Foreign unfold: a face is outside the supported planar/cylindrical class
     * (unknown surface type, or a cylinder that didn't fit) and was ignored. */
    | 'UNSUPPORTED_FACE'
    /** Foreign unfold: the part is a valid solid but its detected structure is
     * incomplete (non-uniform thickness, a dropped panel, or a bend not joining
     * exactly two flats), so the flat pattern may be partial. */
    | 'DETECTION_INCOMPLETE'
    /** A bend-table query fell outside the tabulated (thickness, radius, angle)
     * range and was clamped to the nearest entry (no extrapolation). Distinct from
     * MIN_RADIUS, which means a bend's inner radius is below one thickness. */
    | 'TABLE_CLAMP';
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
  /** Tabs to fuse onto this region's edges (in region-local coords) after folding. */
  tabs?: TabSpec[] | undefined;
  /** Form features (louvers / embosses) on this region (region-local) after folding. */
  forms?: FormSpec[] | undefined;
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
  /** Tabs to fuse onto the base region's edges (in base-local coords) after folding. */
  baseTabs?: TabSpec[] | undefined;
  /** Form features on the base region (base-local coords) after folding. */
  baseForms?: FormSpec[] | undefined;
}
