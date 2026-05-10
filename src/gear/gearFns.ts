/**
 * Public gear API — external + internal spur gears, planetary assemblies.
 *
 * @example Single external gear
 * ```typescript
 * await initOC();
 * const result = makeExternalGear({ teeth: 24, moduleSize: 2, thickness: 8, bore: 6 });
 * if (isOk(result)) writeSTEP(result.value.solid, 'gear.step');
 * ```
 *
 * @example Planetary assembly
 * ```typescript
 * const planetary = makePlanetaryGear({ thickness: 10 });   // all defaults
 * if (isOk(planetary)) {
 *   const { sun, planets, ring, contactRatio } = planetary.value;
 * }
 * ```
 */

import type { Vec3 } from '@/core/types.js';
import { type Result, ok, err, isErr } from '@/core/result.js';
import { validationError } from '@/core/errors.js';
import type { ClosedWire, PlanarWire, ValidSolid } from '@/core/shapeTypes.js';
import { makeCircle, assembleWire } from '@/topology/curveBuilders.js';
import { makeFace } from '@/topology/surfaceBuilders.js';
import { rotate, translate } from '@/topology/transformFns.js';
import { cut } from '@/topology/booleanFns.js';
import { extrude } from '@/operations/extrudeFns.js';
import { sketchCircle } from '@/sketching/cannedSketches.js';
import { sketchExtrude } from '@/sketching/sketchFns.js';
import {
  type GearDiagnostic,
  DEFAULT_CLEARANCE,
  DEFAULT_PRESSURE_ANGLE_DEG,
  backlashHalf,
  externalExternalContactRatio,
  externalInternalContactRatio,
  gearGeometry,
  lewisRootStress,
  planetSelfRotationAngle,
  ringTeeth,
  solveWorkingPressureAngle,
  undercutDeficit,
  validatePlanetary,
  workingCenterDistance,
} from './gearMath.js';
import { makeExternalGearProfileWire, makeInternalGearProfileWire } from './gearProfile.js';

// ── Public types ─────────────────────────────────────────────────────────────

export interface ExternalGearParams {
  teeth: number;
  moduleSize: number;
  thickness: number;
  pressureAngleDeg?: number;
  shift?: number;
  clearance?: number;
  /** Per-gear thinning (i.e. half of total mesh backlash); 0 = theoretical. */
  backlashHalf?: number;
  /** Diameter (mm) of central bore; 0 or omitted = no bore. */
  bore?: number;
}

export interface InternalGearParams {
  teeth: number;
  moduleSize: number;
  thickness: number;
  pressureAngleDeg?: number;
  shift?: number;
  clearance?: number;
  backlashHalf?: number;
  /** Wall thickness from pitch radius outward; defaults to 2·moduleSize. */
  ringWallThickness?: number;
}

export interface PlanetaryGearParams {
  /** Required: extrusion thickness (mm). */
  thickness: number;
  moduleSize?: number;
  sunTeeth?: number;
  planetTeeth?: number;
  numPlanets?: number;
  pressureAngleDeg?: number;
  clearance?: number;
  /** Total mesh backlash (mm); split as b/2 per gear. */
  backlash?: number;
  sunShift?: number;
  planetShift?: number;
  ringShift?: number;
  ringWallThickness?: number;
  bores?: { sun?: number; planet?: number };
  /** Applied torque (Nm). When supplied, lewisStress is computed. */
  appliedTorque?: number;
}

export interface GearResult {
  solid: ValidSolid;
  /** Pitch diameter, base diameter, etc. — useful for assembly placement. */
  pitchDiameter: number;
  baseDiameter: number;
  tipDiameter: number;
  rootDiameter: number;
}

export interface PlanetaryGearAssembly {
  sun: ValidSolid;
  planets: ValidSolid[];
  ring: ValidSolid;
  ringTeeth: number;
  /** Working pressure angle (radians) under the supplied profile shifts. */
  workingPressureAngle: number;
  /** True (working) center distance between sun and planet axes (mm). */
  centerDistance: number;
  /** Transverse contact ratios per mesh; ≥ 1.2 is industry-acceptable. */
  contactRatio: { sunPlanet: number; planetRing: number };
  /** Profile shift deficit relative to undercut threshold (positive = undercut risk). */
  undercut: { sun: number; planet: number };
  /** Lewis bending stress at root (MPa); only present when `appliedTorque` was supplied. */
  lewisStress?: { sun: number; planet: number; ring: number };
  diagnostics: GearDiagnostic[];
}

// ── Single-gear builders ─────────────────────────────────────────────────────

