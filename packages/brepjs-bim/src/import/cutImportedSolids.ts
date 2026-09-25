import {
  clone,
  createSolid,
  cut,
  err,
  getKernel,
  ok,
  validSolid,
  type Result,
  type ValidSolid,
} from 'brepjs';
import { fromBrepError, importError, type BimError } from '../errors/bimError.js';
import { reportedGeometryCleanup } from '../geometryCleanupDiagnostics.js';
import {
  cleanupOwnedResources,
  cleanupReport,
  type OwnedBodyResource,
} from '../productBodyCleanup.js';

/** Borrow World-placed inputs; own every disconnected result independently of the cut's cache. */
export function cutImportedSolids(
  host: ValidSolid,
  opening: ValidSolid
): Result<readonly ValidSolid[], BimError> {
  const context = { operation: 'cutImportedSolids' };
  const temporaries: OwnedBodyResource[] = [];
  const outputs: ValidSolid[] = [];
  const build = (): Result<readonly ValidSolid[], BimError> => {
    const cutResult = cut(host, opening);
    if (!cutResult.ok)
      return err(fromBrepError(cutResult.error, 'VOID_CUT_FAILED', 'Opening cut failed'));
    temporaries.push({ resource: cutResult.value, itemIndex: 0 });
    // Own all extracted native children before copying any survivor. Cached
    // getSolids() extraction can strand earlier children if a later cast fails.
    // The kernel's typed iterator supplies solids; createSolid adds ownership
    // without another native downcast. Retained outputs still need a real copy.
    const children = getKernel().iterShapes(cutResult.value.wrapped, 'solid').map(createSolid);
    temporaries.push(...children.map((resource, itemIndex) => ({ resource, itemIndex })));
    for (const solid of children) {
      const copied = clone(solid);
      if (!copied.ok)
        return err(
          fromBrepError(copied.error, 'VOID_COPY_FAILED', 'Could not retain opening result')
        );
      const candidate = copied.value;
      // Register before validation, including the candidate that fails.
      temporaries.push({ resource: candidate, itemIndex: temporaries.length });
      const validated = validSolid(candidate);
      if (!validated.ok)
        return err(
          importError('VOID_INVALID_SOLID', 'Opening result is not valid', validated.error)
        );
      outputs.push(validated.value);
    }
    return ok(outputs);
  };
  let result: Result<readonly ValidSolid[], BimError>;
  try {
    result = build();
  } catch (cause) {
    result = err(importError('VOID_CUT_FAILED', 'Opening cut failed', cause));
  }

  const survivors = new Set<Disposable>(result.ok ? outputs : []);
  const cleanup = cleanupOwnedResources(
    temporaries.filter(({ resource }) => !survivors.has(resource)).reverse(),
    context
  );
  const diagnostics = [
    ...(result.ok ? [] : reportedGeometryCleanup(result.error, context.operation)),
    ...(cleanup.kind === 'FAILED' ? cleanup.diagnostics : []),
  ];
  if (result.ok && diagnostics.length === 0) return result;
  // Failed temporary cleanup cancels handoff. Never retry any uncertain temporary.
  if (result.ok) {
    const outputCleanup = cleanupOwnedResources(
      outputs.map((resource, itemIndex) => ({ resource, itemIndex })),
      context
    );
    if (outputCleanup.kind === 'FAILED') diagnostics.push(...outputCleanup.diagnostics);
  }
  const failure = result.ok
    ? importError('VOID_CLEANUP_FAILED', 'Opening result cleanup failed')
    : result.error;
  return err({
    ...failure,
    metadata: { ...failure.metadata, cleanup: cleanupReport(diagnostics) },
  });
}
