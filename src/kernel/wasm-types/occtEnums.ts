/**
 * Extract a numeric value from an OCCT enum.
 * OCCT Emscripten returns enum objects with `.value` property.
 */
export function extractEnumValue(val: number | { value: number }): number {
  return typeof val === 'number' ? val : val.value;
}
