// Pure section-aiming logic, kept free of the puppeteer import in shoot.ts so the CLI can import it
// on the default (no-render) path without pulling in puppeteer.

type SectionAxis = 'x' | 'y' | 'z';

/** A clipping section: cut perpendicular to `axis` at `frac` (0..1) of that axis's bbox span. */
export interface SectionSpec {
  axis: SectionAxis;
  frac: number;
}

interface AimBore {
  radius: number;
  axisOrigin: readonly [number, number, number];
  axisDir: readonly [number, number, number];
}
interface AimBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}

/**
 * Aim a section cut through the dominant (largest-radius) bore: cut on the basis axis MOST
 * perpendicular to the bore axis, positioned to pass THROUGH the bore origin — so the bore opens as
 * a clean cross-section (reads wall thickness, where the xray is cluttered). Returns null when there
 * are no bores or no bounds. Plain structural inputs keep this decoupled from the verify report.
 */
export function aimedSection(
  bores: readonly AimBore[],
  bounds: AimBounds | undefined
): SectionSpec | null {
  if (bores.length === 0 || !bounds) return null;
  const bore = bores.reduce((a, b) => (b.radius > a.radius ? b : a));
  const d = bore.axisDir;
  const perp = { x: Math.abs(d[0]), y: Math.abs(d[1]), z: Math.abs(d[2]) };
  const axis = (['x', 'y', 'z'] as const).reduce((a, b) => (perp[b] < perp[a] ? b : a));
  const i = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const min = axis === 'x' ? bounds.xMin : axis === 'y' ? bounds.yMin : bounds.zMin;
  const max = axis === 'x' ? bounds.xMax : axis === 'y' ? bounds.yMax : bounds.zMax;
  const span = max - min || 1;
  const frac = Math.min(1, Math.max(0, (bore.axisOrigin[i] - min) / span));
  return { axis, frac };
}
