import {
  type Result,
  type Vec3,
  type Solid,
  ok,
  err,
  validationError,
  line,
  wireLoop,
  face,
  extrude,
  fuse,
  getSolids,
  isValid,
  isPlanarWire,
  vecAdd,
  vecScale,
} from 'brepjs';
import type { TabSpec, TabFeature, SheetMetalPart } from './types.js';
import { normalizeSolid } from './internal.js';
import type { FlatFrame } from './authorFns.js';
import type { Frame2 } from './unfoldFns.js';
import { regionFrames, regionDevExtent, mapToFrame2, addSlot } from './cutoutFns.js';

const EPS = 1e-6;

type Pt2 = [number, number];

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
export function addTab(part: SheetMetalPart, spec: TabSpec): Result<SheetMetalPart> {
  if (part.solid === undefined) {
    return err(validationError('NO_SOLID', 'addTab: part has no folded solid to fuse onto'));
  }
  if (!Number.isFinite(spec.width) || spec.width <= 0) {
    return err(validationError('INVALID_TAB', `tab width must be positive, got ${spec.width}`));
  }
  if (!Number.isFinite(spec.length) || spec.length <= 0) {
    return err(validationError('INVALID_TAB', `tab length must be positive, got ${spec.length}`));
  }
  if (!Number.isFinite(spec.offset) || spec.offset < -EPS) {
    return err(validationError('INVALID_TAB', `tab offset must be non-negative, got ${spec.offset}`));
  }

  const framesResult = regionFrames(part, spec.region);
  if (!framesResult.ok) return framesResult;
  const { regionId, world, dev } = framesResult.value;

  const ext = regionDevExtent(part, regionId, world);
  // The tab attaches to a region edge and runs `width` ALONG it; that span must lie
  // within the edge's length, or the protrusion overhangs the region.
  const edgeLen = spec.side === 'xmax' || spec.side === 'xmin' ? ext.vMax : ext.uMax;
  if (spec.offset + spec.width > edgeLen + EPS) {
    return err(
      validationError(
        'TAB_OUT_OF_BOUNDS',
        `tab [${spec.offset}, ${spec.offset + spec.width}] on side '${spec.side}' exceeds edge length ${edgeLen}`
      )
    );
  }

  const local = tabLocalRect(spec, ext);

  const tool = buildTabSolid(local, world, part.thickness);
  if (!tool.ok) return tool;

  const fused = fuse(part.solid, tool.value);
  if (!fused.ok) return fused;
  const solid = normalizeSolid(fused.value);
  if (!isValid(solid) || getSolids(solid).length > 1) {
    return err(
      validationError(
        'TAB_INVALID_SOLID',
        `addTab: tab on region '${spec.region}' did not fuse into a single valid body`
      )
    );
  }

  const rect = devRect(local, dev);
  const feature: TabFeature = {
    spec,
    region: regionId,
    rect,
    area: spec.width * spec.length,
  };

  return ok({ ...part, solid, tabs: [...(part.tabs ?? []), feature] });
}

/** The mating-slot placement for a {@link tabAndSlot} joint. */
export interface SlotPlacement {
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
export function tabAndSlot(
  part: SheetMetalPart,
  tab: TabSpec,
  slot: SlotPlacement
): Result<SheetMetalPart> {
  const clearance = slot.clearance ?? 0.1;
  if (!Number.isFinite(clearance) || clearance < 0) {
    return err(validationError('INVALID_CLEARANCE', `clearance must be non-negative, got ${clearance}`));
  }

  const withTab = addTab(part, tab);
  if (!withTab.ok) return withTab;

  // The tab's inserted cross-section is `width` (along the edge) by `thickness`
  // (through the sheet); the slot must clear both, so it's sized + clearance.
  const slotLength = tab.width + clearance;
  const slotWidth = part.thickness + clearance;

  return addSlot(withTab.value, slot.region, {
    x: slot.x,
    y: slot.y,
    length: slotLength,
    width: slotWidth,
    ...(slot.angleDeg !== undefined ? { angleDeg: slot.angleDeg } : {}),
  });
}

/**
 * Region-local rectangle of the tab as four corners (CCW), extending OUTWARD past
 * the chosen edge by `length`, spanning `[offset, offset+width]` along the edge.
 */
function tabLocalRect(spec: TabSpec, ext: { uMax: number; vMax: number }): Pt2[] {
  const o = spec.offset;
  const w = o + spec.width;
  const l = spec.length;
  switch (spec.side) {
    case 'xmax':
      return [
        [ext.uMax, o],
        [ext.uMax + l, o],
        [ext.uMax + l, w],
        [ext.uMax, w],
      ];
    case 'xmin':
      return [
        [-l, o],
        [0, o],
        [0, w],
        [-l, w],
      ];
    case 'ymax':
      return [
        [o, ext.vMax],
        [w, ext.vMax],
        [w, ext.vMax + l],
        [o, ext.vMax + l],
      ];
    case 'ymin':
      return [
        [o, -l],
        [w, -l],
        [w, 0],
        [o, 0],
      ];
    default:
      return spec.side satisfies never;
  }
}

/** Extrude the region-local tab rectangle through the sheet via the region world frame. */
function buildTabSolid(local: Pt2[], f: FlatFrame, thickness: number): Result<Solid> {
  const worldPts: Vec3[] = local.map(([x, y]) =>
    vecAdd(vecAdd(f.origin, vecScale(f.u, x)), vecScale(f.v, y))
  );
  const edges = [];
  for (let i = 0; i < worldPts.length; i += 1) {
    const a = worldPts[i];
    const b = worldPts[(i + 1) % worldPts.length];
    if (a === undefined || b === undefined) {
      return err(validationError('TAB_TOOL_FAILED', 'failed to index tab rectangle points'));
    }
    edges.push(line(a, b));
  }
  const wire = wireLoop(edges);
  if (!wire.ok) return wire;
  if (!isPlanarWire(wire.value)) {
    return err(validationError('TAB_TOOL_FAILED', 'tab profile wire is not planar'));
  }
  const profile = face(wire.value);
  if (!profile.ok) return profile;
  return extrude(profile.value, [f.n[0] * thickness, f.n[1] * thickness, f.n[2] * thickness]);
}

/** Developed-plane axis-aligned rectangle `[x0,y0,x1,y1]` of the local tab rect. */
function devRect(local: Pt2[], dev: Frame2): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of local) {
    const [x, y] = mapToFrame2(p, dev);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}
