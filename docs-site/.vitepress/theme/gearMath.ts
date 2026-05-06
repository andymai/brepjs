// Involute spur-gear path generation for the home-page hero animation.
//
// Geometry follows the standard 20°-pressure-angle convention:
//   pitch radius   rPitch = m·Z/2
//   tip radius     rTip   = rPitch + m   (external) | rPitch − m   (internal)
//   root radius    rRoot  = rPitch − 1.25m (external) | rPitch + 1.25m (internal)
//   base radius    rBase  = rPitch · cos(α)            (involute starts here)
//
// inv(α) = tan(α) − α is the *involute function*: the polar offset of an
// involute point from its base point on the base circle, where α is the
// pressure angle at the chosen radius (α = arccos(rb / r)).
//
// External tooth flank: involute span [rBase, rTip].
// Internal tooth flank: involute span [rTip, rRoot] — the tooth widens toward
// the tip because inv(α) grows monotonically with r and rTip < rRoot.

const TAU = Math.PI * 2;
const PRESSURE_ANGLE = (20 * Math.PI) / 180;
const inv = (a: number): number => Math.tan(a) - a;

export type Pt = { x: number; y: number };
export type GearMode = 'brep' | 'mesh';

export type GearGeom = {
  Z: number;
  m: number;
  internal: boolean;
  rPitch: number;
  rTip: number;
  rRoot: number;
  rBase: number;
};

export const gearGeom = (Z: number, m: number, internal = false): GearGeom => {
  const rPitch = (m * Z) / 2;
  return {
    Z,
    m,
    internal,
    rPitch,
    rTip: internal ? rPitch - m : rPitch + m,
    rRoot: internal ? rPitch + 1.25 * m : rPitch - 1.25 * m,
    rBase: rPitch * Math.cos(PRESSURE_ANGLE),
  };
};

const polar = (r: number, theta: number): Pt => ({
  x: r * Math.cos(theta),
  y: r * Math.sin(theta),
});

const fmt = (n: number): string => n.toFixed(2);

// Sample one involute flank between two radii (rStart → rEnd).
//
//   baseAngle = polar angle on the base circle where the involute originates
//               (offset 0 at r=rBase)
//   side      = +1 or −1 — whether polar offset accumulates CCW or CW with r
//   nSegs     = number of polyline segments (1 = endpoints only)
const involutePolyline = (
  rBase: number,
  rStart: number,
  rEnd: number,
  baseAngle: number,
  side: 1 | -1,
  nSegs: number,
): Pt[] => {
  const pts: Pt[] = [];
  for (let i = 0; i <= nSegs; i++) {
    const f = i / nSegs;
    const r = rStart + (rEnd - rStart) * f;
    const alpha = r > rBase ? Math.acos(Math.min(1, rBase / r)) : 0;
    pts.push(polar(r, baseAngle + side * inv(alpha)));
  }
  return pts;
};

const arcPolyline = (r: number, a0: number, a1: number, nSegs: number): Pt[] => {
  const pts: Pt[] = [];
  for (let i = 0; i <= nSegs; i++) {
    const f = i / nSegs;
    pts.push(polar(r, a0 + (a1 - a0) * f));
  }
  return pts;
};

