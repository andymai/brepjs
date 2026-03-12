/**
 * Shared kernel environment detection for test files.
 * Import these constants instead of duplicating `process.env['TEST_KERNEL']` checks.
 */
export const currentKernel = (process.env['TEST_KERNEL'] ?? 'occt') as 'occt' | 'brepkit';
export const isBrepkit = currentKernel === 'brepkit';
