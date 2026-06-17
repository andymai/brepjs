/**
 * AUTO-GENERATED — do not edit manually.
 * Run `npm run generate-types` to regenerate from brepjs-sheetmetal package types.
 *
 * Ambient type declarations for brepjs-sheetmetal available in the playground editor.
 */

import type { Bounds3D, BrepError, Edge, Face, Result, Solid, Vec3, Wire } from 'brepjs';

declare const DEFAULT_K_FACTOR = 0.44;

declare const STEEL_GAUGES: Readonly<Record<string, MaterialSpec>>;

declare const ALUMINUM_GAUGES: Readonly<Record<string, MaterialSpec>>;

declare const MATERIALS: Readonly<Record<string, MaterialSpec>>;

declare function getMaterial(name: string): MaterialSpec | undefined;

/**
 * Bend allowance — the developed (flat) length of material consumed by a bend,
 * measured along the neutral axis. Resolution precedence (see
 * {@link resolveBendAllowance}): a referenced bend table, then an explicit
 * `rule.allowance` override, then the K-factor formula
 * BA = (π/180)·|angle|·(R + K·T). An optional `onWarning` receives the clamp
 * warning when a table query falls outside its tabulated range.
 */
declare function bendAllowance(angleDeg: number, thickness: number, rule: BendRule, onWarning?: (warning: SheetMetalWarning) => void): Result<number>;

/**
 * Developed length of the bend region when flattened — the neutral-axis arc
 * length that replaces the curved patch in the flat pattern. Identical to the
 * bend allowance (kept distinct in name for the unfold call sites that consume
 * it as a strip width), and routed through the same {@link resolveBendAllowance}
 * resolution (table → explicit allowance → K-factor).
 */
declare function developedLength(angleDeg: number, thickness: number, rule: BendRule, onWarning?: (warning: SheetMetalWarning) => void): Result<number>;

/** Neutral-axis radius R + K·T (the radius the developed arc length is measured at). */
declare function neutralRadius(thickness: number, rule: BendRule): Result<number>;

/**
 * One row of a shop bend table: the tabulated value for a single
 * (thickness, innerRadius, bend-angle) operating point. `value` is a bend
 * allowance (`kind: 'allowance'`) or a bend deduction (`kind: 'deduction'`),
 * per the owning {@link BendTable}.
 */
interface BendTableRow {
    /** Material thickness the row was measured at. */
    thickness: number;
    /** Inner bend radius the row was measured at. */
    radius: number;
    /** Swept bend angle in degrees (90° = a right-angle bend). */
    angleDeg: number;
    /** Bend allowance or bend deduction, per the table's {@link BendTable.kind}. */
    value: number;
}

/**
 * A named shop bend table: empirical bend-allowance or bend-deduction values
 * measured per (thickness, radius, angle). When a {@link BendRule} references a
 * table by id, {@link resolveBendAllowance} interpolates the table instead of
 * applying the K-factor formula, so the developed length matches the shop's
 * actual press-brake results.
 *
 * `kind` selects how a row's `value` is interpreted: an `'allowance'` table
 * tabulates the developed arc length directly; a `'deduction'` table tabulates
 * the bend deduction, which is converted to an allowance on lookup (see
 * {@link resolveBendAllowance} for the OSSB conversion).
 */
interface BendTable {
    id: string;
    kind: 'allowance' | 'deduction';
    rows: BendTableRow[];
}

/**
 * Register (or replace) a bend table under its id, so a {@link BendRule} with a
 * matching `bendTableRef` resolves against it. Returns the registered table.
 */
declare function registerBendTable(table: BendTable): Result<BendTable>;

/** Look up a registered bend table by id (registers the starter tables on first use). */
declare function getBendTable(id: string): BendTable | undefined;

/**
 * The single source of truth for a bend's developed (neutral-axis) length.
 *
 * Precedence:
 *  1. `rule.bendTableRef` — look up the table and interpolate it (linear in
 *     angle, bilinear across thickness × radius), converting a deduction table
 *     to an allowance via {@link allowanceFromDeduction}. Outside the table
 *     extents the lookup clamps to the nearest breakpoint and reports a
 *     `MIN_RADIUS`-class warning through `onWarning` rather than extrapolating.
 *  2. `rule.allowance` — an explicit per-bend override, returned verbatim.
 *  3. The K-factor formula BA = (π/180)·|angle|·(R + K·T).
 *
 * The returned value is in the same units and sense the rest of the package's
 * `developedLength` consumes (a strip width along the developed pattern).
 */
declare function resolveBendAllowance(rule: BendRule, angleDeg: number, thickness: number, onWarning?: (warning: SheetMetalWarning) => void): Result<number>;

declare const ROOT_FLAT_ID = "root";

/** A flat region in the feature graph (the part's base plus every flange face). */
interface FlatNode {
    id: string;
    isRoot: boolean;
    flange?: FlangeFeature | undefined;
}

/** A bend connecting two flats. `parent`/`child` are flat ids; `bend` is the recorded feature. */
interface BendEdge {
    bend: BendFeature;
    parent: string;
    child: string;
}

/** Graph view of an authored part: flats = nodes, bends = edges. */
interface FeatureGraph {
    nodes: Map<string, FlatNode>;
    edges: BendEdge[];
}

/** A bend that survives in the spanning tree, paired with its source/target flat. */
interface TreeBend {
    bend: BendFeature;
    parent: string;
    child: string;
}

/** A non-tree edge that must be cut to flatten a closed profile. */
interface SeamCut {
    bend: BendFeature;
    between: [string, string];
}

interface FeatureTree {
    rootId: string;
    /** Tree edges in breadth-first order (parents precede their children). */
    bends: TreeBend[];
    seams: SeamCut[];
    nodes: Map<string, FlatNode>;
    warnings: SheetMetalWarning[];
}

/**
 * Build the feature graph for an authored part. Each flange contributes a flat
 * node `flange.id`; bends connect a parent flat to a child flat. A bend whose id
 * matches a flange id (the flange's own fold) is wired parent→flange; any other
 * bend is matched to a flange by id suffix `<flange>::<n>` or defaults to a
 * root-anchored edge so authored parts always produce a connected graph.
 */
declare function buildFeatureGraph(part: SheetMetalPart): Result<FeatureGraph>;

/**
 * Spanning tree over the feature graph, rooted at the base flat. Tree edges are
 * returned BFS-ordered (every parent appears before its children); edges that
 * would close a cycle (box/closed profiles) become seam cuts with a warning.
 */
declare function buildFeatureTree(graph: FeatureGraph, rootId?: string): Result<FeatureTree>;

/** Convenience: graph + spanning tree in one call. */
declare function featureTree(part: SheetMetalPart, rootId?: string): Result<FeatureTree>;

