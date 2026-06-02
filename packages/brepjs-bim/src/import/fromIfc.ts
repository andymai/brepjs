import * as WebIFC from 'web-ifc';
import type { Result, ValidSolid } from 'brepjs';
import { ok, err, cut } from 'brepjs';
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
import { readBodyGeometry, type GeometryResult } from './geometryRead.js';
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

    const elements: ImportedElement[] = [];
    const byExpressId = new Map<number, ImportedElement>();
    for (const [type, category] of ELEMENT_TYPES) {
      for (const expressId of reader.getLinesOfType(type)) {
        const element = readElement(
          reader,
          expressId,
          category,
          scale,
          containment,
          options.skipGeometry ?? false,
          diagnostics
        );
        if (element === null) continue;
        elements.push(element);
        byExpressId.set(element.expressId, element);
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
  skipGeometry: boolean,
  diagnostics: ValidationIssue[]
): ImportedElement | null {
  try {
    const line = reader.getLine<Record<string, unknown>>(expressId);
    if (line === null) {
      diagnostics.push(
        issue('error', 'ELEMENT_READ_FAILED', `Element line ${expressId} could not be read`, expressId)
      );
      return null;
    }

    const guid = readGuid(line);
    const name = readName(reader, line);
    const predefinedType = readPredefinedType(line);

    const voids = readVoids(reader, expressId);
    const voidedBy = voids.map((v) => v.openingExpressId);
    const fills = findFills(reader, expressId);

    const geometry: ImportedGeometry = skipGeometry
      ? { fidelity: 'NONE', solid: null }
      : reconstructGeometry(reader, expressId, scale, voidedBy, diagnostics);

    const psets = readPsets(reader, expressId).map(toImportedPset);
    const material = readMaterial(reader, expressId, scale);
    const classification = readClassification(reader, expressId);
    const storeyExpressId = containment.get(expressId);

    return {
      expressId,
      guid,
      name,
      category,
      ...(predefinedType !== undefined ? { predefinedType } : {}),
      ...(storeyExpressId !== undefined ? { storeyExpressId } : {}),
      geometry,
      psets,
      material,
      classification,
      voidedBy,
      ...(fills !== undefined ? { fills } : {}),
    };
  } catch (e) {
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
  const base = toImportedGeometry(readBodyGeometry(reader, expressId, scale, diagnostics));
  if (base.fidelity !== 'PARAMETRIC' || base.solid === null || voidedBy.length === 0) {
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
  return { fidelity: 'PARAMETRIC', solid: host };
}

function toImportedGeometry(result: GeometryResult): ImportedGeometry {
  if (result.kind === 'SOLID') {
    return {
      fidelity: result.lossy ? 'TESSELLATED_MANIFOLD' : 'PARAMETRIC',
      solid: result.solid,
    };
  }
  if (result.kind === 'MESH') {
    return {
      fidelity: 'TESSELLATED_LOSSY',
      solid: null,
      meshVertices: result.vertices,
      meshIndices: result.indices,
    };
  }
  return { fidelity: 'NONE', solid: null };
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
