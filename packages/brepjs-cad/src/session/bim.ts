import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveProjectPackageEntry } from '../preview/evaluate.js';
import type { ImportedModelLike } from './buildIfc.js';
import type { DiagnosticSeverity } from './records.js';

// Structural views of brepjs-bim: like brepjs-families, it is imported from the user's project at
// runtime, so brepjs-cad carries no dependency on it.

export type BimResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown };

export interface BimIssueLike {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly entity?: string | number | undefined;
}

export interface BimModelLike {
  getElement(id: number): { readonly guid: string } | null;
  [Symbol.dispose](): void;
}

export interface FamiliesBimLike {
  readonly model: BimModelLike;
  readonly idByKeyPath: ReadonlyMap<string, number>;
  readonly proxied: readonly { readonly keyPath: string }[];
}

export interface IfcProjectSpec {
  readonly name: string;
  readonly projectId?: string;
  readonly description?: string;
}

export interface BimNs {
  fromIfc(bytes: Uint8Array): Promise<BimResult<ImportedModelLike>>;
  disposeImportedModel(model: ImportedModelLike): void;
  familiesToBim(
    root: unknown,
    options: {
      readonly project: IfcProjectSpec;
      readonly bodyEvaluator?: unknown;
      readonly proxyEvaluator?: unknown;
    }
  ): BimResult<FamiliesBimLike>;
  toIfcValidated(
    model: BimModelLike,
    meta: { readonly applicationName: string; readonly applicationVersion: string }
  ): Promise<
    BimResult<{
      readonly bytes: Uint8Array;
      readonly report: { readonly issues: readonly BimIssueLike[] };
    }>
  >;
}

/** brepjs-bim as installed for the project around `anchorPath` (or the server's cwd). */
export async function importBim(anchorPath: string): Promise<BimNs | undefined> {
  try {
    // Typed through BimNs so a brepjs-bim API change that breaks these structural views fails typecheck.
    const bim: BimNs = await import('brepjs-bim');
    return bim;
  } catch {
    for (const from of [anchorPath, join(process.cwd(), 'package.json')]) {
      const abs = resolveProjectPackageEntry('brepjs-bim', from);
      if (abs === undefined) continue;
      try {
        return (await import(pathToFileURL(abs).href)) as BimNs;
      } catch {
        // try the next anchor
      }
    }
    return undefined;
  }
}
