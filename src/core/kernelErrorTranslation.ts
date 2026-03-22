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

// ---------------------------------------------------------------------------
// Per-error-code suggestions — actionable hints for the `suggestion` field
// ---------------------------------------------------------------------------

const ERROR_CODE_SUGGESTIONS: Readonly<Record<string, string>> = {
  FUSE_FAILED:
    'Try autoHeal() on both operands before the boolean operation. Check for overlapping faces or zero-thickness geometry.',
  CUT_FAILED:
    'Try autoHeal() on both operands before the boolean operation. Check for overlapping faces or zero-thickness geometry.',
  FUSE_NOT_3D:
    'The boolean result was not a 3D solid. Ensure both input shapes are valid 3D solids, not shells or open surfaces.',
  CUT_NOT_3D:
    'The boolean result was not a 3D solid. Ensure both input shapes are valid 3D solids, not shells or open surfaces.',
  INTERSECT_NOT_3D:
    'The boolean result was not a 3D solid. Ensure both input shapes are valid 3D solids, not shells or open surfaces.',
  SWEEP_FAILED:
    'Ensure the spine curve has no sharp corners or self-intersections. Try simplifying the profile or using a smoother path.',
  LOFT_FAILED:
    'Check that all profiles have the same number of edges and consistent orientation. Try reordering profiles.',
  FILLET_NOT_3D:
    'The fillet radius may be too large for the selected edges. Try a smaller radius or check that adjacent faces have enough room.',
  CHAMFER_NOT_3D:
    'The chamfer distance may be too large. Try a smaller distance or check edge geometry.',
  SHELL_NOT_3D:
    'The shell thickness may be too large for the shape. Try reducing thickness or removing problematic faces.',
  OFFSET_NOT_3D:
    'The offset distance may be too large for the shape geometry. Try a smaller distance.',
  DRAFT_FAILED:
    'The draft angle may be too large or the selected faces incompatible. Try a smaller angle or different faces.',
};

/** Look up an actionable suggestion for a given error code. */
export function getSuggestionForCode(code: string): string | undefined {
  return ERROR_CODE_SUGGESTIONS[code];
}

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
