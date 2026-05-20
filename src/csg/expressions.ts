// Each Expr constructor pre-computes its structural hash and freeParams so
// the evaluator's cache-key step is O(depth), not O(subtree-size).
import type { Vec2, Vec3 } from '@/core/types.js';
import { ok, err, type Result } from '@/core/result.js';
import { validationError, BrepErrorCode } from '@/core/errors.js';
import { fnvInit, fnvMixString, fnvMixNumber, fnvMixHash, fnvMixInt32 } from './hash.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExprBase {
  readonly structuralHash: bigint;
  readonly freeParams: ReadonlySet<string>;
}

export interface NumLitExpr extends ExprBase {
  readonly kind: 'NumLit';
  readonly value: number;
}

export interface Vec3LitExpr extends ExprBase {
  readonly kind: 'Vec3Lit';
  readonly value: Vec3;
}

export interface Vec2LitExpr extends ExprBase {
  readonly kind: 'Vec2Lit';
  readonly value: Vec2;
}

export interface ParamExpr extends ExprBase {
  readonly kind: 'Param';
  readonly name: string;
}

export type BinaryOp = '+' | '-' | '*' | '/';

export interface BinOpExpr extends ExprBase {
  readonly kind: 'BinOp';
  readonly op: BinaryOp;
  readonly a: Expr;
  readonly b: Expr;
}

export type UnaryOp = 'neg' | 'sin' | 'cos' | 'sqrt' | 'abs';

export interface UnaryOpExpr extends ExprBase {
  readonly kind: 'UnaryOp';
  readonly op: UnaryOp;
  readonly arg: Expr;
}

export interface ComponentExpr extends ExprBase {
  readonly kind: 'Component';
  readonly vec: Expr;
  readonly index: 0 | 1 | 2;
}

export interface BuildVecExpr extends ExprBase {
  readonly kind: 'BuildVec';
  readonly dim: 2 | 3;
  readonly components: readonly Expr[];
}

export type Expr =
  | NumLitExpr
  | Vec3LitExpr
  | Vec2LitExpr
  | ParamExpr
  | BinOpExpr
  | UnaryOpExpr
  | ComponentExpr
  | BuildVecExpr;

/** Value an expression can evaluate to. */
export type ExprValue = number | Vec2 | Vec3;

/** Parameter binding environment. */
export type Env = Readonly<Record<string, ExprValue>>;

/** Input shape for builder params — a literal or an expression. */
export type ScalarInput = number | Expr;
/** Either a literal Vec3, a mixed `[scalar-or-expr, ...]` tuple, or a bare Expr. */
export type Vec3Input = Vec3 | readonly [ScalarInput, ScalarInput, ScalarInput] | Expr;
export type Vec2Input = Vec2 | readonly [ScalarInput, ScalarInput] | Expr;

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

const EMPTY_DEPS: ReadonlySet<string> = new Set();

function startHash(tag: string): bigint {
  return fnvMixString(fnvInit(), tag);
}

export function numLit(value: number): NumLitExpr {
  const h = fnvMixNumber(startHash('NumLit'), value);
  return { kind: 'NumLit', value, structuralHash: h, freeParams: EMPTY_DEPS };
}

export function vec3Lit(value: Vec3): Vec3LitExpr {
  let h = startHash('Vec3Lit');
  for (const n of value) h = fnvMixNumber(h, n);
  return { kind: 'Vec3Lit', value, structuralHash: h, freeParams: EMPTY_DEPS };
}

export function vec2Lit(value: Vec2): Vec2LitExpr {
  let h = startHash('Vec2Lit');
  for (const n of value) h = fnvMixNumber(h, n);
  return { kind: 'Vec2Lit', value, structuralHash: h, freeParams: EMPTY_DEPS };
}

export function param(name: string): ParamExpr {
  const h = fnvMixString(startHash('Param'), name);
  return { kind: 'Param', name, structuralHash: h, freeParams: new Set([name]) };
}

export function binOp(op: BinaryOp, a: Expr, b: Expr): BinOpExpr {
  let h = fnvMixString(startHash('BinOp'), op);
  h = fnvMixHash(h, a.structuralHash);
  h = fnvMixHash(h, b.structuralHash);
  return {
    kind: 'BinOp',
    op,
    a,
    b,
    structuralHash: h,
    freeParams: unionParams(a.freeParams, b.freeParams),
  };
}