/**
 * Tree-driven analytic unfold of an arbitrary straight-bend part into its flat
 * pattern. Walks the feature tree in BFS order placing every flat in the flat
 * plane: the base occupies `[0,baseLength]×[0,width]`; each child flange lays a
 * developed-bend strip (width = neutral-axis arc length) along the parent edge it
 * folds from — respecting its offset/span along that edge — then its own flat past
 * the strip, perpendicular to the edge and pointing outward. The developed outline
 * is the rectilinear union of the base and every placed flat/strip rectangle,
 * emitted as a single closed brepjs wire. A recorded corner miter replaces the
 * shared reflex corner of two perpendicular base flanges with a 45° chamfer.
 * Closed profiles produce a SEAM_CUT warning (the cycle-closing bend is left
 * unfolded). Warnings ride inside the Ok payload.
 */
declare function unfold(part: SheetMetalPart): Result<UnfoldResult>;

/** A fitted cylinder recovered numerically from a face's sampled points + normals. */
interface FittedCylinder {
    /** A point on the axis line. */
    axisOrigin: Vec3;
    /** Unit axis direction. */
    axisDir: Vec3;
    /** Fitted radius (mean distance from the axis line to the sampled points). */
    radius: number;
    /** Angular extent swept by the face about the axis, in radians. */
    angleSpan: number;
    /** Max relative residual of the fit (fraction of radius); small for a true cylinder. */
    residual: number;
}

/**
 * Numerically fit a cylinder to a face.
 *
 * Every normal of a cylinder is perpendicular to the axis, so the axis direction
 * is the common perpendicular of the sampled normals: it is recovered as the
 * sign-aligned average of the cross products of pairs of non-parallel sampled
 * normals (each such cross product lies along ±axis). The axis LINE and RADIUS
 * are then found by projecting the sample points onto the plane ⟂ axis and
 * fitting a circle (algebraic least squares); the radius is the mean distance
 * from the axis line to the points. The angular span is the extent of the
 * projected points about the fitted centre. Returns `null` when the surface
 * does not fit a cylinder within {@link FIT_RESIDUAL_TOL}.
 */
declare function fitCylinder(face: Face): FittedCylinder | null;

/**
 * Unfold an ARBITRARY imported sheet-metal solid with no feature tree, by
 * detecting its geometry numerically. The supported class is roughly-uniform-
 * thickness solids whose panels are planar and whose bends are cylindrical:
 *
 * 1. Classify faces by surface type — planar faces are panel faces, cylindrical
 *    faces are bend faces. Any other surface type is reported `UNSUPPORTED_FACE`.
 * 2. Pair the two large parallel planar faces of each flat panel (a thickness
 *    apart); pair the inner/outer cylindrical faces of each bend and fit its
 *    axis + inner radius + swept angle via {@link fitCylinder}.
 * 3. Build a bend graph (flats = nodes; a bend connects the two flats it shares
 *    edges with), take a spanning tree from a root flat, and turn any non-tree
 *    bend into a seam cut (warned).
 * 4. Walk the tree replacing each cylindrical bend region with a developed strip
 *    of length `developedLength(angle, thickness, { innerRadius, kFactor })`
 *    (`kFactor` defaults to the {@link DEFAULT_FOREIGN_K} mid-surface), laying
 *    each flat out into the plane. Bend direction (up/down) is read from the
 *    cylinder centre relative to the parent flat.
 *
 * Non-fatal warnings ride inside the Ok payload; the function fails only when the
 * input is not a recognizable sheet-metal solid at all.
 */
declare function unfoldForeignSolid(solid: Solid, opts?: {
    kFactor?: number | undefined;
}): Result<UnfoldResult>;

/** A folded part plus the warnings raised while folding (e.g. SEAM_CUT, MIN_RADIUS). */
interface FoldResult {
    part: SheetMetalPart;
    warnings: SheetMetalWarning[];
}

/**
 * Fold a flat pattern up into a 3D part. Each {@link FoldRegion} folds about its
 * fold line off its parent region, exactly inverting {@link unfold}: folding by an
 * angle is the same rigid construction the forward authoring path performs, so this
 * reuses {@link authorPart}'s bend geometry wholesale rather than re-deriving it.
 *
 * The result carries a fully-populated {@link SheetMetalPart} (valid solid + the
 * BendFeature/FlangeFeature tree consistent with `authorPart`), so
 * `unfold(fold(input))` round-trips. SEAM_CUT-style and min-radius warnings ride
 * inside the Ok payload.
 */
declare function fold(input: FlatInput): Result<SheetMetalPart>;

/** {@link fold} that also surfaces the fold warnings alongside the part. */
declare function foldWithWarnings(input: FlatInput): Result<FoldResult>;

/** How to resolve the bend rule for a bend line read out of a 2D flat pattern. */
interface PatternToFlatInputOptions {
    thickness: number;
    /**
     * Rule for bend line `i` (0-based, in {@link FlatPattern.bendLines} order). A flat
     * pattern is pure geometry and cannot encode K-factor/inner-radius, so the rule is
     * a required *input*; only the regions/sides/offsets/spans/lengths/angles are
     * recovered from the 2D geometry.
     */
    ruleFor: (bendIndex: number) => BendRule;
    material?: MaterialSpec | undefined;
}

/**
 * Reconstruct a {@link FlatInput} region-tree from the *2D flat-pattern geometry*
 * alone — `pattern.outline` (a closed 2D wire) and `pattern.bendLines` (each a 2D
 * segment + fold angle/direction). Nothing is read from a feature tree or a 3D
 * solid: the regions, sides, offsets, spans and flat lengths are all recovered by
 * reading real 2D coordinates back out of the wire/edges via the public brepjs
 * geometry readers (`getEdges`, `curveStartPoint`, `curveEndPoint`).
 *
 * This is the non-circular round-trip bridge: feeding `unfold(part).pattern` through
 * here and into {@link fold} exercises unfold's 2D placement, this parser, and the
 * forward fold geometry — a bug in any of them breaks the round-trip.
 *
 * Algorithm (rectilinear families — PR1 develops only axis-aligned rectangles):
 * every bend line is an axis-aligned segment lying on the shared edge between a
 * parent region and a child's developed strip. The developed strip width is
 * `developedLength(angle, thickness, ruleFor(i))` (the supplied rule). BFS outward
 * from the base region (the one anchored at the origin): a bend line on a known
 * region's edge spawns a child region whose far edge is the next outward bend line
 * (a grandchild) or the outline boundary; `length = far-extent − dev`, `span` =
 * bend-line length, `offset`/`side` are the bend line's position on the parent edge.
 */
declare function patternToFlatInput(pattern: FlatPattern, opts: PatternToFlatInputOptions): Result<FlatInput>;

/**
 * Convert an authored {@link SheetMetalPart} into the {@link FlatInput} that folds
 * back into it, going strictly through the 2D flat pattern: `unfold(part)` produces
 * the developed wire + bend lines, and {@link patternToFlatInput} recovers the
 * region tree from that 2D geometry. Only the bend *rule* is read off the part (by
 * matching bend id), which a flat pattern legitimately cannot encode; every
 * geometric attribute is parsed from the wire/edges. This makes the round-trip
 * oracle non-circular — a bug in unfold's 2D placement or in the parser breaks it.
 *
 * Seam bends (closed profiles) are left unfolded by `unfold`, so the recovered part
 * is the open spanning-tree shape, not the re-closed box.
 */
