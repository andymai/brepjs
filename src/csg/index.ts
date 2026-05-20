/* v8 ignore file */
/**
 * CSG IR — Constructive Solid Geometry as an Intermediate Representation.
 *
 * Build a content-addressed DAG of primitives, booleans, and transforms;
 * parameterize via named expression bindings; evaluate against the active
 * kernel with subtree-level cache reuse for incremental parametric edits.
 */

// Builders (the public surface for constructing trees)
export {
  box,
  sphere,
  cylinder,
  cone,
  torus,
  polygon,
  circle,
  line,
  vertex,
  emptySolid,
  emptyFace,
  emptyWire,
  fuse,
  cut,
  intersect,
  fuseAll,
  cutAll,
  translate,
  rotate,
  scale,
  mirror,
  compound,
  type RotateOptions,
  type ScaleOptions,
  type MirrorOptions,
} from './builders.js';

// Expressions
export {
  numLit,
  vec3Lit,
  vec2Lit,
  param,
  binOp,
  unaryOp,
  component,
  buildVec,
  add,
  mul,
  asScalarExpr,
  asVec3Expr,
  asVec2Expr,
  type Expr,
  type ExprValue,
  type Env,
  type ScalarInput,
  type Vec3Input,
  type Vec2Input,
  type BinaryOp,
  type UnaryOp,
} from './expressions.js';

// Types
export type {
  IRNode,
  NodeKind,
  OutputKind,
  PrimitiveNode,
  BooleanNode,
  TransformIRNode,
  SolidNode,
  FaceNode,
  EdgeNode,
  VertexNode,
  AnyNode,
} from './types.js';
export { outputKindOf } from './types.js';

// Evaluator
export {
  Evaluator,
  withEvaluator,
  type EvaluatorOptions,
  type StepInfo,
  type CacheStats,
} from './evaluate.js';

// Serialization
export { toJSON, fromJSON, CSG_VERSION, type CsgEnvelope } from './serialize.js';

// Optimization
export { optimize, foldExpr } from './optimize.js';

// Editing
export { replaceNode, forEachNode, nodeCount, type NodePredicate } from './edit.js';
