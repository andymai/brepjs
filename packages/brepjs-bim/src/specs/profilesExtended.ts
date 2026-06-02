import {
  polygon,
  addHoles,
  outerWire,
  isClosedWire,
  isPlanarWire,
} from 'brepjs';
import type {
  OrientedFace,
  PlanarFace,
  ClosedWire,
  PlanarWire,
  Result,
} from 'brepjs';
import { ok, err } from 'brepjs';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError, geometryError } from '../errors/bimError.js';

// Extended cross-section profiles, additive to the core Profile union in
// profile.ts (which only covers RECTANGULAR/CIRCULAR/I_BEAM). All dimensions in
// mm. Each profile lives in the local XY plane (z = 0); the consuming element
// extrudes it along its own axis.
//
// Geometry is materialised as a brepjs planar OrientedFace via
// extendedProfileToFace(); hollow/void profiles use addHoles() to subtract
// inner loops. The matching IfcXxxProfileDef is emitted by
// ifc-writer/profileDefWriter.ts.

export type Pt2 = readonly [number, number];

export interface LShapeProfile {
  readonly kind: 'L_SHAPE';
  readonly depth: number; // overall height (Y)
  readonly width: number; // overall width (X)
  readonly legThickness: number; // thickness of both legs
  readonly filletRadius?: number | undefined;
}

export interface TShapeProfile {
  readonly kind: 'T_SHAPE';
  readonly depth: number;
  readonly flangeWidth: number;
  readonly webThickness: number;
  readonly flangeThickness: number;
  readonly filletRadius?: number | undefined;
}

export interface UShapeProfile {
  readonly kind: 'U_SHAPE';
  readonly depth: number;
  readonly flangeWidth: number;
  readonly webThickness: number;
  readonly flangeThickness: number;
}

export interface ZShapeProfile {
  readonly kind: 'Z_SHAPE';
  readonly depth: number;
  readonly flangeWidth: number;
  readonly webThickness: number;
  readonly flangeThickness: number;
}

export interface CShapeProfile {
  readonly kind: 'C_SHAPE';
  readonly depth: number;
  readonly width: number;
  readonly wallThickness: number;
  readonly girth: number; // lip return length
  readonly internalFilletRadius?: number | undefined;
}

export interface AsymmetricIShapeProfile {
  readonly kind: 'ASYMMETRIC_I';
  readonly overallDepth: number;
  readonly webThickness: number;
  readonly topFlangeWidth: number;
  readonly topFlangeThickness: number;
  readonly bottomFlangeWidth: number;
  readonly bottomFlangeThickness: number;
}

export interface EllipseProfile {
  readonly kind: 'ELLIPSE';
  readonly semiAxis1: number; // X half-axis
  readonly semiAxis2: number; // Y half-axis
}

export interface TrapeziumProfile {
  readonly kind: 'TRAPEZIUM';
  readonly bottomXDim: number;
  readonly topXDim: number;
  readonly yDim: number;
  readonly topXOffset: number; // horizontal offset of the top edge
}

export interface RectangleHollowProfile {
  readonly kind: 'RECTANGLE_HOLLOW';
  readonly xDim: number;
  readonly yDim: number;
  readonly wallThickness: number;
  readonly innerFilletRadius?: number | undefined;
  readonly outerFilletRadius?: number | undefined;
}

export interface CircleHollowProfile {
  readonly kind: 'CIRCLE_HOLLOW';
  readonly radius: number;
  readonly wallThickness: number;
}

export interface ArbitraryClosedProfile {
  readonly kind: 'ARBITRARY_CLOSED';
  readonly points: ReadonlyArray<Pt2>;
}

export interface ArbitraryProfileWithVoids {
  readonly kind: 'ARBITRARY_WITH_VOIDS';
  readonly outerPoints: ReadonlyArray<Pt2>;
  readonly voids: ReadonlyArray<ReadonlyArray<Pt2>>;
}

export type ExtendedProfile =
  | LShapeProfile
  | TShapeProfile
  | UShapeProfile
  | ZShapeProfile
  | CShapeProfile
  | AsymmetricIShapeProfile
  | EllipseProfile
  | TrapeziumProfile
  | RectangleHollowProfile
  | CircleHollowProfile
  | ArbitraryClosedProfile
  | ArbitraryProfileWithVoids;

