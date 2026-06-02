import type { ValidationIssue } from '../validation/severity.js';

/**
 * A value constraint on an IDS facet field. IDS expresses these either as a
 * literal `<simpleValue>` or as an `<xs:restriction>` carrying an enumeration or
 * a pattern. The numeric bound dialect (`xs:minInclusive` etc.) is intentionally
 * not modelled — facets that use it fall through to a `pattern`-less restriction
 * and are reported as unsupported by the checker.
 */
export type IdsRestriction =
  | { readonly kind: 'simple'; readonly value: string }
  | { readonly kind: 'enumeration'; readonly values: readonly string[] }
  | { readonly kind: 'pattern'; readonly pattern: string };

/**
 * The IDS facet kinds this subset understands. `PartOf` is parsed but always
 * reported as unsupported by the checker (spatial-tree resolution is out of
 * scope); every other kind is fully evaluated.
 */
export type IdsFacet =
  | { readonly kind: 'Entity'; readonly name: IdsRestriction; readonly predefinedType?: IdsRestriction | undefined }
  | { readonly kind: 'Attribute'; readonly name: IdsRestriction; readonly value?: IdsRestriction | undefined }
  | {
      readonly kind: 'Property';
      readonly psetName: IdsRestriction;
      readonly baseName: IdsRestriction;
      readonly value?: IdsRestriction | undefined;
    }
  | { readonly kind: 'Classification'; readonly system?: IdsRestriction | undefined; readonly value?: IdsRestriction | undefined }
  | { readonly kind: 'Material'; readonly value?: IdsRestriction | undefined }
  | { readonly kind: 'PartOf'; readonly relation?: string | undefined };

export type IdsCardinality = 'required' | 'optional' | 'prohibited';

export interface IdsSpecification {
  readonly name: string;
  readonly ifcVersion: readonly string[];
  /**
   * Cardinality of the *requirements* against applicable elements:
   * - `required` — every applicable element must satisfy all requirement facets.
   * - `optional` — requirements are informational; failures are reported as
   *   warnings and do not fail the spec.
   * - `prohibited` — applicable elements must *not* satisfy the requirements.
   */
  readonly cardinality: IdsCardinality;
  readonly applicability: readonly IdsFacet[];
  readonly requirements: readonly IdsFacet[];
}

export interface IdsDocument {
  readonly title: string;
  readonly specifications: readonly IdsSpecification[];
}

export interface IdsCheckResult {
  readonly specificationName: string;
  readonly pass: boolean;
  /** Number of model elements matched by the applicability facets. */
  readonly applicableCount: number;
  /** Applicable elements that satisfied the cardinality contract. */
  readonly passedCount: number;
  /** Applicable elements that violated the cardinality contract. */
  readonly failedCount: number;
  readonly issues: readonly ValidationIssue[];
}

export interface IdsCheckReport {
  readonly pass: boolean;
  readonly results: readonly IdsCheckResult[];
  /**
   * Human-readable identifiers of facet features that were encountered but not
   * evaluated (e.g. `PartOf in 'spec name'`). Their presence never aborts the
   * check; the affected requirement is skipped with a warning.
   */
  readonly unsupportedFacets: readonly string[];
}
