import type {
  BcfColoring,
  BcfComment,
  BcfComponent,
  BcfComponents,
  BcfContainerData,
  BcfFiles,
  BcfTopic,
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
      if (viewpoint.components !== undefined || viewpoint.viewpointFile !== undefined) {
        files.set(`${topic.guid}/${bcfvName(viewpoint)}`, writeVisualizationInfo(viewpoint));
      }
    }
  }
  return files;
}

function writeVersion(data: BcfContainerData): string {
  const lines: string[] = [`<Version VersionId="${escapeXmlAttr(data.version.versionId)}">`];
  if (data.version.detailedVersion !== undefined) {
    lines.push(`  <DetailedVersion>${escapeXmlText(data.version.detailedVersion)}</DetailedVersion>`);
  }
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
  for (const comment of topic.comments) {
    lines.push(...writeComment(comment).map(indent(1)));
  }
  for (const viewpoint of topic.viewpoints) {
    lines.push(...writeViewpoint(viewpoint).map(indent(1)));
  }
  lines.push('</Markup>');
  return xmlDocument(lines.join('\n'));
}

function writeTopic(topic: BcfTopic): string[] {
  const attrs: string[] = [`Guid="${escapeXmlAttr(topic.guid)}"`];
  if (topic.topicType !== undefined) attrs.push(`TopicType="${escapeXmlAttr(topic.topicType)}"`);
  if (topic.topicStatus !== undefined) attrs.push(`TopicStatus="${escapeXmlAttr(topic.topicStatus)}"`);

  const lines: string[] = [`<Topic ${attrs.join(' ')}>`];
  const inner: string[] = [];
  inner.push(`<Title>${escapeXmlText(topic.title)}</Title>`);
  pushOptional(inner, 'Priority', topic.priority);
  pushOptionalNum(inner, 'Index', topic.index);
  for (const label of topic.labels ?? []) {
    inner.push(`<Labels>${escapeXmlText(label)}</Labels>`);
  }
  pushOptional(inner, 'CreationDate', topic.creationDate);
  pushOptional(inner, 'CreationAuthor', topic.creationAuthor);
  pushOptional(inner, 'ModifiedDate', topic.modifiedDate);
  pushOptional(inner, 'ModifiedAuthor', topic.modifiedAuthor);
  pushOptional(inner, 'DueDate', topic.dueDate);
  pushOptional(inner, 'AssignedTo', topic.assignedTo);
  pushOptional(inner, 'Description', topic.description);
  for (const related of topic.relatedTopics ?? []) {
    inner.push(`<RelatedTopic Guid="${escapeXmlAttr(related)}" />`);
  }

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
  pushOptional(inner, 'ModifiedDate', comment.modifiedDate);
  pushOptional(inner, 'ModifiedAuthor', comment.modifiedAuthor);
  if (comment.viewpointRef !== undefined) {
    inner.push(`<Viewpoint Guid="${escapeXmlAttr(comment.viewpointRef)}" />`);
  }
  lines.push(...inner.map(indent(1)));
  lines.push('</Comment>');
  return lines;
}

function writeViewpoint(viewpoint: BcfViewpoint): string[] {
  const lines: string[] = [`<Viewpoints Guid="${escapeXmlAttr(viewpoint.guid)}">`];
  const inner: string[] = [];
  // Reference the .bcfv visualization file (BCF 3.0). Components are written
  // there by serializeBcfFiles, never inline in the markup.
  if (viewpoint.components !== undefined || viewpoint.viewpointFile !== undefined) {
    inner.push(`<Viewpoint>${escapeXmlText(bcfvName(viewpoint))}</Viewpoint>`);
  }
  pushOptional(inner, 'Snapshot', viewpoint.snapshotFile);
  pushOptionalNum(inner, 'Index', viewpoint.index);
  lines.push(...inner.map(indent(1)));
  lines.push('</Viewpoints>');
  return lines;
}

/** The .bcfv filename a viewpoint's Components are written to / referenced by. */
function bcfvName(viewpoint: BcfViewpoint): string {
  return viewpoint.viewpointFile ?? `${viewpoint.guid}.bcfv`;
}

/** Serializes a viewpoint's Components into a standalone BCF 3.0 .bcfv document. */
function writeVisualizationInfo(viewpoint: BcfViewpoint): string {
  const lines: string[] = [`<VisualizationInfo Guid="${escapeXmlAttr(viewpoint.guid)}">`];
  if (viewpoint.components !== undefined) {
    lines.push(...writeComponents(viewpoint.components).map(indent(1)));
  }
  lines.push('</VisualizationInfo>');
  return xmlDocument(lines.join('\n'));
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
  for (const c of coloring.components) lines.push(...writeComponent(c).map(indent(1)));
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

function indent(levels: number): (line: string) => string {
  const pad = '  '.repeat(levels);
  return (line) => `${pad}${line}`;
}