declare function partToFlatInput(part: SheetMetalPart): Result<FlatInput>;

/** Authoring options for the base flat the flanges attach to. */
interface BaseFlatSpec {
    /** Extent along the run (+X) axis. */
    length: number;
    /** Extent along the width (+Y) axis. */
    width: number;
}

/** Which edge a flange folds off (of the base, or of its parent flange). */
type FlangeSide = FlatSide;

/** A single flange to author off an edge of its parent flat. */
interface FlangeSpec {
    id: string;
    /** Flat length measured from the end of the bend along the flange plane. */
    length: number;
    /** Signed fold angle in degrees. */
    angleDeg: number;
    rule: BendRule;
    /** Parent edge to attach to. Default `'xmax'` (the leading +X edge). */
    side?: FlangeSide | undefined;
    /** Fold direction relative to the parent face normal. Default `'up'`. */
    direction?: 'up' | 'down' | undefined;
    /** Id of another flange this flange folds off (its distal edge). Default = base flat. */
    parent?: string | undefined;
    /** Start position along the parent edge. Default `0`. */
    offset?: number | undefined;
    /** Extent along the parent edge. Default = full parent-edge length. */
    width?: number | undefined;
    miter?: MiterSpec | undefined;
}

/**
 * A seam: a bend connecting two already-authored flats that is intentionally left
 * unfolded (a free edge). Closing the last wall of a box/tube back onto an earlier
 * flat produces a cyclic feature graph; the feature tree turns this edge into a
 * SEAM_CUT, and the unfold leaves the flats connected through the spanning tree.
 */
interface SeamSpec {
    /** Flat id the seam folds from (an authored flange, or `'root'`/`'face-0'` for the base). */
    parent: string;
    /** Flat id the seam meets (must already be authored; `'root'`/`'face-0'` = base). */
    child: string;
    angleDeg: number;
    rule: BendRule;
}

/** Inputs for {@link authorPart}. */
interface AuthorSpec {
    thickness: number;
    base: BaseFlatSpec;
    flanges: FlangeSpec[];
    material?: MaterialSpec | undefined;
    /** Optional seams that close a profile into a tube/box (left unfolded). */
    seams?: SeamSpec[] | undefined;
}

/**
 * Stable edge reference for flange attachment. The base flat is `face-0`; every
 * flange face is `face-<n+1>` in authoring order. The leading edge of a flat is
 * `edgeIndex 0`. The reference also carries `parentId`/`side`/`offset`/`extent`
 * so the feature tree and recursive unfold can resolve the exact parent edge a
 * flange folds from without reading topology back out of the B-rep.
 */
declare function baseEdgeRef(faceIndex: number): EdgeRef;

/**
 * Author a sheet-metal part: a base flat plus an arbitrary tree of flanges. Each
 * flange folds off one of the four edges of its parent flat (the base by default,
 * or another flange via `parent`), in the requested direction (up/down), over an
 * optional sub-span of that edge (`offset`/`width`). Returns a {@link SheetMetalPart}
 * carrying the folded 3D solid and the recorded bend feature tree the unfold
 * consumes. All construction stays on the public, OCCT-WASM-safe API.
 */
declare function authorPart(spec: AuthorSpec): Result<SheetMetalPart>;

/** An oriented cutting plane: material on the `+normal` side is removed. */
interface MiterPlane {
    origin: Vec3;
    normal: Vec3;
}

/**
 * General miter primitive: cut a sheet-metal part by a plane, removing the
 * material on the `+normal` side. The tool is a half-space block sized to the
 * part's bounding box, so the cut is exact regardless of part extent.
 */
declare function miterCut(part: SheetMetalPart, plane: MiterPlane): Result<SheetMetalPart>;

/**
 * Auto corner-miter between two adjacent flanges. The miter plane bisects the two
 * flanges' fold-up directions at their shared corner and is offset by half the gap,
 * so the cut falls on the flat/flange regions and never crosses a bend patch. The
 * single bisector cut trims both flanges to a clean mitered corner.
 */
declare function autoMiterCorner(part: SheetMetalPart, flangeIdA: string, flangeIdB: string, gap?: number): Result<SheetMetalPart>;

/**
 * Add a bend relief to a flange: a small slot cut into the PARENT flat at each end
 * of the bend line that does not reach the parent edge endpoint (a partial/offset
 * flange). Without it the parent material tears at the corner where the bend
 * terminates mid-edge. Each slot is `width` (≈ thickness) along the parent edge by
 * `depth` (≈ developed length + clearance) into the parent flat, cut from the 3D
 * solid and recorded so {@link unfold} replays the 2D notch.
 *
 * A relief is a recorded feature replayed by unfold — exactly the pattern
 * {@link autoMiterCorner} establishes for corner miters.
 */
declare function addBendRelief(part: SheetMetalPart, flangeId: string, spec?: ReliefSpec): Result<SheetMetalPart>;

/**
 * Add a bend relief to every partial-span bend (a flange that does not span its
 * full parent edge). Full-span flanges are skipped — they have no mid-edge bend
 * terminus to relieve. Convenience over calling {@link addBendRelief} per flange.
 */
declare function autoBendReliefs(part: SheetMetalPart, spec?: ReliefSpec): Result<SheetMetalPart>;

/**
 * Corner relief between two adjacent flanges: a notch cut at their shared corner so
 * the two upright flanges clear each other once folded — the alternative to a 45°
 * miter for the same corner {@link autoMiterCorner} handles. The notch is cut from
 * the solid and recorded as a {@link ReliefFeature}; the corner is also recorded in
 * `miters` (gap 0) so the collision check treats the interference as resolved.
 */
declare function cornerRelief(part: SheetMetalPart, flangeIdA: string, flangeIdB: string, spec?: ReliefSpec): Result<SheetMetalPart>;

/**
 * Punch a cutout (hole / slot / polygon) through a named flat region's thickness.
 * The 2D profile is built in the region's LOCAL frame, then placed onto the correct
 * folded face via the region's world {@link FlatFrame} (origin/u/v/n) and extruded
 * through the sheet, so a feature authored at local `(x, y)` lands on the matching
 * face whether the region is the base or a folded flange. The same local profile is
 * mapped through the region's developed {@link Frame2} and recorded as a
 * {@link CutoutFeature}, so {@link unfold} emits the matching loop in the flat
 * pattern and {@link fold} can replay it. Guards a valid, single-bodied solid.
 */
declare function addCutout(part: SheetMetalPart, spec: CutoutSpec): Result<SheetMetalPart>;

/** Punch a circular hole of `diameter` centred at region-local `(x, y)`. */
declare function addHole(part: SheetMetalPart, region: string, x: number, y: number, diameter: number): Result<SheetMetalPart>;

