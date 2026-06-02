import type { Result } from 'brepjs';
import { err, ok, isOk } from 'brepjs';
import type { BimError } from '../errors/bimError.js';
import { bcfError } from '../errors/bimError.js';
import type {
  BcfColoring,
  BcfComment,
  BcfComponent,
  BcfComponents,
  BcfContainerData,
  BcfFiles,
  BcfProject,
  BcfTopic,
  BcfVersion,
  BcfViewpoint,
  BcfVisibility,
} from './bcfTypes.js';
import { childText, findChild, findChildren, parseXml, type XmlNode } from './bcfXml.js';

/**
 * Parse an unzipped BCF 3.0 container (`Map<path, xml-string>`) back into the
 * typed data model. The inverse of `serializeBcfFiles`.
 *
 * `FLAG: BCF_ZIP_PACKAGING_ABSENT` — callers holding a `.bcfzip` binary must
 * unzip it into a `Map<path, string>` (external ZIP library) before calling.
 */
export function parseBcfFiles(files: BcfFiles): Result<BcfContainerData, BimError> {
  const versionXml = files.get('bcf.version');
  if (versionXml === undefined) {
    return err(bcfError('BCF_MISSING_FILE', 'Container is missing the required bcf.version file'));
  }
  const projectXml = files.get('project.bcfp');

  try {
    const version = parseVersion(versionXml);
    if (!isOk(version)) return version;

    // project.bcfp is optional per BCF 3.0; default to an empty project when absent.
    const project =
      projectXml !== undefined ? parseProject(projectXml) : { projectId: '', name: '' };

    const topics: BcfTopic[] = [];
    for (const [path, xml] of files) {
      if (!path.endsWith('/markup.bcf')) continue;
      const dir = path.slice(0, path.length - 'markup.bcf'.length);
      topics.push(parseMarkup(xml, files, dir));
    }
    topics.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    return ok({ version: version.value, project, topics });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return err(bcfError('BCF_PARSE_FAILED', `Failed to parse BCF container: ${message}`, cause));
  }
}

function parseVersion(xml: string): Result<BcfVersion, BimError> {
  const root = parseXml(xml);
  const versionId = root.attrs['VersionId'];
  if (versionId !== '3.0') {
    return err(
      bcfError(
        'BCF_VERSION_UNSUPPORTED',
        `Unsupported BCF version "${versionId ?? '(none)'}"; only 3.0 is supported`,
      ),
    );
  }
  const detailedVersion = childText(root, 'DetailedVersion');
  return ok(detailedVersion === undefined ? { versionId } : { versionId, detailedVersion });
}

function parseProject(xml: string): BcfProject {
  const root = parseXml(xml);
  const projectEl = findChild(root, 'Project');
  const projectId = projectEl?.attrs['ProjectId'] ?? '';
  const name = projectEl !== undefined ? (childText(projectEl, 'Name') ?? '') : '';
  return { projectId, name };
}

function parseMarkup(xml: string, files: BcfFiles, dir: string): BcfTopic {
  const markup = parseXml(xml);
  const topicEl = findChild(markup, 'Topic');
  if (topicEl === undefined) throw new Error('markup.bcf is missing a <Topic> element');

  const comments = findChildren(markup, 'Comment').map(parseComment);
  const viewpoints = findChildren(markup, 'Viewpoints').map((el) => parseViewpoint(el, files, dir));

  const topic: Writable<BcfTopic> = {
    guid: topicEl.attrs['Guid'] ?? '',
    title: childText(topicEl, 'Title') ?? '',
    comments,
    viewpoints,
  };

  assign(topic, 'topicType', topicEl.attrs['TopicType']);
  assign(topic, 'topicStatus', topicEl.attrs['TopicStatus']);
  assign(topic, 'priority', childText(topicEl, 'Priority'));
  assignNum(topic, 'index', childText(topicEl, 'Index'));
  assign(topic, 'creationDate', childText(topicEl, 'CreationDate'));
  assign(topic, 'creationAuthor', childText(topicEl, 'CreationAuthor'));
  assign(topic, 'modifiedDate', childText(topicEl, 'ModifiedDate'));
  assign(topic, 'modifiedAuthor', childText(topicEl, 'ModifiedAuthor'));
  assign(topic, 'dueDate', childText(topicEl, 'DueDate'));
  assign(topic, 'assignedTo', childText(topicEl, 'AssignedTo'));
  assign(topic, 'description', childText(topicEl, 'Description'));

  const labels = findChildren(topicEl, 'Labels').map((l) => l.text);
  if (labels.length > 0) topic.labels = labels;

  const related = findChildren(topicEl, 'RelatedTopic')
    .map((r) => r.attrs['Guid'])
    .filter((g): g is string => g !== undefined);
  if (related.length > 0) topic.relatedTopics = related;

  return topic;
}

