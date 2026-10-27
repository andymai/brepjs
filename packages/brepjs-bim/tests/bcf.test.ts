import { describe, it, expect } from 'vitest';
import type { BcfContainerData } from '../src/bcf/bcfTypes.js';
import { serializeBcfFiles } from '../src/bcf/bcfWrite.js';
import { parseBcfFiles } from '../src/bcf/bcfRead.js';
import { findChild, findChildren, parseXml, type XmlNode } from '../src/bcf/bcfXml.js';

/**
 * BCF 3.0 round-trip: build a container with a topic that carries a comment and
 * a viewpoint whose selection references a component by IFC GlobalId, serialize
 * to the unzipped `Map<path, string>` BCF structure, parse it back, and assert
 * structural equality.
 *
 * No WASM is required — BCF is pure XML over plain value objects.
 */

function buildContainer(): BcfContainerData {
  return {
    version: { versionId: '3.0', detailedVersion: 'BCF 3.0' },
    project: { projectId: 'project-1234', name: 'Demo Project' },
    topics: [
      {
        guid: '8dc86298-9737-40b4-a448-98a9e953293a',
        title: 'Clash between wall and slab',
        topicType: 'Clash',
        topicStatus: 'Open',
        priority: 'High',
        index: 0,
        labels: ['Structural', 'Coordination'],
        creationDate: '2026-06-02T10:15:00Z',
        creationAuthor: 'alice@example.com',
        modifiedDate: '2026-06-02T11:30:00Z',
        modifiedAuthor: 'bob@example.com',
        description: 'The wall <W-01> overlaps the slab & needs review.',
        assignedTo: 'bob@example.com',
        dueDate: '2026-06-10T00:00:00Z',
        relatedTopics: ['11111111-1111-1111-1111-111111111111'],
        comments: [
          {
            guid: '2d4d1f2a-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
            date: '2026-06-02T10:20:00Z',
            author: 'alice@example.com',
            comment: 'Please confirm the clash.',
            viewpointRef: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            modifiedDate: '2026-06-02T10:25:00Z',
            modifiedAuthor: 'alice@example.com',
          },
        ],
        viewpoints: [
          {
            guid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            viewpointFile: 'viewpoint.bcfv',
            snapshotFile: 'snapshot.png',
            index: 0,
            components: {
              selection: [
                {
                  ifcGuid: '2O2Fr$t4X7Zf8NOew3FNr2',
                  originatingSystem: 'brepjs-bim',
                  authoringToolId: 'wall-01',
                },
              ],
              coloring: [
                {
                  color: 'FFFF0000',
                  components: [{ ifcGuid: '3O2Fr$t4X7Zf8NOew3FNr3' }],
                },
              ],
              visibility: {
                defaultVisibility: true,
                exceptions: [{ ifcGuid: '4O2Fr$t4X7Zf8NOew3FNr4' }],
              },
            },
            camera: {
              kind: 'ORTHOGONAL',
              viewPoint: [12.5, -8, 20.25],
              direction: [-0.5, 0.5, -0.7071067811865476],
              upVector: [0, 0, 1],
              viewToWorldScale: 18.5,
              aspectRatio: 1.3333333333333333,
            },
          },
        ],
      },
    ],
  };
}

