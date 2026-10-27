/**
 * COBie handover sheets for a families build, through brepjs-bim: the same BIM projection
 * export_ifc writes, so sheet rows name the elements the IFC file holds.
 */

import type { BimNs, CobieContactLike, IfcProjectSpec } from './bim.js';
import { errorMessage } from './records.js';

export const COBIE_FORMATS = ['csv', 'json'] as const;
export type CobieFormat = (typeof COBIE_FORMATS)[number];

export interface CobieArgs {
  readonly format: CobieFormat;
  readonly project: IfcProjectSpec;
  readonly contact?: CobieContactLike | undefined;
}

export type CobieOutcome =
  | {
      readonly ok: true;
      /** File name to contents: one CSV per sheet, or one cobie.json. */
      readonly files: Readonly<Record<string, string>>;
      /** Rows per sheet. */
      readonly rows: Readonly<Record<string, number>>;
    }
  | { readonly ok: false; readonly error: string };

export function familiesCobie(
  bim: BimNs,
  resolved: unknown,
  evaluator: unknown,
  args: CobieArgs
): CobieOutcome {
  const projected = bim.familiesToBim(resolved, {
    project: args.project,
    proxyEvaluator: evaluator,
  });
  if (!projected.ok) {
    return {
      ok: false,
      error: `the model does not project to BIM: ${errorMessage(projected.error)}`,
    };
  }
  const { model } = projected.value;
  try {
    const cobie = bim.deriveCobieModel(model, args.contact ? { contact: args.contact } : undefined);
    const rows = {
      Contact: cobie.contact.length,
      Facility: cobie.facility.length,
      Floor: cobie.floor.length,
      Space: cobie.space.length,
      Zone: cobie.zone.length,
      Type: cobie.type.length,
      Component: cobie.component.length,
      System: cobie.system.length,
      Attribute: cobie.attribute.length,
    };
    const files =
      args.format === 'csv'
        ? Object.fromEntries(
            [...bim.serializeCobieToCsv(cobie)].map(([sheet, csv]) => [`${sheet}.csv`, csv])
          )
        : { 'cobie.json': `${JSON.stringify(bim.serializeCobieToJson(cobie), null, 2)}\n` };
    return { ok: true, files, rows };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  } finally {
    model[Symbol.dispose]();
  }
}