// Default tessellation segment count for elliptical/circular outlines. Higher
// than the core CIRCULAR profile's 32 so curved structural sections stay smooth.
const ELLIPSE_SEGMENTS = 48;

// Analytical cross-section area (mm²) of an extended profile. For tessellated
// curved profiles (ELLIPSE, CIRCLE_HOLLOW) this returns the exact closed-form
// area, not the polygon approximation.
export function extendedProfileArea(profile: ExtendedProfile): number {
  switch (profile.kind) {
    case 'L_SHAPE':
      return (
        profile.depth * profile.legThickness +
        (profile.width - profile.legThickness) * profile.legThickness
      );
    case 'T_SHAPE': {
      const flangeArea = profile.flangeWidth * profile.flangeThickness;
      const webArea =
        (profile.depth - profile.flangeThickness) * profile.webThickness;
      return flangeArea + webArea;
    }
    case 'U_SHAPE': {
      const flangeArea =
        2 * (profile.flangeWidth - profile.webThickness) * profile.flangeThickness;
      const webArea = profile.depth * profile.webThickness;
      return flangeArea + webArea;
    }
    case 'Z_SHAPE': {
      // The Z geometry builder extends each flange only (flangeWidth-web)/2 from
      // the centred web, so total flange area is (flangeWidth-web)*flangeThickness
      // (half the U-channel's), plus the full web. Matches the drawn polygon.
      const flangeArea = (profile.flangeWidth - profile.webThickness) * profile.flangeThickness;
      const webArea = profile.depth * profile.webThickness;
      return flangeArea + webArea;
    }
    case 'C_SHAPE': {
      // Lipped-channel area = sum of web + 2 flanges + 2 lips with single-counted
      // corners: depth + 2*width + 2*girth - 4*t (thin-wall, one t^2 correction
      // per the 4 internal corners). Verified against the drawn polygon (shoelace).
      const t = profile.wallThickness;
      const perimeter =
        profile.depth + 2 * profile.width + 2 * profile.girth - 4 * t;
      return perimeter * t;
    }
    case 'ASYMMETRIC_I': {
      const webHeight =
        profile.overallDepth -
        profile.topFlangeThickness -
        profile.bottomFlangeThickness;
      return (
        profile.topFlangeWidth * profile.topFlangeThickness +
        profile.bottomFlangeWidth * profile.bottomFlangeThickness +
        webHeight * profile.webThickness
      );
    }
    case 'ELLIPSE':
      return Math.PI * profile.semiAxis1 * profile.semiAxis2;
    case 'TRAPEZIUM':
      return ((profile.bottomXDim + profile.topXDim) / 2) * profile.yDim;
    case 'RECTANGLE_HOLLOW': {
      const inner =
        (profile.xDim - 2 * profile.wallThickness) *
        (profile.yDim - 2 * profile.wallThickness);
      return profile.xDim * profile.yDim - inner;
    }
    case 'CIRCLE_HOLLOW': {
      const innerR = profile.radius - profile.wallThickness;
      return Math.PI * (profile.radius * profile.radius - innerR * innerR);
    }
    case 'ARBITRARY_CLOSED':
      return polygonArea(profile.points);
    case 'ARBITRARY_WITH_VOIDS': {
      const voidArea = profile.voids.reduce((acc, v) => acc + polygonArea(v), 0);
      return polygonArea(profile.outerPoints) - voidArea;
    }
  }
}

// Shoelace formula; returns the absolute (unsigned) polygon area.
function polygonArea(points: ReadonlyArray<Pt2>): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a === undefined || b === undefined) continue;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

