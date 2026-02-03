/** Shared counter for unique I/O filenames to prevent race conditions in concurrent operations. */
let _counter = 0;

/** Generate a unique filename with prefix and extension (e.g., `_export_1.step`). */
export function uniqueIOFilename(prefix: string, ext: string): string {
  return `${prefix}_${++_counter}.${ext}`;
}

/** Generate a unique ID string for temporary file operations. */
export function uniqueId(): string {
  return `_io_${++_counter}`;
}
