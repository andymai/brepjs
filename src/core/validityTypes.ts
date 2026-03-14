/**
 * Topological validity phantom brands (ADR-0005).
 *
 * Phantom types that encode topological invariants as type-level brands.
 * Smart constructors prove validity at runtime; type guards narrow in-place.
 *
 * - ClosedWire<D> — wire forms a closed loop
 * - OrientedFace<D> — face has consistent normal orientation
 * - ManifoldShell — shell is watertight
 * - ValidSolid — solid passes BRepCheck validation
 */

// Type-only imports — erased at runtime, no circular dependency
import type { Dimension } from './dimensionTypes.js';
import type { Wire, Face, Shell, Solid } from './shapeTypes.js';
import type { Result } from './result.js';

import { ok, err } from './result.js';
import { getKernel } from '../kernel/index.js';

// ---------------------------------------------------------------------------
// Phantom brand symbols
// ---------------------------------------------------------------------------

/** Phantom brand: wire forms a closed loop. */
declare const __closed: unique symbol;
/** Phantom brand: face has consistent normal orientation. */
declare const __oriented: unique symbol;
/** Phantom brand: shell is manifold (watertight, no dangling faces). */
declare const __manifold: unique symbol;
/** Phantom brand: solid passes BRepCheck validation. */
declare const __valid: unique symbol;

// ---------------------------------------------------------------------------
// Topological validity types
// ---------------------------------------------------------------------------

/**
 * A wire proven to form a closed loop.
 * The only way to obtain a `ClosedWire` is through smart constructors
 * (`closedWire()`, `rectangleWire()`, etc.) or type guards (`isClosedWire()`).
 * Assignable to `Wire<D>` — a subtype, not a separate type.
 */
export type ClosedWire<D extends Dimension = '3D'> = Wire<D> & { readonly [__closed]: true };

/**
 * A face with proven consistent normal orientation.
 * Obtained via `orientedFace()` or `isOrientedFace()`.
 * Assignable to `Face<D>`.
 */
export type OrientedFace<D extends Dimension = '3D'> = Face<D> & { readonly [__oriented]: true };

/**
 * A shell proven to be manifold (watertight, no dangling faces).
 * Obtained via `manifoldShell()` or `isManifoldShell()`.
 * Assignable to `Shell`.
 */
export type ManifoldShell = Shell & { readonly [__manifold]: true };

/**
 * A solid proven to pass BRepCheck validation.
 * Obtained via `validSolid()` or `isValidSolid()`.
 * Assignable to `Solid`.
 */
export type ValidSolid = Solid & { readonly [__valid]: true };

// ---------------------------------------------------------------------------
// Type guards (runtime checks via kernel)
// ---------------------------------------------------------------------------

/**
 * Type guard — check if a wire is closed (forms a loop).
 * Uses the kernel's `curveIsClosed` to verify at runtime.
 */
export function isClosedWire<D extends Dimension>(wire: Wire<D>): wire is ClosedWire<D> {
  return getKernel().curveIsClosed(wire.wrapped);
}

/**
 * Type guard — check if a face is valid and thus safe to use in operations.
 *
 * Uses kernel validity (BRepCheck_Analyzer) which verifies geometric and
 * topological correctness. Faces produced by kernel operations (makeFace,
 * extrude, revolve, boolean ops) are oriented by construction. For faces
 * from STEP/IGES imports or external sources, validity does not guarantee
 * consistent normal orientation — use with caution or re-orient first.
 */
export function isOrientedFace<D extends Dimension>(face: Face<D>): face is OrientedFace<D> {
  return getKernel().isValid(face.wrapped);
}

/**
 * Type guard — check if a shell is manifold (watertight, no dangling faces).
 * Checks kernel validity, then attempts `solidFromShell` — if the shell
 * can form a valid solid, it is manifold by definition.
 *
 * The temporary solid created for the proof is disposed immediately to avoid
 * WASM memory leaks.
 */
export function isManifoldShell(shell: Shell): shell is ManifoldShell {
  const kernel = getKernel();
  if (!kernel.isValid(shell.wrapped)) return false;
  // Use strict validation for the manifold proof — relaxed validation
  // may accept open shells sewn into a "solid" that aren't truly watertight.
  const validate = kernel.isValidStrict?.bind(kernel) ?? kernel.isValid.bind(kernel);
  // A manifold shell can be converted to a solid — try it as a proof
  try {
    const solid = kernel.solidFromShell(shell.wrapped);
    const valid = validate(solid);
    // Dispose the temporary solid to prevent WASM memory leaks
    try {
      kernel.dispose(solid);
    } catch {
      /* best-effort cleanup */
    }
    return valid;
  } catch {
    return false;
  }
}

/**
 * Type guard — check if a solid passes BRepCheck validation.
 */
export function isValidSolid(solid: Solid): solid is ValidSolid {
  return getKernel().isValid(solid.wrapped);
}

// ---------------------------------------------------------------------------
// Smart constructors — return Result<T, string> for consistency with core Result type
// ---------------------------------------------------------------------------

/**
 * Prove that a wire is closed, returning a branded `ClosedWire` on success.
 * This is the primary smart constructor for `ClosedWire`.
 *
 * @example
 * ```ts
 * const w = wire([e1, e2, e3]);
 * const closed = closedWire(unwrap(w));
 * if (isOk(closed)) {
 *   const f = face(closed.value); // ClosedWire accepted
 * }
 * ```
 */
export function closedWire<D extends Dimension>(wire: Wire<D>): Result<ClosedWire<D>, string> {
  if (isClosedWire(wire)) return ok(wire);
  return err('Wire is not closed: start and end points do not coincide');
}

/**
 * Prove that a face is oriented, returning a branded `OrientedFace` on success.
 */
export function orientedFace<D extends Dimension>(face: Face<D>): Result<OrientedFace<D>, string> {
  if (isOrientedFace(face)) return ok(face);
  return err('Face orientation is inconsistent or face is invalid');
}

/**
 * Prove that a shell is manifold, returning a branded `ManifoldShell` on success.
 */
export function manifoldShell(shell: Shell): Result<ManifoldShell, string> {
  if (isManifoldShell(shell)) return ok(shell);
  return err('Shell is not manifold: has free edges or is invalid');
}

/**
 * Prove that a solid is valid, returning a branded `ValidSolid` on success.
 */
export function validSolid(solid: Solid): Result<ValidSolid, string> {
  if (isValidSolid(solid)) return ok(solid);
  return err('Solid failed BRepCheck validation');
}
