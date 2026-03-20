import { describe, it, expect } from 'vitest';
import {
  ok,
  err,
  OK,
  isOk,
  isErr,
  map,
  mapErr,
  andThen,
  flatMap,
  or,
  orElse,
  zip,
  all,
  tap,
  tapErr,
  fromNullable,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  unwrapErr,
  match,
  collect,
  tryCatch,
  tryCatchAsync,
  type Result,
} from '@/core/result.js';

describe('Result constructors', () => {
  it('ok() creates an Ok result', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(42);
  });

  it('err() creates an Err result', () => {
    const result = err('failure');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('failure');
  });

  it('OK is a pre-built Ok<Unit>', () => {
    expect(OK.ok).toBe(true);
    expect(OK.value).toBeUndefined();
  });
});

describe('Type guards', () => {
  it('isOk returns true for Ok', () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isOk(err('x'))).toBe(false);
  });

  it('isErr returns true for Err', () => {
    expect(isErr(err('x'))).toBe(true);
    expect(isErr(ok(1))).toBe(false);
  });
});

describe('Combinators', () => {
  it('map transforms Ok value', () => {
    const result = map(ok(2), (x) => x * 3);
    expect(unwrap(result)).toBe(6);
  });

  it('map passes through Err', () => {
    const result = map(err('fail') as Result<number, string>, (x) => x * 3);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result)).toBe('fail');
  });

  it('mapErr transforms Err value', () => {
    const result = mapErr(err('fail') as Result<number, string>, (e) => e.toUpperCase());
    expect(unwrapErr(result)).toBe('FAIL');
  });

  it('mapErr passes through Ok', () => {
    const result = mapErr(ok(5) as Result<number, string>, (e) => e.toUpperCase());
    expect(unwrap(result)).toBe(5);
  });

  it('andThen chains Ok values', () => {
    const result = andThen(ok(3), (x) => ok(x + 1));
    expect(unwrap(result)).toBe(4);
  });

  it('andThen short-circuits on Err', () => {
    const result = andThen(err('stop') as Result<number, string>, (x) => ok(x + 1));
    expect(unwrapErr(result)).toBe('stop');
  });

  it('andThen propagates Err from fn', () => {
    const result = andThen(ok(3) as Result<number, string>, () => err('inner'));
    expect(unwrapErr(result)).toBe('inner');
  });

  it('flatMap is an alias for andThen', () => {
    expect(flatMap).toBe(andThen);
  });
});

describe('Extraction', () => {
  it('unwrap returns value from Ok', () => {
    expect(unwrap(ok('hello'))).toBe('hello');
  });

  it('unwrap throws on Err', () => {
    expect(() => unwrap(err('nope'))).toThrow('Called unwrap() on an Err');
  });

  it('unwrapOr returns value from Ok', () => {
    expect(unwrapOr(ok(10), 0)).toBe(10);
  });

  it('unwrapOr returns default from Err', () => {
    expect(unwrapOr(err('x') as Result<number, string>, 0)).toBe(0);
  });

  it('unwrapOrElse returns value from Ok', () => {
    expect(unwrapOrElse(ok(10), () => 0)).toBe(10);
  });

  it('unwrapOrElse calls fn on Err', () => {
    expect(unwrapOrElse(err('x') as Result<number, string>, (e) => e.length)).toBe(1);
  });

  it('unwrapErr returns error from Err', () => {
    expect(unwrapErr(err('bad'))).toBe('bad');
  });

  it('unwrapErr throws on Ok', () => {
    expect(() => unwrapErr(ok(1))).toThrow('Called unwrapErr() on an Ok');
  });
});

describe('Pattern matching', () => {
  it('match calls ok handler for Ok', () => {
    const result = match(ok(5), {
      ok: (v) => `value: ${String(v)}`,
      err: (e) => `error: ${String(e)}`,
    });
    expect(result).toBe('value: 5');
  });

  it('match calls err handler for Err', () => {
    const result = match(err('oops') as Result<number, string>, {
      ok: (v) => `value: ${String(v)}`,
      err: (e) => `error: ${e}`,
    });
    expect(result).toBe('error: oops');
  });
});

describe('collect', () => {
  it('collects all Ok values', () => {
    const results = [ok(1), ok(2), ok(3)];
    const collected = collect(results);
    expect(unwrap(collected)).toEqual([1, 2, 3]);
  });

  it('short-circuits on first Err', () => {
    const results: Result<number, string>[] = [ok(1), err('fail'), ok(3)];
    const collected = collect(results);
    expect(unwrapErr(collected)).toBe('fail');
  });

  it('returns Ok for empty array', () => {
    expect(unwrap(collect([]))).toEqual([]);
  });
});