/** Punch a slot centred at `(x, y)`: `length` along the slot axis by `width` across. */
declare function addSlot(part: SheetMetalPart, region: string, opts: {
    x: number;
    y: number;
    length: number;
    width: number;
    angleDeg?: number;
    round?: boolean;
}): Result<SheetMetalPart>;

/** Punch an arbitrary polygon cutout from its region-local `points` (≥ 3). */
declare function addPolygonCutout(part: SheetMetalPart, region: string, points: [number, number][]): Result<SheetMetalPart>;

/**
 * Fuse a rectangular tab onto a named flat region's edge — additive material (the
 * counterpart of a cutout). The tab is built as a region-local rectangle just past
 * the chosen `side`, placed onto the correct folded face via the region's world
 * {@link FlatFrame}, extruded through the sheet thickness and fused to the solid. The
 * same local rectangle, mapped through the region's developed {@link Frame2}, is
 * recorded as a {@link TabFeature} so {@link unfold} extends the OUTER outline by the
 * protrusion (tabs add material, so the developed area grows). Guards a valid,
 * single-bodied solid.
 */
declare function addTab(part: SheetMetalPart, spec: TabSpec): Result<SheetMetalPart>;

/** The mating-slot placement for a {@link tabAndSlot} joint. */
interface SlotPlacement {
    region: string;
    x: number;
    y: number;
    clearance?: number | undefined;
    /** In-plane rotation of the slot (deg, CCW) in the mating region's local frame.
     * Default 0 = slot length along the region's +x (bend-axis) direction; set this
     * when the tab meets the slot region at a non-default orientation. */
    angleDeg?: number | undefined;
}

/**
 * Self-fixturing tab-and-slot joint: fuse a tab on one region and punch a matching
 * SLOT CUTOUT on the mating region, sized so the tab's cross-section
 * (`width × thickness`) inserts into the slot. The slot is `tab.width + clearance`
 * long by `thickness + clearance` wide, centred at the mating region's local
 * `(x, y)`. The slot is always strictly larger than the tab cross-section, so the
 * joint mates (verified numerically by callers). Clearance defaults to `0.1` mm.
 */
declare function tabAndSlot(part: SheetMetalPart, tab: TabSpec, slot: SlotPlacement): Result<SheetMetalPart>;

/**
 * Add a form feature (louver or emboss/dimple) to a named flat region.
 *
 * 3D FIDELITY (simplified, by design — the public CSG-only API makes true forming
 * impractical):
 * - LOUVER: the vent opening (`length × width`) is cut fully through the sheet, and
 *   the formed flap is represented as a thin box hinged on one side and tilted up to
 *   `height`, fused so it stays connected to the body at the hinge. True forming
 *   keeps the flap continuous with the parent and bends it; the cut+tilted-flap
 *   representation captures the vent geometry while keeping a single valid solid.
 * - EMBOSS: a short cylinder fused onto the formed face (raised by `height`).
 *   DIMPLE: a shallow cylindrical recess cut into the formed face (recessed by
 *   `height`, never through). A true spherical/conical form is approximated by the
 *   flat-topped round so the result stays a valid single body.
 *
 * FLAT PATTERN (the fabrication-critical representation): the louver emits its
 * footprint as an OPEN three-side cut path (the fabricator cuts three of its four
 * sides — all but the hinge) plus the hinge fold line; the emboss emits its footprint
 * circle as a marker. Forming removes no net material, so the developed outline and
 * area are unchanged. Guards a valid, single-bodied solid.
 */
declare function addForm(part: SheetMetalPart, spec: FormSpec): Result<SheetMetalPart>;

/** A louver vent on a region; see {@link addForm}. */
declare function louver(part: SheetMetalPart, opts: {
    region: string;
    x: number;
    y: number;
    length: number;
    width: number;
    height: number;
    direction?: 'up' | 'down';
}): Result<SheetMetalPart>;

/** An emboss (raised) or dimple (recessed) round form on a region; see {@link addForm}. */
declare function emboss(part: SheetMetalPart, opts: {
    region: string;
    x: number;
    y: number;
    diameter: number;
    height: number;
    kind: 'dimple' | 'emboss';
}): Result<SheetMetalPart>;

/**
 * Author a contour flange: an OPEN 2D profile (alternating line/arc segments) swept
 * along one straight edge of the base flat. Each arc is a cylindrical bend, each
 * line a flat leg; consecutive segments chain frame-to-frame exactly as
 * {@link authorPart} chains flanges, building one connected multi-bend cross-section
 * (a return, a hat, a J). The recorded {@link ContourFlangeFeature} carries each
 * segment's EXACT developed length (lines: `length`; arcs: the canonical
 * {@link developedLength}) so the unfold lays the strip out straight with no error.
 * Construction stays on the public, OCCT-WASM-safe API.
 */
declare function authorContourFlange(part: SheetMetalPart, spec: ContourFlangeSpec): Result<SheetMetalPart>;

/**
 * Author a lofted / ruled transition flange between two parallel OPEN profiles.
 * The two profiles are lofted (ruled, straight generators) into a transition surface
 * and thickened to a valid solid; the result is fused onto the part. The developed
 * pattern is produced by TRIANGULATION (the standard transition development): each
 * quad between consecutive vertex pairs is split into two triangles laid flat
 * edge-length-preserving and accumulated into a developed boundary.
 *
 * The triangulated development is EXACT (to tolerance) when the ruled surface is
 * developable — every quad is planar, so the two triangles share their diagonal in
 * 3D and the flat layout preserves all lengths and angles. When a quad is non-planar
 * (twisted ruling) the surface is not developable and the flat layout is an
 * approximation; {@link approximate} is set and the unfold emits a
 * `DEVELOPMENT_APPROXIMATE` warning.
 */
declare function authorLoftedFlange(part: SheetMetalPart, spec: LoftedFlangeSpec): Result<SheetMetalPart>;

/**
 * Author a hem: fold a region edge back ~180°+ onto its parent flat, then run a
 * short return leg. Built on the contour-flange segment chainer — the curl is one
 * or more ≤120° sub-arcs (each a recorded `hem::<id>::<n>` bend) followed by a flat
 * return — so the development is EXACT: Σ curl bend allowances (via the table-aware
 * {@link developedLength}) + the return length, laid out straight past the edge.
 * Four `type`s set the curl/gap geometry (see {@link HemSpec}). Construction stays
 * on the public, OCCT-WASM-safe API; the result is guarded to a valid single solid.
 */
declare function hem(part: SheetMetalPart, spec: HemSpec): Result<SheetMetalPart>;

/**
 * Author a jog (joggle): two opposite bends (`+θ` then `−θ`) that step a flat by
 * `offsetHeight` perpendicular to its plane, then continue parallel past the step.
 * Built on the contour-flange chainer: a flat position leg, a `+θ` up bend
 * (`jog::<id>::0`), the connecting step run, a `−θ` down bend (`jog::<id>::1`), and
 * a flat run-out leg. The development is EXACT (Σ legs + Σ bend allowances, via the
 * table-aware {@link developedLength}). The connecting step run is
 * `offsetHeight / sin(θ)` so the two bends realize the requested perpendicular step;
 * the result is guarded to a valid single solid. OCCT-WASM-safe construction only.
 */
