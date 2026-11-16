import { modelFromShape, type BrepjsForLoad, type LoadedModel } from '../loaders.js';
import type { ShapeMeshLike } from '../convert.js';
import type { ExportFormat, ParamDefs, ParamInput, Presets } from './protocol.js';

type ResultLike<T> = { ok: true; value: T } | { ok: false; error: unknown };

// Structural view of the brepjs namespace the page uses, so a test can pass a fake.
export interface BrepjsForPart extends BrepjsForLoad {
  resolveParams?: (params: unknown, input: ParamInput) => ResultLike<ParamInput>;
  exportSTEP: (shape: unknown) => ResultLike<Blob>;
  exportSTL: (shape: unknown, opts?: { binary?: boolean }) => ResultLike<Blob>;
  exportThreeMF: (mesh: ShapeMeshLike, options?: { name?: string }) => ArrayBuffer;
}

export interface PartModule {
  default?: unknown;
  params?: unknown;
  presets?: unknown;
}

export class PartError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = 'PartError';
  }
}

export interface BuiltPart extends LoadedModel {
  values: ParamInput;
}

export interface ExportedPart {
  bytes: ArrayBuffer;
  filename: string;
  mime: string;
}

interface Declaration {
  kind: 'brepjs.params';
  defs: ParamDefs;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isDeclaration(v: unknown): v is Declaration {
  return isRecord(v) && v['kind'] === 'brepjs.params' && isRecord(v['defs']);
}

function isResultLike(v: unknown): v is ResultLike<unknown> {
  return isRecord(v) && typeof v['ok'] === 'boolean';
}

function toPartError(prefix: string, e: unknown): PartError {
  if (isRecord(e) && typeof e['message'] === 'string') {
    const code = typeof e['code'] === 'string' ? e['code'] : undefined;
    return new PartError(`${prefix}: ${e['message']}`, code);
  }
  return new PartError(`${prefix}: ${String(e)}`);
}

function dispose(shape: unknown): void {
  const disposer = (shape as { [Symbol.dispose]?: () => void } | null)?.[Symbol.dispose];
  if (typeof disposer === 'function') disposer.call(shape);
}

// A preset is a set of values by name; anything else in the export is dropped.
function readPresets(v: unknown): Presets {
  if (!isRecord(v)) return {};
  return Object.fromEntries(
    Object.entries(v).filter((entry): entry is [string, ParamInput] => isRecord(entry[1]))
  );
}

const MIME: Record<ExportFormat, string> = {
  step: 'application/STEP',
  stl: 'model/stl',
  '3mf': 'model/3mf',
};

/** Builds one part module at the values a caller sends, and exports the last build. */
export function createPartRunner(bk: BrepjsForPart, mod: PartModule) {
  const declaration = isDeclaration(mod.params) ? mod.params : null;
  let current: unknown = null;

  function resolve(input: ParamInput): ParamInput | undefined {
    if (declaration === null) return undefined;
    if (typeof bk.resolveParams !== 'function') {
      throw new PartError('this brepjs has no resolveParams');
    }
    const resolved = bk.resolveParams(declaration, input);
    if (!resolved.ok) throw toPartError('params', resolved.error);
    return resolved.value;
  }

  async function shapeFor(values: ParamInput | undefined): Promise<unknown> {
    if (typeof mod.default !== 'function') {
      throw new PartError('the part has no default-exported function');
    }
    const part = mod.default as (v?: ParamInput) => unknown;
    let out: unknown;
    try {
      out = await (values ? part(values) : part());
    } catch (e) {
      throw toPartError('part threw', e);
    }
    if (isResultLike(out)) {
      if (!out.ok) throw toPartError('part returned Err', out.error);
      out = out.value;
    }
    // A fluent `shape(...)` chain returns its wrapper; the built shape is its `.val`.
    if (isRecord(out) && '__wrapped' in out) out = out['val'];
    if (!isRecord(out) || !('wrapped' in out)) throw new PartError('the part returned no shape');
    return out;
  }

  return {
    defs: declaration?.defs ?? {},
    presets: readPresets(mod.presets),

    async build(input: ParamInput): Promise<BuiltPart> {
      const values = resolve(input);
      const shape = await shapeFor(values);
      let model: LoadedModel;
      try {
        model = modelFromShape(bk, shape, true);
      } catch (e) {
        dispose(shape);
        throw toPartError('mesh failed', e);
      }
      dispose(current);
      current = shape;
      return { ...model, values: values ?? {} };
    },

    async export(format: ExportFormat, name: string): Promise<ExportedPart> {
      if (current === null) throw new PartError('no part is built');
      const filename = `${name}.${format}`;
      if (format === '3mf') {
        return {
          bytes: bk.exportThreeMF(bk.mesh(current), { name }),
          filename,
          mime: MIME[format],
        };
      }
      const result =
        format === 'step' ? bk.exportSTEP(current) : bk.exportSTL(current, { binary: true });
      if (!result.ok) throw toPartError(`${format} export failed`, result.error);
      return { bytes: await result.value.arrayBuffer(), filename, mime: MIME[format] };
    },
  };
}

export type PartRunner = ReturnType<typeof createPartRunner>;
