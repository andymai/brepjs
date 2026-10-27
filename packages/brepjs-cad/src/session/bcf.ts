/**
 * BCF issues: a topic raised on session elements, packed into a new .bcf container or added to an
 * existing one, and the topics of a container read back. brepjs-bim writes and reads the XML;
 * zip.ts packs it.
 */

import { randomUUID } from 'node:crypto';
import type {
  BcfCameraLike,
  BcfComponentLike,
  BcfContainerLike,
  BcfTopicLike,
  BcfViewpointLike,
  BimNs,
} from './bim.js';
import { errorMessage } from './records.js';
import type { ShotCamera } from './render.js';
import { MAX_ENTRY_BYTES, MAX_TOTAL_BYTES, readZip, writeZip } from './zip.js';

export const SNAPSHOT_FILE = 'snapshot.png';
const TEXT_ENTRY = /\.(version|bcfp|bcf|bcfv|xml)$/i;

export class BcfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BcfError';
  }
}

/** A session camera (millimetres) as a BCF one (metres). */
export function bcfCamera(c: ShotCamera): BcfCameraLike {
  const [x, y, z] = c.position;
  const frame = {
    viewPoint: [x / 1000, y / 1000, z / 1000] as const,
    direction: c.direction,
    upVector: c.up,
    aspectRatio: c.aspect,
  };
  return c.projection === 'orthographic'
    ? { kind: 'ORTHOGONAL', ...frame, viewToWorldScale: c.height / 1000 }
    : { kind: 'PERSPECTIVE', ...frame, fieldOfView: c.fov };
}

export interface IssueSpec {
  readonly title: string;
  readonly topicType: string;
  readonly topicStatus: string;
  readonly author: string;
  readonly description?: string | undefined;
  readonly priority?: string | undefined;
  readonly labels?: readonly string[] | undefined;
  readonly assignedTo?: string | undefined;
  /** ISO 8601. */
  readonly dueDate?: string | undefined;
  /** A first comment, tied to the viewpoint. */
  readonly comment?: string | undefined;
  readonly components: readonly BcfComponentLike[];
  /** highlight colors the components and leaves the rest shown; isolate hides the rest. */
  readonly focus: 'highlight' | 'isolate';
  /** RRGGBB. */
  readonly color: string;
  readonly camera: BcfCameraLike;
  readonly snapshot: Uint8Array;
}

/** The viewpoint's components: the selection, and how the rest of the model is shown. */
function viewpointComponents(spec: IssueSpec): BcfViewpointLike['components'] {
  const { components } = spec;
  if (components.length === 0) return undefined;
  if (spec.focus === 'isolate') {
    return {
      selection: components,
      visibility: { defaultVisibility: false, exceptions: components },
    };
  }
  return {
    selection: components,
    visibility: { defaultVisibility: true },
    coloring: [{ color: spec.color, components }],
  };
}

function optional<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

/** A topic for `spec`, with one viewpoint (components, camera, snapshot). */
export function issueTopic(spec: IssueSpec, now: Date): BcfTopicLike {
  const date = now.toISOString();
  const viewpointGuid = randomUUID();
  const components = viewpointComponents(spec);
  return {
    guid: randomUUID(),
    title: spec.title,
    topicType: spec.topicType,
    topicStatus: spec.topicStatus,
    ...optional('priority', spec.priority),
    ...(spec.labels && spec.labels.length > 0 ? { labels: spec.labels } : {}),
    creationDate: date,
    creationAuthor: spec.author,
    ...optional('dueDate', spec.dueDate),
    ...optional('assignedTo', spec.assignedTo),
    ...optional('description', spec.description),
    comments:
      spec.comment === undefined
        ? []
        : [
            {
              guid: randomUUID(),
              date,
              author: spec.author,
              comment: spec.comment,
              viewpointRef: viewpointGuid,
            },
          ],
    viewpoints: [
      {
        guid: viewpointGuid,
        snapshotFile: SNAPSHOT_FILE,
        ...(components ? { components } : {}),
        camera: spec.camera,
      },
    ],
  };
}

/** The archive's XML entries as text, the way brepjs-bim's reader takes them. */
function textEntries(entries: ReadonlyMap<string, Uint8Array>): Map<string, string> {
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  for (const [path, bytes] of entries) {
    if (TEXT_ENTRY.test(path)) files.set(path, decoder.decode(bytes));
  }
  return files;
}

export interface OpenedContainer {
  readonly entries: ReadonlyMap<string, Uint8Array>;
  readonly container: BcfContainerLike;
}

/** Unpack and parse a .bcf archive. */
export function openContainer(bim: BimNs, bytes: Uint8Array): OpenedContainer {
  let entries: Map<string, Uint8Array>;
  try {
    entries = readZip(bytes);
  } catch (e) {
    throw new BcfError(`not a BCF archive: ${errorMessage(e)}`);
  }
  const parsed = bim.parseBcfFiles(textEntries(entries));
  if (!parsed.ok) throw new BcfError(errorMessage(parsed.error));
  return { entries, container: parsed.value };
}

/**
 * A .bcf archive holding `topic`: a new container for `project`, or `existing` with the topic's
 * folder added and every other entry kept as it was.
 */
export function packIssue(
  bim: BimNs,
  topic: BcfTopicLike,
  snapshot: Uint8Array,
  project: BcfContainerLike['project'],
  existing?: OpenedContainer,
  limits: { readonly entryBytes?: number; readonly totalBytes?: number } = {}
): Uint8Array {
  const files = bim.serializeBcfFiles({ version: { versionId: '3.0' }, project, topics: [topic] });
  const entries = new Map<string, Uint8Array | string>(existing?.entries ?? []);
  const folder = `${topic.guid}/`;
  for (const [path, xml] of files) {
    if (existing === undefined || path.startsWith(folder)) entries.set(path, xml);
  }
  entries.set(`${folder}${SNAPSHOT_FILE}`, snapshot);
  // An archive readZip would refuse can't be opened again, so it is never written.
  let total = 0;
  const encoder = new TextEncoder();
  for (const [path, content] of entries) {
    const size = typeof content === 'string' ? encoder.encode(content).length : content.length;
    if (size > (limits.entryBytes ?? MAX_ENTRY_BYTES)) {
      throw new BcfError(`${path} would be larger than BCF files may be`);
    }
    total += size;
  }
  if (total > (limits.totalBytes ?? MAX_TOTAL_BYTES)) {
    throw new BcfError('adding this issue would make the BCF file larger than it can be read back');
  }
  return writeZip(entries);
}

/** A viewpoint's snapshot, from the topic's folder (BCF names each folder by its topic's Guid). */
export function snapshotOf(
  opened: OpenedContainer,
  topic: BcfTopicLike,
  viewpoint: BcfViewpointLike
): Uint8Array | undefined {
  if (viewpoint.snapshotFile === undefined) return undefined;
  return opened.entries.get(`${topic.guid}/${viewpoint.snapshotFile}`);
}
