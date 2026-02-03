/** Shared counter for unique I/O filenames to prevent race conditions in concurrent operations. */
let _counter = 0;
export function uniqueIOFilename(prefix: string, ext: string): string {
  return `${prefix}_${++_counter}.${ext}`;
}
