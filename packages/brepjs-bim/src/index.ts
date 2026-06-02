export { BimModel } from './model/bimModel.js';
export { toIfc, toIfcValidated } from './serialize/toIfc.js';
export type { ValidatedIfcResult } from './serialize/toIfc.js';
export { parseWallSpec } from './specs/wallSpec.js';
export { parseSlabSpec } from './specs/slabSpec.js';
export { parseBeamSpec } from './specs/beamSpec.js';
export { parseColumnSpec } from './specs/columnSpec.js';
export { parseProfile, isExtendedProfile } from './specs/profile.js';
export { extendedProfileToFace, extendedProfileArea } from './specs/profilesExtended.js';
export { parseSpaceSpec } from './specs/spaceSpec.js';
export { parseRoofSpec } from './specs/roofSpec.js';
export { parseCurtainWallSpec } from './specs/curtainWallSpec.js';
export { parseFootingSpec, parsePileSpec } from './specs/foundationSpec.js';
export { parseStairSpec, parseStairFlightSpec } from './specs/stairSpec.js';
export { parseRampSpec, parseRampFlightSpec } from './specs/rampSpec.js';
export { parseRailingSpec } from './specs/railingSpec.js';
export { parseCoveringSpec } from './specs/coveringSpec.js';
export { parseElementAssemblySpec } from './specs/assemblySpec.js';
export { parseSurfaceStyleSpec } from './specs/styleSpec.js';
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
  writeElementAssemblyEntity,
  writeRelAggregatesElements,
  writeRelNests,
} from './ifc-writer/assemblyWriter.js';
export {
  writeSurfaceStyle,
  writeStyledItem,
  writePresentationLayer,
} from './ifc-writer/styleWriter.js';
export {
  writeRelConnectsElements,
  writeRelConnectsPathElements,
} from './ifc-writer/connectivityWriter.js';
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
  CoreProfile,
  RectangularProfile,
  CircularProfile,
  IShapeProfile,
} from './specs/profile.js';
export type {
  ExtendedProfile,
  LShapeProfile,
  TShapeProfile,
  UShapeProfile,
  ZShapeProfile,
  CShapeProfile,
  AsymmetricIShapeProfile,
  EllipseProfile,
  TrapeziumProfile,
  RectangleHollowProfile,
  CircleHollowProfile,
  ArbitraryClosedProfile,
  ArbitraryProfileWithVoids,
} from './specs/profilesExtended.js';
export type { SpaceSpec, SpacePredefinedType } from './specs/spaceSpec.js';
export type { RoofSpec, RoofPredefinedType } from './specs/roofSpec.js';
export type { CurtainWallSpec, CurtainWallPredefinedType } from './specs/curtainWallSpec.js';
export type { CurtainWallGrid, CurtainWallComponent } from './elementFns/curtainWallFns.js';
export type {
  FootingSpec,
  PileSpec,
  FootingPredefinedType,
  PilePredefinedType,
  PileConstructionType,
} from './specs/foundationSpec.js';
export type {
  StairSpec,
  StairFlightSpec,
  StairPredefinedType,
} from './specs/stairSpec.js';
export type {
  RampSpec,
  RampFlightSpec,
  RampPredefinedType,
  RampFlightPredefinedType,
} from './specs/rampSpec.js';
export type { RailingSpec, RailingPredefinedType } from './specs/railingSpec.js';
export type { CoveringSpec, CoveringPredefinedType } from './specs/coveringSpec.js';
export type {
  ElementAssemblySpec,
  AssemblyPredefinedType,
  AssemblyPlace,
} from './specs/assemblySpec.js';
export type { SurfaceStyleSpec } from './specs/styleSpec.js';
export type {
  AssemblyPlaceIfc,
  ElementAssemblyPredefinedTypeIfc,
} from './ifc-writer/assemblyWriter.js';
export type { PathConnectionTypeIfc } from './ifc-writer/connectivityWriter.js';
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
  SpaceBoundaryRel,
  NestsRel,
  ConnectsElementsRel,
  ConnectsPathElementsRel,
  CoversElementRel,
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
