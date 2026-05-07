import type { FaceInfo, EdgeInfo } from '../workers/workerProtocol';

const TOL = 0.01;

function bracket(value: number, tol: number = TOL): string {
  // Clamp `min` at 0 — negative tolerances on tiny features (`area = 0.005`)
  // would otherwise produce `withArea({min: -0.005, max: …})`, semantically
  // nonsense as a finder predicate.
  const min = Math.max(0, value - tol);
  return `{ min: ${min.toFixed(2)}, max: ${(value + tol).toFixed(2)} }`;
}

// Cap absolute area window so 1% of a 10 000 mm² face doesn't yield a
// 200 mm² band that matches every similar-sized face on the body.
const MAX_ABSOLUTE_TOL = 5;
function relTol(value: number): number {
  return Math.min(MAX_ABSOLUTE_TOL, Math.max(0.01, value * 0.01));
}

const AXIS_THRESHOLD = 0.99;

function axisDirection(normal: readonly [number, number, number]): string | null {
  const [x, y, z] = normal;
  if (x > AXIS_THRESHOLD) return "'X'";
  if (x < -AXIS_THRESHOLD) return '[-1, 0, 0]';
  if (y > AXIS_THRESHOLD) return "'Y'";
  if (y < -AXIS_THRESHOLD) return '[0, -1, 0]';
  if (z > AXIS_THRESHOLD) return "'Z'";
  if (z < -AXIS_THRESHOLD) return '[0, 0, -1]';
  return null;
}

/** Build the tightest finder predicate that uniquely identifies this face. */
export function buildFaceFinderSnippet(info: FaceInfo): string {
  const lines: string[] = ['faceFinder()'];
  lines.push(`  .ofSurfaceType('${info.surfaceType}')`);
  const dir = axisDirection(info.normal);
  if (dir) {
    lines.push(`  .inDirection(${dir})`);
  }
  if (Number.isFinite(info.area) && info.area > 0) {
    lines.push(`  .withArea(${bracket(info.area, relTol(info.area))})`);
  }
  return lines.join('\n');
}

/** Build the tightest finder predicate that uniquely identifies this edge. */
export function buildEdgeFinderSnippet(info: EdgeInfo): string {
  const lines: string[] = ['edgeFinder()'];
  lines.push(`  .ofCurveType('${info.curveType}')`);
  if (Number.isFinite(info.length) && info.length > 0) {
    lines.push(`  .withLength(${bracket(info.length, relTol(info.length))})`);
  }
  return lines.join('\n');
}
