import { err, isValidSolid, ok, type Result, type Solid, type ValidSolid } from 'brepjs';
import { geometryError, type BimError } from '../errors/bimError.js';

/** Validate a candidate already owned by the surrounding generation scope. */
export function validateGeneratedSolid(
  solid: Solid,
  context: { readonly code: string; readonly message: string }
): Result<ValidSolid, BimError> {
  let cause: unknown;
  try {
    if (isValidSolid(solid)) return ok(solid);
  } catch (error) {
    cause = error;
  }
  return err(geometryError(context.code, context.message, cause));
}
