/**
 * Kernel error translation — maps cryptic kernel messages to user-friendly explanations.
 *
 * Extracted from errors.ts to separate pure type/constructor definitions
 * from OCCT-specific regex matching logic.
 */

/**
 * Common kernel error patterns and their user-friendly translations.
 * Used by kernelCall to provide actionable error messages.
 */
const kernel_ERROR_PATTERNS: ReadonlyArray<{ pattern: RegExp; translation: string }> = [
  {
    pattern: /invalid edge configuration|edges?.*(not|fail|invalid)/i,
    translation:
      'The edges may not form a continuous loop. Check that edges connect end-to-end without gaps.',
  },
  {
    pattern: /BRepAlgoAPI.*failed|boolean.*operation.*failed/i,
    translation:
      'Boolean operation failed. Common causes: overlapping faces, zero-thickness geometry, or degenerate shapes. Try healing input shapes first.',
  },
  {
    pattern: /fillet.*radius.*too.*large|fillet.*failed/i,
    translation:
      'Fillet operation failed. The radius may be too large for the selected edges. Try reducing the radius or check that edges have enough room.',
  },
  {
    pattern: /chamfer.*failed|chamfer.*distance.*too.*large/i,
    translation:
      'Chamfer operation failed. The distance may be too large for the selected edges. Try reducing the distance or check edge geometry.',
  },
  {
    pattern: /shell.*failed|offset.*failed/i,
    translation:
      'Shell/offset operation failed. The thickness may be too large, or the shape may have complex geometry. Try reducing thickness.',
  },
  {
    pattern: /sweep.*failed|pipe.*failed/i,
    translation:
      'Sweep operation failed. Check that the profile and spine are compatible, and that the spine has no sharp twists or self-intersections.',
  },
  {
    pattern: /loft.*failed/i,
    translation:
      'Loft operation failed. Profiles may be incompatible or have different orientations. Ensure profiles are ordered consistently.',
  },
  {
    pattern: /extrude.*failed|prism.*failed/i,
    translation:
      'Extrusion failed. The profile may be invalid or self-intersecting. Check that the profile forms a valid closed wire.',
  },
  {
    pattern: /revolve.*failed|revolution.*failed/i,
    translation:
      'Revolution operation failed. The profile may intersect the axis of revolution, or the angle may be invalid.',
  },
  {
    pattern: /self.*intersect|self-intersect/i,
    translation:
      'Shape has self-intersections. The operation resulted in overlapping geometry. Simplify the input or adjust parameters.',
  },
  {
    pattern: /degener|degenerat/i,
    translation:
      'Degenerate geometry detected. The shape has edges or faces with zero length/area. Check input geometry for collapsed elements.',
  },
  {
    pattern: /BRepCheck.*fail|shape.*invalid|shape.*not.*valid/i,
    translation:
      'Shape validation failed. The resulting shape has invalid topology. Try healing the shape or checking input geometry.',
  },
];

/**
 * Translate an kernel error message into a user-friendly explanation.
 * If no pattern matches, returns the original message.
 *
 * @param kernelMessage - The raw error message from kernel
 * @returns User-friendly error message with actionable guidance
 */
export function translateKernelError(kernelMessage: string): string {
  for (const { pattern, translation } of kernel_ERROR_PATTERNS) {
    if (pattern.test(kernelMessage)) {
      return `${translation} (kernel: ${kernelMessage})`;
    }
  }
  // No pattern matched — return original message
  return kernelMessage;
}
