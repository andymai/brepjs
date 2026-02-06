/**
 * Worker offloading utilities for brepjs.
 *
 * Provides protocol types and helpers for running CAD operations
 * in Web Workers. Shapes are serialized as BREP strings for transfer.
 */

export {
  type WorkerRequest,
  type InitRequest,
  type OperationRequest,
  type DisposeRequest,
  type WorkerResponse,
  type SuccessResponse,
  type ErrorResponse,
  isInitRequest,
  isOperationRequest,
  isDisposeRequest,
  isSuccessResponse,
  isErrorResponse,
} from './protocol.js';

export {
  type PendingTask,
  type TaskQueue,
  createTaskQueue,
  enqueueTask,
  dequeueTask,
  pendingCount,
  isEmpty as isQueueEmpty,
  rejectAll,
} from './taskQueue.js';

export {
  createWorkerClient,
  type WorkerClient,
  type WorkerClientOptions,
  type WorkerResult,
} from './workerClient.js';

export {
  createOperationRegistry,
  registerHandler,
  createWorkerHandler,
  type OperationHandler,
  type OperationRegistry,
} from './workerHandler.js';
