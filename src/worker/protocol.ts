/**
 * Worker communication protocol for offloading CAD operations.
 *
 * Messages are sent between the main thread and worker threads.
 * Shapes are transferred as BREP-serialized strings.
 */

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

export interface WorkerRequest {
  readonly id: string;
  readonly type: 'init' | 'operation' | 'dispose';
}

export interface InitRequest extends WorkerRequest {
  readonly type: 'init';
  readonly wasmUrl?: string;
}

export interface OperationRequest extends WorkerRequest {
  readonly type: 'operation';
  readonly operation: string;
  readonly shapesBrep: ReadonlyArray<string>;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface DisposeRequest extends WorkerRequest {
  readonly type: 'dispose';
}

export interface WorkerResponse {
  readonly id: string;
  readonly success: boolean;
}

export interface SuccessResponse extends WorkerResponse {
  readonly success: true;
  readonly resultBrep?: string;
  readonly resultData?: unknown;
}

export interface ErrorResponse extends WorkerResponse {
  readonly success: false;
  readonly error: string;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isInitRequest(msg: WorkerRequest): msg is InitRequest {
  return msg.type === 'init';
}

export function isOperationRequest(msg: WorkerRequest): msg is OperationRequest {
  return msg.type === 'operation';
}

export function isDisposeRequest(msg: WorkerRequest): msg is DisposeRequest {
  return msg.type === 'dispose';
}

export function isSuccessResponse(msg: WorkerResponse): msg is SuccessResponse {
  return msg.success;
}

export function isErrorResponse(msg: WorkerResponse): msg is ErrorResponse {
  return !msg.success;
}
