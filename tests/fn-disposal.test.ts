import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  createHandle,
  createOcHandle,
  DisposalScope,
  withScope,
  localGC,
} from '../src/core/disposal.js';
import type { Deletable } from '../src/core/disposal.js';
import { getKernel } from '../src/kernel/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

/** Create a minimal OCCT object for testing handle lifecycle */
function makeOcPnt(): Deletable {
  const oc = getKernel().oc;
  return new oc.gp_Pnt_3(1, 2, 3);
}

/** Create a mock deletable for unit tests that don't need OCCT */
function mockDeletable(): { deleted: boolean } & Deletable {
  const obj = {
    deleted: false,
    delete() {
      obj.deleted = true;
    },
  };
  return obj;
}

// ---------------------------------------------------------------------------
// createHandle
// ---------------------------------------------------------------------------

describe('createHandle', () => {
  it('creates a handle wrapping an OCCT shape', () => {
    const oc = getKernel().oc;
    const ocShape = new oc.BRepPrimAPI_MakeBox_2(10, 10, 10).Shape();
    const handle = createHandle(ocShape);
    expect(handle.wrapped).toBeDefined();
    expect(handle.disposed).toBe(false);
  });

  it('allows access to wrapped shape', () => {
    const oc = getKernel().oc;
    const ocShape = new oc.BRepPrimAPI_MakeBox_2(5, 5, 5).Shape();
    const handle = createHandle(ocShape);
    expect(handle.wrapped).toBe(ocShape);
  });

  it('disposes via Symbol.dispose', () => {
    const oc = getKernel().oc;
    const ocShape = new oc.BRepPrimAPI_MakeBox_2(5, 5, 5).Shape();
    const handle = createHandle(ocShape);
    handle[Symbol.dispose]();
    expect(handle.disposed).toBe(true);
  });

  it('throws on access after dispose', () => {
    const oc = getKernel().oc;
    const ocShape = new oc.BRepPrimAPI_MakeBox_2(5, 5, 5).Shape();
    const handle = createHandle(ocShape);
    handle[Symbol.dispose]();
    expect(() => handle.wrapped).toThrow('Shape handle has been disposed');
  });

  it('double dispose is safe', () => {
    const oc = getKernel().oc;
    const ocShape = new oc.BRepPrimAPI_MakeBox_2(5, 5, 5).Shape();
    const handle = createHandle(ocShape);
    handle[Symbol.dispose]();
    expect(() => { handle[Symbol.dispose](); }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createOcHandle
// ---------------------------------------------------------------------------

describe('createOcHandle', () => {
  it('wraps any OCCT object', () => {
    const pnt = makeOcPnt();
    const handle = createOcHandle(pnt);
    expect(handle.value).toBe(pnt);
    expect(handle.disposed).toBe(false);
  });

  it('disposes via Symbol.dispose', () => {
    const pnt = makeOcPnt();
    const handle = createOcHandle(pnt);
    handle[Symbol.dispose]();
    expect(handle.disposed).toBe(true);
  });

  it('throws on access after dispose', () => {
    const pnt = makeOcPnt();
    const handle = createOcHandle(pnt);
    handle[Symbol.dispose]();
    expect(() => handle.value).toThrow('OCCT handle has been disposed');
  });

  it('double dispose is safe', () => {
    const pnt = makeOcPnt();
    const handle = createOcHandle(pnt);
    handle[Symbol.dispose]();
    expect(() => { handle[Symbol.dispose](); }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// DisposalScope
// ---------------------------------------------------------------------------

describe('DisposalScope', () => {
  it('registers and disposes resources', () => {
    const scope = new DisposalScope();
    const obj = mockDeletable();
    scope.register(obj);
    expect(obj.deleted).toBe(false);
    scope[Symbol.dispose]();
    expect(obj.deleted).toBe(true);
  });

  it('disposes in LIFO order', () => {
    const order: number[] = [];
    const scope = new DisposalScope();

    scope.register({
      delete() {
        order.push(1);
      },
    });
    scope.register({
      delete() {
        order.push(2);
      },
    });
    scope.register({
      delete() {
        order.push(3);
      },
    });

    scope[Symbol.dispose]();
    expect(order).toEqual([3, 2, 1]);
  });

  it('tracks disposable objects', () => {
    const scope = new DisposalScope();
    let disposed = false;
    const disposable = {
      [Symbol.dispose]() {
        disposed = true;
      },
    };
    scope.track(disposable);
    expect(disposed).toBe(false);
    scope[Symbol.dispose]();
    expect(disposed).toBe(true);
  });

  it('handles errors during disposal gracefully', () => {
    const scope = new DisposalScope();
    scope.register({
      delete() {
        throw new Error('already deleted');
      },
    });
    // Should not throw
    expect(() => { scope[Symbol.dispose](); }).not.toThrow();
  });

  it('can be disposed multiple times safely', () => {
    const scope = new DisposalScope();
    const obj = mockDeletable();
    scope.register(obj);
    scope[Symbol.dispose]();
    // Second dispose should be safe (handles array cleared)
    expect(() => { scope[Symbol.dispose](); }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// withScope
// ---------------------------------------------------------------------------

describe('withScope', () => {
  it('auto-cleans up on return', () => {
    const obj = mockDeletable();
    const result = withScope((scope) => {
      scope.register(obj);
      return 42;
    });
    expect(result).toBe(42);
    expect(obj.deleted).toBe(true);
  });

  it('auto-cleans up on throw', () => {
    const obj = mockDeletable();
    expect(() =>
      withScope((scope) => {
        scope.register(obj);
        throw new Error('test error');
      })
    ).toThrow('test error');
    expect(obj.deleted).toBe(true);
  });

  it('works with OCCT objects', () => {
    const result = withScope((scope) => {
      const pnt = makeOcPnt();
      scope.register(pnt);
      return true;
    });
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// localGC
// ---------------------------------------------------------------------------

describe('localGC', () => {
  it('registers and cleans up', () => {
    const [gc, cleanup] = localGC();
    const obj = mockDeletable();
    gc(obj);
    expect(obj.deleted).toBe(false);
    cleanup();
    expect(obj.deleted).toBe(true);
  });

  it('returns the registered object', () => {
    const [gc, cleanup] = localGC();
    const obj = mockDeletable();
    const returned = gc(obj);
    expect(returned).toBe(obj);
    cleanup();
  });

  it('returns debug set when debug=true', () => {
    const [gc, cleanup, debugSet] = localGC(true);
    expect(debugSet).toBeInstanceOf(Set);
    const obj = mockDeletable();
    gc(obj);
    expect(debugSet?.size).toBe(1);
    cleanup();
    expect(debugSet?.size).toBe(0);
  });

  it('returns undefined debug set when debug=false', () => {
    const [, , debugSet] = localGC(false);
    expect(debugSet).toBeUndefined();
  });

  it('cleans up multiple objects', () => {
    const [gc, cleanup] = localGC();
    const objs = [mockDeletable(), mockDeletable(), mockDeletable()];
    objs.forEach((o) => gc(o));
    cleanup();
    expect(objs.every((o) => o.deleted)).toBe(true);
  });
});
