import * as WebIFC from 'web-ifc';
import type { Bounds3D, Result, ValidSolid } from 'brepjs';
import { ok, err } from 'brepjs';
import type { BimError } from '../errors/bimError.js';
import { importError } from '../errors/bimError.js';
import {
  productBodyBounds,
  measureProductBodyMaterial,
  type NonEmpty,
} from '../types/productBody.js';
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
import { cutImportedSolids } from './cutImportedSolids.js';
import { cleanupOwnedResources, cleanupReport, type CleanupReport } from '../productBodyCleanup.js';
import { reportedGeometryCleanup } from '../geometryCleanupDiagnostics.js';
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
 * The web-ifc model handle is closed before handing reconstructed owners to the caller.
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
  let result: Result<ImportedModel, BimError>;

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
    result = ok(model);
  } catch (e) {
    result = err(importError('IMPORT_FAILED', 'Unexpected failure during IFC import', e));
  }
  try {
    reader.close();
  } catch (cause) {
    result = err(
      result.ok
        ? importError('IMPORT_CLOSE_FAILED', 'Failed to close IFC reader', cause)
        : { ...result.error, metadata: { ...result.error.metadata, readerCloseCause: cause } }
    );
  }
  if (!result.ok) return err(withCleanup(result.error, disposeElements(elements), 'fromIfc'));
  return result;
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
    const failure =
      geometry === null
        ? e
        : withCleanup(
            importError('ELEMENT_READ_FAILED', 'Element read failed', e),
            disposeGeometry(geometry),
            'readElement'
          );
    diagnostics.push(
      issue(
        'error',
        'ELEMENT_READ_FAILED',
        `Element ${expressId} reconstruction threw: ${errMsg(e)}`,
        expressId,
        { cause: failure }
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
 * semantics, subtracts each opening's Body representation from a parametric host —
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
  if (base.fidelity !== 'PARAMETRIC' || base.completeness !== 'COMPLETE' || voidedBy.length === 0) {
    return base;
  }

  const firstHost = base.solids[0];
  if (firstHost === undefined) return base;
  const hosts = [...base.solids];
  try {
    for (const openingId of voidedBy) {
      const opening = readBodyGeometry(reader, openingId, scale, diagnostics);
      // Reference geometry describes an existing aperture, never a cutting tool.
      if (opening.kind !== 'SOLID') continue;
      using openingOwner = ownOpening(opening.solid, openingId);
      // Keep each source item's outputs together. This owner list always reflects
      // the current live hosts, including if a later cut or opening read throws.
      for (let hostIndex = 0; hostIndex < hosts.length;) {
        const host = hosts[hostIndex];
        if (host === undefined) break;
        const cutResult = cutImportedSolids(host, openingOwner.solid);
        if (!cutResult.ok) {
          diagnostics.push(
            issue(
              'warning',
              'VOID_SUBTRACTION_FAILED',
              `Opening ${openingId} could not be subtracted from element ${expressId}: ${cutResult.error.message}`,
              expressId,
              { cause: cutResult.error }
            )
          );
          hostIndex++;
          continue;
        }
        hosts.splice(hostIndex, 1, ...cutResult.value);
        const cleanup = cleanupOwnedResources([{ resource: host, itemIndex: hostIndex }], {
          operation: 'importOpening',
        });
        if (cleanup.kind === 'FAILED')
          diagnostics.push(
            issue(
              'warning',
              'VOID_HOST_CLEANUP_FAILED',
              'Opening result retained, but previous host release failed',
              expressId,
              { cleanup }
            )
          );
        hostIndex += cutResult.value.length;
      }
    }
    return completeImportedGeometry('PARAMETRIC', hosts, expressId, diagnostics);
  } catch (cause) {
    const failure = importError(
      'GEOMETRY_RECONSTRUCTION_FAILED',
      'Opening reconstruction failed',
      cause
    );
    const cleanup = cleanupOwnedResources(
      hosts.map((resource, itemIndex) => ({ resource, itemIndex })),
      { operation: 'reconstructGeometry' }
    );
    throw Object.assign(new Error(failure.message, { cause }), {
      code: failure.code,
      metadata: withCleanup(failure, cleanup, 'reconstructGeometry').metadata,
    });
  }
}

function ownOpening(
  solid: ValidSolid,
  openingId: number
): Disposable & { readonly solid: ValidSolid } {
  return {
    solid,
    [Symbol.dispose]() {
      const cleanup = cleanupOwnedResources([{ resource: solid, itemIndex: 0 }], {
        operation: 'importOpeningTool',
      });
      if (cleanup.kind === 'FAILED')
        throw new Error(`Opening ${openingId} cleanup failed`, {
          cause: {
            ...importError('OPENING_CLEANUP_FAILED', 'Temporary opening release failed'),
            metadata: { cleanup },
          },
        });
    },
  };
}

function withCleanup(error: BimError, cleanup: CleanupReport, operation: string): BimError {
  return {
    ...error,
    metadata: {
      ...error.metadata,
      cleanup: cleanupReport([
        ...reportedGeometryCleanup(error, operation),
        ...(cleanup.kind === 'FAILED' ? cleanup.diagnostics : []),
      ]),
    },
  };
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
  let lossyMesh: { readonly vertices: number[]; readonly indices: number[] } | null = null;
  for (const item of body.items) {
    if (item.kind === 'SOLID') {
      solids.push(item.solid);
      hasTessellatedSolid ||= item.lossy;
    } else if (item.kind === 'MESH') {
      const meshAccumulator: { readonly vertices: number[]; readonly indices: number[] } =
        lossyMesh ?? { vertices: [], indices: [] };
      lossyMesh = meshAccumulator;
      const vertexOffset = meshAccumulator.vertices.length / 3;
      for (const vertex of item.vertices) meshAccumulator.vertices.push(vertex);
      for (const index of item.indices) meshAccumulator.indices.push(vertexOffset + index);
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
    lossyMesh !== null
      ? 'TESSELLATED_LOSSY'
      : hasTessellatedSolid
        ? 'TESSELLATED_MANIFOLD'
        : solids.length > 0
          ? 'PARAMETRIC'
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
      ? {
          meshVertices: new Float32Array(lossyMesh.vertices),
          meshIndices: new Uint32Array(lossyMesh.indices),
        }
      : {}),
  };
}

function completeImportedGeometry(
  fidelity: ImportedGeometry['fidelity'],
  solids: readonly ValidSolid[],
  expressId: number,
  diagnostics: ValidationIssue[]
): ImportedGeometry {
  return {
    fidelity,
    completeness: 'COMPLETE',
    solids,
    solid: solids.length === 1 ? (solids[0] ?? null) : null,
    ...measureCompleteBody(solids, expressId, diagnostics),
  };
}

function measureCompleteBody(
  solids: readonly ValidSolid[],
  expressId: number,
  diagnostics: ValidationIssue[]
): { readonly bounds: Bounds3D | null; readonly volumeMm3: number | null } {
  const unavailable = (cause: unknown, message = errMsg(cause)) => {
    diagnostics.push(
      issue(
        'warning',
        'BODY_AGGREGATE_MEASUREMENT_FAILED',
        `Complete Body aggregate measurement failed: ${message}`,
        expressId,
        { cause }
      )
    );
    return { bounds: null, volumeMm3: null };
  };
  try {
    const [first, ...rest] = solids;
    if (first === undefined) return { bounds: null, volumeMm3: null };
    const items: NonEmpty<ValidSolid> = [first, ...rest];
    // These borrowed inputs are already World-placed. No further Placement is applied.
    const bounds = productBodyBounds(items);
    if (!bounds.ok) return unavailable(bounds.error, bounds.error.message);
    const volume = measureProductBodyMaterial(items);
    if (!volume.ok) return unavailable(volume.error, volume.error.message);
    return { bounds: bounds.value.bounds, volumeMm3: volume.value };
  } catch (cause) {
    return unavailable(cause);
  }
}

function disposeGeometry(geometry: ImportedGeometry): CleanupReport {
  return cleanupOwnedResources(
    geometry.solids.map((resource, itemIndex) => ({ resource, itemIndex })),
    { operation: 'disposeImportedGeometry' }
  );
}

function disposeElements(elements: readonly ImportedElement[]): CleanupReport {
  return cleanupOwnedResources(
    elements
      .flatMap(({ geometry }) => geometry.solids)
      .map((resource, itemIndex) => ({ resource, itemIndex })),
    { operation: 'disposeImportedElements' }
  );
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
