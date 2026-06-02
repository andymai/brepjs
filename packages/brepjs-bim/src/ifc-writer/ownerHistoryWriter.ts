import * as WebIFC from 'web-ifc';
import type { Handle } from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';

/** Authoring person for the IfcOwnerHistory chain. */
export interface OwnerHistoryAuthor {
  readonly givenName?: string | undefined;
  readonly familyName?: string | undefined;
  /** Optional contact email; emitted as an IfcTelecomAddress on the person. */
  readonly email?: string | undefined;
}

/**
 * Configurable owner-history metadata. All identity values are passed in so the
 * writer never reads wall-clock time — `creationTimestamp` defaults to 0 (epoch)
 * to keep serialized output byte-deterministic.
 */
export interface OwnerHistoryMeta {
  readonly author: OwnerHistoryAuthor;
  readonly organizationName: string;
  readonly applicationName: string;
  readonly applicationVersion: string;
  /** Unix epoch seconds for IfcOwnerHistory.CreationDate. Default 0 (epoch). */
  readonly creationTimestamp?: number | undefined;
}

/**
 * Writes the IfcPerson → IfcOrganization → IfcPersonAndOrganization →
 * IfcApplication → IfcOwnerHistory chain from the supplied metadata and returns
 * the IfcOwnerHistory express id for owned entities to reference.
 *
 * Determinism: no wall-clock time is read here; CreationDate comes solely from
 * `meta.creationTimestamp` (default 0). Identical meta yields identical output.
 */
export function writeOwnerHistory(w: IfcWriter, meta: OwnerHistoryMeta): number {
  const orgId = writeOrganization(w, meta.organizationName);
  const appId = writeApplication(w, meta);

  const addressRefs = writePersonAddresses(w, meta.author.email);

  const personId = w.nextId();
  w.writeLine({
    expressID: personId,
    type: WebIFC.IFCPERSON,
    Identification: null,
    FamilyName: optionalLabel(w, meta.author.familyName),
    GivenName: optionalLabel(w, meta.author.givenName),
    MiddleNames: null,
    PrefixTitles: null,
    SuffixTitles: null,
    Roles: null,
    Addresses: addressRefs,
  });

  const personAndOrgId = w.nextId();
  w.writeLine({
    expressID: personAndOrgId,
    type: WebIFC.IFCPERSONANDORGANIZATION,
    ThePerson: w.ref(personId),
    TheOrganization: w.ref(orgId),
    Roles: null,
  });

  const ownerHistoryId = w.nextId();
  w.writeLine({
    expressID: ownerHistoryId,
    type: WebIFC.IFCOWNERHISTORY,
    OwningUser: w.ref(personAndOrgId),
    OwningApplication: w.ref(appId),
    State: null,
    ChangeAction: { type: 3, value: 'ADDED' },
    LastModifiedDate: null,
    LastModifyingUser: null,
    LastModifyingApplication: null,
    CreationDate: w.mkType(WebIFC.IFCTIMESTAMP, meta.creationTimestamp ?? 0),
  });

  return ownerHistoryId;
}

/** Writes an IfcOrganization and returns its express id. */
function writeOrganization(w: IfcWriter, name: string): number {
  const orgId = w.nextId();
  w.writeLine({
    expressID: orgId,
    type: WebIFC.IFCORGANIZATION,
    Identification: null,
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    Roles: null,
    Addresses: null,
  });
  return orgId;
}

/** Writes the IfcApplication (with its developer IfcOrganization) and returns its express id. */
function writeApplication(w: IfcWriter, meta: OwnerHistoryMeta): number {
  const appOrgId = writeOrganization(w, meta.applicationName);
  const appId = w.nextId();
  w.writeLine({
    expressID: appId,
    type: WebIFC.IFCAPPLICATION,
    ApplicationDeveloper: w.ref(appOrgId),
    Version: w.mkType(WebIFC.IFCLABEL, meta.applicationVersion),
    ApplicationFullName: w.mkType(WebIFC.IFCLABEL, meta.applicationName),
    ApplicationIdentifier: w.mkType(WebIFC.IFCIDENTIFIER, meta.applicationName),
  });
  return appId;
}

/** Emits an IfcTelecomAddress when an email is present, returning the Addresses set. */
function writePersonAddresses(
  w: IfcWriter,
  email: string | undefined
): InstanceType<typeof Handle>[] | null {
  if (email === undefined || email.length === 0) return null;
  const addressId = w.nextId();
  w.writeLine({
    expressID: addressId,
    type: WebIFC.IFCTELECOMADDRESS,
    Purpose: null,
    Description: null,
    UserDefinedPurpose: null,
    TelephoneNumbers: null,
    FacsimileNumbers: null,
    PagerNumber: null,
    ElectronicMailAddresses: [w.mkType(WebIFC.IFCLABEL, email)],
    WWWHomePageURL: null,
    MessagingIDs: null,
  });
  return [w.ref(addressId)];
}

function optionalLabel(w: IfcWriter, value: string | undefined): Record<string, unknown> | null {
  if (value === undefined || value.length === 0) return null;
  return w.mkType(WebIFC.IFCLABEL, value);
}
