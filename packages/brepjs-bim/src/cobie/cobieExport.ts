import type { BimModel } from '../model/bimModel.js';
import type { AnyBimElement, BimCategory } from '../types/bimTypes.js';
import type { BimRelationship } from '../types/relationships.js';
import type { LocalId } from '../identity/localId.js';
import type {
  CobieModel,
  CobieExportMeta,
  CobieContactRow,
  CobieFacilityRow,
  CobieFloorRow,
  CobieSpaceRow,
  CobieZoneRow,
  CobieTypeRow,
  CobieComponentRow,
  CobieSystemRow,
  CobieAttributeRow,
  CobieJson,
} from './cobieTypes.js';

/**
 * Physical-element categories that become COBie Component rows. Spatial
 * containers (PROJECT/SITE/BUILDING/STOREY), abstract groupings, and the SPACE
 * category (which maps to the Space sheet, not Component) are excluded.
 */
const COMPONENT_CATEGORIES: ReadonlySet<BimCategory> = new Set<BimCategory>([
  'WALL',
  'SLAB',
  'BEAM',
  'COLUMN',
  'DOOR',
  'WINDOW',
  'PROXY',
  'ROOF',
  'CURTAIN_WALL',
  'FOOTING',
  'PILE',
  'STAIR',
  'RAMP',
  'RAILING',
  'COVERING',
]);

/**
 * Title-cased label used as the COBie Type/Component name prefix for a category,
 * mirroring the human-readable names {@link toIfc} assigns to occurrences
 * (e.g. `Wall 1`, `Slab 2`).
 */
const CATEGORY_LABEL: Readonly<Record<string, string>> = {
  WALL: 'Wall',
  SLAB: 'Slab',
  BEAM: 'Beam',
  COLUMN: 'Column',
  DOOR: 'Door',
  WINDOW: 'Window',
  PROXY: 'Proxy',
  ROOF: 'Roof',
  CURTAIN_WALL: 'CurtainWall',
  FOOTING: 'Footing',
  PILE: 'Pile',
  STAIR: 'Stair',
  RAMP: 'Ramp',
  RAILING: 'Railing',
  COVERING: 'Covering',
};

function categoryLabel(category: BimCategory): string {
  return CATEGORY_LABEL[category] ?? category;
}

/** Extracts a predefinedType from an element spec, defaulting to NOTDEFINED. */
function predefinedTypeOf(el: AnyBimElement): string {
  const spec = el.spec as { predefinedType?: string | undefined };
  const pred = spec.predefinedType;
  return pred !== undefined && pred.length > 0 ? pred : 'NOTDEFINED';
}

/** Type-row name for a (category, predefinedType) group. */
function typeNameFor(category: BimCategory, predefinedType: string): string {
  const base = `${categoryLabel(category)}Type`;
  return predefinedType === 'NOTDEFINED' ? base : `${base}_${predefinedType}`;
}

/**
 * Derives a {@link CobieModel} from an in-memory {@link BimModel}, reading only
 * its public getters. The derivation is a single O(N) pass that mirrors the
 * spatial-tree and type-layer conventions of {@link toIfc} so that COBie
 * Component/Type names line up with the exported IFC.
 *
 * Optional element categories from later phases (ZONE, SYSTEM) are picked up
 * generically when present; their absence is not an error.
 */
export function deriveCobieModel(model: BimModel, meta?: CobieExportMeta): CobieModel {
  const elements = model.getAllElements();
  const relationships = model.getAllRelationships();

  const elementById = new Map<LocalId, AnyBimElement>();
  for (const el of elements) elementById.set(el.localId, el);

  // Map every element to the spatial container (storey/space) it is placed in,
  // via IfcRelContainedInSpatialStructure.
  const containerOf = new Map<LocalId, LocalId>();
  for (const rel of relationships) {
    if (rel.kind !== 'CONTAINED_IN') continue;
    for (const member of rel.relatedElements) containerOf.set(member, rel.relatingStructure);
  }

  const contact = deriveContact(meta);
  const facility = deriveFacility(model, elements);
  const floor = deriveFloors(elements);
  const space = deriveSpaces(model, elementById, containerOf);
  const { component, type } = deriveComponentsAndTypes(model, elementById, containerOf);
  const zone = deriveZones(elements, relationships, elementById);
  const system = deriveSystems(elements, relationships, elementById);
  const attribute = deriveAttributes(model, elements);

  return { contact, facility, floor, space, zone, type, component, system, attribute };
}

