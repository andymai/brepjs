/** A 2D point or vector represented as an `[x, y]` tuple. */
export type Point2D = [number, number];

/** Type guard that checks whether a value is a `Point2D`. */
export function isPoint2D(point: unknown): point is Point2D {
  return (
    Array.isArray(point) &&
    point.length === 2 &&
    typeof point[0] === 'number' &&
    typeof point[1] === 'number'
  );
}

/** A 2x2 matrix represented as two row tuples. */
export type Matrix2X2 = [[number, number], [number, number]];

/** Type guard that checks whether a value is a `Matrix2X2`. */
export function isMatrix2X2(matrix: unknown): matrix is Matrix2X2 {
  return (
    Array.isArray(matrix) &&
    matrix.length === 2 &&
    matrix.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 2 &&
        typeof row[0] === 'number' &&
        typeof row[1] === 'number'
    )
  );
}
