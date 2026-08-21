/**
 * brepjs-families — declarative family layer over the brepjs CSG IR.
 *
 * Element trees are identity-preserving (key paths, attributes,
 * relationships); projection onto the content-addressed IR is where
 * deduplication happens for free. Domain-neutral: no BIM imports here.
 */

export {
  family,
  el,
  IDENTITY_PROPS,
  type Element,
  type FamilyComponent,
  type FamilyOptions,
  type IdentityProps,
} from './element.js';
export { jsx, jsxs, jsxDEV, Fragment } from './jsxRuntime.js';
export {
  resolve,
  tTranslate,
  tRotate,
  type TransformOp,
  type Relationship,
  type ResolvedElement,
} from './resolve.js';
export {
  evaluateModel,
  type EvaluatedModel,
  type EvaluatedNode,
  type EvaluateModelOptions,
} from './evaluateModel.js';
