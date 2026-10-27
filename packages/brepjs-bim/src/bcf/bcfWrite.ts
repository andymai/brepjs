import type {
  BcfCamera,
  BcfColoring,
  BcfComment,
  BcfComponent,
  BcfComponents,
  BcfContainerData,
  BcfFiles,
  BcfTopic,
  BcfVector,
  BcfViewpoint,
  BcfVisibility,
} from './bcfTypes.js';
import { escapeXmlAttr, escapeXmlText, xmlDocument } from './bcfXml.js';

/**
 * Serialize a BCF 3.0 container into its unzipped file structure
 * (`Map<path, xml-string>`):
 *
 * - `bcf.version` — container version marker
 * - `project.bcfp` — project metadata
 * - `{topicGuid}/markup.bcf` — one markup file per topic (topic, comments, viewpoints)
 * - `{topicGuid}/{viewpoint}.bcfv`: one visualization file per viewpoint (components, camera)
 *
 * `FLAG: BCF_ZIP_PACKAGING_ABSENT` — to produce an actual `.bcfzip`, ZIP these
 * entries with an external library; no ZIP dependency is declared in the
 * workspace.
 */
export function serializeBcfFiles(data: BcfContainerData): BcfFiles {
  const files: BcfFiles = new Map();
  files.set('bcf.version', writeVersion(data));
  files.set('project.bcfp', writeProject(data));
  for (const topic of data.topics) {
    files.set(`${topic.guid}/markup.bcf`, writeMarkup(topic));
    // BCF 3.0: each viewpoint's Components live in a separate .bcfv visualization
    // file referenced from the markup, never inline in markup.bcf.
    for (const viewpoint of topic.viewpoints) {
      if (hasVisualization(viewpoint)) {
        files.set(`${topic.guid}/${bcfvName(viewpoint)}`, writeVisualizationInfo(viewpoint));
      }
    }
  }
  return files;
}

function writeVersion(data: BcfContainerData): string {
  const open = `<Version VersionId="${escapeXmlAttr(data.version.versionId)}"`;
  // The 3.0 schema gives Version no content, so an empty element is written self-closing.
  if (data.version.detailedVersion === undefined) return xmlDocument(`${open} />`);
  const lines: string[] = [`${open}>`];
  lines.push(`  <DetailedVersion>${escapeXmlText(data.version.detailedVersion)}</DetailedVersion>`);
  lines.push('</Version>');
  return xmlDocument(lines.join('\n'));
}

function writeProject(data: BcfContainerData): string {
  const lines: string[] = [
    '<ProjectInfo>',
    `  <Project ProjectId="${escapeXmlAttr(data.project.projectId)}">`,
    `    <Name>${escapeXmlText(data.project.name)}</Name>`,
    '  </Project>',
    '</ProjectInfo>',
  ];
  return xmlDocument(lines.join('\n'));
}

function writeMarkup(topic: BcfTopic): string {
  const lines: string[] = ['<Markup>'];
  lines.push(...writeTopic(topic).map(indent(1)));
  lines.push('</Markup>');
  return xmlDocument(lines.join('\n'));
}

