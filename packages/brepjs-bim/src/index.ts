export { BimModel } from './model/bimModel.js';
export { toIfc } from './serialize/toIfc.js';
export { parseWallSpec } from './specs/wallSpec.js';
export { newIfcGuid, isValidIfcGuid } from './identity/ifcGuid.js';
export { makeLocalIdCounter } from './identity/localId.js';
export { DEFAULT_UNITS, toLengthMm, toIfcLengthM } from './units/units.js';
export { specError, ifcError, geometryError, fromBrepError } from './errors/bimError.js';

export type { WallSpec } from './specs/wallSpec.js';
export type { ProjectSpec, SiteSpec, BuildingSpec, StoreySpec } from './specs/spatialSpec.js';
export type { BimCategory, BimElement, AnyBimElement } from './types/bimTypes.js';
export type { BimRelationship } from './types/relationships.js';
export type { BimError, BimErrorKind } from './errors/bimError.js';
export type { IfcGuid } from './identity/ifcGuid.js';
export type { LocalId, LocalIdCounter } from './identity/localId.js';
export type { UnitSystem, LengthUnit } from './units/units.js';
export type { BimModelMeta } from './ifc-writer/headerWriter.js';
