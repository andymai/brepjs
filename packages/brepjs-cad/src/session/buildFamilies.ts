import type { AnyShape } from 'brepjs';
import type { PreviewModelPayload } from 'brepjs-viewer';
import {
  familiesNodes,
  importFamilies,
  isFamiliesTree,
  isResolvedElementLike,
  loadModelValue,
  previewBuildOf,
  previewTree,
  type FamiliesEvaluatedNode,
  type FamiliesNs,
  type SourceLocationLike,
  type ResolvedElementLike,
} from '../preview/evaluate.js';
import { loadBrep, toolDir, type BrepNs } from '../verify/brepjsRuntime.js';
import { importBim } from './bim.js';
import { exportFamiliesIfc, type ExportIfcArgs, type ExportIfcOutcome } from './exportIfc.js';
import { typecheckPart } from '../verify/typecheck.js';
import {
  boundsOfPositions,
  errorMessage,
  jsonSafe,
  type BuildDiagnostic,
  type BuildOutcome,
  type ElementRecord,
  type ScalarRecord,
  type StoreyRef,
} from './records.js';

// resolve() copies identity props into `attributes` and children into the tree, so a record's
// `props` leaves them out rather than carrying them twice.
const SKIPPED_PROPS = new Set(['name', 'psets', 'material', 'classification', 'children']);
const MAX_UNKEYED_EXAMPLES = 5;

export interface WorkerBuild {
  readonly outcome: BuildOutcome;
  dispose(): void;
  /** The merged render payload, keyed by record id; built on first use. Successful builds only. */
  payload?(): PreviewModelPayload;
  /** Families builds only: the model as IFC. */
  exportIfc?(args: ExportIfcArgs): Promise<ExportIfcOutcome>;
  /** What eval_in_session code receives as `ctx`: live kernel objects, not copies. */
  evalContext?(): object;
}

/** The parts of `ctx` both kinds of build share. */
export function baseEvalContext(
  brep: BrepNs,
  kind: 'families' | 'ifc',
  elements: readonly ElementRecord[]
): Record<string, unknown> {
  const byId = new Map(elements.map((r) => [r.id, r]));
  return { kind, brep, records: elements, record: (id: string) => byId.get(id) };
}

const NOTHING_TO_DISPOSE = (): void => {};

function failed(code: string, message: string): WorkerBuild {
  return {
    outcome: { ok: false, diagnostics: [{ severity: 'error', code, message }] },
    dispose: NOTHING_TO_DISPOSE,
  };
}

/**
 * Build a families program into element records. The Evaluator stays alive with the build (its
 * caches own the meshes and shapes later phases render and export), so the caller disposes it.
 */
export async function buildFamilies(
  entryPath: string,
  opts: { readonly typecheck: boolean }
): Promise<WorkerBuild> {
  if (opts.typecheck) {
    const tc = typecheckPart(entryPath, toolDir());
    if (!tc.ok) {
      const diagnostics: BuildDiagnostic[] = tc.errors.map((e) => ({
        severity: 'error',
        code: e.code ?? 'TYPECHECK',
        message: e.message,
      }));
      return { outcome: { ok: false, diagnostics }, dispose: NOTHING_TO_DISPOSE };
    }
  }

  let loaded: Awaited<ReturnType<typeof loadModelValue>>;
  let fam: Awaited<ReturnType<typeof importFamilies>>;
  try {
    // brepjs (and the resolve hook) first, so brepjs-families binds to the same kernel; then
    // families, so element creation is recorded while the model module runs.
    await loadBrep();
    fam = await importFamilies(entryPath);
    fam?.captureSourceLocations?.(true);
    loaded = await loadModelValue(entryPath);
  } catch (e) {
    return failed('BUILD_FAILED', errorMessage(e));
  }
  const { brep, value } = loaded;
  if (!isFamiliesTree(value)) {
    return failed(
      'NOT_A_MODEL',
      'the default export is not a brepjs-families element tree; use run_program for a single part'
    );
  }
  if (fam === undefined) {
    return failed('FAMILIES_MISSING', "'brepjs-families' is not installed in this project");
  }

  let resolved: ResolvedElementLike;
  try {
    resolved = isResolvedElementLike(value) ? value : fam.resolve(value);
  } catch (e) {
    return failed('RESOLVE_FAILED', errorMessage(e));
  }

  const evaluator = new brep.csg.Evaluator();
  try {
    const model = fam.evaluateModel(resolved, evaluator, {}, { shapes: true });
    const diagnostics: BuildDiagnostic[] = [];
    const sourceOf = fam.sourceOf?.bind(fam);
    const elements = toRecords(brep, resolved, model.byKeyPath, diagnostics, sourceOf);
    let payload: PreviewModelPayload | undefined;
    return {
      outcome: {
        ok: true,
        summary: { kind: 'families', units: 'mm', root: resolved.keyPath, elements, diagnostics },
      },
      dispose: () => evaluator[Symbol.dispose](),
      payload: () =>
        (payload ??= previewBuildOf(
          familiesNodes(brep, model.byKeyPath),
          previewTree(resolved)
        ).payload),
      evalContext: () => ({
        ...baseEvalContext(brep, 'families', elements),
        model: { root: resolved, byKeyPath: model.byKeyPath },
      }),
      exportIfc: async (args) => {
        const bim = await importBim(entryPath);
        if (bim === undefined) {
          return {
            ok: false,
            diagnostics: [
              {
                severity: 'error',
                code: 'BIM_MISSING',
                message: "IFC export needs 'brepjs-bim' and 'web-ifc' installed in this project",
              },
            ],
          };
        }
        return exportFamiliesIfc(bim, resolved, evaluator, args);
      },
    };
  } catch (e) {
    evaluator[Symbol.dispose]();
    return failed('EVALUATE_FAILED', errorMessage(e));
  }
}

