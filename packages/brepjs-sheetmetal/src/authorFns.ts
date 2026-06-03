import {
  type Result,
  type Vec3,
  type Bounds3D,
  type Solid,
  type ValidSolid,
  ok,
  err,
  validationError,
  box,
  cylinder,
  fuse,
  cut,
  intersect,
  rotate,
  translate,
  vecAdd,
  vecSub,
  vecScale,
  vecDot,
  vecCross,
  vecNormalize,
} from 'brepjs';
import type {
  BendFeature,
  BendRule,
  FlangeFeature,
  EdgeRef,
  FlatSide,
  MaterialSpec,
  MiterSpec,
  SheetMetalPart,
} from './types.js';
import { normalizeSolid } from './internal.js';
import { ROOT_FLAT_ID } from './featureTreeFns.js';

/** Authoring options for the base flat the flanges attach to. */
export interface BaseFlatSpec {
  /** Extent along the run (+X) axis. */
  length: number;
  /** Extent along the width (+Y) axis. */
  width: number;
}

/** Which edge a flange folds off (of the base, or of its parent flange). */
export type FlangeSide = FlatSide;

/** A single flange to author off an edge of its parent flat. */
export interface FlangeSpec {
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
export interface SeamSpec {
  /** Flat id the seam folds from (an authored flange, or `'root'`/`'face-0'` for the base). */
  parent: string;
  /** Flat id the seam meets (must already be authored; `'root'`/`'face-0'` = base). */
  child: string;
  angleDeg: number;
  rule: BendRule;
}

/** Inputs for {@link authorPart}. */
export interface AuthorSpec {
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
export function baseEdgeRef(faceIndex: number): EdgeRef {
  return { kind: 'index', faceIndex, edgeIndex: 0 };
}

/**
 * A flat in the part: the base, or a placed flange face. Each carries the world
 * frame (origin + orthonormal axes) of its top surface so a child flange can be
 * built directly off any of its four edges, at any fold direction.
 */
interface FlatFrame {
  id: string;
  /** Lower-left corner of the flat's top surface (the +normal side). */
  origin: Vec3;
  /** In-plane direction; the flat spans `[0, uLen]` along it. */
  u: Vec3;
  /** In-plane direction; the flat spans `[0, vLen]` along it. */
  v: Vec3;
  /** Outward face normal of the top surface (n = u × v). */
  n: Vec3;
  uLen: number;
  vLen: number;
}

/**
 * Author a sheet-metal part: a base flat plus an arbitrary tree of flanges. Each
 * flange folds off one of the four edges of its parent flat (the base by default,
 * or another flange via `parent`), in the requested direction (up/down), over an
 * optional sub-span of that edge (`offset`/`width`). Returns a {@link SheetMetalPart}
 * carrying the folded 3D solid and the recorded bend feature tree the unfold
 * consumes. All construction stays on the public, OCCT-WASM-safe API.
 */
export function authorPart(spec: AuthorSpec): Result<SheetMetalPart> {
  const { thickness } = spec;
  if (!Number.isFinite(thickness) || thickness <= 0) {
    return err(validationError('INVALID_THICKNESS', `thickness must be positive, got ${thickness}`));
  }
  const { length: baseLen, width } = spec.base;
  if (!Number.isFinite(baseLen) || baseLen <= 0) {
    return err(validationError('INVALID_BASE_LENGTH', `base.length must be positive, got ${baseLen}`));
  }
  if (!Number.isFinite(width) || width <= 0) {
    return err(validationError('INVALID_BASE_WIDTH', `base.width must be positive, got ${width}`));
  }

  const seen = new Set<string>();
  for (const flange of spec.flanges) {
    // `::` is reserved as the seam-bend id delimiter (`seam::<parent>::<child>`);
    // allowing it in a flange id would make the seam parent/child ambiguous to parse.
    // `root`/`face-0` are reserved sentinels for the base flat — a flange reusing
    // either would silently overwrite the base frame and fold off wrong geometry.
    if (flange.id === '' || flange.id.includes('::') || flange.id === ROOT_FLAT_ID || flange.id === 'face-0') {
      return err(
        validationError('INVALID_FLANGE_ID', `flange id must be non-empty, must not contain '::', and must not reuse the reserved ids 'root'/'face-0', got '${flange.id}'`)
      );
    }
    if (seen.has(flange.id)) {
      return err(validationError('DUPLICATE_FLANGE', `duplicate flange id '${flange.id}'`));
    }
    seen.add(flange.id);
  }

  // Two flanges on the same parent edge must not overlap along that edge.
  const overlap = checkEdgeOverlaps(spec.flanges, baseLen, width);
  if (!overlap.ok) return overlap;

  const ROOT = ROOT_FLAT_ID;
  const frames = new Map<string, FlatFrame>();
  // Frame origin sits on the sheet's −normal (bottom) surface; the flat spans
  // `thickness` along +n. This matches the canonical assembly, whose z=0 plane is
  // the sheet bottom and whose bend cylinder sits at z = T+r (up) / −r (down).
  frames.set(ROOT, {
    id: ROOT,
    origin: [0, 0, 0],
    u: [1, 0, 0],
    v: [0, 1, 0],
    n: [0, 0, 1],
    uLen: baseLen,
    vLen: width,
  });

  let solid: Solid = box(baseLen, width, thickness);
  const flanges: FlangeFeature[] = [];
  const bends: BendFeature[] = [];

  // Author in spec order; a chained flange must follow its parent. Resolve the
  // parent frame by flange id (or the base for a root flange).
  for (const flange of spec.flanges) {
    const parentId = flange.parent ?? ROOT;
    const parentFrame = frames.get(parentId);
    if (parentFrame === undefined) {
      return err(
        validationError('UNKNOWN_PARENT', `flange '${flange.id}' parent '${flange.parent}' not authored yet`)
      );
    }
    const built = buildFlange(solid, parentFrame, thickness, flange);
    if (!built.ok) return built;
    solid = built.value.solid;
    flanges.push(built.value.flange);
    bends.push(built.value.bend);
    frames.set(flange.id, built.value.childFrame);
  }

  for (const seam of spec.seams ?? []) {
    const seamParent = seam.parent === 'face-0' ? ROOT : seam.parent;
    const seamChild = seam.child === 'face-0' ? ROOT : seam.child;
    if (!frames.has(seamParent) || !frames.has(seamChild)) {
      return err(
        validationError('UNKNOWN_SEAM_FLAT', `seam ${seam.parent}↔${seam.child} references an unauthored flat`)
      );
    }
    if (!Number.isFinite(seam.angleDeg) || seam.angleDeg <= 0 || seam.angleDeg > 180) {
      return err(
        validationError('INVALID_SEAM_ANGLE', `seam ${seam.parent}↔${seam.child} angleDeg must be in (0, 180], got ${seam.angleDeg}`)
      );
    }
    if (!Number.isFinite(seam.rule.innerRadius) || seam.rule.innerRadius < 0) {
      return err(
        validationError('INVALID_SEAM_RADIUS', `seam ${seam.parent}↔${seam.child} innerRadius must be non-negative`)
      );
    }
    const parentFrame = frames.get(seamParent) as FlatFrame;
    bends.push({
      id: `seam::${seamParent}::${seamChild}`,
      axisOrigin: [parentFrame.origin[0], parentFrame.origin[1], parentFrame.origin[2]],
      axisDir: [parentFrame.u[0], parentFrame.u[1], parentFrame.u[2]],
      angleDeg: seam.angleDeg,
      direction: 'up',
      rule: seam.rule,
    });
  }

  return ok({
    thickness,
    baseLength: baseLen,
    width,
    ...(spec.material !== undefined ? { material: spec.material } : {}),
    flanges,
    bends,
    solid: normalizeSolid(solid),
  });
}

/**
 * Reject two flanges on the same parent edge whose [offset, offset+width] ranges
 * overlap. The edge length a flange's default span fills must be the *resolved*
 * parent-edge length, not the base's: a chained flange folds off another flange
 * whose edges have that flange's own span/length, so keying the default off the
 * base dimensions would compute a bogus span and spuriously reject valid pairs.
 */
function checkEdgeOverlaps(specs: FlangeSpec[], baseLen: number, width: number): Result<void> {
  interface Range {
    id: string;
    lo: number;
    hi: number;
  }
  // Resolved child-frame dims per flange: spanLen along the bend axis, flatLen out.
  // Walked in spec order (a chained flange always follows its parent), mirroring
  // the authoring loop so parent frames are known before their children.
  const dims = new Map<string, { spanLen: number; flatLen: number }>();
  const edgeLenFor = (parentId: string, side: FlatSide): number => {
    const onWidthEdge = side === 'xmax' || side === 'xmin';
    if (parentId === ROOT_FLAT_ID) return onWidthEdge ? width : baseLen;
    const p = dims.get(parentId);
    if (p === undefined) return onWidthEdge ? width : baseLen;
    // Parent flange frame: uLen = its span (xmax/xmin edges), vLen = its length.
    return onWidthEdge ? p.flatLen : p.spanLen;
  };

  const byEdge = new Map<string, Range[]>();
  for (const f of specs) {
    const side: FlatSide = f.side ?? 'xmax';
    const parentId = f.parent ?? ROOT_FLAT_ID;
    const key = `${parentId}::${side}`;
    const edgeLen = edgeLenFor(parentId, side);
    const lo = f.offset ?? 0;
    const span = f.width ?? edgeLen;
    const hi = lo + span;
    const list = byEdge.get(key) ?? [];
    for (const r of list) {
      if (lo < r.hi - 1e-9 && r.lo < hi - 1e-9) {
        return err(
          validationError(
            'OVERLAPPING_FLANGES',
            `flange '${f.id}' overlaps '${r.id}' on edge '${key}' ([${lo}, ${hi}] ∩ [${r.lo}, ${r.hi}])`
          )
        );
      }
    }
    list.push({ id: f.id, lo, hi });
    byEdge.set(key, list);
    dims.set(f.id, { spanLen: span, flatLen: f.length });
  }
  return ok(undefined);
}

interface BuiltFlange {
  solid: Solid;
  flange: FlangeFeature;
  bend: BendFeature;
  childFrame: FlatFrame;
}

/**
 * Build one flange off `parent`'s chosen edge and fuse it to `base`. The flange
 * assembly (cylindrical bend patch + flat) is constructed in a canonical frame
 * (bend axis +Y at the origin, outward run +X, top surface +Z) honouring the
 * up/down fold, then rigidly mapped onto the parent edge's world frame.
 */
function buildFlange(
  base: Solid,
  parent: FlatFrame,
  thickness: number,
  flange: FlangeSpec
): Result<BuiltFlange> {
  if (!Number.isFinite(flange.length) || flange.length <= 0) {
    return err(validationError('INVALID_FLANGE_LENGTH', `flange '${flange.id}' length must be positive`));
  }
  if (!Number.isFinite(flange.angleDeg) || flange.angleDeg <= 0 || flange.angleDeg > 180) {
    return err(
      validationError('INVALID_FLANGE_ANGLE', `flange '${flange.id}' angleDeg must be in (0, 180], got ${flange.angleDeg}`)
    );
  }
  const r = flange.rule.innerRadius;
  if (!Number.isFinite(r) || r < 0) {
    return err(validationError('INVALID_RADIUS', `flange '${flange.id}' innerRadius must be non-negative`));
  }

  const side: FlatSide = flange.side ?? 'xmax';
  const direction: 'up' | 'down' = flange.direction ?? 'up';
  const edge = parentEdge(parent, side);
  const offset = flange.offset ?? 0;
  const span = flange.width ?? edge.length;
  if (!Number.isFinite(offset) || offset < -1e-9) {
    return err(validationError('INVALID_OFFSET', `flange '${flange.id}' offset must be non-negative`));
  }
  if (!Number.isFinite(span) || span <= 0) {
    return err(validationError('INVALID_FLANGE_WIDTH', `flange '${flange.id}' width must be positive`));
  }
  if (offset + span > edge.length + 1e-6) {
    return err(
      validationError('FLANGE_OUT_OF_BOUNDS', `flange '${flange.id}' [${offset}, ${offset + span}] exceeds parent edge length ${edge.length}`)
    );
  }

  // Canonical assembly: bend axis +Y, outward run +X, top surface +Z, spanning
  // +Y over [0, span]. Up folds toward +Z, down folds below the base plane.
  const canonAxisZ = direction === 'up' ? thickness + r : -r;
  const canonOrigin: Vec3 = [0, 0, canonAxisZ];
  const patch = buildBendPatch(canonOrigin, flange.angleDeg, r, span, thickness, direction);
  if (!patch.ok) return patch;
  const flat = buildFlangeFlat(canonOrigin, flange.angleDeg, span, thickness, flange.length, direction);

  // World frame the canonical assembly maps onto: bend axis = edge.dir, outward
  // run = edge.out, top normal = parent.n. The bend axis sits at offset along the
  // edge; the canonical contact (axis straight above the base seam) maps onto the
  // parent edge line.
  const place = frameTransform(edge.dir, edge.out, parent.n, edge.start, offset);
  const patchPlaced = place.solid(patch.value);
  const flatPlaced = place.solid(flat);

  const fusedPatch = fuse(base, patchPlaced);
  if (!fusedPatch.ok) return fusedPatch;
  const fused = fuse(fusedPatch.value, flatPlaced);
  if (!fused.ok) return fused;

  const sign = direction === 'up' ? 1 : -1;
  // Recorded bend axis = the cylinder centre line: parent edge + n·(T+r up | r down).
  const axisOrigin = vecAdd(
    vecAdd(edge.start, vecScale(edge.dir, offset)),
    vecScale(parent.n, canonAxisZ)
  );
  const bend: BendFeature = {
    id: flange.id,
    axisOrigin: [axisOrigin[0], axisOrigin[1], axisOrigin[2]],
    axisDir: [edge.dir[0], edge.dir[1], edge.dir[2]],
    angleDeg: flange.angleDeg,
    direction,
    rule: flange.rule,
  };

  const childFrame = computeChildFrame(flange.id, place, span, flange.angleDeg, thickness, r, sign, flange.length);

  // True folded AABB of the whole flange (bend patch + flat) in world space.
  // Computed from the real placed geometry so chained flanges — whose bend axis
  // sits off the z=0 base plane — get a correct box, not the z=0-flattened one a
  // purely analytic re-fold would produce. The collision check reuses this.
  const foldedBounds = flangeFoldedBounds(childFrame, edge, offset, span, parent.n, canonAxisZ, thickness);

  const flangeFeature: FlangeFeature = {
    id: flange.id,
    baseEdge: {
      kind: 'index',
      faceIndex: parent.id === ROOT_FLAT_ID ? 0 : -1,
      edgeIndex: 0,
      parentId: parent.id,
      side,
      offset,
      extent: span,
    },
    length: flange.length,
    span,
    offset,
    angleDeg: flange.angleDeg,
    direction,
    rule: flange.rule,
    foldedBounds,
    ...(flange.miter !== undefined ? { miter: flange.miter } : {}),
  };

  return ok({ solid: fused.value, flange: flangeFeature, bend, childFrame });
}

interface ParentEdge {
  /** Direction along the edge (the bend axis). */
  dir: Vec3;
  /** Outward in-plane direction the flange runs (perpendicular to dir). */
  out: Vec3;
  /** Start corner of the edge (offset 0). */
  start: Vec3;
  /** Edge length. */
  length: number;
}

/**
 * Resolve one of the four edges of a flat frame. The bend axis `dir` is chosen so
 * the canonical assembly maps onto it by a proper rotation: `out × dir = n`, i.e.
 * `dir = n × out`. `start` is the edge endpoint from which `dir` runs along the
 * edge, so the flange spans `start + offset·dir` to `start + (offset+span)·dir`.
 */
function parentEdge(f: FlatFrame, side: FlatSide): ParentEdge {
  const o = f.origin;
  const uTop = vecAdd(o, vecScale(f.u, f.uLen));
  const vTop = vecAdd(o, vecScale(f.v, f.vLen));
  const uvTop = vecAdd(uTop, vecScale(f.v, f.vLen));

  let out: Vec3;
  let length: number;
  let a: Vec3;
  let b: Vec3;
  switch (side) {
    case 'xmax':
      out = f.u;
      length = f.vLen;
      a = uTop;
      b = uvTop;
      break;
    case 'xmin':
      out = vecScale(f.u, -1);
      length = f.vLen;
      a = o;
      b = vTop;
      break;
    case 'ymax':
      out = f.v;
      length = f.uLen;
      a = vTop;
      b = uvTop;
      break;
    case 'ymin':
      out = vecScale(f.v, -1);
      length = f.uLen;
      a = o;
      b = uTop;
      break;
  }
  const dir = vecNormalize(vecCross(f.n, out));
  // Pick the endpoint from which `dir` points toward the other endpoint.
  const toB = vecSub(b, a);
  const start = vecDot(toB, dir) >= 0 ? a : b;
  return { dir, out, start, length };
}

/**
 * Frame of the child flange's flat (bottom/−normal surface, near corner), for
 * chaining grandchildren. Derived by folding the canonical flat by ∓θ about the
 * bend axis, then mapping through the same rigid transform that placed the flange.
 */
function computeChildFrame(
  id: string,
  place: PlacedTransform,
  span: number,
  angleDeg: number,
  thickness: number,
  r: number,
  sign: number,
  length: number
): FlatFrame {
  const theta = (angleDeg * Math.PI) / 180;
  const axisZ = sign > 0 ? thickness + r : -r;

  // Canonical fold = rotate by −sign·θ about +Y at pivot [0,0,axisZ]. Run +X and
  // normal +Z fold accordingly; the flat's near-bottom corner ([0,0,0]) rotates
  // about the pivot. (rotate by a about +Y: [x,z]→[x cos a + z sin a, −x sin a + z cos a].)
  const a = -sign * theta;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const runC: Vec3 = [ca, 0, -sa];
  const nC: Vec3 = [sa, 0, ca];
  const dz = -axisZ;
  const cornerC: Vec3 = [dz * sa, 0, axisZ + dz * ca];

  return {
    id,
    origin: place.point(cornerC),
    u: place.vector([0, 1, 0]),
    v: place.vector(runC),
    n: place.vector(nC),
    uLen: span,
    vLen: length,
  };
}

/**
 * World-space AABB of a folded flange: the union of the flat box (from its child
 * frame) and the bend region between the parent edge and the bend-axis cylinder.
 * Built from the real placed corners, so a chained flange folded off a vertical
 * wall is bounded correctly rather than collapsed into the z=0 base plane.
 */
function flangeFoldedBounds(
  child: FlatFrame,
  edge: ParentEdge,
  offset: number,
  span: number,
  parentN: Vec3,
  canonAxisZ: number,
  thickness: number
): Bounds3D {
  const corners: Vec3[] = [];
  // Flat box: child.origin + [0,uLen]·u + [0,vLen]·v + [0,thickness]·n.
  for (const s of [0, child.uLen]) {
    for (const l of [0, child.vLen]) {
      for (const t of [0, thickness]) {
        corners.push(
          vecAdd(
            vecAdd(vecAdd(child.origin, vecScale(child.u, s)), vecScale(child.v, l)),
            vecScale(child.n, t)
          )
        );
      }
    }
  }
  // Bend region: from the parent edge contact (sheet at the seam) out to the bend
  // axis line, over the flange span. Captures the cylindrical patch's footprint.
  const edgeBase = vecAdd(edge.start, vecScale(edge.dir, offset));
  const axisLine = vecAdd(edgeBase, vecScale(parentN, canonAxisZ));
  for (const s of [0, span]) {
    const along = vecScale(edge.dir, s);
    corners.push(vecAdd(edgeBase, along));
    corners.push(vecAdd(vecAdd(edgeBase, along), vecScale(parentN, thickness)));
    corners.push(vecAdd(axisLine, along));
  }
  return aabbOf(corners);
}

function aabbOf(corners: Vec3[]): Bounds3D {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const c of corners) {
    if (c[0] < xMin) xMin = c[0];
    if (c[0] > xMax) xMax = c[0];
    if (c[1] < yMin) yMin = c[1];
    if (c[1] > yMax) yMax = c[1];
    if (c[2] < zMin) zMin = c[2];
    if (c[2] > zMax) zMax = c[2];
  }
  return { xMin, xMax, yMin, yMax, zMin, zMax };
}

interface PlacedTransform {
  solid: (s: Solid) => Solid;
  point: (p: Vec3) => Vec3;
  vector: (v: Vec3) => Vec3;
}

/**
 * Rigid transform mapping the canonical flange assembly (bend axis +Y, run +X,
 * normal +Z, contact at the origin) onto a world edge frame: align +X→`runT`,
 * +Y→`axisT`, +Z→`nT`, then slide the axis to `edgeStart + offset·axisT`.
 */
function frameTransform(
  axisT: Vec3,
  runT: Vec3,
  nT: Vec3,
  edgeStart: Vec3,
  offset: number
): PlacedTransform {
  // Rotation matrix R with columns [runT | axisT | nT] sends canonical X,Y,Z to
  // the target basis. Convert to axis-angle and rotate about the origin.
  const m: number[] = [
    runT[0], axisT[0], nT[0],
    runT[1], axisT[1], nT[1],
    runT[2], axisT[2], nT[2],
  ];
  const aa = matrixToAxisAngle(m);
  const target = vecAdd(edgeStart, vecScale(axisT, offset));
  const applyR = (v: Vec3): Vec3 =>
    vecAdd(vecAdd(vecScale(runT, v[0]), vecScale(axisT, v[1])), vecScale(nT, v[2]));
  return {
    solid: (s: Solid) => {
      const rotated = aa.angleDeg === 0 ? s : rotate(s, aa.angleDeg, { at: [0, 0, 0], axis: aa.axis });
      return translate(rotated, target);
    },
    point: (p: Vec3) => vecAdd(applyR(p), target),
    vector: applyR,
  };
}

/** Axis-angle of a 3×3 rotation matrix (row-major). */
function matrixToAxisAngle(m: number[]): { axis: Vec3; angleDeg: number } {
  const m00 = m[0] ?? 0;
  const m01 = m[1] ?? 0;
  const m02 = m[2] ?? 0;
  const m10 = m[3] ?? 0;
  const m11 = m[4] ?? 0;
  const m12 = m[5] ?? 0;
  const m20 = m[6] ?? 0;
  const m21 = m[7] ?? 0;
  const m22 = m[8] ?? 0;

  const trace = m00 + m11 + m22;
  const cos = Math.max(-1, Math.min(1, (trace - 1) / 2));
  const angle = Math.acos(cos);
  const angleDeg = (angle * 180) / Math.PI;
  if (angle < 1e-9) return { axis: [0, 0, 1], angleDeg: 0 };

  if (Math.PI - angle < 1e-6) {
    // 180°: axis is the column of (R + I) with the largest diagonal.
    const xx = (m00 + 1) / 2;
    const yy = (m11 + 1) / 2;
    const zz = (m22 + 1) / 2;
    let axis: Vec3;
    if (xx >= yy && xx >= zz) {
      const x = Math.sqrt(Math.max(xx, 0));
      axis = [x, (m01 + m10) / (4 * x), (m02 + m20) / (4 * x)];
    } else if (yy >= zz) {
      const y = Math.sqrt(Math.max(yy, 0));
      axis = [(m01 + m10) / (4 * y), y, (m12 + m21) / (4 * y)];
    } else {
      const z = Math.sqrt(Math.max(zz, 0));
      axis = [(m02 + m20) / (4 * z), (m12 + m21) / (4 * z), z];
    }
    return { axis: vecNormalize(axis), angleDeg: 180 };
  }

  const denom = 2 * Math.sin(angle);
  const axis: Vec3 = [(m21 - m12) / denom, (m02 - m20) / denom, (m10 - m01) / denom];
  return { axis: vecNormalize(axis), angleDeg };
}

/**
 * Cylindrical bend patch swept by the fold. Built as a hollow tube (outer R+T,
 * inner R) along +Y, intersected with the angular wedge for the fold. For an up
 * bend the axis sits above the base (sweep from −Z toward the flange); for a down
 * bend it sits below (sweep from +Z toward the flange).
 */
function buildBendPatch(
  axisOrigin: Vec3,
  thetaDeg: number,
  r: number,
  width: number,
  thickness: number,
  direction: 'up' | 'down'
): Result<ValidSolid> {
  const outerR = r + thickness;

  const outer = cylinder(outerR, width, { at: axisOrigin, axis: [0, 1, 0] });
  let tube: Solid = outer;
  if (r > 1e-9) {
    const inner = cylinder(r, width, { at: axisOrigin, axis: [0, 1, 0] });
    const carved = cut(outer, inner);
    if (!carved.ok) return carved;
    tube = carved.value;
  }

  const wedge = buildWedge(axisOrigin, thetaDeg, outerR, width, direction);
  if (!wedge.ok) return wedge;
  return intersect(tube, wedge.value) as Result<ValidSolid>;
}

/**
 * Convex angular wedge (≤180°) isolating the fold sweep. The inner arc starts at
 * the base contact (straight down −Z for an up bend, straight up +Z for a down
 * bend) and sweeps to the flange. Built as the intersection of the +X half-space
 * through the bend axis with that half-space rotated by the fold; the tube
 * intersection trims it to the true annular sector.
 */
function buildWedge(
  axisOrigin: Vec3,
  thetaDeg: number,
  outerR: number,
  width: number,
  direction: 'up' | 'down'
): Result<Solid> {
  const span = outerR * 2 + 2;
  const margin = 1;

  const blockA = box(span, width + 2 * margin, 2 * span);
  const halfA: Solid = translate(blockA, [
    axisOrigin[0],
    axisOrigin[1] - margin,
    axisOrigin[2] - span,
  ]);

  // Up bends sweep from −Z (rotate +X start plane by +(180−θ)); down bends mirror
  // about the axis, sweeping from +Z (rotate by −(180−θ)).
  const sign = direction === 'up' ? 1 : -1;
  const halfB = rotate(halfA, sign * (180 - thetaDeg), { at: axisOrigin, axis: [0, 1, 0] });

  return intersect(halfA, halfB);
}

/** The flange flat, built lying along +X past the bend, then folded to angle θ. */
function buildFlangeFlat(
  axisOrigin: Vec3,
  thetaDeg: number,
  width: number,
  thickness: number,
  length: number,
  direction: 'up' | 'down'
): Solid {
  // Unfolded the flat is coplanar with the base sheet; for an up bend it lies in
  // Z∈[0,T] folding up (rotate −θ about +Y sends +X toward +Z); for a down bend it
  // lies in Z∈[−T,0] folding down (rotate +θ sends +X toward −Z).
  if (direction === 'up') {
    const flat = box(length, width, thickness);
    const positioned: Solid = translate(flat, [axisOrigin[0], axisOrigin[1], 0]);
    return rotate(positioned, -thetaDeg, { at: axisOrigin, axis: [0, 1, 0] });
  }
  const flat = box(length, width, thickness);
  const positioned: Solid = translate(flat, [axisOrigin[0], axisOrigin[1], -thickness]);
  return rotate(positioned, thetaDeg, { at: axisOrigin, axis: [0, 1, 0] });
}