export function makeExternalGear(params: ExternalGearParams): Result<GearResult> {
  const {
    teeth,
    moduleSize,
    thickness,
    pressureAngleDeg = DEFAULT_PRESSURE_ANGLE_DEG,
    shift = 0,
    clearance = DEFAULT_CLEARANCE,
    backlashHalf: bHalf = 0,
    bore = 0,
  } = params;
  if (thickness <= 0)
    return err(validationError('GEAR_THICKNESS_NONPOSITIVE', 'thickness must be > 0'));

  const alpha = (pressureAngleDeg * Math.PI) / 180;
  const wireResult = makeExternalGearProfileWire({
    teeth,
    moduleSize,
    pressureAngle: alpha,
    shift,
    clearance,
    backlashHalf: bHalf,
  });
  if (isErr(wireResult)) return wireResult;
  const wire = wireResult.value;

  const geom = gearGeometry(teeth, moduleSize, alpha, shift, clearance, bHalf, false);
  return finalizeExternalSolid(wire, thickness, bore, geom);
}

export function makeInternalGear(params: InternalGearParams): Result<GearResult> {
  const {
    teeth,
    moduleSize,
    thickness,
    pressureAngleDeg = DEFAULT_PRESSURE_ANGLE_DEG,
    shift = 0,
    clearance = DEFAULT_CLEARANCE,
    backlashHalf: bHalf = 0,
    ringWallThickness = 2 * params.moduleSize,
  } = params;
  if (thickness <= 0)
    return err(validationError('GEAR_THICKNESS_NONPOSITIVE', 'thickness must be > 0'));
  if (ringWallThickness <= 0)
    return err(validationError('GEAR_WALL_NONPOSITIVE', 'ringWallThickness must be > 0'));

  const alpha = (pressureAngleDeg * Math.PI) / 180;
  const innerWireResult = makeInternalGearProfileWire({
    teeth,
    moduleSize,
    pressureAngle: alpha,
    shift,
    clearance,
    backlashHalf: bHalf,
  });
  if (isErr(innerWireResult)) return innerWireResult;

  const geom = gearGeometry(teeth, moduleSize, alpha, shift, clearance, bHalf, true);
  const outerRadius = geom.rPitch + ringWallThickness;
  const outerWireResult = makeOuterCircleWire(outerRadius);
  if (isErr(outerWireResult)) return outerWireResult;

  return finalizeInternalSolid(outerWireResult.value, innerWireResult.value, thickness, geom);
}

// ── Planetary assembly ───────────────────────────────────────────────────────

export function makePlanetaryGear(params: PlanetaryGearParams): Result<PlanetaryGearAssembly> {
  const resolved = resolvePlanetaryParams(params);
  if (isErr(resolved)) return resolved;
  const cfg = resolved.value;

  const sunResult = makeExternalGear({
    teeth: cfg.sunTeeth,
    moduleSize: cfg.moduleSize,
    thickness: cfg.thickness,
    pressureAngleDeg: cfg.pressureAngleDeg,
    shift: cfg.sunShift,
    clearance: cfg.clearance,
    backlashHalf: cfg.bHalf,
    bore: cfg.bores.sun ?? 0,
  });
  if (isErr(sunResult)) return sunResult;

  const planetResult = makeExternalGear({
    teeth: cfg.planetTeeth,
    moduleSize: cfg.moduleSize,
    thickness: cfg.thickness,
    pressureAngleDeg: cfg.pressureAngleDeg,
    shift: cfg.planetShift,
    clearance: cfg.clearance,
    backlashHalf: cfg.bHalf,
    bore: cfg.bores.planet ?? 0,
  });
  if (isErr(planetResult)) return planetResult;

  const ringResult = makeInternalGear({
    teeth: cfg.zr,
    moduleSize: cfg.moduleSize,
    thickness: cfg.thickness,
    pressureAngleDeg: cfg.pressureAngleDeg,
    shift: cfg.ringShift,
    clearance: cfg.clearance,
    backlashHalf: cfg.bHalf,
    ringWallThickness: cfg.ringWallThickness,
  });
  if (isErr(ringResult)) return ringResult;

  const planets = placePlanets(planetResult.value.solid, cfg);
  const metrics = computeMeshMetrics(cfg, sunResult.value, planetResult.value, ringResult.value);
  const diagnostics = collectDiagnostics(cfg, metrics);

  return ok({
    sun: sunResult.value.solid,
    planets,
    ring: ringResult.value.solid,
    ringTeeth: cfg.zr,
    workingPressureAngle: cfg.alphaW,
    centerDistance: cfg.centerDistance,
    contactRatio: { sunPlanet: metrics.crSunPlanet, planetRing: metrics.crPlanetRing },
    undercut: { sun: metrics.undercutSun, planet: metrics.undercutPlanet },
    ...(metrics.lewisStress ? { lewisStress: metrics.lewisStress } : {}),
    diagnostics,
  });
}

