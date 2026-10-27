import type { BimNs } from './bim.js';
import { errorMessage, type ScalarRecord } from './records.js';

/** Quantity sets per element id, as an IFC export of the build would write them. */
export type QuantitiesById = Readonly<Record<string, Readonly<Record<string, ScalarRecord>>>>;

export type QuantitiesOutcome =
  | { readonly ok: true; readonly quantities: QuantitiesById }
  | { readonly ok: false; readonly error: string };

/**
 * Base quantities for a families build, read back from an in-memory IFC export. brepjs-bim
 * computes them only inside its IFC writers, so this is the one way to get the same numbers an
 * export carries (in its units: metres, square metres, cubic metres).
 */
export async function familiesQuantities(
  bim: BimNs,
  resolved: unknown,
  evaluator: unknown
): Promise<QuantitiesOutcome> {
  const projected = bim.familiesToBim(resolved, {
    project: { name: 'brep-mcp-quantities' },
    proxyEvaluator: evaluator,
  });
  if (!projected.ok) return { ok: false, error: errorMessage(projected.error) };
  const { model, idByKeyPath } = projected.value;
  let bytes: Uint8Array;
  const keyPathOf = new Map<string, string>();
  try {
    for (const [keyPath, id] of idByKeyPath) {
      const guid = model.getElement(id)?.guid;
      if (guid !== undefined) keyPathOf.set(guid, keyPath);
    }
    const written = await bim.toIfc(model, {
      applicationName: 'brepjs-cad',
      applicationVersion: '0',
    });
    if (!written.ok) return { ok: false, error: errorMessage(written.error) };
    bytes = written.value;
  } finally {
    model[Symbol.dispose]();
  }
  const read = await bim.fromIfc(bytes, { skipGeometry: true });
  if (!read.ok) return { ok: false, error: errorMessage(read.error) };
  const quantities: Record<string, Record<string, ScalarRecord>> = {};
  try {
    for (const el of read.value.elements) {
      const keyPath = keyPathOf.get(el.guid);
      if (keyPath === undefined) continue;
      const sets = el.psets.filter((p) => p.isQuantity);
      if (sets.length > 0)
        quantities[keyPath] = Object.fromEntries(sets.map((p) => [p.name, p.properties]));
    }
  } finally {
    bim.disposeImportedModel(read.value);
  }
  return { ok: true, quantities };
}
