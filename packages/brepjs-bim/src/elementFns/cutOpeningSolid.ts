import { clone, createSolid, cut, err, getKernel, type Result, type ValidSolid } from 'brepjs';
import { fromBrepError, geometryError, type BimError } from '../errors/bimError.js';
import { generateGeometry } from '../geometryGeneration.js';
import { validateGeneratedSolid } from './validateGeneratedSolid.js';

/** Borrow the host; retain one independent solid only after all temporary cleanup succeeds. */
export function cutOpeningSolid(input: {
  readonly host: ValidSolid;
  readonly makeTool: () => Result<ValidSolid, BimError>;
  readonly hostKind: 'WALL' | 'SLAB';
}): Result<ValidSolid, BimError> {
  const prefix = `${input.hostKind}_OPENING`;
  return generateGeometry({ operation: 'cutOpeningSolid', codePrefix: prefix }, (own) => {
    const tool = input.makeTool();
    if (!tool.ok) return tool;
    own(tool.value);
    const result = cut(input.host, tool.value);
    if (!result.ok) {
      return err(fromBrepError(result.error, `${input.hostKind}_CUT_FAILED`, 'Opening cut failed'));
    }
    const cutShape = own(result.value);
    // Own all typed native children before cloning the retained result.
    // A failed later cast must not strand handles outside the generator scope.
    const solids = getKernel()
      .iterShapes(cutShape.wrapped, 'solid')
      .map((raw) => own(createSolid(raw)));
    const [solid] = solids;
    if (solids.length !== 1 || solid === undefined) {
      return err(
        geometryError(`${prefix}_INVALID_SOLID`, 'An opening must leave one connected solid')
      );
    }
    const copied = clone(solid);
    if (!copied.ok) {
      return err(
        fromBrepError(copied.error, `${prefix}_COPY_FAILED`, 'Failed to retain opening cut')
      );
    }
    return validateGeneratedSolid(own(copied.value), {
      code: `${prefix}_INVALID_SOLID`,
      message: 'Opening cut failed validity check',
    });
  });
}