// ── Internal helpers ─────────────────────────────────────────────────────────

interface ResolvedPlanetary {
  moduleSize: number;
  sunTeeth: number;
  planetTeeth: number;
  numPlanets: number;
  pressureAngleDeg: number;
  alpha: number;
  alphaW: number;
  clearance: number;
  bHalf: number;
  sunShift: number;
  planetShift: number;
  ringShift: number;
  ringWallThickness: number;
  thickness: number;
  bores: { sun?: number; planet?: number };
  appliedTorque?: number;
  zr: number;
  centerDistance: number;
}

function resolvePlanetaryParams(params: PlanetaryGearParams): Result<ResolvedPlanetary> {
  const moduleSize = params.moduleSize ?? 3;
  const sunTeeth = params.sunTeeth ?? 15;
  const planetTeeth = params.planetTeeth ?? 12;
  const numPlanets = params.numPlanets ?? 3;
  const pressureAngleDeg = params.pressureAngleDeg ?? DEFAULT_PRESSURE_ANGLE_DEG;
  const alpha = (pressureAngleDeg * Math.PI) / 180;
  const sunShift = params.sunShift ?? 0;
  const planetShift = params.planetShift ?? 0;
  const ringShift = params.ringShift ?? 0;

  if (params.thickness <= 0)
    return err(validationError('GEAR_THICKNESS_NONPOSITIVE', 'thickness must be > 0'));

  const validation = validatePlanetary(sunTeeth, planetTeeth, numPlanets, planetShift);
  if (isErr(validation)) return validation;

  const alphaWResult = solveWorkingPressureAngle(
    alpha,
    sunShift,
    planetShift,
    sunTeeth,
    planetTeeth,
    ringShift
  );
  if (isErr(alphaWResult)) return alphaWResult;
  const alphaW = alphaWResult.value;
  const centerDistance = workingCenterDistance(sunTeeth, planetTeeth, moduleSize, alpha, alphaW);
  const zr = ringTeeth(sunTeeth, planetTeeth);

  return ok({
    moduleSize,
    sunTeeth,
    planetTeeth,
    numPlanets,
    pressureAngleDeg,
    alpha,
    alphaW,
    clearance: params.clearance ?? DEFAULT_CLEARANCE,
    bHalf: backlashHalf(params.backlash ?? 0),
    sunShift,
    planetShift,
    ringShift,
    ringWallThickness: params.ringWallThickness ?? 2 * moduleSize,
    thickness: params.thickness,
    bores: params.bores ?? {},
    ...(params.appliedTorque !== undefined ? { appliedTorque: params.appliedTorque } : {}),
    zr,
    centerDistance,
  });
}

function makeOuterCircleWire(radius: number): Result<ClosedWire & PlanarWire> {
  const circleEdge = makeCircle(radius, [0, 0, 0], [0, 0, 1]);
  const wireResult = assembleWire([circleEdge]);
  if (isErr(wireResult)) return wireResult;
  return ok(wireResult.value as ClosedWire & PlanarWire);
}

function finalizeExternalSolid(
  wire: ClosedWire & PlanarWire,
  thickness: number,
  bore: number,
  geom: ReturnType<typeof gearGeometry>
): Result<GearResult> {
  const faceResult = makeFace(wire);
  if (isErr(faceResult)) return faceResult;
  const solidResult = extrude(faceResult.value, [0, 0, thickness]);
  if (isErr(solidResult)) return solidResult;
  if (bore <= 0) return ok(buildGearResult(solidResult.value, geom));

  // Cut bore cylinder — overshoots in +Z to ensure clean through-cut on both kernels.
  const boreSolid = sketchExtrude(sketchCircle(bore / 2), thickness + 1) as ValidSolid;
  const cutResult = cut(solidResult.value, boreSolid);
  if (isErr(cutResult)) return cutResult;
  return ok(buildGearResult(cutResult.value, geom));
}

function finalizeInternalSolid(
  outerWire: ClosedWire & PlanarWire,
  innerToothedWire: ClosedWire & PlanarWire,
  thickness: number,
  geom: ReturnType<typeof gearGeometry>
): Result<GearResult> {
  const faceResult = makeFace(outerWire, [innerToothedWire]);
  if (isErr(faceResult)) return faceResult;
  const solidResult = extrude(faceResult.value, [0, 0, thickness]);
  if (isErr(solidResult)) return solidResult;
  return ok(buildGearResult(solidResult.value, geom));
}

function buildGearResult(solid: ValidSolid, geom: ReturnType<typeof gearGeometry>): GearResult {
  return {
    solid,
    pitchDiameter: 2 * geom.rPitch,
    baseDiameter: 2 * geom.rb,
    tipDiameter: 2 * geom.rTip,
    rootDiameter: 2 * geom.rRoot,
  };
}

