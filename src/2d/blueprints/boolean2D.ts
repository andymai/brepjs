import { bug, safeIndex } from '../../core/errors.js';
import { unwrap } from '../../core/result.js';
import Blueprint from './Blueprint.js';
import Blueprints from './Blueprints.js';
import CompoundBlueprint from './CompoundBlueprint.js';
import { organiseBlueprints } from './lib.js';
import { fuseBlueprints, cutBlueprints, intersectBlueprints } from './booleanOperations.js';
import type { Point2D } from '../lib/index.js';
import { intersectCurves, removeDuplicatePoints } from '../lib/index.js';

/**
 * Union type for all 2D shape representations, including `null` for empty results.
 *
 * Used throughout the 2D boolean API as both input and output of operations.
 */
export type Shape2D = Blueprint | Blueprints | CompoundBlueprint | null;

const genericIntersects = (
  first: Blueprint | CompoundBlueprint | Blueprints,
  second: Blueprint | CompoundBlueprint | Blueprints
): boolean => {
  if (first instanceof Blueprint && second instanceof Blueprint) {
    let allIntersections: Point2D[] = [];

    first.curves.forEach((thisCurve) => {
      second.curves.forEach((otherCurve) => {
        const { intersections, commonSegmentsPoints } = unwrap(
          intersectCurves(thisCurve, otherCurve)
        );
        allIntersections.push(...intersections);
        allIntersections.push(...commonSegmentsPoints);
      });
    });

    allIntersections = removeDuplicatePoints(allIntersections);
    return allIntersections.length > 1;
  }
  if (first instanceof CompoundBlueprint || first instanceof Blueprints) {
    return first.blueprints.some((bp) => genericIntersects(bp, second));
  }
  if (second instanceof CompoundBlueprint || second instanceof Blueprints) {
    return second.blueprints.some((bp) => genericIntersects(first, bp));
  }

  bug('genericIntersects', 'Unhandled shape combination in genericIntersects');
};

const genericFuse = (
  first: Blueprint | CompoundBlueprint,
  second: Blueprint | CompoundBlueprint
): Blueprint | CompoundBlueprint | Blueprints | null => {
  if (first instanceof CompoundBlueprint) {
    if (second instanceof Blueprint) {
      return fuseBlueprintWithCompound(second, first);
    }
    if (second instanceof CompoundBlueprint) {
      return fuseCompoundWithCompound(first, second);
    }
  }

  if (second instanceof CompoundBlueprint) {
    if (first instanceof Blueprint) {
      return fuseBlueprintWithCompound(first, second);
    }
    if (first instanceof CompoundBlueprint) {
      return fuseCompoundWithCompound(first, second);
    }
  }

  if (first instanceof Blueprint && second instanceof Blueprint) {
    return fuseBlueprints(first, second);
  }

  bug('genericFuse', 'Unhandled shape combination in genericFuse');
};

const fuseIntersectingBlueprints = (blueprints: (Blueprint | CompoundBlueprint)[]) => {
  const fused = new Map();

  const output: { current: Blueprint | CompoundBlueprint | Blueprints }[] = [];

  blueprints.forEach((inputBlueprint, i) => {
    let savedBlueprint: {
      current: Blueprint | CompoundBlueprint | Blueprints;
      fusedWith: Set<number>;
    };

    if (fused.has(i)) {
      savedBlueprint = fused.get(i);
    } else {
      savedBlueprint = { current: inputBlueprint, fusedWith: new Set([i]) };
      output.push(savedBlueprint);
    }

    blueprints.slice(i + 1).forEach((inputOtherBlueprint, j) => {
      const blueprint = savedBlueprint.current;

      const currentIndex = i + j + 1;

      if (savedBlueprint.fusedWith.has(currentIndex)) return;

      let otherBlueprint = inputOtherBlueprint;
      let otherIsFused = false;

      if (fused.has(currentIndex)) {
        otherBlueprint = fused.get(currentIndex).current;
        otherIsFused = true;
      }

      if (blueprint.boundingBox.isOut(otherBlueprint.boundingBox)) return;
      if (!genericIntersects(blueprint, otherBlueprint)) return;

      let newFused;
      if (blueprint instanceof Blueprints || otherBlueprint instanceof Blueprints) {
        const fused = fuse2D(blueprint, otherBlueprint);
        if (fused === null) {
          bug('fuseIntersectingBlueprints', 'fuse2D returned null for non-null inputs');
        }
        newFused = fused;
      } else {
        newFused = genericFuse(blueprint, otherBlueprint);
      }
      if (!(newFused instanceof Blueprint || newFused instanceof CompoundBlueprint)) {
        if (newFused instanceof Blueprints && newFused.blueprints.length === 2) {
          // The generic intersects was wrong here - the intersection
          // points were only touching and not crossing
          return;
        } else if (newFused instanceof Blueprints && newFused.blueprints.length === 1) {
          // The generic intersects was wrong here - the intersection
          // points were only touching and not crossing
          newFused = safeIndex(newFused.blueprints, 0, 'fuseIntersectingBlueprints');
        } else if (!(newFused instanceof Blueprints)) {
          bug('fuseIntersectingBlueprints', 'Fuse produced unexpected non-blueprint result');
        }
      }
      savedBlueprint.fusedWith.add(currentIndex);
      savedBlueprint.current = newFused;
      if (!otherIsFused) fused.set(currentIndex, savedBlueprint);
    });
  });

  return organiseBlueprints(output.map(({ current }) => current).flatMap((b) => allBlueprints(b)));
};