declare function jog(part: SheetMetalPart, spec: JogSpec): Result<SheetMetalPart>;

interface DxfOptions {
    textHeight?: number | undefined;
}

/**
 * A 2D point transform applied to every emitted vertex. Used by the nesting writer
 * to place each pattern at its `(x, y)` and rotation on the sheet; the default
 * single-pattern writer uses the identity transform.
 */
type Transform2 = (p: Pt2) => Pt2;

/**
 * Package-local DXF writer for sheet-metal flat patterns. The core public writer
 * (`blueprintToDXF`) is R12 LINE/POLYLINE-only with no MTEXT, layer color, or
 * INSUNITS, so it cannot carry the annotated multi-layer output required here.
 *
 * Emits a strict AC1015 (R2000) DXF: `INSUNITS=4` (mm), the outline polyline on
 * layer OUTLINE, each bend line on BEND_UP / BEND_DOWN, and an MTEXT
 * angle/direction annotation (e.g. "∠90° U") at each bend-line midpoint. Every
 * table record and entity carries a unique handle and the AcDb subclass markers
 * R13+ readers (AutoCAD AUDIT, ODA/Teigha) require to parse the file cleanly.
 */
declare function flatPatternToDXF(pattern: FlatPattern, options?: DxfOptions): Result<string>;

/** One pattern plus the sheet-placement transform applied to all its geometry. */
interface PlacedPattern {
    pattern: FlatPattern;
    transform: Transform2;
}

/**
 * Emit one DXF for any number of placed patterns (the nesting per-sheet writer).
 * Each pattern's outline / bend lines / holes / forms are run through its own
 * {@link Transform2} (translate + rotate onto the sheet) before being written, so
 * the nested file is fabrication-ready. Layers/colors/handle scheme match the
 * single-pattern writer exactly.
 */
declare function multiPatternToDXF(placed: PlacedPattern[], options?: DxfOptions): Result<string>;

/** Stock sheet the parts are packed onto (the gross blank, before margin). */
interface SheetSpec {
    width: number;
    height: number;
}

interface NestOptions {
    sheet: SheetSpec;
    /** Clear border kept empty around the sheet edge (per side). Default `0`. */
    margin?: number | undefined;
    /** Minimum clear gap between any two placed parts (and the bbox padding used
     * for the non-overlap test). Default `0`. */
    spacing?: number | undefined;
    /** Try a 90° rotation per part and keep whichever orientation fits/packs better. */
    allowRotation?: boolean | undefined;
    /**
     * Packing strategy. Default `"bbox"`: each part is packed as its axis-aligned
     * bounding box (the original {@link nest} behavior — fast, parts never interlock).
     * `"nfp"` is true-shape / no-fit-polygon nesting: the actual outline polygons are
     * packed so concave (L-shaped) parts interlock for higher material utilization.
     * The NFP packer is a HEURISTIC (bottom-left-fill, largest-first) — not provably
     * optimal — but it never overlaps parts and never drops a part silently.
     */
    strategy?: 'bbox' | 'nfp' | undefined;
}

/**
 * Where a single pattern lands on a sheet. For the bbox strategy `rotationDeg` is
 * `0` or `90`; the true-shape (nfp) strategy may also emit `180` or `270`. `(x, y)`
 * is the lower-left of the part's transformed bounding box in sheet coordinates.
 */
interface Placement {
    /** Index into the `patterns` array passed to {@link nest}. */
    patternIndex: number;
    /** Lower-left x of the part's (rotated) bounding box, in sheet coordinates. */
    x: number;
    /** Lower-left y of the part's (rotated) bounding box, in sheet coordinates. */
    y: number;
    rotationDeg: number;
}

interface NestSheet {
    placements: Placement[];
    /**
     * Σ placed part areas ÷ usable-sheet area, in `(0, 1]`. "Usable" =
     * `(width − 2·margin) × (height − 2·margin)`. For the `"bbox"` strategy the part
     * area is its BOUNDING-BOX area (intra-bbox waste of a non-rectangular part is not
     * credited — a conservative measure). For the `"nfp"` true-shape strategy it is the
     * actual OUTLINE-POLYGON area, so an L-shaped part credits only its true material,
     * making the two strategies' utilizations directly comparable on the same parts.
     */
    utilization: number;
}

interface NestResult {
    sheets: NestSheet[];
    /** Indices of patterns too large for the usable sheet even rotated. */
    unplaced: number[];
    warnings: SheetMetalWarning[];
}

/** Axis-aligned bounding box of one pattern outline, in developed-plane coords. */
interface Bbox {
    minX: number;
    minY: number;
    width: number;
    height: number;
}

/**
 * Axis-aligned bounding box of a pattern's OUTER outline wire, read from the wire
 * vertices (each edge start point) — the same 2D-coordinate read the DXF/SVG writers
 * use. Only the outer outline is packed; holes ride inside it.
 */
declare function patternBbox(pattern: FlatPattern): Result<Bbox>;

type Pt2 = [number, number];

/** A simple (non-self-intersecting) polygon as an ordered, non-closing vertex loop. */
type Polygon = Pt2[];

/**
 * Ordered vertex loop of a closed outline wire — one vertex per edge start point, the
 * same 2D read the DXF writer (`outlinePoints`) and the bbox nester (`patternBbox`)
 * use. The loop is NOT closed (the last vertex is not repeated); edges are taken as
 * `v[i] → v[(i+1) % n]`.
 */
declare function wireToPolygon(outline: Wire): Result<Polygon>;

/** A bend line in the developed plane: a segment plus its fold direction. */
interface FlatPatternBendLine {
    from: Pt2;
    to: Pt2;
    direction: 'up' | 'down';
}

/** A flat pattern reduced to serializable 2D polylines for a developed-view overlay. */
interface FlatPatternPolylines {
    /** Closed outer boundary as an ordered, non-closing vertex loop. */
    outline: Polygon;
    /** Interior cutout loops (holes / slots / polygon cutouts). */
    holes: Polygon[];
    /** Bend lines, each with its fold direction. */
    bendLines: FlatPatternBendLine[];
}

/**
 * Reduce a {@link FlatPattern} to serializable 2D polylines (outline, holes, bend
 * lines) for a developed-pattern overlay. Best-effort: a wire that fails to read
 * is dropped rather than throwing, so a partial pattern still yields what it can.
 * Arc edges are approximated by endpoints, the same assumption {@link wireToPolygon}
 * and the DXF writer make.
 */
declare function flatPatternToPolylines(pattern: FlatPattern): FlatPatternPolylines;

/** Signed area (CCW positive) — used to normalise orientation and reject degenerates. */
declare function signedArea(poly: Polygon): number;

/** Axis-aligned bounds `[minX, minY, maxX, maxY]` of a polygon. */
declare function polygonBounds(poly: Polygon): [number, number, number, number];