function deriveContact(meta?: CobieExportMeta): CobieContactRow[] {
  const c = meta?.contact;
  // COBie rejects empty key fields — omit the Contact sheet when no email key.
  if (c === undefined || c.email === undefined || c.email.length === 0) return [];
  return [
    {
      email: c.email,
      givenName: c.givenName ?? '',
      familyName: c.familyName ?? '',
      company: c.company ?? c.organizationName ?? '',
      phone: c.phone ?? '',
    },
  ];
}

function deriveFacility(model: BimModel, elements: readonly AnyBimElement[]): CobieFacilityRow[] {
  const project = model.getProject();
  if (project === null) return [];
  const site = elements.find((e) => e.category === 'SITE');
  return [
    {
      name: project.spec.name,
      createdBy: '',
      category: '',
      projectName: project.spec.name,
      siteName: site?.category === 'SITE' ? site.spec.name : '',
      description: project.spec.description ?? '',
      externalIdentifier: project.guid,
    },
  ];
}

function deriveFloors(elements: readonly AnyBimElement[]): CobieFloorRow[] {
  const floors: CobieFloorRow[] = [];
  for (const el of elements) {
    if (el.category !== 'STOREY') continue;
    floors.push({
      name: el.spec.name,
      createdBy: '',
      category: '',
      description: '',
      elevation: el.spec.elevation,
      externalIdentifier: el.guid,
    });
  }
  return floors;
}

function deriveSpaces(
  model: BimModel,
  elementById: ReadonlyMap<LocalId, AnyBimElement>,
  containerOf: ReadonlyMap<LocalId, LocalId>
): CobieSpaceRow[] {
  const spaces: CobieSpaceRow[] = [];
  for (const space of model.getSpaces()) {
    const containerId = containerOf.get(space.localId);
    const container = containerId !== undefined ? elementById.get(containerId) : undefined;
    const floorName = container?.category === 'STOREY' ? container.spec.name : '';
    spaces.push({
      name: space.spec.name,
      createdBy: '',
      category: space.spec.predefinedType ?? '',
      floorName,
      description: space.spec.longName ?? '',
      roomTag: space.spec.name,
      externalIdentifier: space.guid,
    });
  }
  return spaces;
}

/**
 * Walks physical occurrences in the same per-category order {@link toIfc} uses,
 * assigning each the human name (`Wall 1`, `Slab 2`, …) and grouping them into
 * Type rows by (category, predefinedType).
 */
function deriveComponentsAndTypes(
  model: BimModel,
  elementById: ReadonlyMap<LocalId, AnyBimElement>,
  containerOf: ReadonlyMap<LocalId, LocalId>
): { component: CobieComponentRow[]; type: CobieTypeRow[] } {
  const component: CobieComponentRow[] = [];
  const typeByName = new Map<string, CobieTypeRow>();

  // Bucket physical elements by category to reproduce the per-category numbering.
  const byCategory = new Map<BimCategory, AnyBimElement[]>();
  for (const el of model.getAllElements()) {
    if (!COMPONENT_CATEGORIES.has(el.category)) continue;
    const list = byCategory.get(el.category) ?? [];
    list.push(el);
    byCategory.set(el.category, list);
  }

  for (const [category, els] of byCategory) {
    for (const [i, el] of els.entries()) {
      const predefinedType = predefinedTypeOf(el);
      const typeName = typeNameFor(category, predefinedType);
      if (!typeByName.has(typeName)) {
        typeByName.set(typeName, {
          name: typeName,
          createdBy: '',
          category: predefinedType,
          description: '',
          assetType: categoryLabel(category),
        });
      }
      const name = componentName(el, category, i);
      const containerId = containerOf.get(el.localId);
      const container = containerId !== undefined ? elementById.get(containerId) : undefined;
      const space = container?.category === 'SPACE' ? container.spec.name : '';
      component.push({
        name,
        createdBy: '',
        typeName,
        space,
        description: '',
        externalIdentifier: el.guid,
      });
    }
  }

  return { component, type: [...typeByName.values()] };
}

