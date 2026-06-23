import type { KernelShape, KernelType } from '@/kernel/types.js';
import type { AnyShape, CompSolid, Dimension } from '@/core/shapeTypes.js';
import { castShape } from '@/core/shapeTypes.js';
import { getKernel } from '@/kernel/index.js';
import { typeCastError } from '@/core/errors.js';
import { type Result, ok, err } from '@/core/result.js';

/** String literal identifying a topological entity type for TopExp_Explorer iteration. */
export type TopoEntity =
  | 'vertex'
  | 'edge'
  | 'wire'
  | 'face'
  | 'shell'
  | 'solid'
  | 'solidCompound'
  | 'compound'
  | 'shape';

/** An kernel shape after downcast — same underlying type, used for clarity. */
export type GenericTopo = KernelShape;

// TopAbs_ShapeEnum integer constants
const TOPO_ENUM: Record<TopoEntity, number> = {
  compound: 0,
  solidCompound: 1,
  solid: 2,
  shell: 3,
  face: 4,
  wire: 5,
  edge: 6,
  vertex: 7,
  shape: 8,
};

/** Convert a TopoEntity string to its kernel TopAbs_ShapeEnum value. */
export const asTopo = (entity: TopoEntity): KernelType => {
  return TOPO_ENUM[entity];
};

/**
 * Iterate over all sub-shapes of a given type within a shape.
 *
 * @remarks Uses the kernel adapter's iterShapes rather than direct TopExp_Explorer.
 */
// Static map: TopoEntity → ShapeType for kernel adapter
const TOPO_TO_SHAPE_TYPE: Readonly<Record<string, string>> = {
  vertex: 'vertex',
  edge: 'edge',
  wire: 'wire',
  face: 'face',
  shell: 'shell',
  solid: 'solid',
  solidCompound: 'compsolid',
  compound: 'compound',
  shape: 'compound', // fallback; 'shape' isn't used in iterShapes
};

export const iterTopo = function* iterTopo(
  shape: KernelShape,
  topo: TopoEntity
): IterableIterator<KernelShape> {
  const shapeType = TOPO_TO_SHAPE_TYPE[topo];
  if (shapeType) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ShapeType string mapping
    const shapes = getKernel().iterShapes(shape, shapeType as any);
    for (const s of shapes) yield s;
  }
};

/** Get the TopAbs_ShapeEnum type of an kernel shape, returning Err for null shapes. */
export const shapeType = (shape: KernelShape): Result<KernelType> => {
  if (getKernel().isNull(shape))
    return err(typeCastError('NULL_SHAPE', 'This shape has no type, it is null'));
  return ok(shape.ShapeType());
};

/**
 * Downcast a generic KernelShape to its concrete kernel type (e.g., kernel topology_Face).
 *
 * @remarks Uses the kernel adapter's downcast method.
 * @returns Ok with the downcasted shape, or Err if the shape type is unknown.
 */
export function downcast(shape: KernelShape): Result<GenericTopo> {
  if (getKernel().isNull(shape)) {
    return err(typeCastError('NULL_SHAPE', 'This shape has no type, it is null'));
  }
  try {
    return ok(getKernel().downcast(shape));
  } catch (e) {
    return err(typeCastError('NO_WRAPPER', 'Could not find a wrapper for this shape type', e));
  }
}

/**
 * Cast a raw kernel shape to its corresponding branded brepjs type (Vertex, Edge, Face, etc.).
 *
 * Performs downcast + branded handle creation in one step.
 *
 * @returns Ok with a typed AnyShape, or Err if the shape type is unknown.
 */
export function cast(shape: KernelShape): Result<AnyShape<Dimension>> {
  if (getKernel().isNull(shape)) {
    return err(typeCastError('NULL_SHAPE', 'Cannot cast a null shape'));
  }
  return ok(castShape(shape));
}

/** Type guard: return true if the shape is a CompSolid. */
export function isCompSolid(shape: AnyShape<Dimension>): shape is CompSolid {
  return getKernel().shapeType(shape.wrapped) === 'compsolid';
}

/**
 * Deserialize a shape from a BREP string representation.
 *
 * @param data - BREP string produced by toBREP().
 * @returns Ok with the deserialized shape, or Err if parsing fails.
 */
export function fromBREP(data: string): Result<AnyShape<Dimension>> {
  return cast(getKernel().fromBREP(data));
}