function writeTopic(topic: BcfTopic): string[] {
  const attrs: string[] = [`Guid="${escapeXmlAttr(topic.guid)}"`];
  if (topic.topicType !== undefined) attrs.push(`TopicType="${escapeXmlAttr(topic.topicType)}"`);
  if (topic.topicStatus !== undefined)
    attrs.push(`TopicStatus="${escapeXmlAttr(topic.topicStatus)}"`);

  const lines: string[] = [`<Topic ${attrs.join(' ')}>`];
  const inner: string[] = [];
  inner.push(`<Title>${escapeXmlText(topic.title)}</Title>`);
  pushOptional(inner, 'Priority', topic.priority);
  pushOptionalNum(inner, 'Index', topic.index);
  pushList(
    inner,
    'Labels',
    (topic.labels ?? []).map((label) => [`<Label>${escapeXmlText(label)}</Label>`])
  );
  pushOptional(inner, 'CreationDate', topic.creationDate);
  pushOptional(inner, 'CreationAuthor', topic.creationAuthor);
  pushOptional(inner, 'ModifiedDate', topic.modifiedDate);
  pushOptional(inner, 'ModifiedAuthor', topic.modifiedAuthor);
  pushOptional(inner, 'DueDate', topic.dueDate);
  pushOptional(inner, 'AssignedTo', topic.assignedTo);
  pushOptional(inner, 'Description', topic.description);
  pushList(
    inner,
    'RelatedTopics',
    (topic.relatedTopics ?? []).map((related) => [
      `<RelatedTopic Guid="${escapeXmlAttr(related)}" />`,
    ])
  );
  // BCF 3.0 nests comments and viewpoints inside the topic.
  pushList(inner, 'Comments', topic.comments.map(writeComment));
  pushList(inner, 'Viewpoints', topic.viewpoints.map(writeViewpoint));

  lines.push(...inner.map(indent(1)));
  lines.push('</Topic>');
  return lines;
}

function writeComment(comment: BcfComment): string[] {
  const lines: string[] = [`<Comment Guid="${escapeXmlAttr(comment.guid)}">`];
  const inner: string[] = [];
  inner.push(`<Date>${escapeXmlText(comment.date)}</Date>`);
  inner.push(`<Author>${escapeXmlText(comment.author)}</Author>`);
  inner.push(`<Comment>${escapeXmlText(comment.comment)}</Comment>`);
  if (comment.viewpointRef !== undefined) {
    inner.push(`<Viewpoint Guid="${escapeXmlAttr(comment.viewpointRef)}" />`);
  }
  pushOptional(inner, 'ModifiedDate', comment.modifiedDate);
  pushOptional(inner, 'ModifiedAuthor', comment.modifiedAuthor);
  lines.push(...inner.map(indent(1)));
  lines.push('</Comment>');
  return lines;
}

function writeViewpoint(viewpoint: BcfViewpoint): string[] {
  const lines: string[] = [`<ViewPoint Guid="${escapeXmlAttr(viewpoint.guid)}">`];
  const inner: string[] = [];
  // Reference the .bcfv visualization file (BCF 3.0). Components and the camera
  // are written there by serializeBcfFiles, never inline in the markup.
  if (hasVisualization(viewpoint)) {
    inner.push(`<Viewpoint>${escapeXmlText(bcfvName(viewpoint))}</Viewpoint>`);
  }
  pushOptional(inner, 'Snapshot', viewpoint.snapshotFile);
  pushOptionalNum(inner, 'Index', viewpoint.index);
  lines.push(...inner.map(indent(1)));
  lines.push('</ViewPoint>');
  return lines;
}

function hasVisualization(viewpoint: BcfViewpoint): boolean {
  return (
    viewpoint.components !== undefined ||
    viewpoint.camera !== undefined ||
    viewpoint.viewpointFile !== undefined
  );
}

/** The .bcfv filename a viewpoint's Components are written to / referenced by. */
function bcfvName(viewpoint: BcfViewpoint): string {
  return viewpoint.viewpointFile ?? `${viewpoint.guid}.bcfv`;
}

/** Serializes a viewpoint's Components and camera into a standalone BCF 3.0 .bcfv document. */
function writeVisualizationInfo(viewpoint: BcfViewpoint): string {
  const lines: string[] = [`<VisualizationInfo Guid="${escapeXmlAttr(viewpoint.guid)}">`];
  if (viewpoint.components !== undefined) {
    lines.push(...writeComponents(viewpoint.components).map(indent(1)));
  }
  if (viewpoint.camera !== undefined) {
    lines.push(...writeCamera(viewpoint.camera).map(indent(1)));
  }
  lines.push('</VisualizationInfo>');
  return xmlDocument(lines.join('\n'));
}

