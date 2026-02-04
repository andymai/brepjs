import Flatbush from 'flatbush';

import type { Point2D, BoundingBox2d } from '../lib/index.js';
import type { Face, Wire } from '../../topology/shapes.js';

import type { Plane, PlaneName } from '../../core/planeTypes.js';
import type { Vec3, PointInput } from '../../core/types.js';

import type { ScaleMode } from '../curves.js';
import type Blueprint from './Blueprint.js';
import Blueprints from './Blueprints.js';
import CompoundBlueprint from './CompoundBlueprint.js';

/**
 * Groups blueprints by bounding box overlap using a spatial index.
 * Uses Flatbush for O(n log n) performance instead of O(n²) pairwise comparison.
 */
const groupByBoundingBoxOverlap = (blueprints: Blueprint[]): Blueprint[][] => {
  if (blueprints.length === 0) return [];
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length check above
  if (blueprints.length === 1) return [[blueprints[0]!]];

  // Build spatial index
  const index = new Flatbush(blueprints.length);
  for (const bp of blueprints) {
    const [[xMin, yMin], [xMax, yMax]] = bp.boundingBox.bounds;
    index.add(xMin, yMin, xMax, yMax);
  }
  index.finish();

  // Find overlaps using spatial queries
  const overlaps: number[][] = blueprints.map((blueprint, i) => {
    const [[xMin, yMin], [xMax, yMax]] = blueprint.boundingBox.bounds;
    const candidates = index.search(xMin, yMin, xMax, yMax);
    // Filter to indices > i (to avoid duplicates) and verify overlap
    return candidates.filter(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- index from spatial query within bounds
      (j: number) => j > i && !blueprint.boundingBox.isOut(blueprints[j]!.boundingBox)
    );
  });

  // Union-find to group overlapping blueprints
  const groups: Blueprint[][] = [];
  const groupsInOverlaps: Blueprint[][] = new Array(overlaps.length);

  overlaps.forEach((indices, i) => {
    let myGroup = groupsInOverlaps[i];
    if (!myGroup) {
      myGroup = [];
      groups.push(myGroup);
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- i is valid index from forEach
    myGroup.push(blueprints[i]!);

    if (indices.length) {
      indices.forEach((idx) => {
        groupsInOverlaps[idx] = myGroup;
      });
    }
  });

  return groups;
};

interface ContainedBlueprint {
  blueprint: Blueprint;
  isIn: Blueprint[];
}

const addContainmentInfo = (groupedBlueprints: Blueprint[]): ContainedBlueprint[] => {
  return groupedBlueprints.map((blueprint, index) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const firstCurve = blueprint.curves[0]!;
    const point = firstCurve.value((firstCurve.lastParameter + firstCurve.firstParameter) / 2);

    const isIn = groupedBlueprints.filter((potentialOuterBlueprint, j) => {
      if (index === j) return false;
      return potentialOuterBlueprint.isInside(point);
    });

    return {
      blueprint,
      isIn,
    };
  });
};

const splitMultipleOuterBlueprints = (
  outerBlueprints: ContainedBlueprint[],
  allBlueprints: ContainedBlueprint[]
): ContainedBlueprint[][] => {
  return outerBlueprints.flatMap(({ blueprint: outerBlueprint }) => {
    return cleanEdgeCases(
      allBlueprints.filter(
        ({ blueprint, isIn }) => blueprint === outerBlueprint || isIn.indexOf(outerBlueprint) !== -1
      )
    );
  });
};

const handleNestedBlueprints = (
  nestedBlueprints: ContainedBlueprint[],
  allBlueprints: ContainedBlueprint[]
): ContainedBlueprint[][] => {
  const firstLevelOuterBlueprints = allBlueprints.filter(({ isIn }) => isIn.length <= 1);

  const innerLevelsBlueprints = cleanEdgeCases(
    addContainmentInfo(nestedBlueprints.map(({ blueprint }) => blueprint))
  );
  return [firstLevelOuterBlueprints, ...innerLevelsBlueprints];
};

const cleanEdgeCases = (groupedBlueprints: ContainedBlueprint[]): ContainedBlueprint[][] => {
  if (!groupedBlueprints.length) return [];

  const outerBlueprints = groupedBlueprints.filter(({ isIn }) => !isIn.length);
  const nestedBlueprints = groupedBlueprints.filter(({ isIn }) => isIn.length > 1);

  if (outerBlueprints.length === 1 && nestedBlueprints.length === 0) {
    return [groupedBlueprints];
  } else if (outerBlueprints.length > 1) {
    return splitMultipleOuterBlueprints(outerBlueprints, groupedBlueprints);
  } else {
    return handleNestedBlueprints(nestedBlueprints, groupedBlueprints);
  }
};

/**
 * Groups an array of blueprints such that blueprints that correspond to holes
 * in other blueprints are set in a `CompoundBlueprint`.
 *
 * The current algorithm does not handle cases where blueprints cross each
 * other
 */
export const organiseBlueprints = (blueprints: Blueprint[]): Blueprints => {
  const basicGrouping = groupByBoundingBoxOverlap(blueprints).map(addContainmentInfo);
  return new Blueprints(
    basicGrouping.flatMap(cleanEdgeCases).map((compounds) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (compounds.length === 1) return compounds[0]!.blueprint;

      compounds.sort((a, b) => a.isIn.length - b.isIn.length);
      return new CompoundBlueprint(compounds.map(({ blueprint }) => blueprint));
    })
  );
};

/** Plain data returned by blueprint sketchOnPlane/sketchOnFace (Layer 2).
 *  Layer 3 wraps this in a Sketch class. */
export interface SketchData {
  wire: Wire;
  defaultOrigin?: Vec3;
  defaultDirection?: Vec3;
  baseFace?: Face | null;
}

export interface DrawingInterface {
  clone(): DrawingInterface;
  boundingBox: BoundingBox2d;
  stretch(ratio: number, direction: Point2D, origin: Point2D): DrawingInterface;

  rotate(angle: number, center: Point2D): DrawingInterface;

  translate(xDist: number, yDist: number): DrawingInterface;
  translate(translationVector: Point2D): DrawingInterface;

  /**
   * Returns the mirror image of this drawing made with a single point (in
   * center mode, the default, or a plane, (plane mode, with both direction and
   * origin of the plane).
   */
  mirror(centerOrDirection: Point2D, origin?: Point2D, mode?: 'center' | 'plane'): DrawingInterface;

  /**
   * Returns sketch data for the drawing on a plane.
   */
  sketchOnPlane(
    inputPlane?: PlaneName | Plane,
    origin?: PointInput | number
  ): SketchData | SketchData[] | (SketchData | SketchData[])[];

  /**
   * Returns sketch data for the drawing on a face.
   *
   * The scale mode corresponds to the way the coordinates of the drawing are
   * interpreted match with the face:
   *
   * - `original` uses global coordinates (1mm in the drawing is 1mm on the
   *   face). This is the default, but currently supported only for planar
   *   and circular faces
   * - `bounds` normalises the UV parameters on the face to [0,1] intervals.
   * - `native` uses the default UV parameters of opencascade
   */
  sketchOnFace(
    face: Face,
    scaleMode: ScaleMode
  ): SketchData | SketchData[] | (SketchData | SketchData[])[];

  /**
   * Formats the drawing as an SVG image
   */
  toSVG(margin: number): string;

  /**
   * Returns the SVG viewbox that corresponds to this drawing
   */
  toSVGViewBox(margin?: number): string;

  /**
   * Formats the drawing as a list of SVG paths
   */
  toSVGPaths(): string[] | string[][];
}
