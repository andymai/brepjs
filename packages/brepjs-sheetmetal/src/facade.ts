/**
 * Fluent facade — `sheetMetal(base).flange(...).miter(...).unfold()`.
 *
 * A lightweight immutable builder over the {@link ./api.js} wrappers. Authoring
 * steps (`flange`, `material`) accumulate into a spec; part-consuming steps
 * (`miter`, `miterCorner`, `unfold`, `report`, `dxf`, `validate`, `part`)
 * materialize the folded part once and thread it through, auto-unwrapping the
 * underlying `Result<T>` and throwing {@link SheetMetalError} on failure so the
 * chain stays terminal-free. Use the `Result`-returning functions in `./api.js`
 * directly when explicit error handling is preferred over throwing.
 */

import type { BrepError, Result } from 'brepjs';
import { isErr } from 'brepjs';
import type { AuthorSpec, BaseFlatSpec, FlangeSpec, SeamSpec } from './authorFns.js';
import type { MiterPlane, DxfOptions, SlotPlacement } from './api.js';
import {
  author,
  unfold,
  fold,
  miter,
  miterCorner,
  bendRelief,
  autoReliefs,
  relieveCorner,
  addCutout,
  addHole,
  addSlot,
  addPolygonCutout,
  addTab,
  tabAndSlot,
  louver,
  emboss,
  contourFlange,
  loftedFlange,
  toDXF,
  report,
  validate,
} from './api.js';
import type {
  SheetMetalPart,
  FlatPattern,
  FlatInput,
  BendReport,
  MaterialSpec,
  ReliefSpec,
  CutoutSpec,
  TabSpec,
  ContourFlangeSpec,
  LoftedFlangeSpec,
  SheetMetalWarning,
  UnfoldResult,
} from './types.js';

/** Thrown by the fluent facade when an underlying `Result<T>` is an `Err`. */
export class SheetMetalError extends Error {
  readonly code: string;
  readonly kind: string;

  constructor(brepError: BrepError) {
    super(
      brepError.suggestion
        ? `${brepError.message}\nSuggestion: ${brepError.suggestion}`
        : brepError.message
    );
    this.name = 'SheetMetalError';
    this.code = brepError.code;
    this.kind = brepError.kind;
  }
}

function unwrapOrThrow<T>(result: Result<T>): T {
  if (isErr(result)) {
    throw new SheetMetalError(result.error);
  }
  return result.value;
}

/** A built part already mitered/operated on, re-entering the fluent chain. */
class SheetMetalPartHandle {
  constructor(readonly part: SheetMetalPart) {}

  /** Cut by an oriented plane, removing material on the `+normal` side. */
  miter(plane: MiterPlane): SheetMetalPartHandle {
    return new SheetMetalPartHandle(unwrapOrThrow(miter(this.part, plane)));
  }

  /** Auto-miter the shared corner of two flanges with an optional gap. */
  miterCorner(flangeIdA: string, flangeIdB: string, gap = 0): SheetMetalPartHandle {
    return new SheetMetalPartHandle(unwrapOrThrow(miterCorner(this.part, flangeIdA, flangeIdB, gap)));
  }

  /** Add a bend relief at each mid-edge end of a partial flange's bend line. */
  bendRelief(flangeId: string, spec?: ReliefSpec): SheetMetalPartHandle {
    return new SheetMetalPartHandle(unwrapOrThrow(bendRelief(this.part, flangeId, spec)));
  }

  /** Add a bend relief to every partial-span bend in the part. */
  autoReliefs(spec?: ReliefSpec): SheetMetalPartHandle {
    return new SheetMetalPartHandle(unwrapOrThrow(autoReliefs(this.part, spec)));
  }

  /** Cut a corner relief notch at the shared corner of two adjacent flanges. */
  cornerRelief(flangeIdA: string, flangeIdB: string, spec?: ReliefSpec): SheetMetalPartHandle {
    return new SheetMetalPartHandle(unwrapOrThrow(relieveCorner(this.part, flangeIdA, flangeIdB, spec)));
  }

  /** Punch a cutout (hole / slot / polygon) through a named flat region. */
  cutout(spec: CutoutSpec): SheetMetalPartHandle {
    return new SheetMetalPartHandle(unwrapOrThrow(addCutout(this.part, spec)));
  }

