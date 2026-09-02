import * as WebIFC from 'web-ifc';
import type { Bounds3D, Result, ValidSolid } from 'brepjs';
import { ok, err, cut, getBounds, measureVolume } from 'brepjs';
import type { BimError } from '../errors/bimError.js';
import { importError } from '../errors/bimError.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import {
  issue,
  appendIssues,
  emptyReport,
  type ValidationIssue,
  type ValidationReport,
} from '../validation/severity.js';
import { SpfReader, type SpfReaderSettings } from './spfReader.js';
import { readLengthScale } from './placement.js';
import { buildSpatialTree, buildElementContainmentMap, type SpatialNode } from './spatialTree.js';
import { readBodyGeometry, readBodyItems } from './geometryRead.js';
import {
  readPsets,
  readMaterial,
  readClassification,
  readVoids,
  readOwnerHistory,
  type ImportedPset as DataPset,
} from './dataRead.js';
import type {
  ImportedModel,
  ImportedElement,
  ImportedElementCategory,
  ImportedGeometry,
  ImportedPset,
  ImportedSpatialNode,
} from './importedModel.js';

export type { ImportedModel } from './importedModel.js';

export interface FromIfcOptions {
  /** Activate web-ifc's large-coordinate recentering on open. Default false. */
  readonly coordinateToOrigin?: boolean | undefined;
  /** Skip body-geometry reconstruction for fast metadata-only reads. Default false. */
  readonly skipGeometry?: boolean | undefined;
}

export interface FromIfcTestHooks {
  readonly afterGeometry?: ((expressId: number, geometry: ImportedGeometry) => void) | undefined;
  readonly afterElement?:
    ((element: ImportedElement, accumulatedCount: number) => void) | undefined;
}

let testHooks: FromIfcTestHooks | null = null;

/** Package-internal deterministic failure seam for import ownership tests. */
export function setFromIfcTestHooksForTesting(hooks: FromIfcTestHooks | null): void {
  testHooks = hooks;
}

/**
 * Each enumerated physical-element IFC type and the {@link ImportedElementCategory}
 * it maps to. Curtain-wall sub-components (IfcPlate/IfcMember) and stair/ramp
 * flights are mapped to their assembly-level category; anything not listed falls
 * back to PROXY.
 */
const ELEMENT_TYPES: ReadonlyArray<readonly [number, ImportedElementCategory]> = [
  [WebIFC.IFCWALL, 'WALL'],
  [WebIFC.IFCWALLSTANDARDCASE, 'WALL'],
  [WebIFC.IFCSLAB, 'SLAB'],
  [WebIFC.IFCBEAM, 'BEAM'],
  [WebIFC.IFCCOLUMN, 'COLUMN'],
  [WebIFC.IFCDOOR, 'DOOR'],
  [WebIFC.IFCWINDOW, 'WINDOW'],
  [WebIFC.IFCOPENINGELEMENT, 'OPENING'],
  [WebIFC.IFCSPACE, 'SPACE'],
  [WebIFC.IFCROOF, 'ROOF'],
  [WebIFC.IFCCURTAINWALL, 'CURTAIN_WALL'],
  [WebIFC.IFCFOOTING, 'FOOTING'],
  [WebIFC.IFCPILE, 'PILE'],
  [WebIFC.IFCSTAIR, 'STAIR'],
  [WebIFC.IFCSTAIRFLIGHT, 'STAIR'],
  [WebIFC.IFCRAMP, 'RAMP'],
  [WebIFC.IFCRAMPFLIGHT, 'RAMP'],
  [WebIFC.IFCRAILING, 'RAILING'],
  [WebIFC.IFCCOVERING, 'COVERING'],
  [WebIFC.IFCELEMENTASSEMBLY, 'ELEMENT_ASSEMBLY'],
  [WebIFC.IFCEARTHWORKSFILL, 'EARTHWORKS_FILL'],
  [WebIFC.IFCBUILDINGELEMENTPROXY, 'PROXY'],
];

