export const HASH_CODE_MAX = 2147483647;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

/** Shared counter for unique I/O filenames to prevent race conditions. */
export const IO_FILE_COUNTER = { value: 0 };
export function uniqueIOFilename(prefix: string, ext: string): string {
  return `${prefix}_${++IO_FILE_COUNTER.value}.${ext}`;
}
