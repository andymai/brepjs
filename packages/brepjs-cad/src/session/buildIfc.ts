import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveProjectPackageEntry } from '../preview/evaluate.js';
import { initOcctWasm, loadBrep } from '../verify/brepjsRuntime.js';
import type { WorkerBuild } from './buildFamilies.js';
import {
  errorMessage,
  jsonSafe,
  type Bounds,
  type BuildDiagnostic,
  type DiagnosticSeverity,
  type ElementRecord,
  type RelationshipRecord,
  type ScalarRecord,
  type StoreyRef,
} from './records.js';

// Structural views of brepjs-bim: like brepjs-families, it is imported from the user's project at
// runtime, so brepjs-cad carries no dependency on it.
interface ImportedPsetLike {
  readonly name: string;
  readonly isQuantity: boolean;
  readonly properties: ScalarRecord;
}

interface ImportedElementLike {
  readonly expressId: number;
  readonly guid: string;
  readonly name: string;
  readonly category: string;
  readonly predefinedType?: string | undefined;
  readonly spatialStructureExpressId?: number | undefined;
  readonly geometry: {
    readonly fidelity: string;
    readonly completeness: string;
    readonly bounds: Bounds | null;
    readonly volumeMm3: number | null;
  };
  readonly psets: readonly ImportedPsetLike[];
  readonly material: unknown;
  readonly classification: unknown;
  readonly voidedBy: readonly number[];
  readonly fills?: number | undefined;
}

interface ImportedSpatialNodeLike {
  readonly expressId: number;
  readonly guid: string;
  readonly name: string;
  readonly category: string;
  readonly elevationMm?: number | undefined;
  readonly children: readonly ImportedSpatialNodeLike[];
  readonly containedElements: readonly number[];
}

export interface ImportedModelLike {
  readonly schema: string;
  readonly spatialTree: ImportedSpatialNodeLike | null;
  readonly elements: readonly ImportedElementLike[];
  readonly diagnostics: {
    readonly issues: readonly {
      readonly code: string;
      readonly severity: DiagnosticSeverity;
      readonly message: string;
      readonly entity?: string | number | undefined;
    }[];
  };
  readonly applicationName?: string | undefined;
}

interface BimNs {
  fromIfc(
    bytes: Uint8Array
  ): Promise<{ ok: true; value: ImportedModelLike } | { ok: false; error: unknown }>;
  disposeImportedModel(model: ImportedModelLike): void;
}

async function importBim(ifcPath: string): Promise<BimNs | undefined> {
  try {
    // Typed through BimNs so a brepjs-bim API change that breaks these structural views fails typecheck.
    const bim: BimNs = await import('brepjs-bim');
    return bim;
  } catch {
    for (const from of [ifcPath, join(process.cwd(), 'package.json')]) {
      const abs = resolveProjectPackageEntry('brepjs-bim', from);
      if (abs === undefined) continue;
      try {
        return (await import(pathToFileURL(abs).href)) as BimNs;
      } catch {
        // try the next anchor
      }
    }
    return undefined;
  }
}

function failed(code: string, message: string): WorkerBuild {
  return {
    outcome: { ok: false, diagnostics: [{ severity: 'error', code, message }] },
    dispose: () => {},
  };
}

/** Import an IFC file into element records, holding the imported model for later phases. */
export async function buildIfc(ifcPath: string): Promise<WorkerBuild> {
  const bim = await importBim(ifcPath);
  if (bim === undefined) {
    return failed(
      'BIM_MISSING',
      "opening an .ifc needs 'brepjs-bim' and 'web-ifc' installed in this project"
    );
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(ifcPath));
    await initOcctWasm(await loadBrep());
  } catch (e) {
    return failed('BUILD_FAILED', errorMessage(e));
  }
  let model: ImportedModelLike;
  try {
    const r = await bim.fromIfc(bytes);
    if (!r.ok) return failed('IFC_IMPORT_FAILED', errorMessage(r.error));
    model = r.value;
  } catch (e) {
    return failed('IFC_IMPORT_FAILED', errorMessage(e));
  }
  const diagnostics: BuildDiagnostic[] = [];
  const { elements, root } = ifcRecords(model, diagnostics);
  return {
    outcome: {
      ok: true,
      summary: {
        kind: 'ifc',
        units: 'mm',
        ...(root !== undefined ? { root } : {}),
        elements,
        diagnostics,
        schema: model.schema,
        ...(model.applicationName !== undefined ? { applicationName: model.applicationName } : {}),
      },
    },
    dispose: () => bim.disposeImportedModel(model),
  };
}

function splitPsets(psets: readonly ImportedPsetLike[]): {
  psets: Record<string, ScalarRecord>;
  quantities: Record<string, ScalarRecord>;
} {
  const out = {
    psets: {} as Record<string, ScalarRecord>,
    quantities: {} as Record<string, ScalarRecord>,
  };
  for (const p of psets) (p.isQuantity ? out.quantities : out.psets)[p.name] = p.properties;
  return out;
}

// fromIfc's per-element warnings for a Body that exists but did not (fully) reconstruct. An element
// with no Body at all gets neither, so these are what separate failed geometry from absent geometry.
const BODY_FAILURE_CODES = new Set(['BODY_RECONSTRUCTION_NONE', 'PARTIAL_BODY_RECONSTRUCTION']);

