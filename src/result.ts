/**
 * brepjs/result — Result monad and error types.
 * Focused sub-path for error handling without pulling in vectors, planes, or shapes.
 */

export {
  ok,
  err,
  OK,
  isOk,
  isErr,
  map,
  mapErr,
  andThen,
  flatMap,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  unwrapErr,
  match,
  collect,
  tryCatch,
  tryCatchAsync,
  pipeline,
  type Result,
  type Ok,
  type Err,
  type Unit,
  type ResultPipeline,
} from './core/result.js';

export {
  type BrepError,
  type BrepErrorKind,
  BrepErrorCode,
  occtError,
  validationError,
  typeCastError,
  sketcherStateError,
  moduleInitError,
  computationError,
  ioError,
  queryError,
  bug,
  BrepBugError,
} from './core/errors.js';