describe('BCF 3.0 read/write', () => {
  it('serializes the expected unzipped file structure', () => {
    const data = buildContainer();
    const files = serializeBcfFiles(data);

    expect(files.has('bcf.version')).toBe(true);
    expect(files.has('project.bcfp')).toBe(true);
    const topicGuid = data.topics[0]?.guid;
    expect(files.has(`${topicGuid}/markup.bcf`)).toBe(true);

    expect(files.get('bcf.version')).toContain('VersionId="3.0"');
    expect(files.get('project.bcfp')).toContain('ProjectId="project-1234"');
  });

  it('escapes XML special characters in topic text', () => {
    const data = buildContainer();
    const files = serializeBcfFiles(data);
    const markup = files.get(`${data.topics[0]?.guid}/markup.bcf`) ?? '';
    // The raw description contains < > & which must be escaped in the XML.
    expect(markup).toContain('&lt;W-01&gt;');
    expect(markup).toContain('&amp;');
    expect(markup).not.toContain('<W-01>');
  });

  it('round-trips a topic + comment + component by GlobalId', () => {
    const data = buildContainer();
    const files = serializeBcfFiles(data);
    const parsed = parseBcfFiles(files);
    if (!parsed.ok) throw new Error(parsed.error.message);

    expect(parsed.value).toEqual(data);
  });

  it('preserves the component IFC GlobalId reference end-to-end', () => {
    const data = buildContainer();
    const parsed = parseBcfFiles(serializeBcfFiles(data));
    if (!parsed.ok) throw new Error(parsed.error.message);

    const selection = parsed.value.topics[0]?.viewpoints[0]?.components?.selection;
    expect(selection?.[0]?.ifcGuid).toBe('2O2Fr$t4X7Zf8NOew3FNr2');
    expect(selection?.[0]?.authoringToolId).toBe('wall-01');
  });

  it('fails with BIM_BCF when the version file is missing', () => {
    const files = new Map<string, string>();
    files.set('project.bcfp', '<ProjectExtension/>');
    const parsed = parseBcfFiles(files);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.kind).toBe('BIM_BCF');
      expect(parsed.error.code).toBe('BCF_MISSING_FILE');
    }
  });

  it('fails with BCF_VERSION_UNSUPPORTED for a non-3.0 container', () => {
    const data = buildContainer();
    const files = serializeBcfFiles(data);
    files.set(
      'bcf.version',
      '<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="2.1"></Version>'
    );
    const parsed = parseBcfFiles(files);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('BCF_VERSION_UNSUPPORTED');
    }
  });

  it('round-trips a minimal topic with no comments or viewpoints', () => {
    const data: BcfContainerData = {
      version: { versionId: '3.0' },
      project: { projectId: 'p2', name: 'Minimal' },
      topics: [
        {
          guid: '99999999-9999-9999-9999-999999999999',
          title: 'Just a title',
          comments: [],
          viewpoints: [],
        },
      ],
    };
    const parsed = parseBcfFiles(serializeBcfFiles(data));
    if (!parsed.ok) throw new Error(parsed.error.message);
    expect(parsed.value).toEqual(data);
  });

  it('nests labels, related topics, comments and viewpoints in the topic, as BCF 3.0 lays out', () => {
    const data = buildContainer();
    const files = serializeBcfFiles(data);
    const markup = parseXml(files.get(`${data.topics[0]?.guid}/markup.bcf`) ?? '');
    expect(markup.children.map((c) => c.tag)).toEqual(['Topic']);
    const topic = child(markup, 'Topic');
    expect(findChildren(child(topic, 'Labels'), 'Label').map((l) => l.text)).toEqual([
      'Structural',
      'Coordination',
    ]);
    expect(findChildren(child(topic, 'RelatedTopics'), 'RelatedTopic')).toHaveLength(1);
    const comment = child(child(topic, 'Comments'), 'Comment');
    expect(comment.children.map((c) => c.tag)).toEqual([
      'Date',
      'Author',
      'Comment',
      'Viewpoint',
      'ModifiedDate',
      'ModifiedAuthor',
    ]);
    const viewpoint = child(child(topic, 'Viewpoints'), 'ViewPoint');
    expect(viewpoint.children.map((c) => c.tag)).toEqual(['Viewpoint', 'Snapshot', 'Index']);
    // The tail of the topic follows the schema's sequence.
    expect(topic.children.map((c) => c.tag).slice(-5)).toEqual([
      'AssignedTo',
      'Description',
      'RelatedTopics',
      'Comments',
      'Viewpoints',
    ]);
  });

  it('writes the camera after the components, and wraps colored components', () => {
    const files = serializeBcfFiles(buildContainer());
    const bcfv = parseXml(files.get('8dc86298-9737-40b4-a448-98a9e953293a/viewpoint.bcfv') ?? '');
    expect(bcfv.children.map((c) => c.tag)).toEqual(['Components', 'OrthogonalCamera']);
    const camera = child(bcfv, 'OrthogonalCamera');
    const color = child(child(child(bcfv, 'Components'), 'Coloring'), 'Color');
    expect(findChildren(child(color, 'Components'), 'Component')).toHaveLength(1);
    expect(camera.children.map((c) => c.tag)).toEqual([
      'CameraViewPoint',
      'CameraDirection',
      'CameraUpVector',
      'ViewToWorldScale',
      'AspectRatio',
    ]);
  });

  it('round-trips a perspective camera on a viewpoint without components', () => {
    const data: BcfContainerData = {
      version: { versionId: '3.0' },
      project: { projectId: 'p3', name: 'Camera' },
      topics: [
        {
          guid: '77777777-7777-7777-7777-777777777777',
          title: 'Look here',
          comments: [],
          viewpoints: [
            {
              guid: '88888888-8888-8888-8888-888888888888',
              camera: {
                kind: 'PERSPECTIVE',
                viewPoint: [1, 2, 3],
                direction: [0, 1, 0],
                upVector: [0, 0, 1],
                fieldOfView: 60,
                aspectRatio: 1.5,
              },
            },
          ],
        },
      ],
    };
    const files = serializeBcfFiles(data);
    expect(
      files.has('77777777-7777-7777-7777-777777777777/88888888-8888-8888-8888-888888888888.bcfv')
    ).toBe(true);
    const parsed = parseBcfFiles(files);
    if (!parsed.ok) throw new Error(parsed.error.message);
    expect(parsed.value.topics[0]?.viewpoints[0]?.camera).toEqual(
      data.topics[0]?.viewpoints[0]?.camera
    );
  });

  it('reads the layout earlier releases wrote, with comments and viewpoints beside the topic', () => {
    const files = new Map<string, string>([
      ['bcf.version', '<?xml version="1.0"?>\n<Version VersionId="3.0"></Version>'],
      [
        't1/markup.bcf',
        [
          '<Markup>',
          '  <Topic Guid="t1" TopicType="Issue" TopicStatus="Open">',
          '    <Title>Old layout</Title>',
          '    <Labels>Structural</Labels>',
          '    <Labels>Fire</Labels>',
          '    <RelatedTopic Guid="t0" />',
          '  </Topic>',
          '  <Comment Guid="c1"><Date>2026-01-01T00:00:00Z</Date><Author>a</Author><Comment>hi</Comment></Comment>',
          '  <Viewpoints Guid="v1"><Viewpoint>v1.bcfv</Viewpoint></Viewpoints>',
          '</Markup>',
        ].join('\n'),
      ],
      [
        't1/v1.bcfv',
        '<VisualizationInfo Guid="v1"><Components><Selection><Component IfcGuid="g1" /></Selection></Components></VisualizationInfo>',
      ],
    ]);
    const parsed = parseBcfFiles(files);
    if (!parsed.ok) throw new Error(parsed.error.message);
    const topic = parsed.value.topics[0];
    expect(topic?.labels).toEqual(['Structural', 'Fire']);
    expect(topic?.relatedTopics).toEqual(['t0']);
    expect(topic?.comments.map((c) => c.comment)).toEqual(['hi']);
    expect(topic?.viewpoints[0]?.components?.selection).toEqual([{ ifcGuid: 'g1' }]);
  });

  it('fails with BCF_PARSE_FAILED when a camera is missing a coordinate', () => {
    const files = serializeBcfFiles(buildContainer());
    const key = '8dc86298-9737-40b4-a448-98a9e953293a/viewpoint.bcfv';
    files.set(key, (files.get(key) ?? '').replace('<Z>20.25</Z>', ''));
    const parsed = parseBcfFiles(files);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.code).toBe('BCF_PARSE_FAILED');
  });

  it('parses a container without the optional project.bcfp (BCF 3.0)', () => {
    const files = serializeBcfFiles(buildContainer());
    files.delete('project.bcfp');
    const parsed = parseBcfFiles(files);
    expect(parsed.ok).toBe(true);
  });
});

function child(node: XmlNode, tag: string): XmlNode {
  const found = findChild(node, tag);
  if (found === undefined) throw new Error(`<${node.tag}> has no <${tag}>`);
  return found;
}