/**
 * Reads an IFC STEP-SPF byte buffer into an {@link ImportedModel}: schema, unit
 * scale, spatial tree, and one {@link ImportedElement} per physical product
 * (geometry + Psets + material + classification + void/fill relations).
 *
 * Robustness model: every per-element reconstruction is wrapped in try/catch; a
 * failure pushes a diagnostic (severity `error` if the element could not be read
 * at all, `warning`/`info` for partial geometry) and the import continues. Only
 * fatal failures — bad bytes, unsupported schema, WASM open failure — return
 * `err`. Inspect {@link ImportedModel.diagnostics} for per-element quality.
 *
 * The web-ifc model handle is always closed in a `finally` block.
 */
export async function fromIfc(
  bytes: Uint8Array,
  options: FromIfcOptions = {}
): Promise<Result<ImportedModel, BimError>> {
  const settings: SpfReaderSettings = {
    coordinateToOrigin: options.coordinateToOrigin ?? false,
  };
  const readerResult = await SpfReader.create(bytes, settings);
  if (!readerResult.ok) return err(readerResult.error);
  const reader = readerResult.value;
  const elements: ImportedElement[] = [];

  try {
    reader.buildGuidMap();
    const diagnostics: ValidationIssue[] = [];

    if (reader.schema === 'IFC2X3') {
      diagnostics.push(
        issue(
          'warning',
          'SCHEMA_PARTIAL_SUPPORT',
          'IFC2X3 input has partial reader support; some entities may not reconstruct'
        )
      );
    }

    const scale = readLengthScale(reader);
    const spatialRoot = buildSpatialTree(reader, scale);
    const containment = buildElementContainmentMap(reader);
    const typeEnums = buildTypePredefinedMap(reader);

    const byExpressId = new Map<number, ImportedElement>();
    for (const [type, category] of ELEMENT_TYPES) {
      for (const expressId of reader.getLinesOfType(type)) {
        const element = readElement(
          reader,
          expressId,
          category,
          scale,
          containment,
          typeEnums,
          options.skipGeometry ?? false,
          diagnostics
        );
        if (element === null) continue;
        elements.push(element);
        byExpressId.set(element.expressId, element);
        testHooks?.afterElement?.(element, elements.length);
      }
    }

    const report: ValidationReport = appendIssues(emptyReport(), diagnostics);
    const applicationName = readApplicationName(reader);

    const model: ImportedModel = {
      schema: reader.schema,
      spatialTree: spatialRoot === null ? null : mapSpatialNode(spatialRoot),
      elements,
      byExpressId,
      diagnostics: report,
      ...(applicationName !== undefined ? { applicationName } : {}),
    };
    return ok(model);
  } catch (e) {
    disposeElements(elements);
    return err(importError('IMPORT_FAILED', 'Unexpected failure during IFC import', e));
  } finally {
    reader.close();
  }
}

/**
 * Reads one product into an {@link ImportedElement}. Returns null only when the
 * element line itself is unreadable (an `error` diagnostic is recorded). Any
 * sub-read failure is isolated by its own reader and never aborts the element.
 */
