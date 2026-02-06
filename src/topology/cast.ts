import type { OcShape, OcType } from '../kernel/types.js';
import type { AnyShape, CompSolid, Shape3D, Wire } from './shapes.js';
import type * as ShapesModule from './shapes.js';
import { getKernel } from '../kernel/index.js';
import { bug, typeCastError } from '../core/errors.js';
import { type Result, ok, err, andThen } from '../core/result.js';

// Lazy imports to break circular dependency between cast.ts and shapes.ts.
// The Shape classes reference cast/downcast, and cast/downcast reference Shape classes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lazy-loaded module
let _shapesModule: any = null;

// Synchronous accessor — assumes shapes module has been loaded already.
// This is safe because the module is loaded eagerly at first use.
function getShapesModuleSync(): typeof ShapesModule {
  if (!_shapesModule) {
    bug(
      'cast',
      'Shapes module not yet loaded. Ensure initCast() has been called or import shapes.js first.'
    );
  }
  return _shapesModule;
}

/**
 * Initialise the lazy shapes module reference. Call this once at startup
 * (the barrel index.ts does it automatically).
 */
export function initCast(shapesModule: typeof ShapesModule): void {
  _shapesModule = shapesModule;
}

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

/** An OCCT shape after downcast — same underlying type, used for clarity. */
export type GenericTopo = OcShape;

// Lazily cached map: TopoEntity string → TopAbs enum value
// Avoids creating a new object on every asTopo() call
let _topoMap: Map<TopoEntity, OcType> | null = null;