const allBlueprints = (shape: Shape2D): Blueprint[] => {
  if (shape instanceof Blueprint) return [shape];
  if (shape instanceof CompoundBlueprint) return shape.blueprints;
  if (shape instanceof Blueprints) return shape.blueprints.flatMap((b) => allBlueprints(b));
  return [];
};

const fuseBlueprintWithCompound = (blueprint: Blueprint, compound: CompoundBlueprint) => {
  const outerFused = fuseBlueprints(
    blueprint,
    safeIndex(compound.blueprints, 0, 'fuseBlueprintWithCompound')
  );
  const innerFused = compound.blueprints.slice(1).map((c) => cutBlueprints(c, blueprint));

  return organiseBlueprints([
    ...allBlueprints(outerFused),
    ...innerFused.flatMap((fused) => allBlueprints(fused)),
  ]);
};

function allPairs<S, T>(list1: T[], list2: S[]): [T, S][] {
  const result: [T, S][] = [];

  for (const l1 of list1) {
    for (const l2 of list2) {
      result.push([l1, l2]);
    }
  }

  return result;
}

const fuseCompoundWithCompound = (first: CompoundBlueprint, second: CompoundBlueprint) => {
  const firstOuter = safeIndex(first.blueprints, 0, 'fuseCompoundWithCompound');
  const secondOuter = safeIndex(second.blueprints, 0, 'fuseCompoundWithCompound');
  const outerFused = fuseBlueprints(firstOuter, secondOuter);

  const inner1Fused = second.blueprints.slice(1).map((c) => cutBlueprints(c, firstOuter));

  const inner2Fused = first.blueprints.slice(1).map((c) => cutBlueprints(c, secondOuter));

  const innerIntersections = allPairs(
    first.blueprints.slice(1),
    second.blueprints.slice(1)
  ).flatMap(([first, second]) => {
    return allBlueprints(intersectBlueprints(first, second));
  });

  return organiseBlueprints([
    ...allBlueprints(outerFused),
    ...inner1Fused.flatMap((fused) => allBlueprints(fused)),
    ...inner2Fused.flatMap((fused) => allBlueprints(fused)),
    ...innerIntersections,
  ]);
};

/**
 * Compute the boolean union of two 2D shapes.
 *
 * Handles all combinations of {@link Blueprint}, {@link CompoundBlueprint},
 * {@link Blueprints}, and `null`. When both inputs are simple blueprints the
 * operation delegates to {@link fuseBlueprints}; compound and multi-blueprint
 * cases are decomposed recursively.
 *
 * @param first - First operand (or `null` for empty).
 * @param second - Second operand (or `null` for empty).
 * @returns The fused shape, or `null` if both operands are empty.
 *
 * @example
 * ```ts
 * const union = fuse2D(circleBlueprint, squareBlueprint);
 * ```
 *
 * @see {@link fuse2D} for the functional API.
 */
export const fuse2D = (
  first: Shape2D,
  second: Shape2D
): Blueprint | Blueprints | CompoundBlueprint | null => {
  if (first === null) {
    return second?.clone() ?? null;
  }
  if (second === null) {
    return first.clone();
  }

  if (!(first instanceof Blueprints) && second instanceof Blueprints) {
    return fuseIntersectingBlueprints([first, ...second.blueprints]);
  }
  if (!(second instanceof Blueprints) && first instanceof Blueprints) {
    return fuseIntersectingBlueprints([second, ...first.blueprints]);
  }
  if (first instanceof Blueprints && second instanceof Blueprints) {
    let out = fuse2D(safeIndex(first.blueprints, 0, 'fuse2D'), second);

    first.blueprints.slice(1).forEach((bp) => {
      out = fuse2D(bp, out);
    });
    return out;
  }

  if (first instanceof CompoundBlueprint) {
    if (second instanceof Blueprints) {
      return fuse2D(second, first);
    }
    if (second instanceof Blueprint) {
      return fuseBlueprintWithCompound(second, first);
    }
    if (second instanceof CompoundBlueprint) {
      return fuseCompoundWithCompound(first, second);
    }
  }

  if (second instanceof CompoundBlueprint) {
    if (first instanceof Blueprints) {
      return fuse2D(first, second);
    }
    if (first instanceof Blueprint) {
      return fuseBlueprintWithCompound(first, second);
    }
    if (first instanceof CompoundBlueprint) {
      return fuseCompoundWithCompound(first, second);
    }
  }

  if (first instanceof Blueprint && second instanceof Blueprint) {
    return fuseBlueprints(first, second);
  }
  return null;
};

