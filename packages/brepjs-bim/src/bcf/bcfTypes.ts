/**
 * BCF 3.0 (BIM Collaboration Format) typed data model.
 *
 * Container packaging note (`FLAG: BCF_ZIP_PACKAGING_ABSENT`): a real `.bcfzip`
 * is a ZIP archive of these XML files. No declared ZIP dependency exists in the
 * brepjs-bim workspace, so this module's stable interchange surface is the
 * unzipped structure: `BcfFiles = Map<path, xml-string>`. Callers that need the
 * binary `.bcfzip` must bring their own ZIP library and pack/unpack the map.
 */

/** Unzipped BCF container: archive path → XML file contents. */
export type BcfFiles = Map<string, string>;

export interface BcfContainerData {
  readonly version: BcfVersion;
  readonly project: BcfProject;
  readonly topics: readonly BcfTopic[];
}

export interface BcfVersion {
  readonly versionId: '3.0';
  readonly detailedVersion?: string | undefined;
}

export interface BcfProject {
  readonly projectId: string;
  readonly name: string;
}

export interface BcfTopic {
  readonly guid: string;
  readonly title: string;
  readonly topicType?: string | undefined;
  readonly topicStatus?: string | undefined;
  readonly priority?: string | undefined;
  readonly index?: number | undefined;
  readonly labels?: readonly string[] | undefined;
  /** ISO 8601 timestamp. */
  readonly creationDate?: string | undefined;
  readonly creationAuthor?: string | undefined;
  readonly modifiedDate?: string | undefined;
  readonly modifiedAuthor?: string | undefined;
  readonly description?: string | undefined;
  readonly assignedTo?: string | undefined;
  readonly dueDate?: string | undefined;
  readonly comments: readonly BcfComment[];
  readonly viewpoints: readonly BcfViewpoint[];
  readonly relatedTopics?: readonly string[] | undefined;
}

export interface BcfComment {
  readonly guid: string;
  readonly date: string;
  readonly author: string;
  readonly comment: string;
  /** GUID of a viewpoint owned by the same topic. */
  readonly viewpointRef?: string | undefined;
  readonly modifiedDate?: string | undefined;
  readonly modifiedAuthor?: string | undefined;
}

export interface BcfViewpoint {
  readonly guid: string;
  readonly viewpointFile?: string | undefined;
  readonly snapshotFile?: string | undefined;
  readonly index?: number | undefined;
  readonly components?: BcfComponents | undefined;
}

export interface BcfComponents {
  readonly selection?: readonly BcfComponent[] | undefined;
  readonly coloring?: readonly BcfColoring[] | undefined;
  readonly visibility?: BcfVisibility | undefined;
}

export interface BcfComponent {
  /** IFC GlobalId of the referenced element. */
  readonly ifcGuid?: string | undefined;
  readonly originatingSystem?: string | undefined;
  readonly authoringToolId?: string | undefined;
}

export interface BcfColoring {
  /** Hex ARGB colour, e.g. `FFFF0000`. */
  readonly color: string;
  readonly components: readonly BcfComponent[];
}

export interface BcfVisibility {
  readonly defaultVisibility: boolean;
  readonly exceptions?: readonly BcfComponent[] | undefined;
}
