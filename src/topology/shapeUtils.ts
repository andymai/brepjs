/**
 * Shape assembly utilities — welding and sewing operations.
 */

import { getKernel } from '../kernel/index.js';
import { type Result, ok, err, unwrap } from '../core/result.js';
import { typeCastError } from '../core/errors.js';
import type { AnyShape, Face, Shell } from '../core/shapeTypes.js';
import { isShell } from '../core/shapeTypes.js';
import { cast, downcast } from './cast.js';

/** Sew faces/shells into a single shape using the kernel's sewing algorithm. */
export function weldShapes(facesOrShells: Array<Face | Shell>): AnyShape {
  const sewn = getKernel().sew(facesOrShells.map((s) => s.wrapped));
  return unwrap(cast(unwrap(downcast(sewn))));
}

/**
 * Welds faces and shells into a single shell.
 *
 * @param facesOrShells - An array of faces and shells to be welded.
 * @param ignoreType - If true, the function will not check if the result is a shell.
 * @returns A shell that contains all the faces and shells.
 */
export function weldShellsAndFaces(
  facesOrShells: Array<Face | Shell>,
  ignoreType = false
): Result<Shell> {
  const shell = weldShapes(facesOrShells);

  if (!ignoreType && !isShell(shell))
    return err(typeCastError('WELD_NOT_SHELL', 'Could not make a shell from faces and shells'));

  return ok(shell as Shell);
}
