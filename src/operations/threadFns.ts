/**
 * Functional thread operation — builds a helical screw thread.
 *
 * occt-wasm's `BRepOffsetAPI_MakePipeShell` (the `sweep` path) cannot reliably
 * sweep a profile along a helix, so the thread is built the way the OCCT bottle
 * tutorial does it: by lofting (`BRepOffsetAPI_ThruSections`) through a series of
 * tooth cross-sections rotated around the axis. The result is the helical thread
 * *ridge* — fuse it to a core cylinder for an external thread, or cut it from a
 * bore (with `inward: true`) for an internal thread.
 */

import type { Vec3 } from '@/core/types.js';
import type { Dimension, Wire, Shape3D } from '@/core/shapeTypes.js';
import { type Result, err, isOk } from '@/core/result.js';
import { validationError } from '@/core/errors.js';
import { DisposalScope } from '@/core/disposal.js';
import { line, wire } from '@/topology/primitiveFns.js';
import { loft } from './loftFns.js';

/** Configuration for {@link thread}. Units are mm; angles derive from pitch. */
export interface ThreadOptions {
  /** Core radius (external) or nominal hole radius (internal), at the thread root. */
  radius: number;
  /** Axial distance per full turn. */
  pitch: number;
  /** Total thread length along the axis. Turn count = `height / pitch`. */
  height: number;
  /** Radial thread height (crest minus root). Defaults to `0.6 * pitch` (≈ISO 60° V). */
  depth?: number;
  /** Axial half-width of the V tooth. Defaults to `0.42 * pitch`. */
  toothHalfWidth?: number;
  /** Loft sections per turn — higher is smoother but slower. Defaults to `20`. */
  sectionsPerTurn?: number;
  /** Left-handed thread. Defaults to `false` (right-handed). */
  lefthand?: boolean;
  /** Point the tooth toward the axis (for an internal thread to `cut` from a bore). */
  inward?: boolean;
}

/**
 * Build a helical screw-thread ridge by lofting rotated tooth sections.
 *
 * @param options - {@link ThreadOptions}.
 * @returns `Result` with the thread-ridge solid, or an error.
 *
 * @example External thread (Ø12 rod, 2.5 mm pitch):
 * ```ts
 * const ridge = thread({ radius: 6, pitch: 2.5, height: 7.5 });
 * const rod = fuse(cylinder(6.15, 7.5), unwrap(ridge));
 * ```
 * @example Internal thread (tapped Ø6 hole):
 * ```ts
 * const ridge = thread({ radius: 3, pitch: 1, height: 6, inward: true });
 * const nut = cut(boredBlock, unwrap(ridge));
 * ```
 */
export function thread(options: ThreadOptions): Result<Shape3D> {
  const {
    radius,
    pitch,
    height,
    depth = 0.6 * pitch,
    toothHalfWidth = 0.42 * pitch,
    sectionsPerTurn = 20,
    lefthand = false,
    inward = false,
  } = options;

  if (!(radius > 0)) return err(validationError('THREAD_INVALID_RADIUS', 'radius must be > 0'));
  if (!(pitch > 0)) return err(validationError('THREAD_INVALID_PITCH', 'pitch must be > 0'));
  if (!(height > 0)) return err(validationError('THREAD_INVALID_HEIGHT', 'height must be > 0'));
  if (!(depth > 0)) return err(validationError('THREAD_INVALID_DEPTH', 'depth must be > 0'));
  if (sectionsPerTurn < 3) {
    return err(validationError('THREAD_TOO_FEW_SECTIONS', 'sectionsPerTurn must be >= 3'));
  }

  const turns = height / pitch;
  const nSec = Math.max(2, Math.round(turns * sectionsPerTurn));
  const sign = lefthand ? -1 : 1;
  const apexU = inward ? -depth : depth; // tooth tip: outward (external) or inward (internal)
  const baseU = inward ? 0.3 : -0.3; // root: slightly into the mating solid for a clean boolean
  const a = toothHalfWidth;

  // The per-section edges and wires are intermediate WASM handles consumed by
  // loft — register them in a scope so they're freed on every exit path (the
  // lofted ridge is a fresh shape and survives). See docs/memory-management.md.
  using scope = new DisposalScope();
  const sections: Wire<Dimension>[] = [];
  for (let i = 0; i <= nSec; i++) {
    const th = (sign * i * 2 * Math.PI) / sectionsPerTurn;
    const z = (pitch * Math.abs(th)) / (2 * Math.PI);
    const cx = radius * Math.cos(th);
    const cy = radius * Math.sin(th);
    const rx = Math.cos(th);
    const ry = Math.sin(th);
    const pt = (u: number, v: number): Vec3 => [cx + u * rx, cy + u * ry, z + v];
    const p1 = pt(baseU, -a);
    const apex = pt(apexU, 0);
    const p3 = pt(baseU, a);

    // Three line edges form a closed triangular tooth by construction; pass the
    // wire straight to loft (no closed-wire geometry proof — it needs the B-rep
    // kernel and isn't required: ThruSections closes geometrically-closed wires).
    const e1 = scope.register(line(p1, apex));
    const e2 = scope.register(line(apex, p3));
    const e3 = scope.register(line(p3, p1));
    const w = wire([e1, e2, e3]);
    if (!isOk(w)) return w;
    sections.push(scope.register(w.value));
  }

  return loft(sections, { ruled: true });
}
