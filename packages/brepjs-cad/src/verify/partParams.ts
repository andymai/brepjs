import type { BrepNs } from './brepjsRuntime.js';
import type { ErrorInfo } from './report.js';

export type ParamInput = Readonly<Record<string, unknown>>;
export type ParamValues = Readonly<Record<string, number | boolean | string>>;

/** `values` is absent when the part declares no parameters: it is then called with no argument. */
export type PartParams = { values?: ParamValues } | { error: ErrorInfo };

// The peer range admits a brepjs older than `defineParams`, so the declaration is recognized by
// its structure here and `resolveParams` is looked up on the loaded namespace at call time.
function isDeclaration(v: unknown): v is { kind: 'brepjs.params' } {
  return typeof v === 'object' && v !== null && (v as { kind?: unknown }).kind === 'brepjs.params';
}

type ResolveFn = (
  params: unknown,
  input: ParamInput
) => { ok: true; value: ParamValues } | { ok: false; error: ErrorInfo };

export function resolvePartParams(
  brep: BrepNs,
  declared: unknown,
  input: ParamInput = {}
): PartParams {
  if (!isDeclaration(declared)) {
    // A part can export an unrelated `params` of its own; it is not a declaration, so it only
    // matters when the caller tries to set a value.
    if (Object.keys(input).length === 0) return {};
    return {
      error: {
        message: `params: the part declares no parameters, so ${Object.keys(input).join(', ')} cannot be set`,
        code: 'PARAMS_NOT_DECLARED',
        suggestion:
          'Add `export const params = defineParams({ ... })` and take the values as the argument of the part function.',
      },
    };
  }
  const resolve = (brep as { resolveParams?: unknown }).resolveParams;
  if (typeof resolve !== 'function') {
    return { error: { message: 'params: this brepjs has no resolveParams; upgrade brepjs' } };
  }
  const result = (resolve as ResolveFn)(declared, input);
  if (!result.ok) {
    const { message, code, suggestion } = result.error;
    return { error: { message: `params: ${message}`, code, suggestion } };
  }
  return { values: result.value };
}
