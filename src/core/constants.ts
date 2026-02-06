/** Maximum hash code value for OCCT shape hashing (2^31 - 1). */
export const HASH_CODE_MAX = 2147483647;

/** Multiply degrees by this constant to convert to radians. */
export const DEG2RAD = Math.PI / 180;

/** Multiply radians by this constant to convert to degrees. */
export const RAD2DEG = 180 / Math.PI;

// Re-export from utils (Layer 0) so existing imports continue to work.
export { uniqueIOFilename, uniqueId } from '../utils/ioFilename.js';
