import type { AnyShape } from 'brepjs';
import type { EvaluatedNodeLike, PreviewModelPayload } from 'brepjs-viewer';
import { readFile } from 'node:fs/promises';
import { previewBuildOf, tryMeshEdges } from '../preview/evaluate.js';
import { initOcctWasm, loadBrep, type BrepNs } from '../verify/brepjsRuntime.js';
import { importBim } from './bim.js';
import { baseEvalContext, type WorkerBuild } from './buildFamilies.js';
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

// Structural views of brepjs-bim's imported model (bim.ts says why they are structural).
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
    /** Owned kernel solids, World-placed. */
    readonly solids?: readonly unknown[] | undefined;
    /** Raw triangles for a Body that never closed into a solid. */
    readonly meshVertices?: Float32Array | undefined;
    readonly meshIndices?: Uint32Array | undefined;
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
  let brep: BrepNs;
  try {
    bytes = new Uint8Array(await readFile(ifcPath));
    brep = await loadBrep();
    await initOcctWasm(brep);
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
  const { elements, root, idOf } = ifcRecords(model, diagnostics);
  let payload: PreviewModelPayload | undefined;
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
    payload: () => (payload ??= previewBuildOf(ifcNodes(brep, model, idOf), null).payload),
    evalContext: () => ({ ...baseEvalContext(brep, 'ifc', elements), model }),
  };
}

interface MeshPart {
  readonly vertices: Float32Array;
  readonly normals: Float32Array;
  readonly triangles: Uint32Array;
  readonly edges?: Float32Array | undefined;
}

function concat<T extends Float32Array | Uint32Array>(
  make: (n: number) => T,
  parts: readonly T[]
): T {
  const out = make(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function mergeParts(parts: readonly MeshPart[]): MeshPart {
  let base = 0;
  const triangles = parts.map((p) => {
    const shifted = p.triangles.map((i) => i + base);
    base += p.vertices.length / 3;
    return shifted;
  });
  return {
    vertices: concat(
      (n) => new Float32Array(n),
      parts.map((p) => p.vertices)
    ),
    normals: concat(
      (n) => new Float32Array(n),
      parts.map((p) => p.normals)
    ),
    triangles: concat((n) => new Uint32Array(n), triangles),
    edges: concat(
      (n) => new Float32Array(n),
      parts.flatMap((p) => (p.edges ? [p.edges] : []))
    ),
  };
}

/** Per-vertex normals for a raw triangle soup, accumulated from its face normals. */
function soupNormals(v: Float32Array, idx: Uint32Array): Float32Array {
  const n = new Float32Array(v.length);
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const [a, b, c] = [(idx[t] ?? 0) * 3, (idx[t + 1] ?? 0) * 3, (idx[t + 2] ?? 0) * 3];
    const ux = (v[b] ?? 0) - (v[a] ?? 0);
    const uy = (v[b + 1] ?? 0) - (v[a + 1] ?? 0);
    const uz = (v[b + 2] ?? 0) - (v[a + 2] ?? 0);
    const wx = (v[c] ?? 0) - (v[a] ?? 0);
    const wy = (v[c + 1] ?? 0) - (v[a + 1] ?? 0);
    const wz = (v[c + 2] ?? 0) - (v[a + 2] ?? 0);
    const nx = uy * wz - uz * wy;
    const ny = uz * wx - ux * wz;
    const nz = ux * wy - uy * wx;
    for (const k of [a, b, c]) {
      n[k] = (n[k] ?? 0) + nx;
      n[k + 1] = (n[k + 1] ?? 0) + ny;
      n[k + 2] = (n[k + 2] ?? 0) + nz;
    }
  }
  for (let i = 0; i + 2 < n.length; i += 3) {
    const len = Math.hypot(n[i] ?? 0, n[i + 1] ?? 0, n[i + 2] ?? 0) || 1;
    n[i] = (n[i] ?? 0) / len;
    n[i + 1] = (n[i + 1] ?? 0) / len;
    n[i + 2] = (n[i + 2] ?? 0) / len;
  }
  return n;
}

/** One renderable node per imported element with geometry, keyed like its record; exported for tests. */
export function ifcNodes(
  brep: BrepNs,
  model: ImportedModelLike,
  idOf: ReadonlyMap<number, string>
): Map<string, EvaluatedNodeLike> {
  const nodes = new Map<string, EvaluatedNodeLike>();
  for (const el of model.elements) {
    const parts: MeshPart[] = [];
    for (const solid of el.geometry.solids ?? []) {
      try {
        const m = brep.mesh(solid as AnyShape);
        parts.push({ ...m, edges: tryMeshEdges(brep, solid as AnyShape) });
      } catch {
        // A solid that won't mesh is left out of the picture; its record still carries the data.
      }
    }
    const { meshVertices, meshIndices } = el.geometry;
    // Raw triangles are Body items that never closed into solids, not a copy of them, so an element
    // can carry both.
    if (meshVertices && meshIndices) {
      parts.push({
        vertices: meshVertices,
        normals: soupNormals(meshVertices, meshIndices),
        triangles: meshIndices,
      });
    }
    if (parts.length === 0) continue;
    nodes.set(idOf.get(el.expressId) ?? el.guid, { mesh: { ok: true, value: mergeParts(parts) } });
  }
  return nodes;
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
): { elements: ElementRecord[]; root: string | undefined; idOf: ReadonlyMap<number, string> } {
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
      renderable: false,
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
      renderable: (g.solids?.length ?? 0) > 0 || g.meshVertices !== undefined,
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
  return { elements: out, root, idOf };
}
