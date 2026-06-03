export {
  DEFAULT_K_FACTOR,
  STEEL_GAUGES,
  ALUMINUM_GAUGES,
  MATERIALS,
  getMaterial,
} from './materials.js';

export { bendAllowance, developedLength, neutralRadius } from './allowanceFns.js';

export {
  ROOT_FLAT_ID,
  buildFeatureGraph,
  buildFeatureTree,
  featureTree,
} from './featureTreeFns.js';
export type {
  FlatNode,
  BendEdge,
  FeatureGraph,
  TreeBend,
  SeamCut,
  FeatureTree,
} from './featureTreeFns.js';

export { unfold } from './unfoldFns.js';

export { authorPart, baseEdgeRef } from './authorFns.js';
export type {
  AuthorSpec,
  BaseFlatSpec,
  FlangeSpec,
  FlangeSide,
  SeamSpec,
} from './authorFns.js';

export { miterCut, autoMiterCorner } from './miterFns.js';
export type { MiterPlane } from './miterFns.js';

export { flatPatternToDXF } from './dxfFns.js';
export type { DxfOptions } from './dxfFns.js';

export { buildReport, reportFromUnfold, reportToJSON } from './reportFns.js';

export { validatePart } from './validateFns.js';

export {
  author,
  unfold as unfoldPart,
  miter,
  miterCorner,
  toDXF,
  report,
  reportFrom,
  reportJSON,
  validate,
  allowance,
  developed,
} from './api.js';

export { sheetMetal, fromPart, SheetMetalError, SheetMetalBuilder, SheetMetalPartHandle } from './facade.js';

export type {
  EdgeRef,
  FlatSide,
  BendRule,
  MaterialSpec,
  MiterSpec,
  BendFeature,
  FlangeFeature,
  CornerMiter,
  SheetMetalPart,
  FlatPattern,
  BendReport,
  SheetMetalWarning,
  UnfoldResult,
} from './types.js';