function volumeOf(brep: BrepNs, shape: AnyShape): number | undefined {
  if (!brep.isShape3D(shape)) return undefined;
  try {
    const r = brep.measureVolume(shape);
    return r.ok ? r.value : undefined;
  } catch {
    return undefined;
  }
}

function sourceField(loc: SourceLocationLike | undefined): Pick<ElementRecord, 'source'> {
  return loc ? { source: { file: loc.file, line: loc.line, column: loc.column } } : {};
}

function propsOf(props: Readonly<Record<string, unknown>> | undefined): ScalarRecord | undefined {
  if (props === undefined) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (SKIPPED_PROPS.has(k)) continue;
    const safe = jsonSafe(v);
    if (safe !== undefined) out[k] = safe;
  }
  return out;
}

function toRecords(
  brep: BrepNs,
  root: ResolvedElementLike,
  byKeyPath: ReadonlyMap<string, FamiliesEvaluatedNode>,
  diagnostics: BuildDiagnostic[],
  sourceOf: FamiliesNs['sourceOf']
): ElementRecord[] {
  const out: ElementRecord[] = [];
  const unkeyed: string[] = [];

  const walk = (
    n: ResolvedElementLike,
    parent: string | undefined,
    storey: StoreyRef | undefined
  ) => {
    const rawName = n.attributes['name'];
    const name = typeof rawName === 'string' ? rawName : undefined;
    const predefined = n.props?.['predefinedType'];
    const hasGeometry = n.geometry.kind !== 'Empty';
    let bounds: ElementRecord['bounds'];
    let volume: number | undefined;
    let geometryError: string | undefined;
    let renderable = false;
    if (hasGeometry) {
      const node = byKeyPath.get(n.keyPath);
      const mesh = node?.mesh.ok ? node.mesh.value : undefined;
      renderable = mesh !== undefined;
      if (mesh) bounds = boundsOfPositions(mesh.vertices);
      else geometryError = errorMessage(node?.mesh.error ?? 'element has no evaluated mesh');
      const shape = node?.shape?.ok ? node.shape.value : undefined;
      if (shape) volume = volumeOf(brep, shape);
      if (geometryError !== undefined) {
        diagnostics.push({
          severity: 'error',
          code: 'ELEMENT_GEOMETRY_FAILED',
          message: geometryError,
          id: n.keyPath,
        });
      }
    }
    if (n.keyed === false) unkeyed.push(n.keyPath);
    out.push({
      id: n.keyPath,
      keyPath: n.keyPath,
      ...(n.keyed !== undefined ? { keyed: n.keyed } : {}),
      type: n.type,
      ...(n.archetype !== undefined ? { archetype: n.archetype } : {}),
      category: n.archetype ?? n.type,
      ...(typeof predefined === 'string' ? { predefinedType: predefined } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(parent !== undefined ? { parent } : {}),
      children: n.children.map((c) => c.keyPath),
      ...(storey !== undefined ? { storey } : {}),
      props: propsOf(n.props),
      psets: jsonSafe(n.attributes['psets']) as ElementRecord['psets'],
      material: jsonSafe(n.attributes['material']),
      classification: jsonSafe(n.attributes['classification']),
      relationships: (n.relationships ?? []).map((r) => ({ kind: r.kind, target: r.target })),
      hasGeometry,
      renderable,
      ...sourceField(sourceOf?.(n)),
      ...(n.geometry.structuralHash !== undefined
        ? { geometryHash: n.geometry.structuralHash.toString(16) }
        : {}),
      ...(bounds !== undefined ? { bounds } : {}),
      ...(volume !== undefined ? { volume } : {}),
      ...(geometryError !== undefined ? { geometryError } : {}),
    });
    const childStorey =
      n.archetype === 'storey' ? { id: n.keyPath, ...(name ? { name } : {}) } : storey;
    for (const c of n.children) walk(c, n.keyPath, childStorey);
  };
  walk(root, undefined, undefined);

  if (unkeyed.length > 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'UNKEYED_ELEMENTS',
      message:
        `${unkeyed.length} element(s) have index-based key paths, which shift when siblings are ` +
        `added or reordered. Add a key prop for stable identity: ` +
        unkeyed.slice(0, MAX_UNKEYED_EXAMPLES).join(', ') +
        (unkeyed.length > MAX_UNKEYED_EXAMPLES ? ', ...' : ''),
    });
  }
  return out;
}
