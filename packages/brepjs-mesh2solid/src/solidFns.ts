import {
  type AnyShape,
  type Dimension,
  type Face,
  type Shell,
  type Solid,
  castShape,
  clone,
  cut,
  facesOfEdge,
  flipFaceOrientation,
  getEdges,
  getFaces,
  getKernel,
  getSolids,
  isShell,
  isSolid,
  measureVolume,
  sewShells,
  solidFromShell,
} from 'brepjs';

/** A raw kernel shape handle (brepjs doesn't export the type from its root). */
type KernelShape = ReturnType<ReturnType<typeof getKernel>['sew']>;

/** Anything built along the way and released when the rebuild is done. */
export type Owned = { [Symbol.dispose](): void };

export type Built = { ok: true; value: Solid } | { ok: false; reason: string };

export function volumeOf(s: Solid): number {
  const v = measureVolume(s);
  return v.ok ? v.value : Number.NaN;
}

/**
 * A fresh kernel result as a typed shape. On an arena kernel the downcast
 * takes a new slot; the generic one is released.
 */
function ownedCast(raw: KernelShape): AnyShape {
  const shape = castShape(raw);
  const id = (s: unknown): unknown => (s as { id?: unknown }).id;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- raw kernel handles are untyped (any) outside brepjs
  if (id(raw) !== undefined && id(raw) !== id(shape.wrapped)) getKernel().dispose(raw);
  return shape;
}

/** Faces sewn within `tolerance` (the kernel's own when omitted). */
function sew(faces: Face[], tolerance: number | undefined): Shell | string {
  if (tolerance === undefined) {
    const sewn = sewShells(faces, true);
    return sewn.ok ? sewn.value : sewn.error.message;
  }
  const shape = ownedCast(
    getKernel().sew(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- raw kernel handles are untyped (any) outside brepjs
      faces.map((f) => f.wrapped),
      tolerance
    )
  );
  if (isShell(shape)) return shape;
  shape[Symbol.dispose]();
  return 'the faces do not form one shell';
}

/** Sew faces into one closed shell and make it a solid. */
function closeShell(faces: Face[], owned: Owned[], tolerance: number | undefined): Built {
  const sewn = sew(faces, tolerance);
  if (typeof sewn === 'string') return { ok: false, reason: `faces could not be sewn: ${sewn}` };
  owned.push(sewn);
  if (!isShell(sewn)) return { ok: false, reason: 'the faces do not form one shell' };
  const solid = solidFromShell(sewn);
  if (!solid.ok) {
    const open = getEdges(sewn).filter((e) => facesOfEdge(sewn, e).length < 2).length;
    const detail = open > 0 ? `${open} edges border one face` : solid.error.message;
    return { ok: false, reason: `the faces do not close: ${detail}` };
  }
  owned.push(solid.value);
  return { ok: true, value: solid.value };
}

/** One body's faces as an outward-facing solid. */
export function outwardSolid(faces: Face[], owned: Owned[], tolerance?: number): Built {
  let solid = closeShell(faces, owned, tolerance);
  if (!solid.ok) return solid;
  // Sewing orients the shell after whichever face came first; turn it outward.
  if (volumeOf(solid.value) < 0) {
    const flipped = faces.map((f) => flipFaceOrientation(f));
    owned.push(...flipped);
    solid = closeShell(flipped, owned, tolerance);
    if (!solid.ok) return solid;
  }
  if (!(volumeOf(solid.value) > 0))
    return { ok: false, reason: 'rebuilt solid has no positive volume' };
  return solid;
}

/** The single solid of a boolean result, which the kernel may wrap in a compound. */
function onlySolid(shape: AnyShape<Dimension>, owned: Owned[]): Solid | null {
  if (isSolid(shape)) return shape;
  const solids = getSolids(shape);
  const [one] = solids;
  if (one === undefined || solids.length !== 1 || getFaces(one).length !== getFaces(shape).length)
    return null;
  // Sub-shapes are borrowed from the parent's topology cache; own a copy.
  const copy = clone(one);
  if (!copy.ok) return null;
  owned.push(copy.value);
  return copy.value;
}

/** Cut each cavity body from the body around it, in place. */
export function cutCavities(
  solids: Map<number, Solid>,
  bodyParent: Int32Array,
  owned: Owned[]
): { ok: true } | { ok: false; reason: string } {
  for (const [body, s] of solids) {
    const p = bodyParent[body] ?? -1;
    if (p < 0) continue;
    const outer = solids.get(p);
    if (outer === undefined)
      return { ok: false, reason: `cavity body ${body} has no rebuilt outer body` };
    const hollowed = cut(outer, s);
    if (!hollowed.ok)
      return { ok: false, reason: `cavity could not be cut: ${hollowed.error.message}` };
    owned.push(hollowed.value);
    const only = onlySolid(hollowed.value, owned);
    if (only === null) return { ok: false, reason: 'cutting a cavity did not leave one solid' };
    solids.set(p, only);
  }
  return { ok: true };
}
