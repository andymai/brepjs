export const HASH_CODE_MAX = 2147483647;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

// Re-export from utils (Layer 0) so existing imports continue to work.
export { uniqueIOFilename, uniqueId } from '../utils/ioFilename.js';