/** Component display name, preferring a spec-supplied name, else `Label N`. */
function componentName(el: AnyBimElement, category: BimCategory, index: number): string {
  const spec = el.spec as { name?: string | undefined };
  const specName = spec.name;
  if (specName !== undefined && specName.length > 0) return specName;
  return `${categoryLabel(category)} ${index + 1}`;
}

/**
 * Derives Zone rows from ZONE elements and their space memberships. ZONE is a
 * later-phase category; when absent this yields an empty list. Members are
 * resolved through ASSIGNS_TO_GROUP relationships (zone -> spaces).
 */
function deriveZones(
  elements: readonly AnyBimElement[],
  relationships: readonly BimRelationship[],
  elementById: ReadonlyMap<LocalId, AnyBimElement>
): CobieZoneRow[] {
  const zones: CobieZoneRow[] = [];
  for (const el of elements) {
    if ((el.category as string) !== 'ZONE') continue;
    const spaceName = firstGroupMemberName(el.localId, relationships, elementById, 'SPACE');
    zones.push({
      name: groupName(el),
      createdBy: '',
      category: '',
      spaceName,
      externalIdentifier: el.guid,
    });
  }
  return zones;
}

/**
 * Derives System rows from SYSTEM elements and their component memberships.
 * SYSTEM is a later-phase category; absent => empty list.
 */
function deriveSystems(
  elements: readonly AnyBimElement[],
  relationships: readonly BimRelationship[],
  elementById: ReadonlyMap<LocalId, AnyBimElement>
): CobieSystemRow[] {
  const systems: CobieSystemRow[] = [];
  for (const el of elements) {
    if ((el.category as string) !== 'SYSTEM') continue;
    const componentNames = groupMemberNames(el.localId, relationships, elementById);
    systems.push({
      name: groupName(el),
      createdBy: '',
      category: '',
      componentNames: componentNames.join(', '),
      externalIdentifier: el.guid,
    });
  }
  return systems;
}

function groupName(el: AnyBimElement): string {
  const spec = el.spec as { name?: string | undefined };
  return spec.name ?? '';
}

function firstGroupMemberName(
  groupId: LocalId,
  relationships: readonly BimRelationship[],
  elementById: ReadonlyMap<LocalId, AnyBimElement>,
  ofCategory: BimCategory
): string {
  for (const rel of relationships) {
    if (rel.kind !== 'ASSIGNS_TO_GROUP' || rel.groupLocalId !== groupId) continue;
    for (const memberId of rel.memberLocalIds) {
      const member = elementById.get(memberId);
      if (member?.category === ofCategory) {
        const spec = member.spec as { name?: string | undefined };
        return spec.name ?? '';
      }
    }
  }
  return '';
}

function groupMemberNames(
  groupId: LocalId,
  relationships: readonly BimRelationship[],
  elementById: ReadonlyMap<LocalId, AnyBimElement>
): string[] {
  const names: string[] = [];
  for (const rel of relationships) {
    if (rel.kind !== 'ASSIGNS_TO_GROUP' || rel.groupLocalId !== groupId) continue;
    for (const memberId of rel.memberLocalIds) {
      const member = elementById.get(memberId);
      if (member === undefined) continue;
      const spec = member.spec as { name?: string | undefined };
      if (spec.name !== undefined && spec.name.length > 0) names.push(spec.name);
    }
  }
  return names;
}

/**
 * Derives Attribute rows from the `customProperties` of every element spec, one
 * row per property. The owning row is keyed by the element's display name.
 */
function deriveAttributes(model: BimModel, elements: readonly AnyBimElement[]): CobieAttributeRow[] {
  const attributes: CobieAttributeRow[] = [];

  // Reproduce per-category numbering so attribute row names line up with components.
  const indexByElement = new Map<LocalId, number>();
  const countByCategory = new Map<BimCategory, number>();
  for (const el of model.getAllElements()) {
    if (!COMPONENT_CATEGORIES.has(el.category) && el.category !== 'SPACE') continue;
    const n = countByCategory.get(el.category) ?? 0;
    indexByElement.set(el.localId, n);
    countByCategory.set(el.category, n + 1);
  }

  for (const el of elements) {
    const spec = el.spec as {
      customProperties?:
        | Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>>
        | undefined;
      name?: string | undefined;
    };
    const props = spec.customProperties;
    if (props === undefined) continue;
    const index = indexByElement.get(el.localId) ?? 0;
    const rowName =
      spec.name !== undefined && spec.name.length > 0
        ? spec.name
        : `${categoryLabel(el.category)} ${index + 1}`;
    for (const [psetName, psetProps] of Object.entries(props)) {
      for (const [propName, value] of Object.entries(psetProps)) {
        attributes.push({
          name: propName,
          createdBy: '',
          sheetName: psetName,
          rowName,
          value: String(value),
        });
      }
    }
  }
  return attributes;
}

