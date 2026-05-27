export { BimModel } from './model/bimModel.js';
export { toIfc } from './serialize/toIfc.js';
export { parseWallSpec } from './specs/wallSpec.js';
export { parseSlabSpec } from './specs/slabSpec.js';
export { parseBeamSpec } from './specs/beamSpec.js';
export { parseColumnSpec } from './specs/columnSpec.js';
export { parseProfile } from './specs/profile.js';
export { parseDoorSpec, parseWindowSpec, parseSlabOpeningInput } from './specs/openingSpec.js';
export { newIfcGuid, isValidIfcGuid } from './identity/ifcGuid.js';
export { makeLocalIdCounter } from './identity/localId.js';
export { DEFAULT_UNITS, toLengthMm, toIfcLengthM } from './units/units.js';
export { specError, ifcError, geometryError, fromBrepError } from './errors/bimError.js';

export type { WallSpec } from './specs/wallSpec.js';
export type { SlabSpec, SlabPredefinedType } from './specs/slabSpec.js';
export type { BeamSpec, BeamPredefinedType } from './specs/beamSpec.js';
export type { ColumnSpec, ColumnPredefinedType } from './specs/columnSpec.js';
export type {
  Profile,
  RectangularProfile,
  CircularProfile,
  IShapeProfile,
} from './specs/profile.js';
export type { DoorSpec, WindowSpec, SlabOpeningInput } from './specs/openingSpec.js';
export type { ProjectSpec, SiteSpec, BuildingSpec, StoreySpec } from './specs/spatialSpec.js';
export type { BimCategory, BimElement, AnyBimElement, OpeningSpec, WallOpeningSpec, SlabOpeningSpec } from './types/bimTypes.js';
export { isWallOpening, isSlabOpening } from './types/bimTypes.js';
export type { BimRelationship, VoidsWallRel, VoidsSlabRel, FillsOpeningRel } from './types/relationships.js';
export type { BimError, BimErrorKind } from './errors/bimError.js';
export type { IfcGuid } from './identity/ifcGuid.js';
export type { LocalId, LocalIdCounter } from './identity/localId.js';
export type { UnitSystem, LengthUnit } from './units/units.js';
export type { BimModelMeta } from './ifc-writer/headerWriter.js';
