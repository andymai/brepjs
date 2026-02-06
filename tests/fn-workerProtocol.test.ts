import { describe, expect, it } from 'vitest';
import {
  isInitRequest,
  isOperationRequest,
  isDisposeRequest,
  isSuccessResponse,
  isErrorResponse,
  createTaskQueue,
  enqueueTask,
  dequeueTask,
  pendingCount,
  isQueueEmpty,
  rejectAll,
} from '../src/worker/index.js';
import type {
  InitRequest,
  OperationRequest,
  DisposeRequest,
  SuccessResponse,
  ErrorResponse,
} from '../src/worker/index.js';

describe('protocol type guards', () => {
  it('identifies init request', () => {
    const msg: InitRequest = { id: '1', type: 'init' };
    expect(isInitRequest(msg)).toBe(true);
    expect(isOperationRequest(msg)).toBe(false);
    expect(isDisposeRequest(msg)).toBe(false);
  });

  it('identifies operation request', () => {
    const msg: OperationRequest = {
      id: '2',
      type: 'operation',
      operation: 'fuse',
      shapesBrep: ['brep1', 'brep2'],
      parameters: {},
    };
    expect(isOperationRequest(msg)).toBe(true);
    expect(isInitRequest(msg)).toBe(false);
  });

  it('identifies dispose request', () => {
    const msg: DisposeRequest = { id: '3', type: 'dispose' };
    expect(isDisposeRequest(msg)).toBe(true);
  });

  it('identifies success response', () => {
    const msg: SuccessResponse = { id: '1', success: true, resultBrep: 'data' };
    expect(isSuccessResponse(msg)).toBe(true);
    expect(isErrorResponse(msg)).toBe(false);
  });

  it('identifies error response', () => {
    const msg: ErrorResponse = { id: '1', success: false, error: 'fail' };
    expect(isErrorResponse(msg)).toBe(true);
    expect(isSuccessResponse(msg)).toBe(false);
  });
});

describe('task queue', () => {
  it('creates empty queue', () => {
    const q = createTaskQueue();
    expect(pendingCount(q)).toBe(0);
    expect(isQueueEmpty(q)).toBe(true);
  });

  it('enqueues and dequeues a task', () => {
    let resolved = false;
    const task = {
      id: 'task-1',
      resolve: () => {
        resolved = true;
      },
      reject: () => {},
      createdAt: Date.now(),
    };
    const q1 = enqueueTask(createTaskQueue(), task);
    expect(pendingCount(q1)).toBe(1);
    expect(isQueueEmpty(q1)).toBe(false);

    const { queue: q2, task: found } = dequeueTask(q1, 'task-1');
    expect(found).toBeDefined();
    expect(found?.id).toBe('task-1');
    expect(pendingCount(q2)).toBe(0);

    found?.resolve(undefined);
    expect(resolved).toBe(true);
  });

  it('dequeue returns undefined for missing task', () => {
    const q = createTaskQueue();
    const { queue, task } = dequeueTask(q, 'nonexistent');
    expect(task).toBeUndefined();
    expect(queue).toBe(q);
  });

  it('rejectAll rejects all pending tasks', () => {
    const errors: unknown[] = [];
    const t1 = { id: '1', resolve: () => {}, reject: (e: unknown) => errors.push(e), createdAt: 0 };
    const t2 = { id: '2', resolve: () => {}, reject: (e: unknown) => errors.push(e), createdAt: 0 };

    let q = createTaskQueue();
    q = enqueueTask(q, t1);
    q = enqueueTask(q, t2);

    const q2 = rejectAll(q, 'terminated');
    expect(isQueueEmpty(q2)).toBe(true);
    expect(errors).toEqual(['terminated', 'terminated']);
  });

  it('queue is immutable', () => {
    const q1 = createTaskQueue();
    const task = { id: '1', resolve: () => {}, reject: () => {}, createdAt: 0 };
    const q2 = enqueueTask(q1, task);
    expect(pendingCount(q1)).toBe(0);
    expect(pendingCount(q2)).toBe(1);
  });
});
