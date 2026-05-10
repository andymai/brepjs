/**
 * Gear module — involute spur gears and planetary assemblies.
 */

export {
  type GearDiagnostic,
  type GearDiagnosticSeverity,
  type GearGeometry,
  inv,
  involutePoint,
  cosineSpaceFlankSamples,
  adaptiveSampleCount,
  adaptiveBSplineTolerance,
  gearGeometry,
  solveWorkingPressureAngle,
  workingCenterDistance,
  validatePlanetary,
  externalExternalContactRatio,
  externalInternalContactRatio,
  undercutMinimumShift,
  undercutDeficit,
  lewisYFactor,
  lewisRootStress,
  ringTeeth,
  evenToothPhaseOffset,
  planetSelfRotationAngle,
} from './gearMath.js';

export {
  type GearWireParams,
  makeExternalGearProfileWire,
  makeInternalGearProfileWire,
} from './gearProfile.js';

export {
  type ExternalGearParams,
  type InternalGearParams,
  type PlanetaryGearParams,
  type GearResult,
  type PlanetaryGearAssembly,
  makeExternalGear,
  makeInternalGear,
  makePlanetaryGear,
} from './gearFns.js';
