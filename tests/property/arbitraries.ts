import * as fc from 'fast-check';

// Reasonable bounds for CAD shapes — not too small (degenerate), not too large (perf)
const MIN_DIM = 1;
const MAX_DIM = 50;
const MIN_POS = -100;
const MAX_POS = 100;

/** Random 3D vector within reasonable bounds. */
export const arbVec3 = fc.tuple(
  fc.double({ min: MIN_POS, max: MAX_POS, noNaN: true }),
  fc.double({ min: MIN_POS, max: MAX_POS, noNaN: true }),
  fc.double({ min: MIN_POS, max: MAX_POS, noNaN: true })
);

/** Random box solid (position + dimensions). */
export const arbBox = fc.record({
  width: fc.double({ min: MIN_DIM, max: MAX_DIM, noNaN: true }),
  height: fc.double({ min: MIN_DIM, max: MAX_DIM, noNaN: true }),
  depth: fc.double({ min: MIN_DIM, max: MAX_DIM, noNaN: true }),
  position: arbVec3,
});

/** Random cylinder (radius, height, position). */
export const arbCylinder = fc.record({
  radius: fc.double({ min: MIN_DIM, max: MAX_DIM / 2, noNaN: true }),
  height: fc.double({ min: MIN_DIM, max: MAX_DIM, noNaN: true }),
  position: arbVec3,
});

/** Random sphere (radius, position). */
export const arbSphere = fc.record({
  radius: fc.double({ min: MIN_DIM, max: MAX_DIM / 2, noNaN: true }),
  position: arbVec3,
});

/** Random translation vector. */
export const arbTranslation = arbVec3;
