export { runPart, type RunPartOptions, type RunPartResult } from './verify/runPart.js';
export { runChecks } from './verify/checks.js';
export { runMeasure, type MeasureReport } from './verify/measure.js';
export { runDiff } from './verify/diff.js';
export {
  serializeReport,
  emptyReport,
  type VerifyReport,
  type VerifyCheck,
  type VerifyMeasurements,
  type VerifyAssertion,
  type DiffReport,
  type BoundsDelta,
} from './verify/report.js';
export { typecheckPart, TYPECHECK_CODE, type TypecheckResult } from './verify/typecheck.js';
export {
  evaluateExpected,
  isExpectedDims,
  pctDelta,
  DEFAULT_TOLERANCE_PCT,
  type ExpectedDims,
  type ExpectedBounds,
} from './verify/expected.js';