function parseComment(el: XmlNode): BcfComment {
  const comment: Writable<BcfComment> = {
    guid: el.attrs['Guid'] ?? '',
    date: childText(el, 'Date') ?? '',
    author: childText(el, 'Author') ?? '',
    comment: childText(el, 'Comment') ?? '',
  };
  const viewpointRef = findChild(el, 'Viewpoint')?.attrs['Guid'];
  assign(comment, 'viewpointRef', viewpointRef);
  assign(comment, 'modifiedDate', childText(el, 'ModifiedDate'));
  assign(comment, 'modifiedAuthor', childText(el, 'ModifiedAuthor'));
  return comment;
}

function parseViewpoint(el: XmlNode, files: BcfFiles, dir: string): BcfViewpoint {
  const viewpoint: Writable<BcfViewpoint> = { guid: el.attrs['Guid'] ?? '' };
  assign(viewpoint, 'viewpointFile', childText(el, 'Viewpoint'));
  assign(viewpoint, 'snapshotFile', childText(el, 'Snapshot'));
  assignNum(viewpoint, 'index', childText(el, 'Index'));
  // BCF 3.0: Components live in the referenced .bcfv file. Fall back to an inline
  // <Components> block for tolerance of non-conformant producers.
  const inlineComponents = findChild(el, 'Components');
  if (inlineComponents !== undefined) {
    viewpoint.components = parseComponents(inlineComponents);
  } else if (viewpoint.viewpointFile !== undefined) {
    const bcfvXml = files.get(`${dir}${viewpoint.viewpointFile}`);
    if (bcfvXml !== undefined) {
      const visEl = findChild(parseXml(bcfvXml), 'Components');
      if (visEl !== undefined) viewpoint.components = parseComponents(visEl);
    }
  }
  return viewpoint;
}

function parseComponents(el: XmlNode): BcfComponents {
  const components: Writable<BcfComponents> = {};

  const selectionEl = findChild(el, 'Selection');
  if (selectionEl !== undefined) {
    components.selection = findChildren(selectionEl, 'Component').map(parseComponent);
  }

  const coloringEl = findChild(el, 'Coloring');
  if (coloringEl !== undefined) {
    components.coloring = findChildren(coloringEl, 'Color').map(parseColoring);
  }

  const visibilityEl = findChild(el, 'Visibility');
  if (visibilityEl !== undefined) {
    components.visibility = parseVisibility(visibilityEl);
  }

  return components;
}

function parseColoring(el: XmlNode): BcfColoring {
  return {
    color: el.attrs['Color'] ?? '',
    components: findChildren(el, 'Component').map(parseComponent),
  };
}

function parseVisibility(el: XmlNode): BcfVisibility {
  const visibility: Writable<BcfVisibility> = {
    defaultVisibility: el.attrs['DefaultVisibility'] === 'true',
  };
  const exceptionsEl = findChild(el, 'Exceptions');
  if (exceptionsEl !== undefined) {
    visibility.exceptions = findChildren(exceptionsEl, 'Component').map(parseComponent);
  }
  return visibility;
}

function parseComponent(el: XmlNode): BcfComponent {
  const component: Writable<BcfComponent> = {};
  assign(component, 'ifcGuid', el.attrs['IfcGuid']);
  assign(component, 'originatingSystem', childText(el, 'OriginatingSystem'));
  assign(component, 'authoringToolId', childText(el, 'AuthoringToolId'));
  return component;
}

type Writable<T> = { -readonly [K in keyof T]: T[K] };

/** Set a string key only when the source value is present (exactOptionalPropertyTypes). */
function assign<T, K extends keyof T>(target: T, key: K, value: string | undefined): void {
  if (value !== undefined) target[key] = value as T[K];
}

function assignNum<T, K extends keyof T>(target: T, key: K, value: string | undefined): void {
  if (value !== undefined) target[key] = Number(value) as T[K];
}
