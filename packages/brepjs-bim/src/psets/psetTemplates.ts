import * as WebIFC from 'web-ifc';

/**
 * IFC measure types used by the standard Pset_*Common property sets.
 * Each maps to a web-ifc defined-type constant via {@link webIfcConstantFor}.
 */
export type PsetMeasureType =
  | 'IFCBOOLEAN'
  | 'IFCIDENTIFIER'
  | 'IFCLABEL'
  | 'IFCTEXT'
  | 'IFCREAL'
  | 'IFCINTEGER'
  | 'IFCLENGTHMEASURE'
  | 'IFCPOSITIVELENGTHMEASURE'
  | 'IFCAREAMEASURE'
  | 'IFCVOLUMEMEASURE'
  | 'IFCRATIOMEASURE'
  | 'IFCPOSITIVERATIOMEASURE'
  | 'IFCPLANEANGLEMEASURE'
  | 'IFCTHERMALTRANSMITTANCEMEASURE';

/** The element categories that carry a standard Pset_*Common set. */
export type PsetCategory =
  | 'WALL'
  | 'SLAB'
  | 'BEAM'
  | 'COLUMN'
  | 'DOOR'
  | 'WINDOW'
  | 'SPACE'
  | 'ROOF'
  | 'CURTAIN_WALL'
  | 'FOOTING'
  | 'PILE'
  | 'STAIR'
  | 'RAMP'
  | 'RAILING'
  | 'COVERING';

interface SingleValueTemplate {
  readonly name: string;
  readonly measureType: PsetMeasureType;
  readonly kind: 'single';
}

interface EnumeratedValueTemplate {
  readonly name: string;
  readonly measureType: PsetMeasureType;
  readonly kind: 'enumerated';
  /** Legal values for the enumeration, in canonical IFC order. */
  readonly enumValues: readonly string[];
}

export type PsetPropertyTemplate = SingleValueTemplate | EnumeratedValueTemplate;

export interface PsetTemplate {
  readonly psetName: string;
  readonly properties: readonly PsetPropertyTemplate[];
}

// The bSI-standard Status enumeration shared by every Pset_*Common set.
const STATUS_ENUM_VALUES = [
  'NEW',
  'EXISTING',
  'DEMOLISH',
  'TEMPORARY',
  'OTHER',
  'NOTKNOWN',
  'UNSET',
] as const;

const STATUS_PROPERTY: EnumeratedValueTemplate = {
  name: 'Status',
  measureType: 'IFCLABEL',
  kind: 'enumerated',
  enumValues: STATUS_ENUM_VALUES,
};

function single(name: string, measureType: PsetMeasureType): SingleValueTemplate {
  return { name, measureType, kind: 'single' };
}

/**
 * Per-property IFC measure type for every property appearing in the standard
 * Pset_*Common sets. The psetWriter consults this to emit the correct measure
 * type instead of the legacy everything-is-IFCREAL heuristic. Properties absent
 * from this table have no standard measure type and the writer falls back to its
 * JS-type heuristic.
 */
export const PSET_PROPERTY_TYPE_TABLE: Readonly<Record<string, PsetMeasureType>> = {
  // Shared common properties
  Reference: 'IFCIDENTIFIER',
  Status: 'IFCLABEL',
  IsExternal: 'IFCBOOLEAN',
  LoadBearing: 'IFCBOOLEAN',
  FireRating: 'IFCLABEL',
  AcousticRating: 'IFCLABEL',
  ThermalTransmittance: 'IFCTHERMALTRANSMITTANCEMEASURE',
  Combustible: 'IFCBOOLEAN',
  Compartmentation: 'IFCBOOLEAN',
  SurfaceSpreadOfFlame: 'IFCLABEL',
  // Manufacturer information (used by type objects)
  Manufacturer: 'IFCLABEL',
  ModelLabel: 'IFCLABEL',
  ProductionYear: 'IFCLABEL',
  // Door / window common properties
  FireExit: 'IFCBOOLEAN',
  SelfClosing: 'IFCBOOLEAN',
  SmokeStop: 'IFCBOOLEAN',
  HandicapAccessible: 'IFCBOOLEAN',
  HasDrive: 'IFCBOOLEAN',
  // bSI types Infiltration as IfcVolumetricFlowRateMeasure, which is outside the
  // Pset_*Common measure-type set this module covers; emit it as IFCREAL.
  Infiltration: 'IFCREAL',
  GlazingAreaFraction: 'IFCPOSITIVERATIOMEASURE',
  SecurityRating: 'IFCLABEL',
  // Space-specific (Pset_SpaceCommon)
  OccupancyType: 'IFCLABEL',
  FinishCeiling: 'IFCLABEL',
  FinishFloor: 'IFCLABEL',
};