describe('tryCatch', () => {
  it('returns Ok when function succeeds', () => {
    const result = tryCatch(
      () => 42,
      (e) => String(e)
    );
    expect(unwrap(result)).toBe(42);
  });

  it('returns Err when function throws', () => {
    const result = tryCatch(
      () => {
        throw new Error('boom');
      },
      (e) => (e instanceof Error ? e.message : 'unknown')
    );
    expect(unwrapErr(result)).toBe('boom');
  });
});

describe('tryCatchAsync', () => {
  it('returns Ok when async function succeeds', async () => {
    const result = await tryCatchAsync(
      () => Promise.resolve(42),
      (e) => String(e)
    );
    expect(unwrap(result)).toBe(42);
  });

  it('returns Err when async function throws', async () => {
    const result = await tryCatchAsync(
      () => Promise.reject(new Error('async boom')),
      (e) => (e instanceof Error ? e.message : 'unknown')
    );
    expect(unwrapErr(result)).toBe('async boom');
  });
});

describe('or', () => {
  it('returns first if Ok', () => {
    expect(unwrap(or(ok(1), ok(2)))).toBe(1);
  });

  it('returns second if first is Err', () => {
    expect(unwrap(or(err('a') as Result<number, string>, ok(2)))).toBe(2);
  });

  it('returns second Err if both are Err', () => {
    expect(unwrapErr(or(err('a'), err('b')))).toBe('b');
  });
});

describe('orElse', () => {
  it('returns result if Ok', () => {
    expect(unwrap(orElse(ok(1) as Result<number, string>, () => ok(99)))).toBe(1);
  });

  it('calls fn if Err', () => {
    expect(unwrap(orElse(err('x') as Result<number, string>, (e) => ok(e.length)))).toBe(1);
  });

  it('can return Err from fn', () => {
    expect(unwrapErr(orElse(err('x'), () => err('y')))).toBe('y');
  });
});

describe('zip', () => {
  it('combines two Ok values into a tuple', () => {
    expect(unwrap(zip(ok(1), ok('a')))).toEqual([1, 'a']);
  });

  it('returns first Err if first is Err', () => {
    expect(unwrapErr(zip(err('e1') as Result<number, string>, ok('a')))).toBe('e1');
  });

  it('returns second Err if second is Err', () => {
    expect(unwrapErr(zip(ok(1), err('e2') as Result<string, string>))).toBe('e2');
  });

  it('returns first Err if both are Err', () => {
    expect(unwrapErr(zip(err('e1'), err('e2')))).toBe('e1');
  });
});

describe('all', () => {
  it('is an alias for collect', () => {
    expect(all).toBe(collect);
  });

  it('collects Ok values', () => {
    expect(unwrap(all([ok(1), ok(2), ok(3)]))).toEqual([1, 2, 3]);
  });

  it('short-circuits on first Err', () => {
    const results: Result<number, string>[] = [ok(1), err('fail'), ok(3)];
    expect(unwrapErr(all(results))).toBe('fail');
  });
});

describe('tap', () => {
  it('runs side-effect on Ok', () => {
    let captured = 0;
    const result = tap(ok(42), (v) => {
      captured = v;
    });
    expect(captured).toBe(42);
    expect(unwrap(result)).toBe(42);
  });

  it('skips side-effect on Err', () => {
    let called = false;
    const result = tap(err('x') as Result<number, string>, () => {
      called = true;
    });
    expect(called).toBe(false);
    expect(isErr(result)).toBe(true);
  });
});

describe('tapErr', () => {
  it('runs side-effect on Err', () => {
    let captured = '';
    const result = tapErr(err('oops') as Result<number, string>, (e) => {
      captured = e;
    });
    expect(captured).toBe('oops');
    expect(unwrapErr(result)).toBe('oops');
  });

  it('skips side-effect on Ok', () => {
    let called = false;
    const result = tapErr(ok(1) as Result<number, string>, () => {
      called = true;
    });
    expect(called).toBe(false);
    expect(unwrap(result)).toBe(1);
  });
});

describe('fromNullable', () => {
  it('returns Ok for non-null value', () => {
    expect(unwrap(fromNullable(42, () => 'was null'))).toBe(42);
  });

  it('returns Ok for falsy non-null values', () => {
    expect(unwrap(fromNullable(0, () => 'was null'))).toBe(0);
    expect(unwrap(fromNullable('', () => 'was null'))).toBe('');
    expect(unwrap(fromNullable(false, () => 'was null'))).toBe(false);
  });

  it('returns Err for null', () => {
    expect(unwrapErr(fromNullable(null, () => 'was null'))).toBe('was null');
  });

  it('returns Err for undefined', () => {
    expect(unwrapErr(fromNullable(undefined, () => 'was undef'))).toBe('was undef');
  });
});