/** Column order per sheet, defining the CSV header row and field projection. */
const SHEET_COLUMNS = {
  Contact: ['email', 'givenName', 'familyName', 'company', 'phone'],
  Facility: ['name', 'createdBy', 'category', 'projectName', 'siteName', 'description', 'externalIdentifier'],
  Floor: ['name', 'createdBy', 'category', 'description', 'elevation', 'externalIdentifier'],
  Space: ['name', 'createdBy', 'category', 'floorName', 'description', 'roomTag', 'externalIdentifier'],
  Zone: ['name', 'createdBy', 'category', 'spaceName', 'externalIdentifier'],
  Type: ['name', 'createdBy', 'category', 'description', 'assetType'],
  Component: ['name', 'createdBy', 'typeName', 'space', 'description', 'externalIdentifier'],
  System: ['name', 'createdBy', 'category', 'componentNames', 'externalIdentifier'],
  Attribute: ['name', 'createdBy', 'sheetName', 'rowName', 'value'],
} as const;

const SHEET_HEADERS: Readonly<Record<keyof typeof SHEET_COLUMNS, string>> = {
  Contact: 'Email,GivenName,FamilyName,Company,Phone',
  Facility: 'Name,CreatedBy,Category,ProjectName,SiteName,Description,ExternalIdentifier',
  Floor: 'Name,CreatedBy,Category,Description,Elevation,ExternalIdentifier',
  Space: 'Name,CreatedBy,Category,FloorName,Description,RoomTag,ExternalIdentifier',
  Zone: 'Name,CreatedBy,Category,SpaceName,ExternalIdentifier',
  Type: 'Name,CreatedBy,Category,Description,AssetType',
  Component: 'Name,CreatedBy,TypeName,Space,Description,ExternalIdentifier',
  System: 'Name,CreatedBy,Category,ComponentNames,ExternalIdentifier',
  Attribute: 'Name,CreatedBy,SheetName,RowName,Value',
};

const SHEET_ROWS: Readonly<Record<keyof typeof SHEET_COLUMNS, (m: CobieModel) => readonly object[]>> = {
  Contact: (m) => m.contact,
  Facility: (m) => m.facility,
  Floor: (m) => m.floor,
  Space: (m) => m.space,
  Zone: (m) => m.zone,
  Type: (m) => m.type,
  Component: (m) => m.component,
  System: (m) => m.system,
  Attribute: (m) => m.attribute,
};

/** Escapes one CSV field per RFC 4180 (quote when it holds `,`, `"`, CR, or LF). */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serializes a {@link CobieModel} to CSV — one sheet per COBie table, keyed by
 * sheet name. Each sheet is a CRLF-delimited RFC 4180 document with a header row
 * followed by one row per record.
 */
export function serializeCobieToCsv(model: CobieModel): Map<string, string> {
  const sheets = new Map<string, string>();
  for (const sheetName of Object.keys(SHEET_COLUMNS) as (keyof typeof SHEET_COLUMNS)[]) {
    const columns = SHEET_COLUMNS[sheetName];
    const rows = SHEET_ROWS[sheetName](model);
    const lines = [SHEET_HEADERS[sheetName]];
    for (const row of rows) {
      const record = row as Record<string, string | number>;
      lines.push(columns.map((col) => csvField(String(record[col] ?? ''))).join(','));
    }
    sheets.set(sheetName, lines.join('\r\n'));
  }
  return sheets;
}

/** Serializes a {@link CobieModel} to a JSON object — one array per sheet. */
export function serializeCobieToJson(model: CobieModel): CobieJson {
  return {
    Contact: model.contact,
    Facility: model.facility,
    Floor: model.floor,
    Space: model.space,
    Zone: model.zone,
    Type: model.type,
    Component: model.component,
    System: model.system,
    Attribute: model.attribute,
  };
}