export function unaryOp(op: UnaryOp, arg: Expr): UnaryOpExpr {
  let h = fnvMixString(startHash('UnaryOp'), op);
  h = fnvMixHash(h, arg.structuralHash);
  return { kind: 'UnaryOp', op, arg, structuralHash: h, freeParams: arg.freeParams };
}

export function component(vec: Expr, index: 0 | 1 | 2): ComponentExpr {
  let h = fnvMixInt32(startHash('Component'), index);
  h = fnvMixHash(h, vec.structuralHash);
  return { kind: 'Component', vec, index, structuralHash: h, freeParams: vec.freeParams };
}

export function buildVec(dim: 2 | 3, components: readonly Expr[]): BuildVecExpr {
  let h = fnvMixInt32(startHash('BuildVec'), dim);
  const deps = new Set<string>();
  for (const c of components) {
    h = fnvMixHash(h, c.structuralHash);
    for (const p of c.freeParams) deps.add(p);
  }
  return { kind: 'BuildVec', dim, components, structuralHash: h, freeParams: deps };
}

// ---------------------------------------------------------------------------
// Convenience builders
// ---------------------------------------------------------------------------

export const add = (a: Expr, b: Expr): BinOpExpr => binOp('+', a, b);
export const mul = (a: Expr, b: Expr): BinOpExpr => binOp('*', a, b);

// ---------------------------------------------------------------------------
// Input normalization
// ---------------------------------------------------------------------------

export function asScalarExpr(input: ScalarInput): Expr {
  return typeof input === 'number' ? numLit(input) : input;
}

function asVecExpr(input: Vec3Input | Vec2Input, dim: 2 | 3): Expr {
  if (!Array.isArray(input)) return input as Expr;
  const arr = input as ReadonlyArray<ScalarInput>;
  if (arr.every((v): v is number => typeof v === 'number')) {
    return dim === 3
      ? vec3Lit([arr[0] as number, arr[1] as number, arr[2] as number])
      : vec2Lit([arr[0] as number, arr[1] as number]);
  }
  return buildVec(dim, arr.map(asScalarExpr));
}

export function asVec3Expr(input: Vec3Input): Expr {
  return asVecExpr(input, 3);
}

export function asVec2Expr(input: Vec2Input): Expr {
  return asVecExpr(input, 2);
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

function unionParams(a: ReadonlySet<string>, b: ReadonlySet<string>): ReadonlySet<string> {
  if (a.size === 0) return b;
  if (b.size === 0) return a;
  const out = new Set(a);
  for (const x of b) out.add(x);
  return out;
}

function isNumber(v: ExprValue): v is number {
  return typeof v === 'number';
}

function expectNumber(v: ExprValue, where: string): Result<number> {
  if (isNumber(v)) return ok(v);
  return err(
    validationError(
      BrepErrorCode.NULL_SHAPE_INPUT,
      `${where}: expected number, got ${Array.isArray(v) ? `vector(${v.length})` : typeof v}`
    )
  );
}

function expectVecLen(v: ExprValue, len: 2 | 3, where: string): Result<readonly number[]> {
  if (Array.isArray(v) && v.length === len) return ok(v);
  return err(
    validationError(
      BrepErrorCode.NULL_SHAPE_INPUT,
      `${where}: expected Vec${len}, got ${isNumber(v) ? 'number' : `vector(${(v as readonly number[]).length})`}`
    )
  );
}

export function evalExpr(expr: Expr, env: Env): Result<ExprValue> {
  switch (expr.kind) {
    case 'NumLit':
      return ok(expr.value);
    case 'Vec3Lit':
      return ok(expr.value);
    case 'Vec2Lit':
      return ok(expr.value);
    case 'Param': {
      const v = env[expr.name];
      if (v === undefined) {
        return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, `unbound param: ${expr.name}`));
      }
      return ok(v);
    }
    case 'BinOp':
      return evalBinOp(expr, env);
    case 'UnaryOp':
      return evalUnaryOp(expr, env);
    case 'Component':
      return evalComponent(expr, env);
    case 'BuildVec':
      return evalBuildVec(expr, env);
  }
}

