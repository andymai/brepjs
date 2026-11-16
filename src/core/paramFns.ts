/**
 * Declared part parameters.
 *
 * A part declares its parameters as data with `defineParams`. A tool (the `brep` CLI, a viewer,
 * a published page) reads the declaration without building any geometry, then calls
 * `resolveParams` to turn caller input into validated values for the part function.
 */

import { err, ok, type Result } from './result.js';
import { BrepErrorCode, validationError, type BrepError } from './errors.js';

interface ParamDefBase {
  /** Display name. Tools fall back to the parameter key. */
  readonly label?: string;
  readonly description?: string;
  /** Tools show parameters with the same group together. */
  readonly group?: string;
}

/** A numeric parameter. `min` and `max` are inclusive limits that `resolveParams` enforces. */
export interface NumberParamDef extends ParamDefBase {
  readonly type: 'number';
  readonly default: number;
  readonly min?: number;
  readonly max?: number;
  /** Increment for a slider or a stepper. It is a display hint, not a constraint. */
  readonly step?: number;
  /** When true, `resolveParams` rejects a value with a fraction (a count of holes or teeth). */
  readonly integer?: boolean;
  /** Display unit, for example `'mm'` or `'deg'`. */
  readonly unit?: string;
}

/** An on/off parameter. */
export interface BooleanParamDef extends ParamDefBase {
  readonly type: 'boolean';
  readonly default: boolean;
}

/** A free-text parameter. */
export interface StringParamDef extends ParamDefBase {
  readonly type: 'string';
  readonly default: string;
  readonly maxLength?: number;
}

/** A parameter that takes one of a fixed list of strings. */
export interface ChoiceParamDef extends ParamDefBase {
  readonly type: 'choice';
  readonly default: string;
  readonly options: readonly string[];
}

/** One declared parameter. */
export type ParamDef = NumberParamDef | BooleanParamDef | StringParamDef | ChoiceParamDef;

/** A set of declared parameters, keyed by parameter name. */
export type ParamDefs = Readonly<Record<string, ParamDef>>;

/** A value that a parameter can hold. */
export type ParamValue = number | boolean | string;

type ValueOf<D extends ParamDef> = D extends { readonly type: 'number' }
  ? number
  : D extends { readonly type: 'boolean' }
    ? boolean
    : D extends { readonly type: 'choice'; readonly options: readonly (infer O)[] }
      ? O
      : string;

// Narrows the default of each choice parameter to its own options, so a default that is not
// an option is a compile error at the `defineParams` call.
type ChoiceDefaults<D extends ParamDefs> = {
  readonly [K in keyof D]: D[K] extends {
    readonly type: 'choice';
    readonly options: readonly (infer O)[];
  }
    ? { readonly default: O }
    : unknown;
};

/** The value object that a part function receives for the declarations `D`. */
export type ParamValues<D extends ParamDefs> = { readonly [K in keyof D]: ValueOf<D[K]> };

/**
 * A parameter declaration made by `defineParams`. It is plain data, so a tool can serialize it
 * and can recognize it across module realms with `isParams`.
 */
export interface Params<D extends ParamDefs = ParamDefs> {
  readonly kind: 'brepjs.params';
  readonly defs: D;
  /** The default value of each parameter. Use `typeof params.values` to type a part function. */
  readonly values: ParamValues<D>;
}

/**
 * Declare the parameters of a part.
 *
 * @example
 * ```ts
 * export const params = defineParams({
 *   width: { type: 'number', default: 50, min: 10, max: 200, unit: 'mm' },
 *   holes: { type: 'number', default: 4, min: 0, max: 12, integer: true },
 *   style: { type: 'choice', default: 'round', options: ['round', 'square'] },
 * });
 *
 * export default (p: typeof params.values) => box(p.width, 30, 20);
 * ```
 */
export function defineParams<const D extends ParamDefs>(defs: D & ChoiceDefaults<D>): Params<D> {
  const values: Record<string, ParamValue> = {};
  for (const [name, def] of Object.entries<ParamDef>(defs)) values[name] = def.default;
  return Object.freeze({
    kind: 'brepjs.params',
    defs,
    values: Object.freeze(values) as ParamValues<D>,
  });
}

