import { Curve2D } from './Curve2D.js';
import { isPoint2D } from './definitions.js';
import { intersectCurves } from './intersections.js';
import { unwrap, isOk } from '../../core/result.js';
import {
  make2dArcFromCenter,
  make2dCircle,
  make2dSegmentCurve,
  make2dThreePointArc,
} from './makeCurves.js';
import { make2dOffset } from './offset.js';
import { add2d, crossProduct2d, normalize2d, scalarMultiply2d } from './vectorOperations.js';

function removeCorner(firstCurve: Curve2D, secondCurve: Curve2D, radius: number) {
  const sinAngle = crossProduct2d(firstCurve.tangentAt(1), secondCurve.tangentAt(0));

  // This cover the case when the curves are colinear
  if (Math.abs(sinAngle) < 1e-10) return null;

  const orientationCorrection = sinAngle > 0 ? -1 : 1;
  const offset = Math.abs(radius) * orientationCorrection;

  const firstOffset = make2dOffset(firstCurve, offset);
  const secondOffset = make2dOffset(secondCurve, offset);

  if (!(firstOffset instanceof Curve2D) || !(secondOffset instanceof Curve2D)) {
    return null;
  }

  const intersectionResult = intersectCurves(firstOffset, secondOffset, 1e-9);
  if (!isOk(intersectionResult)) {
    return null;
  }

  const potentialCenter = intersectionResult.value.intersections.at(-1);
  if (!isPoint2D(potentialCenter)) {
    return null;
  }
  const center = potentialCenter;

  const splitForFillet = (curve: Curve2D, offsetCurve: Curve2D) => {
    const [x, y] = offsetCurve.tangentAt(center);
    const normal = normalize2d([-y, x]);
    const splitPoint = add2d(center, scalarMultiply2d(normal, offset));
    const splitParam = unwrap(curve.parameter(splitPoint, 1e-6));
    return curve.splitAt([splitParam]);
  };

  const [first] = splitForFillet(firstCurve, firstOffset);
  const [, second] = splitForFillet(secondCurve, secondOffset);

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { first: first!, second: second!, center };
}

export function filletCurves(firstCurve: Curve2D, secondCurve: Curve2D, radius: number) {
  const cornerRemoved = removeCorner(firstCurve, secondCurve, radius);
  if (!cornerRemoved) {
    return [firstCurve, secondCurve];
  }

  const { first, second, center } = cornerRemoved;

  return [first, make2dArcFromCenter(first.lastPoint, second.firstPoint, center), second];
}

export function chamferCurves(firstCurve: Curve2D, secondCurve: Curve2D, radius: number) {
  const cornerRemoved = removeCorner(firstCurve, secondCurve, radius);
  if (!cornerRemoved) {
    return [firstCurve, secondCurve];
  }

  const { first, second } = cornerRemoved;

  return [first, make2dSegmentCurve(first.lastPoint, second.firstPoint), second];
}

export function dogboneFilletCurves(firstCurve: Curve2D, secondCurve: Curve2D, radius: number) {
  const tgt1 = normalize2d(firstCurve.tangentAt(1));
  const tgt2 = normalize2d(secondCurve.tangentAt(0));

  const sinAngle = crossProduct2d(tgt1, tgt2);
  const a = Math.asin(sinAngle);
  // This cover the case when the curves are colinear
  if (Math.abs(sinAngle) < 1e-10) return [firstCurve, secondCurve];
  const orientationCorrection = sinAngle > 0 ? -1 : 1;

  const offset = Math.abs(radius) * Math.sin(a / 2) * orientationCorrection;

  const firstOffset = make2dOffset(firstCurve, offset);
  const secondOffset = make2dOffset(secondCurve, offset);

  if (!(firstOffset instanceof Curve2D) || !(secondOffset instanceof Curve2D)) {
    return [firstCurve, secondCurve];
  }

  const intersectionResult2 = intersectCurves(firstOffset, secondOffset, 1e-9);
  if (!isOk(intersectionResult2)) {
    return [firstCurve, secondCurve];
  }
  const potentialCenter = intersectionResult2.value.intersections.at(-1);
  if (!isPoint2D(potentialCenter)) {
    return [firstCurve, secondCurve];
  }

  const circle = make2dCircle(radius, potentialCenter);
  const firstInt = unwrap(intersectCurves(firstCurve, circle)).intersections[0];
  const secondInt = unwrap(intersectCurves(secondCurve, circle)).intersections.at(-1);

  if (!firstInt || !secondInt) return [firstCurve, secondCurve];

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const firstPart = firstCurve.splitAt([firstInt])[0]!;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const secondPart = secondCurve.splitAt([secondInt]).at(-1)!;

  if (!firstPart || !secondPart) {
    return [firstCurve, secondCurve];
  }

  try {
    return [
      firstPart,
      make2dThreePointArc(firstPart.lastPoint, firstCurve.lastPoint, secondPart.firstPoint),
      secondPart,
    ];
  } catch {
    return [firstCurve, secondCurve];
  }
}