/** Element records for an imported model; exported for tests. */
export function ifcRecords(
  model: ImportedModelLike,
  diagnostics: BuildDiagnostic[]
): { elements: ElementRecord[]; root: string | undefined } {
  // GlobalIds are the identity, but files in the wild repeat them; suffix the express id so every
  // record stays addressable, and say so.
  const idOf = new Map<number, string>();
  const seen = new Map<string, number>();
  const claim = (guid: string, expressId: number): void => {
    const prior = seen.get(guid);
    if (prior === undefined) {
      seen.set(guid, expressId);
      idOf.set(expressId, guid);
      return;
    }
    idOf.set(expressId, `${guid}#${expressId}`);
    diagnostics.push({
      severity: 'warning',
      code: 'DUPLICATE_GLOBAL_ID',
      message: `GlobalId ${guid} is used by #${prior} and #${expressId}; the second is addressed as ${guid}#${expressId}`,
      id: `${guid}#${expressId}`,
    });
  };
  const nodes: ImportedSpatialNodeLike[] = [];
  const collect = (n: ImportedSpatialNodeLike): void => {
    nodes.push(n);
    n.children.forEach(collect);
  };
  if (model.spatialTree) collect(model.spatialTree);
  for (const n of nodes) claim(n.guid, n.expressId);
  for (const el of model.elements) claim(el.guid, el.expressId);
  const id = (expressId: number): string | undefined => idOf.get(expressId);

  const rels = (kind: string, expressIds: readonly number[]): RelationshipRecord[] =>
    expressIds.flatMap((e) => {
      const target = id(e);
      return target !== undefined ? [{ kind, target }] : [];
    });

  const storeyOfNode = new Map<number, StoreyRef>();
  const parentOfNode = new Map<number, string>();
  const markStoreys = (n: ImportedSpatialNodeLike, storey: StoreyRef | undefined): void => {
    const own = n.category === 'STOREY' ? { id: id(n.expressId) ?? n.guid, name: n.name } : storey;
    if (own) storeyOfNode.set(n.expressId, own);
    for (const c of n.children) {
      parentOfNode.set(c.expressId, id(n.expressId) ?? n.guid);
      markStoreys(c, own);
    }
  };
  if (model.spatialTree) markStoreys(model.spatialTree, undefined);

  const hostOf = new Map<number, number>();
  const filledBy = new Map<number, number[]>();
  for (const el of model.elements) {
    for (const o of el.voidedBy) hostOf.set(o, el.expressId);
    if (el.fills !== undefined)
      filledBy.set(el.fills, [...(filledBy.get(el.fills) ?? []), el.expressId]);
  }
  const byExpressId = new Map(model.elements.map((e) => [e.expressId, e]));
  const bodyFailures = new Map<number, string>();
  for (const issue of model.diagnostics.issues) {
    if (typeof issue.entity === 'number' && BODY_FAILURE_CODES.has(issue.code)) {
      bodyFailures.set(issue.entity, issue.message);
    }
  }

  const out: ElementRecord[] = [];
  for (const n of nodes) {
    const childIds = [
      ...n.children.map((c) => c.expressId),
      ...n.containedElements.filter((e) => byExpressId.has(e)),
    ];
    const children = childIds.flatMap((e) => id(e) ?? []);
    const parent = parentOfNode.get(n.expressId);
    const storey = n.category === 'STOREY' ? undefined : storeyOfNode.get(n.expressId);
    out.push({
      id: id(n.expressId) ?? n.guid,
      guid: n.guid,
      expressId: n.expressId,
      type: n.category,
      category: n.category,
      name: n.name,
      ...(parent !== undefined ? { parent } : {}),
      children,
      ...(storey !== undefined ? { storey } : {}),
      ...(n.elevationMm !== undefined ? { props: { elevationMm: n.elevationMm } } : {}),
      relationships: rels('Contains', childIds),
      hasGeometry: false,
    });
  }

  for (const el of model.elements) {
    const host = hostOf.get(el.expressId);
    const containerId = el.spatialStructureExpressId;
    const parent =
      host !== undefined ? id(host) : containerId !== undefined ? id(containerId) : undefined;
    const storeyFrom =
      host !== undefined ? byExpressId.get(host)?.spatialStructureExpressId : containerId;
    const storey = storeyFrom !== undefined ? storeyOfNode.get(storeyFrom) : undefined;
    const relationships = [
      ...rels('Voids', el.voidedBy),
      ...rels('Fills', filledBy.get(el.expressId) ?? []),
    ];
    const { psets, quantities } = splitPsets(el.psets);
    const g = el.geometry;
    out.push({
      id: id(el.expressId) ?? el.guid,
      guid: el.guid,
      expressId: el.expressId,
      type: el.category,
      category: el.category,
      ...(el.predefinedType !== undefined ? { predefinedType: el.predefinedType } : {}),
      name: el.name,
      ...(parent !== undefined ? { parent } : {}),
      children: el.voidedBy.flatMap((o) => id(o) ?? []),
      ...(storey !== undefined ? { storey } : {}),
      psets,
      quantities,
      material: jsonSafe(el.material),
      classification: jsonSafe(el.classification),
      relationships,
      hasGeometry: g.fidelity !== 'NONE',
      fidelity: g.fidelity,
      completeness: g.completeness,
      ...(bodyFailures.has(el.expressId) ? { geometryError: bodyFailures.get(el.expressId) } : {}),
      ...(g.bounds !== null ? { bounds: g.bounds } : {}),
      ...(g.volumeMm3 !== null ? { volume: g.volumeMm3 } : {}),
    });
  }

  for (const issue of model.diagnostics.issues) {
    const target = typeof issue.entity === 'number' ? id(issue.entity) : issue.entity;
    diagnostics.push({
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      ...(target !== undefined ? { id: target } : {}),
    });
  }
  const root = model.spatialTree ? id(model.spatialTree.expressId) : undefined;
  return { elements: out, root };
}
