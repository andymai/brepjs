// Keys must match the strings returned by `getSurfaceType()` / `getCurveType()` exactly.

const SURFACE_LABELS: Record<string, string> = {
  PLANE: 'Flat face',
  CYLINDRE: 'Cylindrical face',
  CONE: 'Conical face',
  SPHERE: 'Spherical face',
  TORUS: 'Toroidal face',
  BEZIER_SURFACE: 'Freeform face',
  BSPLINE_SURFACE: 'Freeform face',
  REVOLUTION_SURFACE: 'Revolved face',
  EXTRUSION_SURFACE: 'Extruded face',
  OFFSET_SURFACE: 'Offset face',
  OTHER_SURFACE: 'Face',
};

const CURVE_LABELS: Record<string, string> = {
  LINE: 'Straight edge',
  CIRCLE: 'Circular arc',
  ELLIPSE: 'Elliptical arc',
  HYPERBOLA: 'Hyperbolic edge',
  PARABOLA: 'Parabolic edge',
  BEZIER_CURVE: 'Freeform edge',
  BSPLINE_CURVE: 'Freeform edge',
  OFFSET_CURVE: 'Offset edge',
  OTHER_CURVE: 'Edge',
};

const AXIS_THRESHOLD = 0.99;

type Vec3 = readonly [number, number, number];

const AXIS_DIRECTIONS: ReadonlyArray<{ axis: Vec3; label: string }> = [
  { axis: [1, 0, 0], label: '+X (right)' },
  { axis: [-1, 0, 0], label: '−X (left)' },
  { axis: [0, 1, 0], label: '+Y (front)' },
  { axis: [0, -1, 0], label: '−Y (back)' },
  { axis: [0, 0, 1], label: '+Z (top)' },
  { axis: [0, 0, -1], label: '−Z (bottom)' },
];

export function formatSurfaceType(surfaceType: string): string {
  return SURFACE_LABELS[surfaceType] ?? 'Face';
}

export function formatCurveType(curveType: string): string {
  return CURVE_LABELS[curveType] ?? 'Edge';
}

export function formatNormalDirection(normal: Vec3): string {
  for (const { axis, label } of AXIS_DIRECTIONS) {
    const dot = normal[0] * axis[0] + normal[1] * axis[1] + normal[2] * axis[2];
    if (dot > AXIS_THRESHOLD) return label;
  }
  return `[${normal.map((n) => n.toFixed(2)).join(', ')}]`;
}

function formatNumber(n: number): string {
  if (n >= 100) return Math.round(n).toLocaleString('en-US');
  return n.toFixed(2).replace(/\.?0+$/, '');
}

export function formatArea(area: number): string {
  return `${formatNumber(area)} mm²`;
}

export function formatLength(length: number): string {
  return `${formatNumber(length)} mm`;
}