  /** Punch a circular hole of `diameter` centred at region-local `(x, y)`. */
  hole(region: string, x: number, y: number, diameter: number): SheetMetalPartHandle {
    return new SheetMetalPartHandle(unwrapOrThrow(addHole(this.part, region, x, y, diameter)));
  }

  /** Punch a slot (rectangular or obround) centred at region-local `(x, y)`. */
  slot(
    region: string,
    opts: { x: number; y: number; length: number; width: number; angleDeg?: number; round?: boolean }
  ): SheetMetalPartHandle {
    return new SheetMetalPartHandle(unwrapOrThrow(addSlot(this.part, region, opts)));
  }

  /** Punch an arbitrary polygon cutout from its region-local `points`. */
  polygonCutout(region: string, points: [number, number][]): SheetMetalPartHandle {
    return new SheetMetalPartHandle(unwrapOrThrow(addPolygonCutout(this.part, region, points)));
  }

  /** Fuse a rectangular tab (additive protrusion) onto a region's edge. */
  tab(spec: TabSpec): SheetMetalPartHandle {
    return new SheetMetalPartHandle(unwrapOrThrow(addTab(this.part, spec)));
  }

  /** Self-fixturing tab-and-slot joint: a tab on one region + a matching slot on another. */
  tabAndSlot(tab: TabSpec, slot: SlotPlacement): SheetMetalPartHandle {
    return new SheetMetalPartHandle(unwrapOrThrow(tabAndSlot(this.part, tab, slot)));
  }

  /** Form a louver (vent flap) on a region. */
  louver(opts: {
    region: string;
    x: number;
    y: number;
    length: number;
    width: number;
    height: number;
    direction?: 'up' | 'down';
  }): SheetMetalPartHandle {
    return new SheetMetalPartHandle(unwrapOrThrow(louver(this.part, opts)));
  }

  /** Form a round emboss (raised) or dimple (recessed) on a region. */
  emboss(opts: {
    region: string;
    x: number;
    y: number;
    diameter: number;
    height: number;
    kind: 'dimple' | 'emboss';
  }): SheetMetalPartHandle {
    return new SheetMetalPartHandle(unwrapOrThrow(emboss(this.part, opts)));
  }

  /** Author a contour flange (open line/arc profile swept along a base edge). */
  contourFlange(spec: ContourFlangeSpec): SheetMetalPartHandle {
    return new SheetMetalPartHandle(unwrapOrThrow(contourFlange(this.part, spec)));
  }

  /** Author a lofted / ruled transition flange between two parallel open profiles. */
  loftedFlange(spec: LoftedFlangeSpec): SheetMetalPartHandle {
    return new SheetMetalPartHandle(unwrapOrThrow(loftedFlange(this.part, spec)));
  }

  /** Flatten into a developed flat pattern + bend report + warnings. */
  unfold(): UnfoldResult {
    return unwrapOrThrow(unfold(this.part));
  }

  /** Just the flat pattern from the unfold. */
  flatPattern(): FlatPattern {
    return this.unfold().pattern;
  }

  /** Bend report built from the feature tree. */
  report(): BendReport {
    return unwrapOrThrow(report(this.part));
  }

  /** Annotated multi-layer DXF of the developed flat pattern. */
  dxf(options?: DxfOptions): string {
    return unwrapOrThrow(toDXF(this.flatPattern(), options));
  }

  /** Manufacturability warnings (advisory, never throws). */
  validate(): SheetMetalWarning[] {
    return validate(this.part);
  }

  /** The materialized part (escape hatch back to the functional API). */
  get(): SheetMetalPart {
    return this.part;
  }
}

/** Authoring builder — accumulates the base/flanges/material spec, then folds. */
class SheetMetalBuilder {
  private built?: SheetMetalPartHandle;

  constructor(private readonly spec: AuthorSpec) {}

  /** Add a flange folded off its parent edge (the base by default). */
  flange(flange: FlangeSpec): SheetMetalBuilder {
    return new SheetMetalBuilder({ ...this.spec, flanges: [...this.spec.flanges, flange] });
  }

  /** Add a seam closing a profile into a tube/box (left unfolded). */
  seam(seam: SeamSpec): SheetMetalBuilder {
    return new SheetMetalBuilder({ ...this.spec, seams: [...(this.spec.seams ?? []), seam] });
  }