/** Rotate every vertex (CCW, degrees, about the origin), then translate by (dx, dy). */
declare function transformPolygon(poly: Polygon, dx: number, dy: number, rotationDeg: number): Polygon;

/** Ray-cast point-in-polygon: points strictly inside return true; behaviour for a
 * point exactly on the boundary is undefined (the overlap predicate handles edge
 * contact separately via segment-intersection). */
declare function pointInPolygon(poly: Polygon, x: number, y: number): boolean;

/**
 * Proper-or-improper segment intersection (`p1p2` vs `p3p4`). Returns true when the
 * segments cross OR touch (collinear overlap or a shared endpoint), so it is
 * conservative for the overlap test — never a false negative.
 */
declare function segmentsIntersect(p1: Pt2, p2: Pt2, p3: Pt2, p4: Pt2): boolean;

/**
 * Do two simple polygons overlap? True iff any edge of `a` intersects any edge of
 * `b`, or one polygon fully contains a vertex of the other. This pair of conditions
 * is exhaustive for simple polygons: a disjoint pair has no crossing edges and no
 * mutually-contained vertex; a touching-but-non-overlapping pair (shared edge/vertex,
 * zero interior overlap) is caught by `segmentsIntersect` and so is reported as
 * overlapping — callers wanting a clearance gap should inflate via {@link polygonsOverlapWithClearance}.
 *
 * Centroid containment is NOT sufficient on its own (a concave part's centroid can
 * lie outside it), so a representative INTERIOR vertex of each polygon is tested for
 * containment in the other — combined with the edge-crossing test this covers the
 * nested-without-crossing case.
 */
declare function polygonsOverlap(a: Polygon, b: Polygon): boolean;

/**
 * Overlap test honoring a clearance gap: the two polygons must stay at least
 * `clearance` apart. Implemented by testing raw overlap and, when disjoint, the
 * minimum edge-to-edge distance against the clearance. `clearance <= 0` is the plain
 * {@link polygonsOverlap}.
 */
declare function polygonsOverlapWithClearance(a: Polygon, b: Polygon, clearance: number): boolean;

/**
 * Build the bend-table JSON report directly from an authored part. Walks the
 * same tree layout the unfold consumes so the per-bend values and the total flat
 * size agree with the flat pattern. `allowance` is the consumed neutral-axis arc
 * length (the bend allowance); `flatLength` is the straight flange leg past the
 * bend — distinct values a downstream nesting/cut-list tool needs separately.
 */
declare function buildReport(part: SheetMetalPart): Result<BendReport>;

/**
 * Project the report already computed by `unfold` into the standalone
 * `BendReport` shape, defensively re-validating its numeric fields. This keeps
 * the report a pure function of a previously-unfolded result without re-walking
 * the tree.
 */
declare function reportFromUnfold(result: UnfoldResult): Result<BendReport>;

/** Serialize a `BendReport` to a stable, pretty-printed JSON string. */
declare function reportToJSON(report: BendReport): string;

/**
 * Manufacturability checks for an authored sheet-metal part. Returns a list of
 * {@link SheetMetalWarning} — these are advisory, never errors: a part with
 * warnings is still produced and exportable. Three checks per plan §6:
 *
 *  - `INVALID_SOLID`: the folded solid is missing, fails kernel validity, or has
 *    no positive volume.
 *  - `COLLISION`: two flanges' axis-aligned bounding boxes overlap once folded —
 *    the cheap interference signal for corners that need a miter or relief cut.
 *  - `MIN_RADIUS`: a bend's inner radius is below one material thickness
 *    (`R < 1×T`), the standard minimum-bend-radius rule of thumb.
 */
declare function validatePart(part: SheetMetalPart): SheetMetalWarning[];

/** Author a straight-bend part: a base flat plus folded-up flanges. */
declare function author(spec: AuthorSpec): Result<SheetMetalPart>;

/**
 * Unfold an imported sheet-metal solid that has no feature tree, by detecting its
 * geometry (planar panels + cylindrical bends) numerically. `kFactor` defaults to
 * the mid-surface neutral axis (0.5); supply a known material's K-factor to match
 * its development.
 */
declare function unfoldSolid(solid: Solid, opts?: {
    kFactor?: number;
}): Result<UnfoldResult>;

/** Cut a part by an oriented plane, removing material on the `+normal` side. */
declare function miter(part: SheetMetalPart, plane: MiterPlane): Result<SheetMetalPart>;

/** Auto-miter the shared corner of two flanges with an optional gap. */
declare function miterCorner(part: SheetMetalPart, flangeIdA: string, flangeIdB: string, gap?: number): Result<SheetMetalPart>;

/** Add a bend relief slot at each mid-edge end of a partial flange's bend line. */
declare function bendRelief(part: SheetMetalPart, flangeId: string, spec?: ReliefSpec): Result<SheetMetalPart>;

/** Add a bend relief to every partial-span bend in the part. */
declare function autoReliefs(part: SheetMetalPart, spec?: ReliefSpec): Result<SheetMetalPart>;

/** Cut a corner relief notch at the shared corner of two adjacent flanges. */
declare function relieveCorner(part: SheetMetalPart, flangeIdA: string, flangeIdB: string, spec?: ReliefSpec): Result<SheetMetalPart>;

/**
 * Author a contour flange: an open line/arc profile swept along a base edge into a
 * multi-bend cross-section. The development is exact (Σ segment developed lengths).
 */
declare function contourFlange(part: SheetMetalPart, spec: ContourFlangeSpec): Result<SheetMetalPart>;

/**
 * Author a lofted / ruled transition flange between two parallel open profiles. The
 * development is by triangulation — exact for a developable transition, an
 * approximation (with a `DEVELOPMENT_APPROXIMATE` unfold warning) otherwise.
 */
declare function loftedFlange(part: SheetMetalPart, spec: LoftedFlangeSpec): Result<SheetMetalPart>;

/** Emit an annotated multi-layer DXF string for a flat pattern. */
declare function toDXF(pattern: FlatPattern, options?: DxfOptions): Result<string>;

/**
 * Nest developed flat patterns onto stock sheets to reduce waste. The default
 * `strategy: "bbox"` packs each part as its outline bounding box (fast, no
 * interlocking). `strategy: "nfp"` is true-shape / no-fit-polygon nesting: the actual
 * outline polygons are packed so concave (L-shaped) parts interlock for higher
 * utilization. The NFP packer is a HEURISTIC (bottom-left-fill) — not provably
 * optimal — but never overlaps parts and never drops a part silently.
 */
declare function nest(patterns: FlatPattern[], options: NestOptions): Result<NestResult>;

/** Emit one fabrication-ready DXF for a single nested sheet (all parts placed). */
declare function nestToDXF(result: NestResult, patterns: FlatPattern[], sheetIndex: number, options?: DxfOptions): Result<string>;

/** Build a bend report by walking the part's feature tree. */
declare function report(part: SheetMetalPart): Result<BendReport>;

/** Project the report already computed by {@link unfold} without re-walking the tree. */
declare function reportFrom(result: UnfoldResult): Result<BendReport>;

