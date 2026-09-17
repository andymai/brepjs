/** An observable failed release. Its native outcome is uncertain; never retry it blindly. */
export class GeometryCleanupError extends Error {
  readonly resourceKind: 'SHAPE' | 'TRANSFORM';

  constructor(options: {
    readonly message: string;
    readonly resourceKind: 'SHAPE' | 'TRANSFORM';
    readonly cause: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'GeometryCleanupError';
    this.resourceKind = options.resourceKind;
  }
}
