/**
 * Bug / panic helper — these throw and should never be caught in normal code.
 * Lives in utils (Layer 0) so it can be used by all layers including kernel.
 */

export class BrepBugError extends Error {
  readonly location: string;

  constructor(location: string, message: string) {
    super(`Bug in ${location}: ${message}`);
    this.name = 'BrepBugError';
    this.location = location;
  }
}

/**
 * Throws a BrepBugError for invariant violations / programmer errors.
 * Equivalent to Rust's panic!() — should never be caught in normal code.
 */
export function bug(location: string, message: string): never {
  throw new BrepBugError(location, message);
}