function evalBinOp(expr: BinOpExpr, env: Env): Result<ExprValue> {
  const ar = evalExpr(expr.a, env);
  if (!ar.ok) return ar;
  const br = evalExpr(expr.b, env);
  if (!br.ok) return br;
  const an = expectNumber(ar.value, `BinOp(${expr.op}).a`);
  if (!an.ok) return an;
  const bn = expectNumber(br.value, `BinOp(${expr.op}).b`);
  if (!bn.ok) return bn;
  switch (expr.op) {
    case '+':
      return ok(an.value + bn.value);
    case '-':
      return ok(an.value - bn.value);
    case '*':
      return ok(an.value * bn.value);
    case '/':
      if (bn.value === 0) {
        return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, `BinOp(/): division by zero`));
      }
      return ok(an.value / bn.value);
  }
}

function evalUnaryOp(expr: UnaryOpExpr, env: Env): Result<ExprValue> {
  const ar = evalExpr(expr.arg, env);
  if (!ar.ok) return ar;
  const an = expectNumber(ar.value, `UnaryOp(${expr.op})`);
  if (!an.ok) return an;
  const n = an.value;
  switch (expr.op) {
    case 'neg':
      return ok(-n);
    case 'sin':
      return ok(Math.sin(n));
    case 'cos':
      return ok(Math.cos(n));
    case 'sqrt':
      return ok(Math.sqrt(n));
    case 'abs':
      return ok(Math.abs(n));
  }
}

function evalComponent(expr: ComponentExpr, env: Env): Result<ExprValue> {
  const vr = evalExpr(expr.vec, env);
  if (!vr.ok) return vr;
  if (isNumber(vr.value)) {
    return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, `Component: cannot index a scalar`));
  }
  const v = vr.value;
  const c = v[expr.index];
  if (c === undefined) {
    return err(
      validationError(
        BrepErrorCode.NULL_SHAPE_INPUT,
        `Component: index ${expr.index} out of range for Vec${v.length}`
      )
    );
  }
  return ok(c);
}

function evalBuildVec(expr: BuildVecExpr, env: Env): Result<ExprValue> {
  if (expr.components.length !== expr.dim) {
    return err(
      validationError(
        BrepErrorCode.NULL_SHAPE_INPUT,
        `BuildVec(${expr.dim}): expected ${expr.dim} components, got ${expr.components.length}`
      )
    );
  }
  const out: number[] = [];
  for (const c of expr.components) {
    const r = evalExpr(c, env);
    if (!r.ok) return r;
    const n = expectNumber(r.value, 'BuildVec.component');
    if (!n.ok) return n;
    out.push(n.value);
  }
  return ok(
    expr.dim === 2
      ? ([out[0] as number, out[1] as number] satisfies Vec2)
      : ([out[0] as number, out[1] as number, out[2] as number] satisfies Vec3)
  );
}

// ---------------------------------------------------------------------------
// Typed evaluation helpers
// ---------------------------------------------------------------------------

export function evalScalar(expr: Expr, env: Env, where: string): Result<number> {
  const r = evalExpr(expr, env);
  if (!r.ok) return r;
  return expectNumber(r.value, where);
}

export function evalVec3(expr: Expr, env: Env, where: string): Result<Vec3> {
  const r = evalExpr(expr, env);
  if (!r.ok) return r;
  const v = expectVecLen(r.value, 3, where);
  if (!v.ok) return v;
  const [a, b, c] = v.value;
  return ok([a as number, b as number, c as number]);
}

// ---------------------------------------------------------------------------
// Projection — restrict env to the keys a node actually depends on, so cache
// keys are insensitive to unrelated env changes.
// ---------------------------------------------------------------------------

export function projectEnv(env: Env, deps: ReadonlySet<string>): Env {
  if (deps.size === 0) return Object.freeze({});
  const out: Record<string, ExprValue> = {};
  for (const k of deps) {
    const v = env[k];
    if (v !== undefined) out[k] = v;
  }
  return Object.freeze(out);
}