function readElement(
  reader: SpfReader,
  expressId: number,
  category: ImportedElementCategory,
  scale: number,
  containment: ReadonlyMap<number, number>,
  typeEnums: ReadonlyMap<number, string>,
  skipGeometry: boolean,
  diagnostics: ValidationIssue[]
): ImportedElement | null {
  let geometry: ImportedGeometry | null = null;
  try {
    const line = reader.getLine<Record<string, unknown>>(expressId);
    if (line === null) {
      diagnostics.push(
        issue(
          'error',
          'ELEMENT_READ_FAILED',
          `Element line ${expressId} could not be read`,
          expressId
        )
      );
      return null;
    }

    const guid = readGuid(line);
    const name = readName(reader, line);
    // Conformant exports carry the enum on the relating type object (OJT001)
    // with the occurrence attribute empty; fall back through IfcRelDefinesByType.
    const predefinedType = readPredefinedType(line) ?? typeEnums.get(expressId);

    const voids = readVoids(reader, expressId);
    const voidedBy = voids.map((v) => v.openingExpressId);
    const fills = findFills(reader, expressId);

    geometry = skipGeometry
      ? {
          fidelity: 'NONE',
          completeness: 'NONE',
          solids: [],
          solid: null,
          bounds: null,
          volumeMm3: null,
        }
      : reconstructGeometry(reader, expressId, scale, voidedBy, diagnostics);
    testHooks?.afterGeometry?.(expressId, geometry);

    const psets = readPsets(reader, expressId).map(toImportedPset);
    const material = readMaterial(reader, expressId, scale);
    const classification = readClassification(reader, expressId);
    const spatialStructureExpressId = containment.get(expressId);

    return {
      expressId,
      guid,
      name,
      category,
      ...(predefinedType !== undefined ? { predefinedType } : {}),
      ...(spatialStructureExpressId !== undefined
        ? { spatialStructureExpressId, storeyExpressId: spatialStructureExpressId }
        : {}),
      geometry,
      psets,
      material,
      classification,
      voidedBy,
      ...(fills !== undefined ? { fills } : {}),
    };
  } catch (e) {
    if (geometry !== null) disposeGeometry(geometry);
    diagnostics.push(
      issue(
        'error',
        'ELEMENT_READ_FAILED',
        `Element ${expressId} reconstruction threw: ${errMsg(e)}`,
        expressId
      )
    );
    return null;
  }
}

/** Finds the opening this element fills (door/window), via IfcRelFillsElement. */
function findFills(reader: SpfReader, elementExpressId: number): number | undefined {
  for (const relId of reader.getLinesOfType(WebIFC.IFCRELFILLSELEMENT)) {
    const rel = reader.getLine<Record<string, unknown>>(relId);
    if (rel === null) continue;
    if (refValue(rel['RelatedBuildingElement']) !== elementExpressId) continue;
    const opening = refValue(rel['RelatingOpeningElement']);
    if (opening !== undefined) return opening;
  }
  return undefined;
}

/**
 * Reconstructs a host element's body geometry and, per IFC `IfcRelVoidsElement`
 * semantics, subtracts the reconstructed solid of every opening that voids it —
 * so a wall with a door hole comes back as the cut solid, matching the source
 * model. Falls back to the uncut solid (with a diagnostic) if a cut fails.
 */
function reconstructGeometry(
  reader: SpfReader,
  expressId: number,
  scale: number,
  voidedBy: readonly number[],
  diagnostics: ValidationIssue[]
): ImportedGeometry {
  const base = toImportedGeometry(reader, expressId, scale, diagnostics);
  if (
    base.fidelity !== 'PARAMETRIC' ||
    base.completeness !== 'COMPLETE' ||
    base.solid === null ||
    voidedBy.length === 0
  ) {
    return base;
  }

  // cut<ValidSolid> preserves the base's solid type; the kernel may wrap the
  // result in a single-solid compound, so we trust the typed Result rather than
  // re-running isSolid (which rejects the compound wrapper) — mirroring how
  // BimModel applies opening cuts on the write side.
  let host: ValidSolid = base.solid;
  for (const openingId of voidedBy) {
    const opening = readBodyGeometry(reader, openingId, scale, diagnostics);
    if (opening.kind !== 'SOLID') continue;
    const cutResult = cut<ValidSolid>(host, opening.solid);
    // cut() consumes neither input; free the opening tool every iteration.
    opening.solid[Symbol.dispose]();
    if (!cutResult.ok) {
      diagnostics.push(
        issue(
          'warning',
          'VOID_SUBTRACTION_FAILED',
          `Opening ${openingId} could not be subtracted from element ${expressId}: ${cutResult.error.message}`,
          expressId
        )
      );
      continue;
    }
    // Free the prior host (the base body on the first cut) before adopting the result.
    host[Symbol.dispose]();
    host = cutResult.value;
  }
  return completeImportedGeometry('PARAMETRIC', [host], expressId, diagnostics);
}

