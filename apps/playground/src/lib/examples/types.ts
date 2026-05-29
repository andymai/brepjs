/**
 * Shared type for playground examples surfaced through the command palette.
 *
 * Authoring rules for every example's `code` string:
 * - Fully self-contained — no shared helpers, no TS-only constructs the worker's
 *   sucrase strip can't handle. The `code` becomes the editor buffer verbatim.
 * - Imports only from 'brepjs/quick' (plus `color` from 'brepjs/playground' when
 *   multi-colored), and ends in `export default <shape | shape[]>`.
 * - Comments kept terse in the house style (see basics.ts for the calibration).
 *
 * Examples live in category files (basics, geometry, mechanical, …) and are
 * aggregated into a single flat EXAMPLES list by ./index.
 */
export interface Example {
  id: string;
  label: string;
  description: string;
  code: string;
}
