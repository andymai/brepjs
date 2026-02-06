/**
 * Worker communication protocol for offloading CAD operations.
 *
 * Messages are sent between the main thread and worker threads.
 * Shapes are transferred as BREP-serialized strings.
 */

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

/** Base interface for all messages sent from the main thread to a worker. */
export interface WorkerRequest {
  /** Unique identifier for correlating requests with responses. */
  readonly id: string;
  /** Discriminant indicating the kind of request. */
  readonly type: 'init' | 'operation' | 'dispose';
}

/** Request to initialize the worker (load the WASM/OpenCascade runtime). */
export interface InitRequest extends WorkerRequest {
  readonly type: 'init';
  /** Optional URL to the WASM binary; when omitted the worker uses its default. */
  readonly wasmUrl?: string;
}

/**
 * Request to execute a named CAD operation inside the worker.
 *
 * @remarks Shapes are transferred as BREP-serialized strings, not as live
 * OpenCascade handles, because handles cannot cross the worker boundary.
 */
export interface OperationRequest extends WorkerRequest {
  readonly type: 'operation';
  /** Name of the registered operation to invoke. */
  readonly operation: string;
  /** BREP-serialized input shapes. */
  readonly shapesBrep: ReadonlyArray<string>;
  /** Arbitrary key/value parameters forwarded to the operation handler. */
  readonly parameters: Readonly<Record<string, unknown>>;
}

/** Request to dispose the worker, releasing all resources. */
export interface DisposeRequest extends WorkerRequest {
  readonly type: 'dispose';
}

/** Base interface for all messages sent from a worker back to the main thread. */
export interface WorkerResponse {
  /** Matches the {@link WorkerRequest.id} of the originating request. */
  readonly id: string;
  /** Discriminant: `true` for success, `false` for error. */
  readonly success: boolean;
}

/** Response indicating that the requested operation completed successfully. */
export interface SuccessResponse extends WorkerResponse {
  readonly success: true;
  /** BREP-serialized result shape, when the operation produces geometry. */
  readonly resultBrep?: string;
  /** Arbitrary result data for non-geometric outputs (e.g., measurements). */
  readonly resultData?: unknown;
}

/** Response indicating that the requested operation failed. */
export interface ErrorResponse extends WorkerResponse {
  readonly success: false;
  /** Human-readable error message describing the failure. */
  readonly error: string;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/** Narrow a {@link WorkerRequest} to an {@link InitRequest}. */
export function isInitRequest(msg: WorkerRequest): msg is InitRequest {
  return msg.type === 'init';
}

/** Narrow a {@link WorkerRequest} to an {@link OperationRequest}. */
export function isOperationRequest(msg: WorkerRequest): msg is OperationRequest {
  return msg.type === 'operation';
}

/** Narrow a {@link WorkerRequest} to a {@link DisposeRequest}. */
export function isDisposeRequest(msg: WorkerRequest): msg is DisposeRequest {
  return msg.type === 'dispose';
}

/** Narrow a {@link WorkerResponse} to a {@link SuccessResponse}. */
export function isSuccessResponse(msg: WorkerResponse): msg is SuccessResponse {
  return msg.success;
}

/** Narrow a {@link WorkerResponse} to an {@link ErrorResponse}. */
export function isErrorResponse(msg: WorkerResponse): msg is ErrorResponse {
  return !msg.success;
}
