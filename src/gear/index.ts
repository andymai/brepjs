export {
  type GearDiagnostic,
  type GearDiagnosticCode,
  type GearDiagnosticSeverity,
  type GearGeometry,
  inv,
  involutePoint,
  cosineSpaceFlankSamples,
  adaptiveSampleCount,
  gearGeometry,
  solveWorkingPressureAngle,
  solveSunPlanetWorkingPressureAngle,
  solvePlanetRingWorkingPressureAngle,
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