// Outer outline (2D points, z=0) for the given profile, centred on the local
// origin. Hollow/void profiles expose their inner loops via holeLoops().
function outerLoop(profile: ExtendedProfile): ReadonlyArray<Pt2> {
  switch (profile.kind) {
    case 'L_SHAPE': {
      const halfW = profile.width / 2;
      const halfD = profile.depth / 2;
      const t = profile.legThickness;
      // L sitting in the bottom-left, traced counter-clockwise.
      return [
        [-halfW, -halfD],
        [halfW, -halfD],
        [halfW, -halfD + t],
        [-halfW + t, -halfD + t],
        [-halfW + t, halfD],
        [-halfW, halfD],
      ];
    }
    case 'T_SHAPE': {
      const halfFw = profile.flangeWidth / 2;
      const halfD = profile.depth / 2;
      const halfWeb = profile.webThickness / 2;
      const flangeInnerY = halfD - profile.flangeThickness;
      return [
        [-halfWeb, -halfD],
        [halfWeb, -halfD],
        [halfWeb, flangeInnerY],
        [halfFw, flangeInnerY],
        [halfFw, halfD],
        [-halfFw, halfD],
        [-halfFw, flangeInnerY],
        [-halfWeb, flangeInnerY],
      ];
    }
    case 'U_SHAPE': {
      const halfFw = profile.flangeWidth / 2;
      const halfD = profile.depth / 2;
      const t = profile.webThickness;
      const ft = profile.flangeThickness;
      // Channel opening towards +X (web on the left).
      return [
        [-halfFw, -halfD],
        [halfFw, -halfD],
        [halfFw, -halfD + ft],
        [-halfFw + t, -halfD + ft],
        [-halfFw + t, halfD - ft],
        [halfFw, halfD - ft],
        [halfFw, halfD],
        [-halfFw, halfD],
      ];
    }
    case 'Z_SHAPE': {
      const halfFw = profile.flangeWidth / 2;
      const halfD = profile.depth / 2;
      const halfWeb = profile.webThickness / 2;
      const ft = profile.flangeThickness;
      // Bottom flange extends to -X, top flange to +X, web centred.
      return [
        [-halfFw, -halfD],
        [halfWeb, -halfD],
        [halfWeb, halfD - ft],
        [halfFw, halfD - ft],
        [halfFw, halfD],
        [-halfWeb, halfD],
        [-halfWeb, -halfD + ft],
        [-halfFw, -halfD + ft],
      ];
    }
    case 'C_SHAPE': {
      const halfW = profile.width / 2;
      const halfD = profile.depth / 2;
      const t = profile.wallThickness;
      const g = profile.girth;
      // Lipped channel opening towards +X. Outer boundary traced CCW, then the
      // inner return as a single continuous loop (the lips create the C gap).
      return [
        [-halfW, -halfD],
        [halfW, -halfD],
        [halfW, -halfD + g],
        [halfW - t, -halfD + g],
        [halfW - t, -halfD + t],
        [-halfW + t, -halfD + t],
        [-halfW + t, halfD - t],
        [halfW - t, halfD - t],
        [halfW - t, halfD - g],
        [halfW, halfD - g],
        [halfW, halfD],
        [-halfW, halfD],
      ];
    }
    case 'ASYMMETRIC_I': {
      const halfTop = profile.topFlangeWidth / 2;
      const halfBot = profile.bottomFlangeWidth / 2;
      const halfWeb = profile.webThickness / 2;
      const halfD = profile.overallDepth / 2;
      const topInnerY = halfD - profile.topFlangeThickness;
      const botInnerY = -halfD + profile.bottomFlangeThickness;
      return [
        [-halfBot, -halfD],
        [halfBot, -halfD],
        [halfBot, botInnerY],
        [halfWeb, botInnerY],
        [halfWeb, topInnerY],
        [halfTop, topInnerY],
        [halfTop, halfD],
        [-halfTop, halfD],
        [-halfTop, topInnerY],
        [-halfWeb, topInnerY],
        [-halfWeb, botInnerY],
        [-halfBot, botInnerY],
      ];
    }
    case 'ELLIPSE':
      return ellipsePoints(profile.semiAxis1, profile.semiAxis2);
    case 'TRAPEZIUM': {
      const halfB = profile.bottomXDim / 2;
      const halfY = profile.yDim / 2;
      const topLeft = -profile.topXDim / 2 + profile.topXOffset;
      const topRight = profile.topXDim / 2 + profile.topXOffset;
      return [
        [-halfB, -halfY],
        [halfB, -halfY],
        [topRight, halfY],
        [topLeft, halfY],
      ];
    }
    case 'RECTANGLE_HOLLOW': {
      const halfX = profile.xDim / 2;
      const halfY = profile.yDim / 2;
      return [
        [-halfX, -halfY],
        [halfX, -halfY],
        [halfX, halfY],
        [-halfX, halfY],
      ];
    }
    case 'CIRCLE_HOLLOW':
      return ellipsePoints(profile.radius, profile.radius);
    case 'ARBITRARY_CLOSED':
      return profile.points;
    case 'ARBITRARY_WITH_VOIDS':
      return profile.outerPoints;
  }
}