function toImportedGeometry(
  reader: SpfReader,
  expressId: number,
  scale: number,
  diagnostics: ValidationIssue[]
): ImportedGeometry {
  const body = readBodyItems(reader, expressId, scale, diagnostics);
  const solids: ValidSolid[] = [];
  let hasTessellatedSolid = false;
  let lossyMesh: { readonly vertices: Float32Array; readonly indices: Uint32Array } | null = null;
  for (const item of body.items) {
    if (item.kind === 'SOLID') {
      solids.push(item.solid);
      hasTessellatedSolid ||= item.lossy;
    } else if (item.kind === 'MESH' && lossyMesh === null) {
      lossyMesh = { vertices: item.vertices, indices: item.indices };
    }
  }

  const completeness =
    body.hasBody && body.itemCount > 0 && solids.length === body.itemCount
      ? 'COMPLETE'
      : solids.length > 0
        ? 'PARTIAL'
        : 'NONE';
  if (completeness === 'PARTIAL') {
    diagnostics.push(
      issue(
        'warning',
        'PARTIAL_BODY_RECONSTRUCTION',
        `Reconstructed ${solids.length} of ${body.itemCount} Body items`,
        expressId,
        { reconstructedItems: solids.length, bodyItems: body.itemCount }
      )
    );
  } else if (completeness === 'NONE' && body.hasBody) {
    diagnostics.push(
      issue(
        'warning',
        'BODY_RECONSTRUCTION_NONE',
        `The Product has ${body.itemCount} Body item(s), but none reconstructed as solids`,
        expressId,
        { bodyItems: body.itemCount }
      )
    );
  }

  const fidelity =
    solids.length > 0
      ? hasTessellatedSolid
        ? 'TESSELLATED_MANIFOLD'
        : 'PARAMETRIC'
      : lossyMesh !== null
        ? 'TESSELLATED_LOSSY'
        : 'NONE';
  const aggregate =
    completeness === 'COMPLETE'
      ? measureCompleteBody(solids, expressId, diagnostics)
      : { bounds: null, volumeMm3: null };
  return {
    fidelity,
    completeness,
    solids,
    solid: completeness === 'COMPLETE' && solids.length === 1 ? (solids[0] ?? null) : null,
    ...aggregate,
    ...(lossyMesh !== null
      ? { meshVertices: lossyMesh.vertices, meshIndices: lossyMesh.indices }
      : {}),
  };
}

function completeImportedGeometry(
  fidelity: ImportedGeometry['fidelity'],
  solids: readonly [ValidSolid, ...ValidSolid[]],
  expressId: number,
  diagnostics: ValidationIssue[]
): ImportedGeometry {
  return {
    fidelity,
    completeness: 'COMPLETE',
    solids,
    solid: solids.length === 1 ? solids[0] : null,
    ...measureCompleteBody(solids, expressId, diagnostics),
  };
}

function measureCompleteBody(
  solids: readonly ValidSolid[],
  expressId: number,
  diagnostics: ValidationIssue[]
): { readonly bounds: Bounds3D | null; readonly volumeMm3: number | null } {
  try {
    const first = solids[0];
    if (first === undefined) return { bounds: null, volumeMm3: null };
    const initial = getBounds(first);
    let xMin = initial.xMin;
    let xMax = initial.xMax;
    let yMin = initial.yMin;
    let yMax = initial.yMax;
    let zMin = initial.zMin;
    let zMax = initial.zMax;
    let volumeMm3 = 0;
    for (const solid of solids) {
      const measured = measureVolume(solid);
      if (!measured.ok) throw new Error(measured.error.message);
      volumeMm3 += measured.value;
      const itemBounds = getBounds(solid);
      xMin = Math.min(xMin, itemBounds.xMin);
      xMax = Math.max(xMax, itemBounds.xMax);
      yMin = Math.min(yMin, itemBounds.yMin);
      yMax = Math.max(yMax, itemBounds.yMax);
      zMin = Math.min(zMin, itemBounds.zMin);
      zMax = Math.max(zMax, itemBounds.zMax);
    }
    const bounds: Bounds3D = { xMin, xMax, yMin, yMax, zMin, zMax };
    return { bounds, volumeMm3 };
  } catch (cause) {
    diagnostics.push(
      issue(
        'warning',
        'BODY_AGGREGATE_MEASUREMENT_FAILED',
        `Complete Body aggregate measurement failed: ${errMsg(cause)}`,
        expressId
      )
    );
    return { bounds: null, volumeMm3: null };
  }
}

