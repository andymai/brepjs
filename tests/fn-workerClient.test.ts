import { describe, expect, it, vi } from 'vitest';
import {
  createWorkerClient,
  createOperationRegistry,
  registerHandler,
  createMeshCache,
  type MeshCacheContext,
} from '../src/index.js';
import { buildMeshCacheKey } from '../src/topology/meshCache.js';

// ---------------------------------------------------------------------------
// Mock Worker for testing without real Web Workers
// ---------------------------------------------------------------------------

function createMockWorker(): {
  worker: Worker;
  getHandler: () => ((event: MessageEvent) => void) | null;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock Worker
  let messageHandler: any = null;
  const listeners: Map<string, ((...args: unknown[]) => void)[]> = new Map();

  const worker = {
    postMessage: vi.fn(),
    addEventListener(event: string, handler: (...args: unknown[]) => void) {
      const list = listeners.get(event) ?? [];
      list.push(handler);
      listeners.set(event, list);
      if (event === 'message') messageHandler = handler;
    },
    removeEventListener(event: string, handler: (...args: unknown[]) => void) {
      const list = listeners.get(event) ?? [];
      listeners.set(
        event,
        list.filter((h) => h !== handler)
      );
      if (event === 'message' && messageHandler === handler) messageHandler = null;
    },
  } as unknown as Worker;

  return { worker, getHandler: () => messageHandler };
}

// ---------------------------------------------------------------------------
// WorkerClient tests
// ---------------------------------------------------------------------------

describe('createWorkerClient', () => {
  it('sends init request', async () => {
    const { worker, getHandler } = createMockWorker();
    const client = createWorkerClient({ worker, wasmUrl: '/test.wasm' });

    const initPromise = client.init();

    // Simulate worker response
    const handler = getHandler();
    expect(handler).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest mock
    const postMessage = vi.mocked(worker).postMessage;
    expect(postMessage).toHaveBeenCalledTimes(1);
    const sentMsg = postMessage.mock.calls.at(0)?.at(0) as { id: string; type: string };
    expect(sentMsg.type).toBe('init');

    // Reply with success
    handler?.({ data: { id: sentMsg.id, success: true } } as MessageEvent);

    await expect(initPromise).resolves.toBeUndefined();
  });

  it('sends operation request and receives result', async () => {
    const { worker, getHandler } = createMockWorker();
    const client = createWorkerClient({ worker });

    const execPromise = client.execute('fuse', ['brep1', 'brep2'], { tolerance: 0.1 });

    const handler = getHandler();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest mock
    const postMessage = vi.mocked(worker).postMessage;
    const sentMsg = postMessage.mock.calls.at(0)?.at(0) as {
      id: string;
      type: string;
      operation: string;
    };
    expect(sentMsg.type).toBe('operation');
    expect(sentMsg.operation).toBe('fuse');

    // Reply
    handler?.({
      data: { id: sentMsg.id, success: true, resultBrep: 'output-brep' },
    } as MessageEvent);

    const result = await execPromise;
    expect(result.resultBrep).toBe('output-brep');
  });

  it('rejects on error response', async () => {
    const { worker, getHandler } = createMockWorker();
    const client = createWorkerClient({ worker });

    const execPromise = client.execute('bad-op', [], {});

    const handler = getHandler();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest mock
    const postMessage = vi.mocked(worker).postMessage;
    const sentMsg = postMessage.mock.calls.at(0)?.at(0) as { id: string };

    handler?.({
      data: { id: sentMsg.id, success: false, error: 'Unknown operation' },
    } as MessageEvent);

    await expect(execPromise).rejects.toThrow('Unknown operation');
  });

  it('dispose rejects pending operations', async () => {
    const { worker } = createMockWorker();
    const client = createWorkerClient({ worker });

    // Start an operation but don't reply
    const execPromise = client.execute('fuse', [], {});

    // Dispose
    client.dispose();

    await expect(execPromise).rejects.toThrow('disposed');
  });

  it('rejects new operations after dispose', async () => {
    const { worker } = createMockWorker();
    const client = createWorkerClient({ worker });
    client.dispose();

    await expect(client.execute('fuse', [], {})).rejects.toThrow('disposed');
  });
});

// ---------------------------------------------------------------------------
// OperationRegistry tests
// ---------------------------------------------------------------------------

describe('createOperationRegistry', () => {
  it('creates empty registry', () => {
    const registry = createOperationRegistry();
    expect(registry.operations.size).toBe(0);
  });

  it('registers handlers immutably', () => {
    const r1 = createOperationRegistry();
    const r2 = registerHandler(r1, 'fuse', () => ({ resultData: 'ok' }));
    expect(r1.operations.size).toBe(0);
    expect(r2.operations.size).toBe(1);
    expect(r2.operations.has('fuse')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MeshCacheContext tests
// ---------------------------------------------------------------------------

describe('createMeshCache', () => {
  it('creates isolated context', () => {
    const ctx1: MeshCacheContext = createMeshCache();
    const ctx2: MeshCacheContext = createMeshCache();

    const key = buildMeshCacheKey(0.001, 0.1, false);
    const mockShape = {} as object;
    const mockMesh = {
      vertices: new Float32Array(0),
      normals: new Float32Array(0),
      triangles: new Uint32Array(0),
      uvs: new Float32Array(0),
      faceGroups: [],
    };

    ctx1.setMesh(mockShape, key, mockMesh);

    expect(ctx1.getMesh(mockShape, key)).toBe(mockMesh);
    expect(ctx2.getMesh(mockShape, key)).toBeUndefined();
  });

  it('clears independently', () => {
    const ctx1: MeshCacheContext = createMeshCache();
    const ctx2: MeshCacheContext = createMeshCache();

    const key = 'test-key';
    const mockShape = {} as object;
    const mockMesh = {
      vertices: new Float32Array(0),
      normals: new Float32Array(0),
      triangles: new Uint32Array(0),
      uvs: new Float32Array(0),
      faceGroups: [],
    };

    ctx1.setMesh(mockShape, key, mockMesh);
    ctx2.setMesh(mockShape, key, mockMesh);

    ctx1.clear();

    expect(ctx1.getMesh(mockShape, key)).toBeUndefined();
    expect(ctx2.getMesh(mockShape, key)).toBe(mockMesh);
  });

  it('stores and retrieves edge meshes', () => {
    const ctx: MeshCacheContext = createMeshCache();
    const mockShape = {} as object;
    const key = 'edge-key';
    const mockEdgeMesh = {
      lines: [0, 0, 0, 1, 1, 1],
      edgeGroups: [],
    };

    ctx.setEdgeMesh(mockShape, key, mockEdgeMesh);
    expect(ctx.getEdgeMesh(mockShape, key)).toBe(mockEdgeMesh);
  });
});