const WALL_COMMON_TEMPLATE: PsetTemplate = {
  psetName: 'Pset_WallCommon',
  properties: [
    single('Reference', 'IFCIDENTIFIER'),
    STATUS_PROPERTY,
    single('IsExternal', 'IFCBOOLEAN'),
    single('LoadBearing', 'IFCBOOLEAN'),
    single('FireRating', 'IFCLABEL'),
    single('AcousticRating', 'IFCLABEL'),
    single('ThermalTransmittance', 'IFCTHERMALTRANSMITTANCEMEASURE'),
    single('Combustible', 'IFCBOOLEAN'),
    single('Compartmentation', 'IFCBOOLEAN'),
    single('SurfaceSpreadOfFlame', 'IFCLABEL'),
  ],
};

const SLAB_COMMON_TEMPLATE: PsetTemplate = {
  psetName: 'Pset_SlabCommon',
  properties: [
    single('Reference', 'IFCIDENTIFIER'),
    STATUS_PROPERTY,
    single('IsExternal', 'IFCBOOLEAN'),
    single('LoadBearing', 'IFCBOOLEAN'),
    single('FireRating', 'IFCLABEL'),
    single('AcousticRating', 'IFCLABEL'),
    single('ThermalTransmittance', 'IFCTHERMALTRANSMITTANCEMEASURE'),
    single('Combustible', 'IFCBOOLEAN'),
    single('Compartmentation', 'IFCBOOLEAN'),
    single('SurfaceSpreadOfFlame', 'IFCLABEL'),
  ],
};

const BEAM_COMMON_TEMPLATE: PsetTemplate = {
  psetName: 'Pset_BeamCommon',
  properties: [
    single('Reference', 'IFCIDENTIFIER'),
    STATUS_PROPERTY,
    single('IsExternal', 'IFCBOOLEAN'),
    single('LoadBearing', 'IFCBOOLEAN'),
    single('FireRating', 'IFCLABEL'),
    single('AcousticRating', 'IFCLABEL'),
    single('ThermalTransmittance', 'IFCTHERMALTRANSMITTANCEMEASURE'),
  ],
};

const COLUMN_COMMON_TEMPLATE: PsetTemplate = {
  psetName: 'Pset_ColumnCommon',
  properties: [
    single('Reference', 'IFCIDENTIFIER'),
    STATUS_PROPERTY,
    single('IsExternal', 'IFCBOOLEAN'),
    single('LoadBearing', 'IFCBOOLEAN'),
    single('FireRating', 'IFCLABEL'),
    single('AcousticRating', 'IFCLABEL'),
    single('ThermalTransmittance', 'IFCTHERMALTRANSMITTANCEMEASURE'),
  ],
};

const DOOR_COMMON_TEMPLATE: PsetTemplate = {
  psetName: 'Pset_DoorCommon',
  properties: [
    single('Reference', 'IFCIDENTIFIER'),
    STATUS_PROPERTY,
    single('IsExternal', 'IFCBOOLEAN'),
    single('FireRating', 'IFCLABEL'),
    single('AcousticRating', 'IFCLABEL'),
    single('SecurityRating', 'IFCLABEL'),
    single('ThermalTransmittance', 'IFCTHERMALTRANSMITTANCEMEASURE'),
    single('FireExit', 'IFCBOOLEAN'),
    single('SelfClosing', 'IFCBOOLEAN'),
    single('SmokeStop', 'IFCBOOLEAN'),
    single('HandicapAccessible', 'IFCBOOLEAN'),
    single('HasDrive', 'IFCBOOLEAN'),
    single('Infiltration', 'IFCREAL'),
  ],
};