  /** Set the part material (its thickness/default rule). */
  material(material: MaterialSpec): SheetMetalBuilder {
    return new SheetMetalBuilder({ ...this.spec, material });
  }

  /**
   * Fold the accumulated spec into a 3D part, re-entering the fluent chain.
   * Memoized so chaining multiple terminal shortcuts (e.g. `unfold()` then
   * `report()`) authors the solid only once.
   */
  build(): SheetMetalPartHandle {
    this.built ??= new SheetMetalPartHandle(unwrapOrThrow(author(this.spec)));
    return this.built;
  }

  // ----- part-consuming shortcuts (build then delegate) -----

  miter(plane: MiterPlane): SheetMetalPartHandle {
    return this.build().miter(plane);
  }

  miterCorner(flangeIdA: string, flangeIdB: string, gap = 0): SheetMetalPartHandle {
    return this.build().miterCorner(flangeIdA, flangeIdB, gap);
  }

  bendRelief(flangeId: string, spec?: ReliefSpec): SheetMetalPartHandle {
    return this.build().bendRelief(flangeId, spec);
  }

  autoReliefs(spec?: ReliefSpec): SheetMetalPartHandle {
    return this.build().autoReliefs(spec);
  }

  cornerRelief(flangeIdA: string, flangeIdB: string, spec?: ReliefSpec): SheetMetalPartHandle {
    return this.build().cornerRelief(flangeIdA, flangeIdB, spec);
  }

  cutout(spec: CutoutSpec): SheetMetalPartHandle {
    return this.build().cutout(spec);
  }

  hole(region: string, x: number, y: number, diameter: number): SheetMetalPartHandle {
    return this.build().hole(region, x, y, diameter);
  }

  slot(
    region: string,
    opts: { x: number; y: number; length: number; width: number; angleDeg?: number; round?: boolean }
  ): SheetMetalPartHandle {
    return this.build().slot(region, opts);
  }

  polygonCutout(region: string, points: [number, number][]): SheetMetalPartHandle {
    return this.build().polygonCutout(region, points);
  }

  tab(spec: TabSpec): SheetMetalPartHandle {
    return this.build().tab(spec);
  }

  tabAndSlot(tab: TabSpec, slot: SlotPlacement): SheetMetalPartHandle {
    return this.build().tabAndSlot(tab, slot);
  }

  louver(opts: {
    region: string;
    x: number;
    y: number;
    length: number;
    width: number;
    height: number;
    direction?: 'up' | 'down';
  }): SheetMetalPartHandle {
    return this.build().louver(opts);
  }

  emboss(opts: {
    region: string;
    x: number;
    y: number;
    diameter: number;
    height: number;
    kind: 'dimple' | 'emboss';
  }): SheetMetalPartHandle {
    return this.build().emboss(opts);
  }

  contourFlange(spec: ContourFlangeSpec): SheetMetalPartHandle {
    return this.build().contourFlange(spec);
  }

  loftedFlange(spec: LoftedFlangeSpec): SheetMetalPartHandle {
    return this.build().loftedFlange(spec);
  }

  unfold(): UnfoldResult {
    return this.build().unfold();
  }

  report(): BendReport {
    return this.build().report();
  }

  dxf(options?: DxfOptions): string {
    return this.build().dxf(options);
  }

  validate(): SheetMetalWarning[] {
    return this.build().validate();
  }

  get(): SheetMetalPart {
    return this.build().get();
  }
}

/** Start a fluent sheet-metal chain from a base flat (`length × width`). */
export function sheetMetal(base: BaseFlatSpec, thickness: number): SheetMetalBuilder {
  return new SheetMetalBuilder({ thickness, base, flanges: [] });
}

/** Re-enter the fluent chain from an already-authored part. */
export function fromPart(part: SheetMetalPart): SheetMetalPartHandle {
  return new SheetMetalPartHandle(part);
}

/** Fold a flat pattern up into a part and re-enter the fluent chain. */
export function foldFlat(input: FlatInput): SheetMetalPartHandle {
  return new SheetMetalPartHandle(unwrapOrThrow(fold(input)));
}

export { SheetMetalBuilder, SheetMetalPartHandle };
