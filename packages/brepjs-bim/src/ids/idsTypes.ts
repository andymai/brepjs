import type { ValidationIssue } from '../validation/severity.js';

/**
 * A value constraint on an IDS facet field: a literal `<simpleValue>` or an
 * `<xs:restriction>` carrying any combination of enumeration, pattern, numeric
 * bounds, and length constraints. `base` is the xs type the restriction
 * declares (e.g. `xs:double`), which drives typed comparison.
 */
export interface IdsRestrictionConstraints {
  readonly base: string | undefined;
  readonly values?: readonly string[] | undefined;
  readonly pattern?: readonly string[] | undefined;
  readonly minInclusive?: number | undefined;
  readonly maxInclusive?: number | undefined;
  readonly minExclusive?: number | undefined;
  readonly maxExclusive?: number | undefined;
  readonly length?: number | undefined;
  readonly minLength?: number | undefined;
  readonly maxLength?: number | undefined;
}

export type IdsRestriction =
  | { readonly kind: 'simple'; readonly value: string }
  | ({ readonly kind: 'restriction' } & IdsRestrictionConstraints);

/** Cardinality of a specification or of an individual requirement facet. */
export type IdsCardinality = 'required' | 'optional' | 'prohibited';

export type IdsPartOfRelation =
  'IFCRELAGGREGATES' | 'IFCRELASSIGNSTOGROUP' | 'IFCRELCONTAINEDINSPATIALSTRUCTURE' | 'IFCRELNESTS';

export type IdsFacet =
  | {
      readonly kind: 'Entity';
      readonly name: IdsRestriction;
      readonly predefinedType?: IdsRestriction | undefined;
    }
  | {
      readonly kind: 'Attribute';
      readonly name: IdsRestriction;
      readonly value?: IdsRestriction | undefined;
      readonly cardinality: IdsCardinality;
    }
  | {
      readonly kind: 'Property';
      readonly psetName: IdsRestriction;
      readonly baseName: IdsRestriction;
      readonly value?: IdsRestriction | undefined;
      readonly dataType?: string | undefined;
      readonly cardinality: IdsCardinality;
    }
  | {
      readonly kind: 'Classification';
      readonly system?: IdsRestriction | undefined;
      readonly value?: IdsRestriction | undefined;
      readonly cardinality: IdsCardinality;
    }
  | {
      readonly kind: 'Material';
      readonly value?: IdsRestriction | undefined;
      readonly cardinality: IdsCardinality;
    }
  | {
      readonly kind: 'PartOf';
      readonly entity?:
        | { readonly name: IdsRestriction; readonly predefinedType?: IdsRestriction | undefined }
        | undefined;
      readonly relation?: IdsPartOfRelation | undefined;
      readonly cardinality: IdsCardinality;
    };

export interface IdsSpecification {
  readonly name: string;
  /** Declared schema versions. Purely metadata: never filters checking. */
  readonly ifcVersion: readonly string[];
  /**
   * Cardinality of the applicability set:
   * - `required` — at least one element must be applicable, and every
   *   applicable element must satisfy the requirements.
   * - `optional` — applicable elements must satisfy the requirements, but an
   *   empty applicability set still passes.
   * - `prohibited` — no element may match the applicability at all.
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
  /** Number of model entity instances matched by the applicability facets. */
  readonly applicableCount: number;
  /** Applicable instances that satisfied every requirement. */
  readonly passedCount: number;
  /** Applicable instances that violated at least one requirement. */
  readonly failedCount: number;
  readonly issues: readonly ValidationIssue[];
}

export interface IdsCheckReport {
  readonly pass: boolean;
  readonly results: readonly IdsCheckResult[];
  /**
   * Human-readable identifiers of facet features that were encountered but not
   * evaluated. Their presence never aborts the check; the affected requirement
   * is skipped with a warning.
   */
  readonly unsupportedFacets: readonly string[];
}
