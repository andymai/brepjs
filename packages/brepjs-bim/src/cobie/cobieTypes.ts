/**
 * COBie (Construction-Operations Building information exchange) table row types.
 *
 * Each interface models one COBie sheet. Column names follow the COBie 2.4
 * spreadsheet schema (camelCased). Rows are derived from a {@link BimModel} by
 * {@link deriveCobieModel}; the resulting {@link CobieModel} is a pure value
 * object that can be serialized to CSV or JSON.
 *
 * Several required-but-not-yet-modelled COBie columns (CreatedBy, CreatedOn,
 * Category) are emitted as empty strings rather than omitted, because COBie
 * validators expect the columns to be present. The fields that brepjs-bim can
 * populate from a {@link BimModel} carry real data.
 */

/** Minimal contact metadata used to populate the COBie Contact sheet. */
export interface CobieContactMeta {
  readonly email?: string | undefined;
  readonly givenName?: string | undefined;
  readonly familyName?: string | undefined;
  readonly organizationName?: string | undefined;
  readonly company?: string | undefined;
  readonly phone?: string | undefined;
}

/** Optional metadata consumed by {@link deriveCobieModel}. */
export interface CobieExportMeta {
  readonly contact?: CobieContactMeta | undefined;
}

export interface CobieContactRow {
  /** COBie Contact key — the contact's email address. */
  readonly email: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly company: string;
  readonly phone: string;
}

export interface CobieFacilityRow {
  readonly name: string;
  readonly createdBy: string;
  readonly category: string;
  readonly projectName: string;
  readonly siteName: string;
  readonly description: string;
  /** IfcProject GlobalId. */
  readonly externalIdentifier: string;
}

export interface CobieFloorRow {
  readonly name: string;
  readonly createdBy: string;
  readonly category: string;
  readonly description: string;
  readonly elevation: number;
  /** IfcBuildingStorey GlobalId. */
  readonly externalIdentifier: string;
}

export interface CobieSpaceRow {
  readonly name: string;
  readonly createdBy: string;
  readonly category: string;
  /** Name of the Floor this space sits on (resolved via the spatial tree). */
  readonly floorName: string;
  readonly description: string;
  readonly roomTag: string;
  /** IfcSpace GlobalId. */
  readonly externalIdentifier: string;
}

export interface CobieZoneRow {
  readonly name: string;
  readonly createdBy: string;
  readonly category: string;
  /** Name of a space that is a member of this zone. */
  readonly spaceName: string;
  readonly externalIdentifier: string;
}

export interface CobieTypeRow {
  readonly name: string;
  readonly createdBy: string;
  readonly category: string;
  readonly description: string;
  readonly assetType: string;
}

export interface CobieComponentRow {
  readonly name: string;
  readonly createdBy: string;
  /** Name of the Type row this component is an occurrence of. */
  readonly typeName: string;
  /** Name of the Space this component is contained in, when resolvable. */
  readonly space: string;
  readonly description: string;
  /** Element GlobalId. */
  readonly externalIdentifier: string;
}

export interface CobieSystemRow {
  readonly name: string;
  readonly createdBy: string;
  readonly category: string;
  /** Name of a component that is a member of this system. */
  readonly componentNames: string;
  readonly externalIdentifier: string;
}

export interface CobieAttributeRow {
  readonly name: string;
  readonly createdBy: string;
  /** Name of the sheet row this attribute belongs to (e.g. a component name). */
  readonly sheetName: string;
  readonly rowName: string;
  readonly value: string;
}

/** All populated COBie sheets derived from a model. */
export interface CobieModel {
  readonly contact: readonly CobieContactRow[];
  readonly facility: readonly CobieFacilityRow[];
  readonly floor: readonly CobieFloorRow[];
  readonly space: readonly CobieSpaceRow[];
  readonly zone: readonly CobieZoneRow[];
  readonly type: readonly CobieTypeRow[];
  readonly component: readonly CobieComponentRow[];
  readonly system: readonly CobieSystemRow[];
  readonly attribute: readonly CobieAttributeRow[];
}

/** JSON serialization of a {@link CobieModel} — one array per sheet name. */
export interface CobieJson {
  readonly Contact: readonly CobieContactRow[];
  readonly Facility: readonly CobieFacilityRow[];
  readonly Floor: readonly CobieFloorRow[];
  readonly Space: readonly CobieSpaceRow[];
  readonly Zone: readonly CobieZoneRow[];
  readonly Type: readonly CobieTypeRow[];
  readonly Component: readonly CobieComponentRow[];
  readonly System: readonly CobieSystemRow[];
  readonly Attribute: readonly CobieAttributeRow[];
}