function disposeGeometry(geometry: ImportedGeometry): void {
  for (const solid of geometry.solids) solid[Symbol.dispose]();
}

function disposeElements(elements: readonly ImportedElement[]): void {
  for (const element of elements) disposeGeometry(element.geometry);
}

function toImportedPset(pset: DataPset): ImportedPset {
  return {
    name: pset.name,
    isQuantity: pset.isQuantity,
    properties: pset.properties,
    measureTypes: pset.measureTypes,
  };
}

function mapSpatialNode(node: SpatialNode): ImportedSpatialNode {
  return {
    expressId: node.expressId,
    guid: brandGuid(node.guid),
    name: node.name,
    category: node.category,
    ...(node.elevation !== undefined ? { elevationMm: node.elevation } : {}),
    children: node.children.map(mapSpatialNode),
    containedElements: node.containedElements,
  };
}

/** Reads the owning application name from the first IfcOwnerHistory present. */
function readApplicationName(reader: SpfReader): string | undefined {
  const histories = reader.getLinesOfType(WebIFC.IFCOWNERHISTORY);
  const first = histories[0];
  if (first === undefined) return undefined;
  return readOwnerHistory(reader, first)?.applicationName;
}

// --- line-value extraction helpers ------------------------------------------

function readGuid(line: Record<string, unknown>): IfcGuid {
  const raw = (line['GlobalId'] as { value?: unknown } | null | undefined)?.value;
  return brandGuid(typeof raw === 'string' ? raw : '');
}

// GlobalIds round-tripped from the writer are valid 22-char IFC GUIDs; for
// third-party files we preserve the incoming string verbatim under the brand.
function brandGuid(s: string): IfcGuid {
  return s as IfcGuid;
}

function readName(reader: SpfReader, line: Record<string, unknown>): string {
  const raw = (line['Name'] as { value?: unknown } | null | undefined)?.value;
  return typeof raw === 'string' ? reader.decodeText(raw) : '';
}

/** occurrence expressId -> the relating type object's PredefinedType literal. */
function buildTypePredefinedMap(reader: SpfReader): Map<number, string> {
  const map = new Map<number, string>();
  for (const relId of reader.getLinesOfType(WebIFC.IFCRELDEFINESBYTYPE)) {
    const rel = reader.getLine<Record<string, unknown>>(relId);
    if (rel === null) continue;
    const typeId = refValue(rel['RelatingType']);
    if (typeId === undefined) continue;
    const typeLine = reader.getLine<Record<string, unknown>>(typeId);
    if (typeLine === null) continue;
    const pred = readPredefinedType(typeLine);
    if (pred === undefined) continue;
    const related = rel['RelatedObjects'];
    if (!Array.isArray(related)) continue;
    for (const ref of related) {
      const id = refValue(ref);
      if (id !== undefined) map.set(id, pred);
    }
  }
  return map;
}

function readPredefinedType(line: Record<string, unknown>): string | undefined {
  const raw = (line['PredefinedType'] as { value?: unknown } | null | undefined)?.value;
  return typeof raw === 'string' ? raw : undefined;
}

function refValue(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const value = (v as { value?: unknown }).value;
  return typeof value === 'number' ? value : undefined;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