/** Serialize a bend report to stable pretty-printed JSON. */
declare function reportJSON(report: BendReport): string;

/** Manufacturability checks — advisory warnings, never errors. */
declare function validate(part: SheetMetalPart): SheetMetalWarning[];

/** Bend allowance `BA = (π/180)·|angle|·(R + K·T)` for a single bend. */
declare function allowance(angleDeg: number, thickness: number, rule: BendRule, onWarning?: (warning: SheetMetalWarning) => void): Result<number>;

/** Neutral-axis developed length of a bend region (numerically equal to the allowance). */
declare function developed(angleDeg: number, thickness: number, rule: BendRule, onWarning?: (warning: SheetMetalWarning) => void): Result<number>;

/** Register (or replace) a shop bend table so rules can reference it by id. */
declare function addBendTable(table: BendTable): Result<BendTable>;

/** Look up a registered bend table by id (starter tables included). */
declare function bendTable(id: string): BendTable | undefined;

/**
 * Resolve a bend's developed allowance through the single resolution point:
 * a referenced bend table, then an explicit `rule.allowance`, then the K-factor
 * formula. This is what {@link developed} delegates to.
 */
declare function resolveAllowance(rule: BendRule, angleDeg: number, thickness: number, onWarning?: (warning: SheetMetalWarning) => void): Result<number>;

/** Thrown by the fluent facade when an underlying `Result<T>` is an `Err`. */
declare class SheetMetalError extends Error {
    readonly code: string;
    readonly kind: string;
    constructor(brepError: BrepError);
}

/** A built part already mitered/operated on, re-entering the fluent chain. */
declare class SheetMetalPartHandle {
    readonly part: SheetMetalPart;
    constructor(part: SheetMetalPart);
    /** Cut by an oriented plane, removing material on the `+normal` side. */
    miter(plane: MiterPlane): SheetMetalPartHandle;
    /** Auto-miter the shared corner of two flanges with an optional gap. */
    miterCorner(flangeIdA: string, flangeIdB: string, gap?: number): SheetMetalPartHandle;
    /** Add a bend relief at each mid-edge end of a partial flange's bend line. */
    bendRelief(flangeId: string, spec?: ReliefSpec): SheetMetalPartHandle;
    /** Add a bend relief to every partial-span bend in the part. */
    autoReliefs(spec?: ReliefSpec): SheetMetalPartHandle;
    /** Cut a corner relief notch at the shared corner of two adjacent flanges. */
    cornerRelief(flangeIdA: string, flangeIdB: string, spec?: ReliefSpec): SheetMetalPartHandle;
    /** Punch a cutout (hole / slot / polygon) through a named flat region. */
    cutout(spec: CutoutSpec): SheetMetalPartHandle;
    /** Punch a circular hole of `diameter` centred at region-local `(x, y)`. */
    hole(region: string, x: number, y: number, diameter: number): SheetMetalPartHandle;
    /** Punch a slot (rectangular or obround) centred at region-local `(x, y)`. */
    slot(region: string, opts: {
        x: number;
        y: number;
        length: number;
        width: number;
        angleDeg?: number;
        round?: boolean;
    }): SheetMetalPartHandle;
    /** Punch an arbitrary polygon cutout from its region-local `points`. */
    polygonCutout(region: string, points: [number, number][]): SheetMetalPartHandle;
    /** Fuse a rectangular tab (additive protrusion) onto a region's edge. */
    tab(spec: TabSpec): SheetMetalPartHandle;
    /** Self-fixturing tab-and-slot joint: a tab on one region + a matching slot on another. */
    tabAndSlot(tab: TabSpec, slot: SlotPlacement): SheetMetalPartHandle;
    /** Form a louver (vent flap) on a region. */
    louver(opts: {
        region: string;
        x: number;
        y: number;
        length: number;
        width: number;
        height: number;
        direction?: 'up' | 'down';
    }): SheetMetalPartHandle;
    /** Form a round emboss (raised) or dimple (recessed) on a region. */
    emboss(opts: {
        region: string;
        x: number;
        y: number;
        diameter: number;
        height: number;
        kind: 'dimple' | 'emboss';
    }): SheetMetalPartHandle;
    /** Author a contour flange (open line/arc profile swept along a base edge). */
    contourFlange(spec: ContourFlangeSpec): SheetMetalPartHandle;
    /** Author a lofted / ruled transition flange between two parallel open profiles. */
    loftedFlange(spec: LoftedFlangeSpec): SheetMetalPartHandle;
    /** Fold a region edge back ~180°+ onto its parent as a hem (closed/open/teardrop/rolled). */
    hem(spec: HemSpec): SheetMetalPartHandle;
    /** Step a region's flat by `offsetHeight` with two opposite bends (a jog/joggle). */
    jog(spec: JogSpec): SheetMetalPartHandle;
    /** Flatten into a developed flat pattern + bend report + warnings. */
    unfold(): UnfoldResult;
    /** Just the flat pattern from the unfold. */
    flatPattern(): FlatPattern;
    /** Bend report built from the feature tree. */
    report(): BendReport;
    /** Annotated multi-layer DXF of the developed flat pattern. */
    dxf(options?: DxfOptions): string;
    /** Manufacturability warnings (advisory, never throws). */
    validate(): SheetMetalWarning[];
    /** The materialized part (escape hatch back to the functional API). */
    get(): SheetMetalPart;
}

/**
 * An imported foreign solid (no feature tree) re-entering the fluent chain: detect
 * its geometry and unfold it. `kFactor` defaults to the mid-surface neutral axis.
 */
declare class ForeignSolidHandle {
    private readonly solid;
    private readonly opts?;
    constructor(solid: Solid, opts?: {
        kFactor?: number;
    } | undefined);
    /** Override the neutral-axis K-factor (default 0.5, the mid-surface). */
    kFactor(kFactor: number): ForeignSolidHandle;
    /** Detect geometry and flatten into a developed flat pattern + report + warnings. */
    unfold(): UnfoldResult;
    /** Just the flat pattern from the detected unfold. */
    flatPattern(): FlatPattern;
    /** Annotated multi-layer DXF of the developed flat pattern. */
    dxf(options?: DxfOptions): string;
}

