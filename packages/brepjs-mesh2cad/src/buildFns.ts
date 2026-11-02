import {
  type AnyShape,
  type Compound,
  type Dimension,
  type Result,
  type Shell,
  type Solid,
  clone,
  computationError,
  err,
  getFaces,
  getShells,
  getSolids,
  importSTL,
  isCompound,
  isShell,
  isSolid,
  isValid,
  ok,
  simplify,
} from 'brepjs';

export interface FaceStats {
  /** Triangles handed to the kernel. */
  readonly triangles: number;
  /** Faces in the result after coplanar triangles were unified. */
  readonly faces: number;
  /** False when unifying coplanar faces failed validation and the triangulated shape was kept. */
  readonly unified: boolean;
}

export interface Built {
  readonly shape: Solid | Shell | Compound;
  readonly solid: boolean;
  readonly faces: FaceStats;
  readonly warnings: string[];
}

/**
 * Triangle indices sorted by their lowest vertex id. Vertex ids follow the
 * input's first-appearance order, so this keeps neighbors together, and the
 * kernel's sewing is an order of magnitude slower on scattered faces (46k-face
 * torus: 1.7 s sorted, 17 s shuffled).
 */
function coherentOrder(triangles: Uint32Array): Uint32Array {
  const n = triangles.length / 3;
  const key = new Uint32Array(n);
  for (let t = 0; t < n; t++) {
    key[t] = Math.min(triangles[3 * t] ?? 0, triangles[3 * t + 1] ?? 0, triangles[3 * t + 2] ?? 0);
  }
  return Uint32Array.from({ length: n }, (_, t) => t).sort((a, b) => (key[a] ?? 0) - (key[b] ?? 0));
}

/**
 * Text STL for the engine's triangles. Decimal text, not binary: each number
 * prints as the shortest decimal that parses back to the same double, so the
 * snapped coplanar vertices stay exactly coplanar (float32 would break that).
 */
function decimalSTL(positions: Float64Array, triangles: Uint32Array): string {
  const out: string[] = ['solid mesh2cad'];
  for (const t of coherentOrder(triangles)) {
    out.push('facet normal 0 0 0', 'outer loop');
    for (let k = 0; k < 3; k++) {
      const v = 3 * (triangles[3 * t + k] ?? 0);
      out.push(`vertex ${positions[v]} ${positions[v + 1]} ${positions[v + 2]}`);
    }
    out.push('endloop', 'endfacet');
  }
  out.push('endsolid mesh2cad', '');
  return out.join('\n');
}

function allSolidsValid(shape: AnyShape<Dimension>): boolean {
  if (isSolid(shape)) return isValid(shape);
  if (isCompound(shape)) return getSolids(shape).every((s) => isValid(s));
  return isValid(shape);
}

/** A compound holding exactly one solid and nothing else (how the importer returns a body with a cavity), unwrapped. */
function unwrapSingleSolid(shape: Solid | Shell | Compound): Solid | Shell | Compound {
  if (!isCompound(shape)) return shape;
  const solids = getSolids(shape);
  const [only] = solids;
  if (only === undefined || solids.length !== 1) return shape;
  const looseShells = getShells(shape).length - getShells(only).length;
  if (looseShells !== 0 || getFaces(shape).length !== getFaces(only).length) return shape;
  const copy = clone(only);
  if (!copy.ok) return shape;
  shape[Symbol.dispose]();
  return copy.value;
}

function asResult(shape: AnyShape<Dimension>): Solid | Shell | Compound | null {
  if (isSolid(shape) || isShell(shape) || isCompound(shape))
    return shape as Solid | Shell | Compound;
  return null;
}

/**
 * Sew the engine's triangles into shells and solids with the kernel's mesh
 * importer (faces share edges from the start, so sewing is cheap, and it
 * already splits bodies and carves cavities), then unify each snapped planar
 * region back into a single face.
 */
export async function buildShape(
  positions: Float64Array,
  triangles: Uint32Array
): Promise<Result<Built>> {
  const warnings: string[] = [];
  const triCount = triangles.length / 3;
  if (triCount === 0) {
    return err(computationError('MESH_BUILD_EMPTY', 'the engine produced no triangles'));
  }
  const imported = await importSTL(new Blob([decimalSTL(positions, triangles)]));
  if (!imported.ok) return imported;
  const raw = asResult(imported.value);
  if (raw === null) {
    imported.value[Symbol.dispose]();
    return err(
      computationError('MESH_BUILD_UNEXPECTED', 'the kernel returned an unexpected shape type')
    );
  }

  let shape: Solid | Shell | Compound = raw;
  let unified = false;
  const merged = simplify(raw);
  if (merged.ok && merged.value !== raw && allSolidsValid(merged.value)) {
    const next = asResult(merged.value);
    if (next !== null) {
      raw[Symbol.dispose]();
      shape = next;
      unified = true;
    } else {
      merged.value[Symbol.dispose]();
    }
  } else {
    if (merged.ok && merged.value !== raw) merged.value[Symbol.dispose]();
    warnings.push(
      'coplanar triangles could not be unified into planar faces; the result stays triangulated'
    );
  }

  shape = unwrapSingleSolid(shape);
  const solid = isSolid(shape) && isValid(shape);
  if (isSolid(shape) && !solid)
    warnings.push('the reconstructed solid failed the kernel validity check');
  if (isCompound(shape) && !allSolidsValid(shape)) {
    warnings.push('a reconstructed solid failed the kernel validity check');
  }
  return ok({
    shape,
    solid,
    faces: { triangles: triCount, faces: getFaces(shape).length, unified },
    warnings,
  });
}