// Inner loops (voids) for hollow/void profiles; empty for solid profiles.
function holeLoops(profile: ExtendedProfile): ReadonlyArray<ReadonlyArray<Pt2>> {
  switch (profile.kind) {
    case 'RECTANGLE_HOLLOW': {
      const halfX = profile.xDim / 2 - profile.wallThickness;
      const halfY = profile.yDim / 2 - profile.wallThickness;
      return [
        [
          [-halfX, -halfY],
          [halfX, -halfY],
          [halfX, halfY],
          [-halfX, halfY],
        ],
      ];
    }
    case 'CIRCLE_HOLLOW': {
      const innerR = profile.radius - profile.wallThickness;
      return [ellipsePoints(innerR, innerR)];
    }
    case 'ARBITRARY_WITH_VOIDS':
      return profile.voids;
    default:
      return [];
  }
}

function ellipsePoints(a: number, b: number): ReadonlyArray<Pt2> {
  const pts: Pt2[] = [];
  for (let i = 0; i < ELLIPSE_SEGMENTS; i++) {
    const theta = (2 * Math.PI * i) / ELLIPSE_SEGMENTS;
    pts.push([a * Math.cos(theta), b * Math.sin(theta)]);
  }
  return pts;
}

// Geometric feasibility guard. Returns a BimError when the profile cannot
// produce a valid non-degenerate face.
function validateProfile(profile: ExtendedProfile): BimError | null {
  switch (profile.kind) {
    case 'L_SHAPE':
      if (profile.legThickness >= profile.width || profile.legThickness >= profile.depth) {
        return specError('INVALID_PROFILE', 'L_SHAPE legThickness must be smaller than width and depth');
      }
      return null;
    case 'T_SHAPE':
      if (profile.flangeThickness >= profile.depth) {
        return specError('INVALID_PROFILE', 'T_SHAPE flangeThickness must be less than depth');
      }
      if (profile.webThickness >= profile.flangeWidth) {
        return specError('INVALID_PROFILE', 'T_SHAPE webThickness must be less than flangeWidth');
      }
      return null;
    case 'U_SHAPE':
    case 'Z_SHAPE':
      if (2 * profile.flangeThickness >= profile.depth) {
        return specError('INVALID_PROFILE', `${profile.kind} flangeThickness × 2 must be less than depth`);
      }
      if (profile.webThickness >= profile.flangeWidth) {
        return specError('INVALID_PROFILE', `${profile.kind} webThickness must be less than flangeWidth`);
      }
      return null;
    case 'C_SHAPE':
      if (2 * profile.wallThickness >= profile.width || 2 * profile.wallThickness >= profile.depth) {
        return specError('INVALID_PROFILE', 'C_SHAPE wallThickness × 2 must be less than width and depth');
      }
      if (profile.girth >= profile.depth / 2 || profile.girth <= profile.wallThickness) {
        return specError('INVALID_PROFILE', 'C_SHAPE girth must exceed wallThickness and be less than depth/2');
      }
      return null;
    case 'ASYMMETRIC_I':
      if (profile.topFlangeThickness + profile.bottomFlangeThickness >= profile.overallDepth) {
        return specError('INVALID_PROFILE', 'ASYMMETRIC_I flange thicknesses must sum to less than overallDepth');
      }
      if (profile.webThickness >= profile.topFlangeWidth || profile.webThickness >= profile.bottomFlangeWidth) {
        return specError('INVALID_PROFILE', 'ASYMMETRIC_I webThickness must be less than both flange widths');
      }
      return null;
    case 'ELLIPSE':
      if (profile.semiAxis1 <= 0 || profile.semiAxis2 <= 0) {
        return specError('INVALID_PROFILE', 'ELLIPSE semi-axes must be positive');
      }
      return null;
    case 'TRAPEZIUM':
      if (profile.bottomXDim <= 0 || profile.topXDim <= 0 || profile.yDim <= 0) {
        return specError('INVALID_PROFILE', 'TRAPEZIUM dimensions must be positive');
      }
      return null;
    case 'RECTANGLE_HOLLOW':
      if (2 * profile.wallThickness >= profile.xDim || 2 * profile.wallThickness >= profile.yDim) {
        return specError('INVALID_PROFILE', 'RECTANGLE_HOLLOW wallThickness × 2 must be less than xDim and yDim');
      }
      return null;
    case 'CIRCLE_HOLLOW':
      if (profile.wallThickness >= profile.radius) {
        return specError('INVALID_PROFILE', 'CIRCLE_HOLLOW wallThickness must be less than radius');
      }
      return null;
    case 'ARBITRARY_CLOSED':
      if (profile.points.length < 3) {
        return specError('INVALID_PROFILE', 'ARBITRARY_CLOSED requires at least three points');
      }
      return null;
    case 'ARBITRARY_WITH_VOIDS':
      if (profile.outerPoints.length < 3) {
        return specError('INVALID_PROFILE', 'ARBITRARY_WITH_VOIDS outer loop requires at least three points');
      }
      if (profile.voids.some((v) => v.length < 3)) {
        return specError('INVALID_PROFILE', 'ARBITRARY_WITH_VOIDS each void requires at least three points');
      }
      return null;
  }
}