/** Convert a TopoEntity string to its OCCT TopAbs_ShapeEnum value. */
export const asTopo = (entity: TopoEntity): OcType => {
  if (!_topoMap) {
    const oc = getKernel().oc;
    const ta = oc.TopAbs_ShapeEnum;
    _topoMap = new Map<TopoEntity, OcType>([
      ['vertex', ta.TopAbs_VERTEX],
      ['edge', ta.TopAbs_EDGE],
      ['wire', ta.TopAbs_WIRE],
      ['face', ta.TopAbs_FACE],
      ['shell', ta.TopAbs_SHELL],
      ['solid', ta.TopAbs_SOLID],
      ['solidCompound', ta.TopAbs_COMPSOLID],
      ['compound', ta.TopAbs_COMPOUND],
      ['shape', ta.TopAbs_SHAPE],
    ]);
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- all TopoEntity values are in map
  return _topoMap.get(entity)!;
};

/**
 * Iterate over all sub-shapes of a given type within a shape.
 *
 * @remarks Uses the kernel adapter's iterShapes rather than direct TopExp_Explorer.
 */
export const iterTopo = function* iterTopo(
  shape: OcShape,
  topo: TopoEntity
): IterableIterator<OcShape> {
  // Map TopoEntity to ShapeType for kernel adapter
  const topoToShapeType: Record<string, string> = {
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
  const shapeType = topoToShapeType[topo];
  if (shapeType) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ShapeType string mapping
    const shapes = getKernel().iterShapes(shape, shapeType as any);
    for (const s of shapes) yield s;
  }
};

/** Get the TopAbs_ShapeEnum type of an OCCT shape, returning Err for null shapes. */
export const shapeType = (shape: OcShape): Result<OcType> => {
  if (shape.IsNull()) return err(typeCastError('NULL_SHAPE', 'This shape has no type, it is null'));
  return ok(shape.ShapeType());
};

// Lazily cached map: TopAbs enum → TopoDS downcast function
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT enum keys are opaque
let _downcastMap: Map<any, any> | null = null;

function getDowncastMap() {
  if (!_downcastMap) {
    const oc = getKernel().oc;
    const ta = oc.TopAbs_ShapeEnum;
    _downcastMap = new Map([
      [ta.TopAbs_VERTEX, oc.TopoDS.Vertex_1],
      [ta.TopAbs_EDGE, oc.TopoDS.Edge_1],
      [ta.TopAbs_WIRE, oc.TopoDS.Wire_1],
      [ta.TopAbs_FACE, oc.TopoDS.Face_1],
      [ta.TopAbs_SHELL, oc.TopoDS.Shell_1],
      [ta.TopAbs_SOLID, oc.TopoDS.Solid_1],
      [ta.TopAbs_COMPSOLID, oc.TopoDS.CompSolid_1],
      [ta.TopAbs_COMPOUND, oc.TopoDS.Compound_1],
    ]);
  }
  return _downcastMap;
}

/**
 * Downcast a generic TopoDS_Shape to its concrete OCCT type (e.g., TopoDS_Face).
 *
 * @remarks WASM requires explicit downcasting via `oc.TopoDS.Face_1()` etc.
 * @returns Ok with the downcasted shape, or Err if the shape type is unknown.
 */
export function downcast(shape: OcShape): Result<GenericTopo> {
  return andThen(shapeType(shape), (myType) => {
    const caster = getDowncastMap().get(myType);
    if (!caster)
      return err(typeCastError('NO_WRAPPER', 'Could not find a wrapper for this shape type'));
    return ok(caster(shape));
  });
}

// Lazily cached map: TopAbs enum → Shape class constructor
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT enum keys are opaque
let _castMap: Map<any, any> | null = null;

function getCastMap() {
  if (!_castMap) {
    const oc = getKernel().oc;
    const ta = oc.TopAbs_ShapeEnum;
    const mod = getShapesModuleSync();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mapping enum to class constructors
    _castMap = new Map<any, any>([
      [ta.TopAbs_VERTEX, mod.Vertex],
      [ta.TopAbs_EDGE, mod.Edge],
      [ta.TopAbs_WIRE, mod.Wire],
      [ta.TopAbs_FACE, mod.Face],
      [ta.TopAbs_SHELL, mod.Shell],
      [ta.TopAbs_SOLID, mod.Solid],
      [ta.TopAbs_COMPSOLID, mod.CompSolid],
      [ta.TopAbs_COMPOUND, mod.Compound],
    ]);
  }
  return _castMap;
}

/**
 * Cast a raw OCCT shape to its corresponding brepjs wrapper class (Vertex, Edge, Face, etc.).
 *
 * Performs downcast + class instantiation in one step.
 *
 * @returns Ok with a typed AnyShape, or Err if the shape type is unknown.
 */
export function cast(shape: OcShape): Result<AnyShape> {
  return andThen(shapeType(shape), (st) => {
    const Klass = getCastMap().get(st);
    if (!Klass)
      return err(typeCastError('NO_WRAPPER', 'Could not find a wrapper for this shape type'));
    return andThen(downcast(shape), (downcasted) => ok(new Klass(downcasted) as AnyShape));
  });
}

/** Type guard: return true if the shape is a 3D body (Shell, Solid, CompSolid, or Compound). */
export function isShape3D(shape: AnyShape): shape is Shape3D {
  const mod = getShapesModuleSync();
  return (
    shape instanceof mod.Shell ||
    shape instanceof mod.Solid ||
    shape instanceof mod.CompSolid ||
    shape instanceof mod.Compound
  );
}

/** Type guard: return true if the shape is a Wire. */
export function isWire(shape: AnyShape): shape is Wire {
  const mod = getShapesModuleSync();
  return shape instanceof mod.Wire;
}

/** Type guard: return true if the shape is a CompSolid. */
export function isCompSolid(shape: AnyShape): shape is CompSolid {
  const mod = getShapesModuleSync();
  return shape instanceof mod.CompSolid;
}

/**
 * Deserialize a shape from a BREP string representation.
 *
 * @param data - BREP string produced by serializeShape().
 * @returns Ok with the deserialized shape, or Err if parsing fails.
 */
export function deserializeShape(data: string): Result<AnyShape> {
  const oc = getKernel().oc;
  return cast(oc.BRepToolsWrapper.Read(data));
}