const WINDOW_COMMON_TEMPLATE: PsetTemplate = {
  psetName: 'Pset_WindowCommon',
  properties: [
    single('Reference', 'IFCIDENTIFIER'),
    STATUS_PROPERTY,
    single('IsExternal', 'IFCBOOLEAN'),
    single('FireRating', 'IFCLABEL'),
    single('AcousticRating', 'IFCLABEL'),
    single('SecurityRating', 'IFCLABEL'),
    single('ThermalTransmittance', 'IFCTHERMALTRANSMITTANCEMEASURE'),
    single('FireExit', 'IFCBOOLEAN'),
    single('SmokeStop', 'IFCBOOLEAN'),
    single('GlazingAreaFraction', 'IFCPOSITIVERATIOMEASURE'),
    single('Infiltration', 'IFCREAL'),
  ],
};

const SPACE_COMMON_TEMPLATE: PsetTemplate = {
  psetName: 'Pset_SpaceCommon',
  properties: [
    single('Reference', 'IFCIDENTIFIER'),
    STATUS_PROPERTY,
    single('IsExternal', 'IFCBOOLEAN'),
    single('FinishCeiling', 'IFCLABEL'),
    single('FinishFloor', 'IFCLABEL'),
    single('OccupancyType', 'IFCLABEL'),
  ],
};

const ROOF_COMMON_TEMPLATE: PsetTemplate = {
  psetName: 'Pset_RoofCommon',
  properties: [
    single('Reference', 'IFCIDENTIFIER'),
    STATUS_PROPERTY,
    single('IsExternal', 'IFCBOOLEAN'),
    single('FireRating', 'IFCLABEL'),
    single('ThermalTransmittance', 'IFCTHERMALTRANSMITTANCEMEASURE'),
  ],
};

const CURTAIN_WALL_COMMON_TEMPLATE: PsetTemplate = {
  psetName: 'Pset_CurtainWallCommon',
  properties: [
    single('Reference', 'IFCIDENTIFIER'),
    STATUS_PROPERTY,
    single('IsExternal', 'IFCBOOLEAN'),
    single('FireRating', 'IFCLABEL'),
    single('ThermalTransmittance', 'IFCTHERMALTRANSMITTANCEMEASURE'),
  ],
};

const FOOTING_COMMON_TEMPLATE: PsetTemplate = {
  psetName: 'Pset_FootingCommon',
  properties: [
    single('Reference', 'IFCIDENTIFIER'),
    STATUS_PROPERTY,
    single('LoadBearing', 'IFCBOOLEAN'),
    single('IsExternal', 'IFCBOOLEAN'),
    single('FireRating', 'IFCLABEL'),
  ],
};

const PILE_COMMON_TEMPLATE: PsetTemplate = {
  psetName: 'Pset_PileCommon',
  properties: [
    single('Reference', 'IFCIDENTIFIER'),
    STATUS_PROPERTY,
    single('LoadBearing', 'IFCBOOLEAN'),
  ],
};

const STAIR_COMMON_TEMPLATE: PsetTemplate = {
  psetName: 'Pset_StairCommon',
  properties: [
    single('Reference', 'IFCIDENTIFIER'),
    STATUS_PROPERTY,
    single('IsExternal', 'IFCBOOLEAN'),
    single('FireRating', 'IFCLABEL'),
    single('LoadBearing', 'IFCBOOLEAN'),
  ],
};

const RAMP_COMMON_TEMPLATE: PsetTemplate = {
  psetName: 'Pset_RampCommon',
  properties: [
    single('Reference', 'IFCIDENTIFIER'),
    STATUS_PROPERTY,
    single('IsExternal', 'IFCBOOLEAN'),
    single('FireRating', 'IFCLABEL'),
    single('LoadBearing', 'IFCBOOLEAN'),
  ],
};