function to3D(points: ReadonlyArray<Pt2>): Array<[number, number, number]> {
  return points.map(([x, y]) => [x, y, 0]);
}

// Build a planar OrientedFace for the profile in the local XY plane. Hollow and
// void profiles subtract their inner loops via addHoles(). The caller owns the
// returned face and must dispose it (use `using`).
export function extendedProfileToFace(
  profile: ExtendedProfile
): Result<OrientedFace & PlanarFace, BimError> {
  const invalid = validateProfile(profile);
  if (invalid !== null) {
    return err(invalid);
  }

  const outerResult = polygon(to3D(outerLoop(profile)));
  if (!outerResult.ok) {
    return err(
      fromBrepError(outerResult.error, 'PROFILE_FACE_FAILED', 'Failed to build profile outer face')
    );
  }

  const holes = holeLoops(profile);
  if (holes.length === 0) {
    return ok(outerResult.value);
  }

  using outerFace = outerResult.value;
  // Each hole polygon is built as a face only to extract its closed boundary wire.
  // The faces (and thus the wires, which are sub-shapes of them) MUST stay alive
  // until addHoles() has consumed the wires, then are disposed together — disposing
  // each face inside the loop would invalidate the wire used later (use-after-free).
  const holeFaces: Array<OrientedFace & PlanarFace> = [];
  const holeWires: Array<ClosedWire & PlanarWire> = [];
  const disposeHoleFaces = (): void => {
    for (const f of holeFaces) f[Symbol.dispose]();
  };
  for (const loop of holes) {
    const holeFaceResult = polygon(to3D(loop));
    if (!holeFaceResult.ok) {
      disposeHoleFaces();
      return err(
        fromBrepError(holeFaceResult.error, 'PROFILE_HOLE_FAILED', 'Failed to build profile hole loop')
      );
    }
    const holeFace = holeFaceResult.value;
    holeFaces.push(holeFace);
    const wire = outerWire(holeFace);
    if (!isClosedWire(wire) || !isPlanarWire(wire)) {
      disposeHoleFaces();
      return err(geometryError('PROFILE_HOLE_WIRE_INVALID', 'Profile hole wire is not a closed planar wire'));
    }
    holeWires.push(wire);
  }

  const faceWithHoles = addHoles(outerFace, holeWires);
  disposeHoleFaces();
  return ok(faceWithHoles);
}
