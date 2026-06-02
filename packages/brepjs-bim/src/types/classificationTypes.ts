/**
 * A reference into an external classification system (e.g. Uniclass 2015 or
 * OmniClass). Pure data, no imports, so it is safe to import from any layer.
 */
export interface ClassificationRef {
  /** Classification system name, e.g. 'Uniclass2015'. */
  readonly system: string;
  /** Edition of the system, e.g. '2015'. */
  readonly edition?: string | undefined;
  /** URL locating the system or table. */
  readonly location?: string | undefined;
  /** The classification code, e.g. 'Ss_15_10_30_14'. */
  readonly code: string;
  /** Human-readable label for the referenced code. */
  readonly description?: string | undefined;
}