function placePlanets(planetProto: ValidSolid, cfg: ResolvedPlanetary): ValidSolid[] {
  const planets: ValidSolid[] = [];
  for (let i = 0; i < cfg.numPlanets; i++) {
    const orbital = (i * 2 * Math.PI) / cfg.numPlanets;
    const selfRot = planetSelfRotationAngle(orbital, cfg.sunTeeth, cfg.planetTeeth);
    const rotated = rotate(planetProto, (selfRot * 180) / Math.PI);
    const offset: Vec3 = [
      cfg.centerDistance * Math.cos(orbital),
      cfg.centerDistance * Math.sin(orbital),
      0,
    ];
    planets.push(translate(rotated, offset));
  }
  return planets;
}

interface MeshMetrics {
  crSunPlanet: number;
  crPlanetRing: number;
  undercutSun: number;
  undercutPlanet: number;
  lewisStress?: { sun: number; planet: number; ring: number };
}

function computeMeshMetrics(
  cfg: ResolvedPlanetary,
  sun: GearResult,
  planet: GearResult,
  ring: GearResult
): MeshMetrics {
  const crSunPlanet = externalExternalContactRatio(
    sun.tipDiameter / 2,
    sun.baseDiameter / 2,
    planet.tipDiameter / 2,
    planet.baseDiameter / 2,
    cfg.centerDistance,
    cfg.moduleSize,
    cfg.alpha,
    cfg.alphaW
  );
  const crPlanetRing = externalInternalContactRatio(
    planet.tipDiameter / 2,
    planet.baseDiameter / 2,
    ring.tipDiameter / 2,
    ring.baseDiameter / 2,
    cfg.centerDistance,
    cfg.moduleSize,
    cfg.alpha,
    cfg.alphaW
  );
  const undercutSun = undercutDeficit(cfg.sunTeeth, cfg.alpha, cfg.sunShift);
  const undercutPlanet = undercutDeficit(cfg.planetTeeth, cfg.alpha, cfg.planetShift);

  const metrics: MeshMetrics = { crSunPlanet, crPlanetRing, undercutSun, undercutPlanet };
  if (cfg.appliedTorque !== undefined) {
    metrics.lewisStress = {
      sun: lewisRootStress(cfg.appliedTorque, cfg.moduleSize, cfg.thickness, cfg.sunTeeth),
      planet: lewisRootStress(cfg.appliedTorque, cfg.moduleSize, cfg.thickness, cfg.planetTeeth),
      ring: lewisRootStress(cfg.appliedTorque, cfg.moduleSize, cfg.thickness, cfg.zr),
    };
  }
  return metrics;
}

function collectDiagnostics(cfg: ResolvedPlanetary, metrics: MeshMetrics): GearDiagnostic[] {
  const diagnostics: GearDiagnostic[] = [];
  if (metrics.crSunPlanet < 1.2) {
    diagnostics.push({
      code: 'CONTACT_RATIO_LOW_SUN_PLANET',
      severity: 'warning',
      message: `sun-planet contact ratio ${metrics.crSunPlanet.toFixed(2)} is below 1.2 — may run unevenly`,
      context: { value: metrics.crSunPlanet },
    });
  }
  if (metrics.crPlanetRing < 1.2) {
    diagnostics.push({
      code: 'CONTACT_RATIO_LOW_PLANET_RING',
      severity: 'warning',
      message: `planet-ring contact ratio ${metrics.crPlanetRing.toFixed(2)} is below 1.2 — may run unevenly`,
      context: { value: metrics.crPlanetRing },
    });
  }
  if (metrics.undercutSun > 0) {
    diagnostics.push({
      code: 'UNDERCUT_RISK_SUN',
      severity: 'warning',
      message: `sun gear is undercut: increase sunShift by ${metrics.undercutSun.toFixed(3)} to avoid`,
      context: { deficit: metrics.undercutSun, sunTeeth: cfg.sunTeeth },
    });
  }
  if (metrics.undercutPlanet > 0) {
    diagnostics.push({
      code: 'UNDERCUT_RISK_PLANET',
      severity: 'warning',
      message: `planet gear is undercut: increase planetShift by ${metrics.undercutPlanet.toFixed(3)} to avoid`,
      context: { deficit: metrics.undercutPlanet, planetTeeth: cfg.planetTeeth },
    });
  }
  if (cfg.sunShift !== 0 || cfg.planetShift !== 0) {
    diagnostics.push({
      code: 'LEWIS_Y_SHIFT_UNCORRECTED',
      severity: 'info',
      message:
        'Lewis stress uses unshifted Y(z) approximation; expect ±5% per 0.1 of profile shift',
    });
  }
  return diagnostics;
}
