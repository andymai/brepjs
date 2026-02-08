/**
 * Verify brepjs/result sub-path exports the expected symbols.
 * Does NOT require WASM initialization.
 */
import { describe, expect, it } from 'vitest';
import * as ResultAPI from '../src/result.js';

const EXPECTED_RUNTIME_EXPORTS: readonly string[] = [
  'BrepBugError',
  'BrepErrorCode',
  'OK',
  'andThen',
  'bug',
  'collect',
  'computationError',
  'err',
  'flatMap',
  'ioError',
  'isErr',
  'isOk',
  'map',
  'mapErr',
  'match',
  'moduleInitError',
  'occtError',
  'ok',
  'pipeline',
  'queryError',
  'sketcherStateError',
  'tryCatch',
  'tryCatchAsync',
  'typeCastError',
  'unwrap',
  'unwrapErr',
  'unwrapOr',
  'unwrapOrElse',
  'validationError',
];

describe('brepjs/result export surface', () => {
  it('matches the expected runtime export list', () => {
    const actual = Object.keys(ResultAPI).sort();
    expect(actual).toEqual(EXPECTED_RUNTIME_EXPORTS);
  });

  it('Result constructors work', () => {
    const good = ResultAPI.ok(42);
    expect(good.ok).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (good.ok) expect(good.value).toBe(42);

    const bad = ResultAPI.err(ResultAPI.validationError('TEST', 'msg'));
    expect(bad.ok).toBe(false);
  });

  it('error constructors produce correct kinds', () => {
    expect(ResultAPI.occtError('C', 'm').kind).toBe('OCCT_OPERATION');
    expect(ResultAPI.validationError('C', 'm').kind).toBe('VALIDATION');
    expect(ResultAPI.typeCastError('C', 'm').kind).toBe('TYPE_CAST');
    expect(ResultAPI.ioError('C', 'm').kind).toBe('IO');
    expect(ResultAPI.queryError('C', 'm').kind).toBe('QUERY');
  });
});
