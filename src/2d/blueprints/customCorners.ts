import { bug } from '../../core/errors.js';
import type { Corner } from '../../query/cornerFinder.js';
import type { CornerFilter } from '../../query/finderFns.js';
import type { Curve2D } from '../lib/index.js';
import { chamferCurves, filletCurves, samePoint } from '../lib/index.js';
import Blueprint from './Blueprint.js';
import Blueprints from './Blueprints.js';
import type { Shape2D } from './boolean2D.js';
import CompoundBlueprint from './CompoundBlueprint.js';

type CornerMaker = (c1: Curve2D, c2: Curve2D, radius: number) => Curve2D[];

function modifyCorners(
  makeCorner: CornerMaker,
  blueprint: Blueprint,
  radius: number,
  finder?: CornerFilter
) {
  let modifyCorner: (c: Corner) => boolean = () => true;
  if (finder) {
    modifyCorner = finder.shouldKeep.bind(finder);
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const curves: Curve2D[] = [blueprint.curves[0]!];

  const addModifiedCorner = (firstCurve: Curve2D, secondCurve: Curve2D) => {
    if (modifyCorner({ firstCurve, secondCurve, point: firstCurve.lastPoint })) {
      curves.push(...makeCorner(firstCurve, secondCurve, radius));
    } else {
      curves.push(firstCurve, secondCurve);
    }
  };

  blueprint.curves.slice(1).forEach((secondCurve) => {
    const firstCurve = curves.pop();
    if (!firstCurve)
      bug('customCorners.modifyCorners', 'Unexpected empty curve stack during filleting');
    addModifiedCorner(firstCurve, secondCurve);
  });

  const lastCurve = curves.at(-1);
  if (!lastCurve)
    bug('customCorners.modifyCorners', 'Unexpected empty curve list during corner modification');
  if (
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    samePoint(curves[0]!.firstPoint, lastCurve.lastPoint) &&
    curves.length > 1
  ) {
    const firstCurve = curves.pop();
    const secondCurve = curves.shift();
    if (!firstCurve || !secondCurve)
      bug('customCorners.modifyCorners', 'Unexpected empty curve stack during close-and-fillet');
    addModifiedCorner(firstCurve, secondCurve);
  }

  return new Blueprint(curves);
}

function modifyCorner2D(
  makeCorner: CornerMaker,
  shape: Shape2D,
  radius: number,
  finder?: CornerFilter
): Shape2D {
  if (shape instanceof Blueprint) {
    return modifyCorners(makeCorner, shape, radius, finder);
  }

  if (shape instanceof CompoundBlueprint) {
    // This might break the compound by clipping the outer limit. We ignore
    // that case for now
    return new CompoundBlueprint(
      shape.blueprints.map((b) => modifyCorners(makeCorner, b, radius, finder))
    );
  }

  if (shape instanceof Blueprints) {
    const bps = shape.blueprints
      .map((b) => modifyCorner2D(makeCorner, b, radius, finder))
      .filter((b) => b !== null) as (Blueprint | CompoundBlueprint)[];
    return new Blueprints(bps);
  }

  return null;
}

/**
 * Apply fillet (rounded) corners to a 2D shape.
 *
 * Replaces sharp junctions between adjacent curves with tangent arcs of the
 * given radius. An optional corner filter can restrict which corners
 * are modified (use {@link cornerFinder} to create one).
 *
 * @param shape - The 2D shape to fillet.
 * @param radius - Fillet arc radius.
 * @param finder - Optional filter to select specific corners.
 * @returns A new shape with filleted corners, or `null` if the input is `null`.
 */
export function fillet2D(shape: Shape2D, radius: number, finder?: CornerFilter) {
  return modifyCorner2D(filletCurves, shape, radius, finder);
}

/**
 * Apply chamfer (beveled) corners to a 2D shape.
 *
 * Replaces sharp junctions between adjacent curves with straight-line cuts at
 * the given distance from the corner. An optional corner filter can
 * restrict which corners are modified (use {@link cornerFinder} to create one).
 *
 * @param shape - The 2D shape to chamfer.
 * @param radius - Chamfer setback distance from the corner.
 * @param finder - Optional filter to select specific corners.
 * @returns A new shape with chamfered corners, or `null` if the input is `null`.
 */
export function chamfer2D(shape: Shape2D, radius: number, finder?: CornerFilter) {
  return modifyCorner2D(chamferCurves, shape, radius, finder);
}