// We assume that the shapes are not intersecting here - we do not check for it
const mergeNonIntersecting = (shapes: Shape2D[]) => {
  const exploded: (CompoundBlueprint | Blueprint)[] = shapes.flatMap((s) => {
    if (s === null) return [];
    if (s instanceof Blueprints) return s.blueprints;
    return s;
  });
  if (exploded.length === 1) return safeIndex(exploded, 0, 'mergeNonIntersecting');
  return new Blueprints(exploded);
};

/**
 * Compute the boolean difference of two 2D shapes (first minus second).
 *
 * Removes the region covered by `second` from `first`. When the tool is fully
 * inside the base, the result is a {@link CompoundBlueprint} (base with a
 * hole).
 *
 * @param first - Base shape to cut from.
 * @param second - Tool shape to subtract.
 * @returns The remaining shape, or `null` if nothing remains.
 *
 * @example
 * ```ts
 * const withHole = cut2D(outerRect, innerCircle);
 * ```
 *
 * @see {@link cut2D} for the functional API.
 */
export const cut2D = (
  first: Shape2D,
  second: Shape2D
): Blueprint | Blueprints | CompoundBlueprint | null => {
  if (first === null) {
    return null;
  }
  if (second === null) {
    return first.clone();
  }

  if (first instanceof Blueprints) {
    return mergeNonIntersecting(first.blueprints.map((bp) => cut2D(bp, second)));
  }

  if (first instanceof CompoundBlueprint) {
    const wrapper = safeIndex(first.blueprints, 0, 'cut2D');
    if (second instanceof Blueprint && !second.intersects(wrapper)) {
      if (!wrapper.isInside(second.firstPoint)) return null;
      const cuts = fuse2D(second, new Blueprints(first.blueprints.slice(1)));
      return organiseBlueprints([wrapper, ...allBlueprints(cuts)]);
    } else {
      let out = cut2D(wrapper, second);
      first.blueprints.slice(1).forEach((bp) => {
        out = cut2D(out, bp);
      });
      return out;
    }
  }

  // From here the first is a simple blueprint
  if (second instanceof Blueprints) {
    return mergeNonIntersecting(second.blueprints.map((bp) => cut2D(first, bp)));
  }

  if (second instanceof CompoundBlueprint) {
    let out: Shape2D = cutBlueprints(first, safeIndex(second.blueprints, 0, 'cut2D'));
    second.blueprints.slice(1).forEach((bp) => {
      out = fuse2D(out, intersectBlueprints(bp, first));
    });
    return out;
  }

  // Both are blueprints
  const singleCut = cutBlueprints(first, second);
  return singleCut;
};

/**
 * Compute the boolean intersection of two 2D shapes.
 *
 * Returns only the region common to both shapes. Compound and multi-blueprint
 * operands are decomposed recursively, with holes handled via complementary
 * cut operations.
 *
 * @param first - First operand.
 * @param second - Second operand.
 * @returns The intersection shape, or `null` if the shapes do not overlap.
 *
 * @example
 * ```ts
 * const overlap = intersect2D(circle, rectangle);
 * ```
 *
 * @see {@link intersect2D} for the functional API.
 */
export function intersect2D(
  first: Shape2D,
  second: Shape2D
): Blueprint | Blueprints | CompoundBlueprint | null {
  if (first === null || second === null) {
    return null;
  }

  if (first instanceof Blueprint && second instanceof Blueprint) {
    return intersectBlueprints(first, second);
  }

  if (first instanceof Blueprints) {
    return mergeNonIntersecting(first.blueprints.map((bp) => intersect2D(bp, second)));
  }

  if (first instanceof CompoundBlueprint) {
    // blueprints[0] is the outer boundary (wrapper), remaining are holes (cuts)
    const wrapper = safeIndex(first.blueprints, 0, 'intersect2D');
    const cuts = first.blueprints.slice(1);

    // If no holes, just intersect with the wrapper
    if (cuts.length === 0) {
      return intersect2D(wrapper, second);
    }
    // With holes, cut each from the intersection result
    let result = intersect2D(wrapper, second);
    for (const cut of cuts) {
      result = cut2D(result, cut);
    }
    return result;
  }

  if (second instanceof Blueprints) {
    return mergeNonIntersecting(second.blueprints.map((bp) => intersect2D(first, bp)));
  }

  if (second instanceof CompoundBlueprint) {
    // blueprints[0] is the outer boundary (wrapper), remaining are holes (cuts)
    const wrapper = safeIndex(second.blueprints, 0, 'intersect2D');
    const cuts = second.blueprints.slice(1);

    // If no holes, just intersect with the wrapper
    if (cuts.length === 0) {
      return intersect2D(wrapper, first);
    }
    // With holes, cut each from the intersection result
    let result = intersect2D(wrapper, first);
    for (const cut of cuts) {
      result = cut2D(result, cut);
    }
    return result;
  }

  bug('intersect2D', 'Unhandled Shape2D combination');
}
