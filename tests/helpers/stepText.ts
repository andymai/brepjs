/** Read lengths back out of STEP text, to check the unit an export wrote them in. */

const CARTESIAN_POINT = /CARTESIAN_POINT\('[^']*',\(([^)]*)\)\)/g;

/** The largest coordinate of any CARTESIAN_POINT, in the file's own length unit. */
export function largestStepCoordinate(step: string): number {
  let largest = -Infinity;
  for (const [, coords] of step.matchAll(CARTESIAN_POINT)) {
    for (const value of coords?.split(',') ?? []) largest = Math.max(largest, Number(value));
  }
  return largest;
}

export const INCH_UNIT = "CONVERSION_BASED_UNIT('INCH'";
export const MILLIMETER_UNIT = 'SI_UNIT(.MILLI.,.METRE.)';
