import * as WebIFC from 'web-ifc';
import type { SpfReader } from './spfReader.js';

/**
 * A reconstructed spatial-structure node. The tree mirrors the IFC spatial
 * containment hierarchy (`IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey`)
 * rebuilt from `IfcRelAggregates`, with physical elements attached to their
 * storey via `IfcRelContainedInSpatialStructure`.
 *
 * Nodes are addressable by {@link SpatialNode.guid} (the IFC `GlobalId`).
 */
export interface SpatialNode {
  readonly expressId: number;
  readonly guid: string;
  readonly name: string;
  readonly category: 'PROJECT' | 'SITE' | 'BUILDING' | 'STOREY';
  /** Storey elevation in mm; present on `STOREY` nodes only. */
  readonly elevation?: number | undefined;
  readonly children: readonly SpatialNode[];
  /** Express ids of elements contained directly in this node. */
  readonly containedElements: readonly number[];
}

/** Reference wrapper as returned by `GetLine` with `flatten=false`. */
interface IfcRef {
  readonly value?: number;
}

/** Typed value wrapper (`IfcLabel`, `IfcLengthMeasure`, …). */
interface IfcValue {
  readonly value?: unknown;
}

const CATEGORY_BY_TYPE: ReadonlyMap<number, SpatialNode['category']> = new Map([
  [WebIFC.IFCPROJECT, 'PROJECT'],
  [WebIFC.IFCSITE, 'SITE'],
  [WebIFC.IFCBUILDING, 'BUILDING'],
  [WebIFC.IFCBUILDINGSTOREY, 'STOREY'],
]);

function refId(ref: unknown): number | undefined {
  const v = (ref as IfcRef | null | undefined)?.value;
  return typeof v === 'number' ? v : undefined;
}

function refList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const entry of value) {
    const id = refId(entry);
    if (id !== undefined) out.push(id);
  }
  return out;
}

function readName(reader: SpfReader, line: Record<string, unknown>): string {
  const raw = (line['Name'] as IfcValue | null | undefined)?.value;
  return typeof raw === 'string' ? reader.decodeText(raw) : '';
}

function readGuid(line: Record<string, unknown>): string {
  const raw = (line['GlobalId'] as IfcValue | null | undefined)?.value;
  return typeof raw === 'string' ? raw : '';
}

/**
 * Maps each parent spatial-container express id to its directly aggregated
 * child express ids, by walking every `IfcRelAggregates` line.
 */
function buildAggregatesIndex(reader: SpfReader): Map<number, number[]> {
  const index = new Map<number, number[]>();
  for (const relId of reader.getLinesOfType(WebIFC.IFCRELAGGREGATES)) {
    const rel = reader.getLine<Record<string, unknown>>(relId);
    if (rel === null) continue;
    const parent = refId(rel['RelatingObject']);
    if (parent === undefined) continue;
    const children = refList(rel['RelatedObjects']);
    if (children.length === 0) continue;
    const existing = index.get(parent);
    if (existing === undefined) index.set(parent, [...children]);
    else existing.push(...children);
  }
  return index;
}

/**
 * Maps each spatial container express id to the element express ids contained
 * in it, by walking every `IfcRelContainedInSpatialStructure` line.
 */
function buildContainmentIndex(reader: SpfReader): Map<number, number[]> {
  const index = new Map<number, number[]>();
  for (const relId of reader.getLinesOfType(WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
    const rel = reader.getLine<Record<string, unknown>>(relId);
    if (rel === null) continue;
    const structure = refId(rel['RelatingStructure']);
    if (structure === undefined) continue;
    const elements = refList(rel['RelatedElements']);
    const existing = index.get(structure);
    if (existing === undefined) index.set(structure, [...elements]);
    else existing.push(...elements);
  }
  return index;
}

function readNode(
  reader: SpfReader,
  expressId: number,
  scale: number,
  aggregates: Map<number, number[]>,
  containment: Map<number, number[]>,
  visited: Set<number>
): SpatialNode | null {
  if (visited.has(expressId)) return null;
  visited.add(expressId);

  const category = CATEGORY_BY_TYPE.get(reader.getLineType(expressId));
  if (category === undefined) return null;

  const line = reader.getLine<Record<string, unknown>>(expressId);
  if (line === null) return null;

  const children: SpatialNode[] = [];
  for (const childId of aggregates.get(expressId) ?? []) {
    const child = readNode(reader, childId, scale, aggregates, containment, visited);
    if (child !== null) children.push(child);
  }

  let elevation: number | undefined;
  if (category === 'STOREY') {
    const raw = (line['Elevation'] as IfcValue | null | undefined)?.value;
    // Writer emits Elevation in metres; scale converts file units → metres,
    // then ×1000 yields mm to match the BimModel input contract.
    if (typeof raw === 'number') elevation = raw * scale * 1000;
  }

  return {
    expressId,
    guid: readGuid(line),
    name: readName(reader, line),
    category,
    elevation,
    children,
    containedElements: containment.get(expressId) ?? [],
  };
}

/**
 * Reconstructs the spatial-structure tree from `IfcRelAggregates` and attaches
 * contained elements via `IfcRelContainedInSpatialStructure`. Walks top-down
 * from the single `IfcProject`. Returns `null` when no `IfcProject` is present.
 *
 * @param scale metres-per-file-unit; storey elevations are scaled to mm as
 *   `Elevation × scale × 1000` to match the `BimModel` input contract.
 */
export function buildSpatialTree(reader: SpfReader, scale: number): SpatialNode | null {
  const projectIds = reader.getLinesOfType(WebIFC.IFCPROJECT);
  const rootId = projectIds[0];
  if (rootId === undefined) return null;

  const aggregates = buildAggregatesIndex(reader);
  const containment = buildContainmentIndex(reader);
  return readNode(reader, rootId, scale, aggregates, containment, new Set<number>());
}

/**
 * Returns a flat map of element express id → containing spatial-structure
 * express id, built from every `IfcRelContainedInSpatialStructure` line. When
 * an element appears in multiple containment relations, the last one wins.
 */
export function buildElementContainmentMap(reader: SpfReader): Map<number, number> {
  const map = new Map<number, number>();
  for (const [structure, elements] of buildContainmentIndex(reader)) {
    for (const elementId of elements) map.set(elementId, structure);
  }
  return map;
}