// Build the gear silhouette path centered at the origin, tooth 0 centered on
// the +x axis (polar angle 0).
//
// Path topology per tooth (mode-independent):
//   1. trailing flank: outer → inner   (rooted edge → tip-side edge)
//   2. tip arc       : inner → inner   (across the top of the tooth)
//   3. leading flank : inner → outer   (tip-side edge → rooted edge)
//   4. root arc      : outer → outer   (across the gap to next tooth)
//
// "Outer" and "inner" here mean *farther from the base circle* and *closer*,
// respectively — which corresponds to rTip / rBase for external gears and
// rRoot / rTip for internal gears.
//
// In B-Rep mode, flanks are quadratic Béziers (control point at the involute
// midpoint sample) and arcs are SVG `A` commands.
//
// In mesh mode, every primitive is a polyline; the segment counts are tuned
// so the polygon corners are visible at hero scale (~400 px canvas).
export const gearPath = (g: GearGeom, mode: GearMode): string => {
  const { Z, internal, rTip, rBase, rRoot } = g;
  const stepAngle = TAU / Z;
  const halfTooth = stepAngle / 4;
  const invPitch = inv(PRESSURE_ANGLE);

  // For external: flank goes between [rBase, rTip], "outer" = rTip.
  // For internal: flank goes between [rTip, rRoot], "outer" = rRoot.
  const rOuter = internal ? rRoot : rTip;
  const rInner = internal ? rTip : rBase;
  // tip-side radius is rTip in both cases; the difference is which end is
  // anchored on the involute curve — for external the tip is the outer end of
  // the flank, for internal the tip is the inner end.
  const flankStart = internal ? rOuter : rInner; // path sweeps start → tipSide → tipSide → start
  const flankEnd = internal ? rInner : rOuter;

  const flankSegs = mode === 'brep' ? 6 : 2;
  const tipArcSegs = mode === 'brep' ? 6 : 2;
  const rootArcSegs = mode === 'brep' ? 6 : 2;

  const cmds: string[] = [];

  // Helper: polar angle on base circle for the right flank of tooth k
  // (such that at r=rPitch, the flank lies at angle (k·stepAngle − halfTooth)).
  const baseRight = (k: number): number => k * stepAngle - halfTooth + invPitch;
  const baseLeft = (k: number): number => k * stepAngle + halfTooth - invPitch;

  for (let k = 0; k < Z; k++) {
    const right = involutePolyline(rBase, flankStart, flankEnd, baseRight(k), -1, flankSegs);
    const left = involutePolyline(rBase, flankEnd, flankStart, baseLeft(k), 1, flankSegs);

    if (k === 0) cmds.push(`M ${fmt(right[0]!.x)} ${fmt(right[0]!.y)}`);

    // 1. trailing flank (root area → tip area)
    if (mode === 'brep') {
      const mid = right[Math.floor(flankSegs / 2)]!;
      const end = right[flankSegs]!;
      cmds.push(`Q ${fmt(mid.x)} ${fmt(mid.y)} ${fmt(end.x)} ${fmt(end.y)}`);
    } else {
      for (let i = 1; i <= flankSegs; i++) {
        const p = right[i]!;
        cmds.push(`L ${fmt(p.x)} ${fmt(p.y)}`);
      }
    }

    // 2. tip arc (across the top of tooth k, at radius rTip)
    const tipR = right[flankSegs]!;
    const tipL = left[0]!;
    if (mode === 'brep') {
      // Both gear types: short arc, CCW from right-tip to left-tip.
      cmds.push(`A ${fmt(rTip)} ${fmt(rTip)} 0 0 1 ${fmt(tipL.x)} ${fmt(tipL.y)}`);
    } else {
      const a0 = Math.atan2(tipR.y, tipR.x);
      const a1raw = Math.atan2(tipL.y, tipL.x);
      let a1 = a1raw;
      while (a1 < a0) a1 += TAU;
      const pts = arcPolyline(rTip, a0, a1, tipArcSegs);
      for (let i = 1; i < pts.length; i++) {
        cmds.push(`L ${fmt(pts[i]!.x)} ${fmt(pts[i]!.y)}`);
      }
    }

    // 3. leading flank (tip area → root area)
    if (mode === 'brep') {
      const mid = left[Math.floor(flankSegs / 2)]!;
      const end = left[flankSegs]!;
      cmds.push(`Q ${fmt(mid.x)} ${fmt(mid.y)} ${fmt(end.x)} ${fmt(end.y)}`);
    } else {
      for (let i = 1; i <= flankSegs; i++) {
        const p = left[i]!;
        cmds.push(`L ${fmt(p.x)} ${fmt(p.y)}`);
      }
    }

    // 4. root arc (across the gap to the next tooth's trailing flank).
    // Radius: rBase for external (small inaccuracy: real root is at rRoot,
    // slightly inside, joined by a fillet — visually negligible at hero scale).
    // For internal, rRoot is the actual gap-bottom radius.
    const rootR = internal ? rRoot : rBase;
    const endLeft = left[flankSegs]!;
    const nextRight = involutePolyline(
      rBase,
      flankStart,
      flankEnd,
      baseRight((k + 1) % Z),
      -1,
      1,
    )[0]!;
    if (mode === 'brep') {
      // CCW arc; for external, large=0 sweep=1 (short, CCW). For internal,
      // the gap is small and the same flags work.
      cmds.push(
        `A ${fmt(rootR)} ${fmt(rootR)} 0 0 1 ${fmt(nextRight.x)} ${fmt(nextRight.y)}`,
      );
    } else {
      const a0 = Math.atan2(endLeft.y, endLeft.x);
      let a1 = Math.atan2(nextRight.y, nextRight.x);
      while (a1 < a0) a1 += TAU;
      const pts = arcPolyline(rootR, a0, a1, rootArcSegs);
      for (let i = 1; i < pts.length; i++) {
        cmds.push(`L ${fmt(pts[i]!.x)} ${fmt(pts[i]!.y)}`);
      }
    }
  }

  cmds.push('Z');
  return cmds.join(' ');
};

