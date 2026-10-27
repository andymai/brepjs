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

export type BcfVectorLike = readonly [number, number, number];

export type BcfCameraLike =
  | {
      readonly kind: 'ORTHOGONAL';
      readonly viewPoint: BcfVectorLike;
      readonly direction: BcfVectorLike;
      readonly upVector: BcfVectorLike;
      readonly viewToWorldScale: number;
      readonly aspectRatio: number;
    }
  | {
      readonly kind: 'PERSPECTIVE';
      readonly viewPoint: BcfVectorLike;
      readonly direction: BcfVectorLike;
      readonly upVector: BcfVectorLike;
      readonly fieldOfView: number;
      readonly aspectRatio: number;
    };

export interface BcfComponentLike {
  readonly ifcGuid?: string | undefined;
  readonly originatingSystem?: string | undefined;
  readonly authoringToolId?: string | undefined;
}

export interface BcfViewpointLike {
  readonly guid: string;
  readonly viewpointFile?: string | undefined;
  readonly snapshotFile?: string | undefined;
  readonly components?:
    | {
        readonly selection?: readonly BcfComponentLike[] | undefined;
        readonly coloring?:
          | readonly { readonly color: string; readonly components: readonly BcfComponentLike[] }[]
          | undefined;
        readonly visibility?:
          | {
              readonly defaultVisibility: boolean;
              readonly exceptions?: readonly BcfComponentLike[] | undefined;
            }
          | undefined;
      }
    | undefined;
  readonly camera?: BcfCameraLike | undefined;
}

export interface BcfCommentLike {
  readonly guid: string;
  readonly date: string;
  readonly author: string;
  readonly comment: string;
  readonly viewpointRef?: string | undefined;
}

export interface BcfTopicLike {
  readonly guid: string;
  readonly title: string;
  readonly topicType?: string | undefined;
  readonly topicStatus?: string | undefined;
  readonly priority?: string | undefined;
  readonly labels?: readonly string[] | undefined;
  readonly creationDate?: string | undefined;
  readonly creationAuthor?: string | undefined;
  readonly modifiedDate?: string | undefined;
  readonly modifiedAuthor?: string | undefined;
  readonly description?: string | undefined;
  readonly assignedTo?: string | undefined;
  readonly dueDate?: string | undefined;
  readonly comments: readonly BcfCommentLike[];
  readonly viewpoints: readonly BcfViewpointLike[];
  readonly relatedTopics?: readonly string[] | undefined;
}

export interface BcfContainerLike {
  readonly version: { readonly versionId: '3.0' };
  readonly project: { readonly projectId: string; readonly name: string };
  readonly topics: readonly BcfTopicLike[];
}

export interface CobieContactLike {
  readonly email?: string | undefined;
  readonly givenName?: string | undefined;
  readonly familyName?: string | undefined;
  readonly company?: string | undefined;
  readonly phone?: string | undefined;
}

export interface CobieModelLike {
  readonly contact: readonly unknown[];
  readonly facility: readonly unknown[];
  readonly floor: readonly unknown[];
  readonly space: readonly unknown[];
  readonly zone: readonly unknown[];
  readonly type: readonly unknown[];
  readonly component: readonly unknown[];
  readonly system: readonly unknown[];
  readonly attribute: readonly unknown[];
}

export interface BimNs {
  fromIfc(
    bytes: Uint8Array,
    options?: { readonly skipGeometry?: boolean }
  ): Promise<BimResult<ImportedModelLike>>;
  toIfc(
    model: BimModelLike,
    meta: { readonly applicationName: string; readonly applicationVersion: string }
  ): Promise<BimResult<Uint8Array>>;
  disposeImportedModel(model: ImportedModelLike): void;
  familiesToBim(
    root: unknown,
    options: {
      readonly project: IfcProjectSpec;
      readonly bodyEvaluator?: unknown;
      readonly proxyEvaluator?: unknown;
    }
  ): BimResult<FamiliesBimLike>;
  /** Takes the BimModel from familiesToBim. */
  checkReferentialIntegrity(model: unknown): { readonly issues: readonly BimIssueLike[] };
  checkSchema(bytes: Uint8Array): Promise<{ readonly issues: readonly BimIssueLike[] }>;
  checkRoundTrip(bytes: Uint8Array): Promise<{ readonly issues: readonly BimIssueLike[] }>;
  checkGherkinRules(bytes: Uint8Array): Promise<readonly BimIssueLike[]>;
  checkGeometryValidity(
    solids: unknown,
    entity?: string
  ): { readonly issues: readonly BimIssueLike[] };
  serializeBcfFiles(data: BcfContainerLike): Map<string, string>;
  /** Takes the BimModel from familiesToBim. */
  deriveCobieModel(
    model: BimModelLike,
    meta?: { readonly contact?: CobieContactLike | undefined }
  ): CobieModelLike;
  serializeCobieToCsv(model: CobieModelLike): Map<string, string>;
  serializeCobieToJson(model: CobieModelLike): unknown;
  parseBcfFiles(files: Map<string, string>): BimResult<BcfContainerLike>;
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