/** Authoring builder — accumulates the base/flanges/material spec, then folds. */
declare class SheetMetalBuilder {
    private readonly spec;
    private built?;
    constructor(spec: AuthorSpec);
    /** Add a flange folded off its parent edge (the base by default). */
    flange(flange: FlangeSpec): SheetMetalBuilder;
    /** Add a seam closing a profile into a tube/box (left unfolded). */
    seam(seam: SeamSpec): SheetMetalBuilder;
    /** Set the part material (its thickness/default rule). */
    material(material: MaterialSpec): SheetMetalBuilder;
    /**
     * Fold the accumulated spec into a 3D part, re-entering the fluent chain.
     * Memoized so chaining multiple terminal shortcuts (e.g. `unfold()` then
     * `report()`) authors the solid only once.
     */
    build(): SheetMetalPartHandle;
    miter(plane: MiterPlane): SheetMetalPartHandle;
    miterCorner(flangeIdA: string, flangeIdB: string, gap?: number): SheetMetalPartHandle;
    bendRelief(flangeId: string, spec?: ReliefSpec): SheetMetalPartHandle;
    autoReliefs(spec?: ReliefSpec): SheetMetalPartHandle;
    cornerRelief(flangeIdA: string, flangeIdB: string, spec?: ReliefSpec): SheetMetalPartHandle;
    cutout(spec: CutoutSpec): SheetMetalPartHandle;
    hole(region: string, x: number, y: number, diameter: number): SheetMetalPartHandle;
    slot(region: string, opts: {
        x: number;
        y: number;
        length: number;
        width: number;
        angleDeg?: number;
        round?: boolean;
    }): SheetMetalPartHandle;
    polygonCutout(region: string, points: [number, number][]): SheetMetalPartHandle;
    tab(spec: TabSpec): SheetMetalPartHandle;
    tabAndSlot(tab: TabSpec, slot: SlotPlacement): SheetMetalPartHandle;
    louver(opts: {
        region: string;
        x: number;
        y: number;
        length: number;
        width: number;
        height: number;
        direction?: 'up' | 'down';
    }): SheetMetalPartHandle;
    emboss(opts: {
        region: string;
        x: number;
        y: number;
        diameter: number;
        height: number;
        kind: 'dimple' | 'emboss';
    }): SheetMetalPartHandle;
    contourFlange(spec: ContourFlangeSpec): SheetMetalPartHandle;
    loftedFlange(spec: LoftedFlangeSpec): SheetMetalPartHandle;
    hem(spec: HemSpec): SheetMetalPartHandle;
    jog(spec: JogSpec): SheetMetalPartHandle;
    unfold(): UnfoldResult;
    report(): BendReport;
    dxf(options?: DxfOptions): string;
    validate(): SheetMetalWarning[];
    get(): SheetMetalPart;
}

/** Start a fluent sheet-metal chain from a base flat (`length × width`). */
declare function sheetMetal(base: BaseFlatSpec, thickness: number): SheetMetalBuilder;

/** Re-enter the fluent chain from an already-authored part. */
declare function fromPart(part: SheetMetalPart): SheetMetalPartHandle;

/** Fold a flat pattern up into a part and re-enter the fluent chain. */
declare function foldFlat(input: FlatInput): SheetMetalPartHandle;

/** Detect and unfold an imported foreign sheet-metal solid (no feature tree). */
declare function fromSolid(solid: Solid, opts?: {
    kFactor?: number;
}): ForeignSolidHandle;

/** Which edge of a flat a child flange folds off. */
type FlatSide = 'xmin' | 'xmax' | 'ymin' | 'ymax';

/**
 * Reference to the parent edge a flange folds from. `faceIndex` keeps the legacy
 * construction-order scheme (`face-0` = base flat). `parentId` names the parent
 * flat directly (a flange id for chained flanges, or undefined for the base) and
 * `side`/`offset`/`extent` locate the flange along that parent edge — the data
 * the recursive unfold walk and the feature tree consume.
 */
type EdgeRef = {
    kind: 'index';
    faceIndex: number;
    edgeIndex: number;
    parentId?: string | undefined;
    side?: FlatSide | undefined;
    offset?: number | undefined;
    extent?: number | undefined;
};

interface BendRule {
    innerRadius: number;
    kFactor: number;
    allowance?: number | undefined;
    deduction?: number | undefined;
    bendTableRef?: string | undefined;
}

interface MaterialSpec {
    name: string;
    thickness: number;
    defaultRule: BendRule;
}

interface MiterSpec {
    gap: number;
    style: 'auto';
}

interface BendFeature {
    id: string;
    axisOrigin: [number, number, number];
    axisDir: [number, number, number];
    angleDeg: number;
    direction: 'up' | 'down';
    rule: BendRule;
}

interface FlangeFeature {
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
interface CornerMiter {
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
interface ReliefSpec {
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
interface ReliefFeature {
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
type CutoutSpec = {
    kind: 'hole';
    region: string;
    x: number;
    y: number;
    diameter: number;
} | {
    kind: 'slot';
    region: string;
    x: number;
    y: number;
    length: number;
    width: number;
    angleDeg?: number | undefined;
    round?: boolean | undefined;
} | {
    kind: 'polygon';
    region: string;
    points: [number, number][];
};

/**
 * A recorded cutout, mirroring {@link ReliefFeature}: enough to replay the 2D loop
 * in the developed pattern without re-deriving geometry. `spec` is the original
 * region-local feature (so {@link FoldRegion} can re-apply it on a re-fold); `loop`
 * is the closed cutout boundary already mapped into developed-plane coordinates via
 * the region's unfold frame; `area` is the loop's enclosed area, subtracted from the
 * developed area.
 */
interface CutoutFeature {
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
interface TabSpec {
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
interface TabFeature {
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
type FormSpec = {
    kind: 'louver';
    region: string;
    x: number;
    y: number;
    length: number;
    width: number;
    height: number;
    direction?: 'up' | 'down' | undefined;
} | {
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
interface FormFeature {
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
type ProfileSegment = {
    kind: 'line';
    length: number;
} | {
    kind: 'arc';
    radius: number;
    angleDeg: number;
    direction: 'up' | 'down';
};

/**
 * A contour flange: an OPEN 2D profile (alternating line/arc {@link ProfileSegment}s)
 * swept along a straight edge of the base flat (`side`). Unlike a plain flange (one
 * bend + one flat) this chains an arbitrary multi-bend cross-section — a return, a
 * hat/top-hat, a J — in one feature. The development is EXACT: the developed strip
 * length is the sum of each segment's developed length (lines: `length`; arcs: the
 * canonical {@link bendAllowance}).
 */
interface ContourFlangeSpec {
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
interface ContourFlangeFeature {
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
interface LoftedFlangeSpec {
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
interface LoftedFlangeFeature {
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
interface HemSpec {
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
interface HemFeature {
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
interface JogSpec {
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
interface JogFeature {
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

interface SheetMetalPart {
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

interface FlatPattern {
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

interface BendReport {
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

type SheetMetalWarning = {
    code: 'COLLISION' | 'SEAM_CUT' | 'MIN_RADIUS' | 'INVALID_SOLID' | 'MITER_NOT_DEVELOPED' | 'DEVELOPMENT_APPROXIMATE'
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
     | 'TABLE_CLAMP'
    /** Nesting: a flat pattern's outline bounding box does not fit the usable stock
     * sheet (sheet minus margin) even rotated 90°, so it was left unplaced. */
     | 'PART_TOO_LARGE';
    message: string;
    featureId?: string | undefined;
};

interface UnfoldResult {
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
interface FoldRegion {
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
interface FlatInput {
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

// ── Aliases ──

declare const unfoldPart: typeof unfold;
declare const foldPart: typeof fold;