// Outline of one ring-tooth slot, as a wedge from the rim down through the
// tooth flanks and tip. Used as a *mask cut-out* during the build phase: when
// rendered into a black-on-white mask, painting this wedge black "carves" one
// slot out of the smooth-bore cover, exposing the toothed ring below.
//
// Positioned in the gear's local frame; tooth k centered at angle k·(2π/Z).
export const ringSlotPath = (g: GearGeom, k: number, rimRadius: number): string => {
  const { Z, rTip, rRoot, rBase } = g;
  const stepAngle = TAU / Z;
  const center = k * stepAngle;
  const halfTooth = stepAngle / 4;
  const invPitch = inv(PRESSURE_ANGLE);

  const baseR = center - halfTooth + invPitch;
  const baseL = center + halfTooth - invPitch;

  // Internal-gear flank: rTip → rRoot, sampled along the involute.
  const right = involutePolyline(rBase, rRoot, rTip, baseR, -1, 6);
  const left = involutePolyline(rBase, rTip, rRoot, baseL, 1, 6);

  const tipR = right[6]!;
  const tipL = left[0]!;
  const rootR = right[0]!;
  const rootL = left[6]!;

  const a0 = Math.atan2(rootR.y, rootR.x);
  const a1 = Math.atan2(rootL.y, rootL.x);
  const wedgeStart = polar(rimRadius, a0);
  const wedgeEnd = polar(rimRadius, a1);

  const cmds: string[] = [];
  cmds.push(`M ${fmt(wedgeStart.x)} ${fmt(wedgeStart.y)}`);
  // Rim → root-right
  cmds.push(`L ${fmt(rootR.x)} ${fmt(rootR.y)}`);
  // Right flank: root → tip
  const rMid = right[3]!;
  cmds.push(`Q ${fmt(rMid.x)} ${fmt(rMid.y)} ${fmt(tipR.x)} ${fmt(tipR.y)}`);
  // Tip arc
  cmds.push(`A ${fmt(rTip)} ${fmt(rTip)} 0 0 1 ${fmt(tipL.x)} ${fmt(tipL.y)}`);
  // Left flank: tip → root
  const lMid = left[3]!;
  cmds.push(`Q ${fmt(lMid.x)} ${fmt(lMid.y)} ${fmt(rootL.x)} ${fmt(rootL.y)}`);
  // Root → rim
  cmds.push(`L ${fmt(wedgeEnd.x)} ${fmt(wedgeEnd.y)}`);
  // Close along the rim (short way, CW since a1 > a0 for CCW slots).
  cmds.push(`A ${fmt(rimRadius)} ${fmt(rimRadius)} 0 0 0 ${fmt(wedgeStart.x)} ${fmt(wedgeStart.y)}`);
  cmds.push('Z');
  return cmds.join(' ');
};

// Locked planetary configuration.
// Zs/Zp/Zr = 18/12/42 satisfies all three constraints simultaneously:
//   1. module match:        Zr = Zs + 2·Zp           (42 = 18 + 24)  ✓
//   2. assembly condition:  (Zs + Zr) / N = integer  (60 / 3 = 20)   ✓
//   3. equal phase mesh:    Zs / N and Zr / N integer (6, 14)        ✓
// (3) is what lets all three planets share an identical body phase.
export const PLANET_COUNT = 3;
export const Z_SUN = 18;
export const Z_PLANET = 12;
export const Z_RING = 42;
export const MODULE = 7.5;

// Planetary kinematics with the ring fixed:
//   ω_carrier  = ω_sun · Z_sun / (Z_sun + Z_ring)        = +0.30·ω_sun
//   ω_planet_in_ring_frame = ω_carrier − ω_sun · Zs/Zp   = −1.20·ω_sun
export const RATE_CARRIER_PER_SUN = Z_SUN / (Z_SUN + Z_RING);
export const RATE_PLANET_PER_SUN = RATE_CARRIER_PER_SUN - Z_SUN / Z_PLANET;

// Initial body phase (radians) for every gear at the start of the settle.
// Half a tooth pitch on the planet — places a planet gap at planet-frame
// 180° (inner contact toward sun) AND at planet-frame 0° (outer contact
// toward ring) simultaneously, satisfying both meshes at t=0.
export const PLANET_INITIAL_PHASE = Math.PI / Z_PLANET;