function writeCamera(camera: BcfCamera): string[] {
  const tag = camera.kind === 'ORTHOGONAL' ? 'OrthogonalCamera' : 'PerspectiveCamera';
  const inner: string[] = [
    ...writeVector('CameraViewPoint', camera.viewPoint),
    ...writeVector('CameraDirection', camera.direction),
    ...writeVector('CameraUpVector', camera.upVector),
  ];
  if (camera.kind === 'ORTHOGONAL') {
    inner.push(`<ViewToWorldScale>${camera.viewToWorldScale}</ViewToWorldScale>`);
  } else {
    inner.push(`<FieldOfView>${camera.fieldOfView}</FieldOfView>`);
  }
  inner.push(`<AspectRatio>${camera.aspectRatio}</AspectRatio>`);
  return [`<${tag}>`, ...inner.map(indent(1)), `</${tag}>`];
}

function writeVector(tag: string, [x, y, z]: BcfVector): string[] {
  return [`<${tag}>`, `  <X>${x}</X>`, `  <Y>${y}</Y>`, `  <Z>${z}</Z>`, `</${tag}>`];
}

function writeComponents(components: BcfComponents): string[] {
  const lines: string[] = ['<Components>'];
  const inner: string[] = [];

  if (components.selection !== undefined) {
    inner.push('<Selection>');
    for (const c of components.selection) inner.push(...writeComponent(c).map(indent(1)));
    inner.push('</Selection>');
  }

  if (components.visibility !== undefined) {
    inner.push(...writeVisibility(components.visibility));
  }

  if (components.coloring !== undefined) {
    inner.push('<Coloring>');
    for (const c of components.coloring) inner.push(...writeColoring(c).map(indent(1)));
    inner.push('</Coloring>');
  }

  lines.push(...inner.map(indent(1)));
  lines.push('</Components>');
  return lines;
}

function writeVisibility(visibility: BcfVisibility): string[] {
  const lines: string[] = [`<Visibility DefaultVisibility="${visibility.defaultVisibility}">`];
  if (visibility.exceptions !== undefined) {
    const inner: string[] = ['<Exceptions>'];
    for (const c of visibility.exceptions) inner.push(...writeComponent(c).map(indent(1)));
    inner.push('</Exceptions>');
    lines.push(...inner.map(indent(1)));
  }
  lines.push('</Visibility>');
  return lines;
}

function writeColoring(coloring: BcfColoring): string[] {
  const lines: string[] = [`<Color Color="${escapeXmlAttr(coloring.color)}">`];
  const inner: string[] = ['<Components>'];
  for (const c of coloring.components) inner.push(...writeComponent(c).map(indent(1)));
  inner.push('</Components>');
  lines.push(...inner.map(indent(1)));
  lines.push('</Color>');
  return lines;
}

function writeComponent(component: BcfComponent): string[] {
  const attrs: string[] = [];
  if (component.ifcGuid !== undefined) attrs.push(`IfcGuid="${escapeXmlAttr(component.ifcGuid)}"`);
  if (component.originatingSystem === undefined && component.authoringToolId === undefined) {
    return [`<Component ${attrs.join(' ')} />`];
  }
  const lines: string[] = [`<Component ${attrs.join(' ')}>`];
  const inner: string[] = [];
  pushOptional(inner, 'OriginatingSystem', component.originatingSystem);
  pushOptional(inner, 'AuthoringToolId', component.authoringToolId);
  lines.push(...inner.map(indent(1)));
  lines.push('</Component>');
  return lines;
}

function pushOptional(target: string[], tag: string, value: string | undefined): void {
  if (value !== undefined) target.push(`<${tag}>${escapeXmlText(value)}</${tag}>`);
}

function pushOptionalNum(target: string[], tag: string, value: number | undefined): void {
  if (value !== undefined) target.push(`<${tag}>${value}</${tag}>`);
}

/** A wrapper element around `items`, each already written as lines; nothing when empty. */
function pushList(target: string[], tag: string, items: readonly string[][]): void {
  if (items.length === 0) return;
  target.push(`<${tag}>`);
  for (const item of items) target.push(...item.map(indent(1)));
  target.push(`</${tag}>`);
}

function indent(levels: number): (line: string) => string {
  const pad = '  '.repeat(levels);
  return (line) => `${pad}${line}`;
}
