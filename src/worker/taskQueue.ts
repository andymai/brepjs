/**
 * Task queue for managing pending worker operations.
 * Pure data structure -- no Worker API dependency.
 */

/** A task awaiting a response from the worker. */
export interface PendingTask<T = unknown> {
  readonly id: string;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
  readonly createdAt: number;
}

/** Immutable queue of pending worker tasks, keyed by ID. */
export interface TaskQueue<T = unknown> {
  readonly pending: ReadonlyMap<string, PendingTask<T>>;
}

/** Create an empty task queue. */
export function createTaskQueue<T = unknown>(): TaskQueue<T> {
  return { pending: new Map() };
}

/** Add a task to the queue. Returns the updated queue. */
export function enqueueTask<T>(queue: TaskQueue<T>, task: PendingTask<T>): TaskQueue<T> {
  const pending = new Map(queue.pending);
  pending.set(task.id, task);
  return { pending };
}

/** Remove and return a task from the queue. */
export function dequeueTask<T>(
  queue: TaskQueue<T>,
  taskId: string
): { queue: TaskQueue<T>; task: PendingTask<T> | undefined } {
  const task = queue.pending.get(taskId);
  if (!task) return { queue, task: undefined };
  const pending = new Map(queue.pending);
  pending.delete(taskId);
  return { queue: { pending }, task };
}

/** Get the number of pending tasks. */
export function pendingCount<T>(queue: TaskQueue<T>): number {
  return queue.pending.size;
}

/** Check if the queue has no pending tasks. */
export function isEmpty<T>(queue: TaskQueue<T>): boolean {
  return queue.pending.size === 0;
}

/** Reject all pending tasks with the given reason. */
export function rejectAll<T>(queue: TaskQueue<T>, reason: unknown): TaskQueue<T> {
  for (const task of queue.pending.values()) {
    task.reject(reason);
  }
  return { pending: new Map() };
}
