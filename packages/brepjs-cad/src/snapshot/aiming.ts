// Pure section-aiming logic, kept free of the puppeteer import in shoot.ts so the CLI can import it
// on the default (no-render) path without pulling in puppeteer.

type SectionAxis = 'x' | 'y' | 'z';

/** A clipping section: cut perpendicular to `axis` at `frac` (0..1) of that axis's bbox span. */
export interface SectionSpec {
  axis: SectionAxis;
  frac: number;
}

/** A numbered label anchored at a 3D feature, projected per-view into the render (Set-of-Marks). */
export interface Mark {
  label: string;
  pos: readonly [number, number, number];
}

interface MarkBody {
  index: number;
  bounds?:
    | { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number }
    | undefined;
}
interface MarkBore {
  axisOrigin: readonly [number, number, number];
}

/**
 * Kernel-anchored marks for the judge: `B<index>` at each body's bbox centroid (only for multi-body
 * parts — a single body needs no label) and `H1..` at each bore's axis. The same id lands on the same
 * feature across every view (it's a 3D anchor projected per-view), giving the judge view-invariant,
 * part-space addressing without per-body mesh color.
 *
 * Body labels use the body's INDEX (0-based), matching how the measured-facts digest refers to bodies
 * ("bodies 0&1: interfering"), so the judge can cross-reference a mark with the facts. A body that
 * can't be located (no bounds) simply gets no mark — there is no resequenced gap.
 */
export function featureMarks(bodies: readonly MarkBody[], bores: readonly MarkBore[]): Mark[] {
  const marks: Mark[] = [];
  if (bodies.length > 1) {
    for (const b of bodies) {
      if (!b.bounds) continue;
      marks.push({
        label: `B${b.index}`,
        pos: [
          (b.bounds.xMin + b.bounds.xMax) / 2,
          (b.bounds.yMin + b.bounds.yMax) / 2,
          (b.bounds.zMin + b.bounds.zMax) / 2,
        ],
      });
    }
  }
  bores.forEach((bore, i) => {
    marks.push({ label: `H${i + 1}`, pos: bore.axisOrigin });
  });
  return marks;
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