/** True when `value` is a declaration made by `defineParams`, in this realm or another one. */
export function isParams(value: unknown): value is Params {
  if (typeof value !== 'object' || value === null) return false;
  const rec = value as Record<string, unknown>;
  return (
    rec['kind'] === 'brepjs.params' &&
    typeof rec['defs'] === 'object' &&
    rec['defs'] !== null &&
    typeof rec['values'] === 'object' &&
    rec['values'] !== null
  );
}

function invalidValue(name: string, expected: string, raw: unknown): BrepError {
  return validationError(
    BrepErrorCode.PARAM_INVALID_VALUE,
    `Parameter "${name}" must be ${expected}, got ${JSON.stringify(raw)}`,
    undefined,
    { param: name, value: raw }
  );
}

function outOfRange(name: string, limit: string, value: ParamValue): BrepError {
  return validationError(
    BrepErrorCode.PARAM_OUT_OF_RANGE,
    `Parameter "${name}" must be ${limit}, got ${JSON.stringify(value)}`,
    undefined,
    { param: name, value }
  );
}

function toNumber(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function resolveNumber(name: string, def: NumberParamDef, raw: unknown): Result<number> {
  const n = toNumber(raw);
  if (n === undefined) return err(invalidValue(name, 'a finite number', raw));
  if (def.integer === true && !Number.isInteger(n)) {
    return err(invalidValue(name, 'an integer', raw));
  }
  if (def.min !== undefined && n < def.min) return err(outOfRange(name, `>= ${def.min}`, n));
  if (def.max !== undefined && n > def.max) return err(outOfRange(name, `<= ${def.max}`, n));
  return ok(n);
}

function resolveBoolean(name: string, raw: unknown): Result<boolean> {
  if (typeof raw === 'boolean') return ok(raw);
  if (raw === 'true') return ok(true);
  if (raw === 'false') return ok(false);
  return err(invalidValue(name, 'true or false', raw));
}

function resolveString(name: string, def: StringParamDef, raw: unknown): Result<string> {
  if (typeof raw !== 'string') return err(invalidValue(name, 'a string', raw));
  if (def.maxLength !== undefined && raw.length > def.maxLength) {
    return err(outOfRange(name, `at most ${def.maxLength} characters`, raw));
  }
  return ok(raw);
}

function resolveChoice(name: string, def: ChoiceParamDef, raw: unknown): Result<string> {
  if (typeof raw === 'string' && def.options.includes(raw)) return ok(raw);
  return err(invalidValue(name, `one of ${def.options.join(', ')}`, raw));
}

function resolveOne(name: string, def: ParamDef, raw: unknown): Result<ParamValue> {
  switch (def.type) {
    case 'number':
      return resolveNumber(name, def, raw);
    case 'boolean':
      return resolveBoolean(name, raw);
    case 'string':
      return resolveString(name, def, raw);
    case 'choice':
      return resolveChoice(name, def, raw);
  }
}

/**
 * Turn caller input into the values for a part function.
 *
 * A missing parameter takes its default. A string is accepted for a number or a boolean
 * parameter (`'80'`, `'true'`), so command-line and URL input needs no conversion first.
 * The defaults go through the same checks, so a declaration whose default breaks its own
 * limits fails here too.
 *
 * @returns The values, or the first problem found: an input key that is not declared
 * (`PARAM_UNKNOWN`), a value of the wrong type (`PARAM_INVALID_VALUE`), or a value outside
 * its limits (`PARAM_OUT_OF_RANGE`).
 */
export function resolveParams<D extends ParamDefs>(
  params: Params<D>,
  input: Readonly<Record<string, unknown>> = {}
): Result<ParamValues<D>> {
  const names = Object.keys(params.defs);
  const unknown = Object.keys(input).find((key) => !names.includes(key));
  if (unknown !== undefined) {
    return err(
      validationError(
        BrepErrorCode.PARAM_UNKNOWN,
        `Unknown parameter "${unknown}"`,
        undefined,
        { param: unknown },
        names.length > 0 ? `Declared parameters: ${names.join(', ')}` : 'The part declares none'
      )
    );
  }
  const values: Record<string, ParamValue> = {};
  for (const [name, def] of Object.entries(params.defs)) {
    const raw = input[name];
    const resolved = resolveOne(name, def, raw === undefined ? def.default : raw);
    if (!resolved.ok) return resolved;
    values[name] = resolved.value;
  }
  return ok(values as ParamValues<D>);
}