const RAILING_COMMON_TEMPLATE: PsetTemplate = {
  psetName: 'Pset_RailingCommon',
  properties: [
    single('Reference', 'IFCIDENTIFIER'),
    STATUS_PROPERTY,
    single('IsExternal', 'IFCBOOLEAN'),
    single('FireRating', 'IFCLABEL'),
  ],
};

const COVERING_COMMON_TEMPLATE: PsetTemplate = {
  psetName: 'Pset_CoveringCommon',
  properties: [
    single('Reference', 'IFCIDENTIFIER'),
    STATUS_PROPERTY,
    single('IsExternal', 'IFCBOOLEAN'),
    single('FireRating', 'IFCLABEL'),
    single('ThermalTransmittance', 'IFCTHERMALTRANSMITTANCEMEASURE'),
  ],
};

/** Standard Pset_*Common template keyed by element category. */
export const PSET_TEMPLATES: Readonly<Record<PsetCategory, PsetTemplate>> = {
  WALL: WALL_COMMON_TEMPLATE,
  SLAB: SLAB_COMMON_TEMPLATE,
  BEAM: BEAM_COMMON_TEMPLATE,
  COLUMN: COLUMN_COMMON_TEMPLATE,
  DOOR: DOOR_COMMON_TEMPLATE,
  WINDOW: WINDOW_COMMON_TEMPLATE,
  SPACE: SPACE_COMMON_TEMPLATE,
  ROOF: ROOF_COMMON_TEMPLATE,
  CURTAIN_WALL: CURTAIN_WALL_COMMON_TEMPLATE,
  FOOTING: FOOTING_COMMON_TEMPLATE,
  PILE: PILE_COMMON_TEMPLATE,
  STAIR: STAIR_COMMON_TEMPLATE,
  RAMP: RAMP_COMMON_TEMPLATE,
  RAILING: RAILING_COMMON_TEMPLATE,
  COVERING: COVERING_COMMON_TEMPLATE,
};

const WEBIFC_CONSTANT_BY_MEASURE: Readonly<Record<PsetMeasureType, number>> = {
  IFCBOOLEAN: WebIFC.IFCBOOLEAN,
  IFCIDENTIFIER: WebIFC.IFCIDENTIFIER,
  IFCLABEL: WebIFC.IFCLABEL,
  IFCTEXT: WebIFC.IFCTEXT,
  IFCREAL: WebIFC.IFCREAL,
  IFCINTEGER: WebIFC.IFCINTEGER,
  IFCLENGTHMEASURE: WebIFC.IFCLENGTHMEASURE,
  IFCPOSITIVELENGTHMEASURE: WebIFC.IFCPOSITIVELENGTHMEASURE,
  IFCAREAMEASURE: WebIFC.IFCAREAMEASURE,
  IFCVOLUMEMEASURE: WebIFC.IFCVOLUMEMEASURE,
  IFCRATIOMEASURE: WebIFC.IFCRATIOMEASURE,
  IFCPOSITIVERATIOMEASURE: WebIFC.IFCPOSITIVERATIOMEASURE,
  IFCPLANEANGLEMEASURE: WebIFC.IFCPLANEANGLEMEASURE,
  IFCTHERMALTRANSMITTANCEMEASURE: WebIFC.IFCTHERMALTRANSMITTANCEMEASURE,
};

/** Looks up the standard IFC measure type for a Pset property name. */
export function measureTypeFor(propertyName: string): PsetMeasureType | undefined {
  return PSET_PROPERTY_TYPE_TABLE[propertyName];
}

/** Resolves a measure type to its web-ifc defined-type constant. */
export function webIfcConstantFor(measureType: PsetMeasureType): number {
  return WEBIFC_CONSTANT_BY_MEASURE[measureType];
}

/** Returns the standard Pset_*Common template for an element category. */
export function templateFor(category: PsetCategory): PsetTemplate {
  return PSET_TEMPLATES[category];
}
