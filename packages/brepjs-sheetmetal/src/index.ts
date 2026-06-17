export {
  DEFAULT_K_FACTOR,
  STEEL_GAUGES,
  ALUMINUM_GAUGES,
  MATERIALS,
  getMaterial,
} from './materials.js';

export { bendAllowance, developedLength, neutralRadius } from './allowanceFns.js';

export { registerBendTable, getBendTable, resolveBendAllowance } from './bendTableFns.js';
export type { BendTable, BendTableRow } from './bendTableFns.js';

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

export { unfoldForeignSolid, fitCylinder } from './foreignUnfoldFns.js';
export type { FittedCylinder } from './foreignUnfoldFns.js';

export { fold, foldWithWarnings, patternToFlatInput, partToFlatInput } from './foldFns.js';
export type { FoldResult, PatternToFlatInputOptions } from './foldFns.js';

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

export { addBendRelief, autoBendReliefs, cornerRelief } from './reliefFns.js';

export { addCutout, addHole, addSlot, addPolygonCutout } from './cutoutFns.js';

export { addTab, tabAndSlot } from './tabFns.js';
export type { SlotPlacement } from './tabFns.js';

export { addForm, louver, emboss } from './formFns.js';

export { authorContourFlange } from './contourFlangeFns.js';
export { authorLoftedFlange } from './loftedFlangeFns.js';

export { hem } from './hemFns.js';
export { jog } from './jogFns.js';

export { flatPatternToDXF, multiPatternToDXF } from './dxfFns.js';
export type { DxfOptions, PlacedPattern, Transform2 } from './dxfFns.js';

export { patternBbox } from './nestFns.js';
export type {
  NestOptions,
  NestResult,
  NestSheet,
  Placement,
  SheetSpec,
  Bbox,
} from './nestFns.js';

export {
  wireToPolygon,
  flatPatternToPolylines,
  polygonsOverlap,
  polygonsOverlapWithClearance,
  segmentsIntersect,
  pointInPolygon,
  transformPolygon,
  polygonBounds,
  signedArea,
} from './polygonFns.js';
export type {
  Polygon,
  Pt2,
  FlatPatternPolylines,
  FlatPatternBendLine,
} from './polygonFns.js';

export { buildReport, reportFromUnfold, reportToJSON } from './reportFns.js';

export { validatePart } from './validateFns.js';

export {
  author,
  unfold as unfoldPart,
  unfoldSolid,
  fold as foldPart,
  miter,
  miterCorner,
  bendRelief,
  autoReliefs,
  relieveCorner,
  toDXF,
  report,
  reportFrom,
  reportJSON,
  validate,
  allowance,
  developed,
  addBendTable,
  bendTable,
  resolveAllowance,
  contourFlange,
  loftedFlange,
  nest,
  nestToDXF,
} from './api.js';

export {
  sheetMetal,
  fromPart,
  foldFlat,
  fromSolid,
  SheetMetalError,
  SheetMetalBuilder,
  SheetMetalPartHandle,
  ForeignSolidHandle,
} from './facade.js';

export type {
  EdgeRef,
  FlatSide,
  BendRule,
  MaterialSpec,
  MiterSpec,
  BendFeature,
  FlangeFeature,
  CornerMiter,
  ReliefSpec,
  ReliefFeature,
  CutoutSpec,
  CutoutFeature,
  TabSpec,
  TabFeature,
  FormSpec,
  FormFeature,
  ProfileSegment,
  ContourFlangeSpec,
  ContourFlangeFeature,
  LoftedFlangeSpec,
  LoftedFlangeFeature,
  HemSpec,
  HemFeature,
  JogSpec,
  JogFeature,
  SheetMetalPart,
  FlatPattern,
  FlatInput,
  FoldRegion,
  BendReport,
  SheetMetalWarning,
  UnfoldResult,
} from './types.js';
