import type { OcShape, OcType } from '../kernel/types.js';
import type { AnyShape, CompSolid, Shape3D, Wire } from './shapes.js';
import type * as ShapesModule from './shapes.js';
import { getKernel } from '../kernel/index.js';
import { HASH_CODE_MAX } from '../core/constants.js';
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

export type GenericTopo = OcShape;

export const asTopo = (entity: TopoEntity): OcType => {
  const oc = getKernel().oc;

  return {
    vertex: oc.TopAbs_ShapeEnum.TopAbs_VERTEX,
    wire: oc.TopAbs_ShapeEnum.TopAbs_WIRE,
    face: oc.TopAbs_ShapeEnum.TopAbs_FACE,
    shell: oc.TopAbs_ShapeEnum.TopAbs_SHELL,
    solid: oc.TopAbs_ShapeEnum.TopAbs_SOLID,
    solidCompound: oc.TopAbs_ShapeEnum.TopAbs_COMPSOLID,
    compound: oc.TopAbs_ShapeEnum.TopAbs_COMPOUND,
    edge: oc.TopAbs_ShapeEnum.TopAbs_EDGE,
    shape: oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  }[entity];
};

export const iterTopo = function* iterTopo(
  shape: OcShape,
  topo: TopoEntity
): IterableIterator<OcShape> {
  const oc = getKernel().oc;
  const explorer = new oc.TopExp_Explorer_2(shape, asTopo(topo), asTopo('shape'));
  const seen = new Map<number, OcShape[]>();
  while (explorer.More()) {
    const item = explorer.Current();
    const hash = item.HashCode(HASH_CODE_MAX);
    const bucket = seen.get(hash);
    if (!bucket) {
      seen.set(hash, [item]);
      yield item;
    } else if (!bucket.some((s) => s.IsSame(item))) {
      bucket.push(item);
      yield item;
    }
    explorer.Next();
  }
  explorer.delete();
};

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

export function cast(shape: OcShape): Result<AnyShape> {
  return andThen(shapeType(shape), (st) => {
    const Klass = getCastMap().get(st);
    if (!Klass)
      return err(typeCastError('NO_WRAPPER', 'Could not find a wrapper for this shape type'));
    return andThen(downcast(shape), (downcasted) => ok(new Klass(downcasted) as AnyShape));
  });
}

export function isShape3D(shape: AnyShape): shape is Shape3D {
  const mod = getShapesModuleSync();
  return (
    shape instanceof mod.Shell ||
    shape instanceof mod.Solid ||
    shape instanceof mod.CompSolid ||
    shape instanceof mod.Compound
  );
}

export function isWire(shape: AnyShape): shape is Wire {
  const mod = getShapesModuleSync();
  return shape instanceof mod.Wire;
}

export function isCompSolid(shape: AnyShape): shape is CompSolid {
  const mod = getShapesModuleSync();
  return shape instanceof mod.CompSolid;
}

export function deserializeShape(data: string): Result<AnyShape> {
  const oc = getKernel().oc;
  return cast(oc.BRepToolsWrapper.Read(data));
}
