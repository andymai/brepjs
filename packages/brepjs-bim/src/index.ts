export { BimModel } from './model/bimModel.js';
export { toIfc, toIfcValidated } from './serialize/toIfc.js';
export type { ValidatedIfcResult } from './serialize/toIfc.js';
export { parseWallSpec } from './specs/wallSpec.js';
export { parseSlabSpec } from './specs/slabSpec.js';
export { parseBeamSpec } from './specs/beamSpec.js';
export { parseColumnSpec } from './specs/columnSpec.js';
export { parseProfile } from './specs/profile.js';
export { parseDoorSpec, parseWindowSpec, parseSlabOpeningInput } from './specs/openingSpec.js';
export { newIfcGuid, isValidIfcGuid } from './identity/ifcGuid.js';
export { deriveIfcGuid, deriveIfcGuidSync } from './identity/guidDerivation.js';
export { makeLocalIdCounter } from './identity/localId.js';
export { checkReferentialIntegrity } from './validation/referentialIntegrity.js';
export { checkSchema } from './validation/schemaCheck.js';
export { checkRoundTrip } from './validation/roundTrip.js';
export { checkGeometryValidity } from './validation/geometryValidity.js';
export {
  issue,
  emptyReport,
  hasErrors,
  countBySeverity,
} from './validation/severity.js';
export { writeIfcType } from './ifc-writer/typeWriter.js';
export {
  writeMaterialLayerSet,
  writeMaterialProfileSet,
  writeMaterialSimple,
} from './ifc-writer/materialWriter.js';
export { writeClassificationRefs } from './ifc-writer/classificationWriter.js';
export {
  PSET_TEMPLATES,
  PSET_PROPERTY_TYPE_TABLE,
  measureTypeFor,
  templateFor,
} from './psets/psetTemplates.js';
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
export type { ProxySpec } from './specs/proxySpec.js';
export type { ProjectSpec, SiteSpec, BuildingSpec, StoreySpec } from './specs/spatialSpec.js';
export type { BimCategory, BimElement, AnyBimElement, OpeningSpec, WallOpeningSpec, SlabOpeningSpec } from './types/bimTypes.js';
export { isWallOpening, isSlabOpening } from './types/bimTypes.js';
export type {
  BimRelationship,
  AssociatesMaterialRel,
  AssociatesClassificationRel,
  VoidsWallRel,
  VoidsSlabRel,
  FillsOpeningRel,
} from './types/relationships.js';
export type { MaterialLayer } from './types/materialTypes.js';
export type {
  MaterialLayerSetSpec,
  MaterialProfileSpec,
  MaterialSpec,
} from './ifc-writer/materialWriter.js';
export type { ClassificationRef } from './types/classificationTypes.js';
export type {
  PsetCategory,
  PsetMeasureType,
  PsetTemplate,
  PsetPropertyTemplate,
} from './psets/psetTemplates.js';
export type { BimError, BimErrorKind } from './errors/bimError.js';
export type { IfcGuid } from './identity/ifcGuid.js';
export type { LocalId, LocalIdCounter } from './identity/localId.js';
export type { UnitSystem, LengthUnit } from './units/units.js';
export type { BimModelMeta } from './ifc-writer/headerWriter.js';
export type {
  ValidationSeverity,
  ValidationIssue,
  ValidationReport,
  SeverityCounts,
} from './validation/severity.js';
export type { ModelGraph, IntegrityInput } from './validation/referentialIntegrity.js';
export type { RoundTripReport, EntityCounts } from './validation/roundTrip.js';
export type { IfcTypeName, TypeWriteResult } from './ifc-writer/typeWriter.js';
