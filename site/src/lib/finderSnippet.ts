import type { FaceInfo, EdgeInfo } from '../workers/workerProtocol';

const TOL = 0.01;

function bracket(value: number, tol: number = TOL): string {
  return `{ min: ${(value - tol).toFixed(2)}, max: ${(value + tol).toFixed(2)} }`;
}

function axisDirection(normal: readonly [number, number, number]): string | null {
  const [x, y, z] = normal;
  const t = 0.99;
  if (x > t) return "'X'";
  if (x < -t) return '[-1, 0, 0]';
  if (y > t) return "'Y'";
  if (y < -t) return '[0, -1, 0]';
  if (z > t) return "'Z'";
  if (z < -t) return '[0, 0, -1]';
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
    lines.push(`  .withArea(${bracket(info.area, Math.max(0.01, info.area * 0.01))})`);
  }
  return lines.join('\n');
}

/** Build the tightest finder predicate that uniquely identifies this edge. */
export function buildEdgeFinderSnippet(info: EdgeInfo): string {
  const lines: string[] = ['edgeFinder()'];
  lines.push(`  .ofCurveType('${info.curveType}')`);
  if (Number.isFinite(info.length) && info.length > 0) {
    lines.push(`  .withLength(${bracket(info.length, Math.max(0.01, info.length * 0.01))})`);
  }
  return lines.join('\n');
}
