import type { ImportedElement, ImportedModel } from '../import/importedModel.js';
import { issue, type ValidationIssue } from '../validation/severity.js';
import type {
  IdsCheckReport,
  IdsCheckResult,
  IdsFacet,
  IdsSpecification,
} from './idsTypes.js';
import {
  evalAttributeFacet,
  evalClassificationFacet,
  evalEntityFacet,
  evalMaterialFacet,
  evalPropertyFacet,
  isValidPattern,
} from './idsFacets.js';
import type { IdsDocument } from './idsTypes.js';

/**
 * Checks an imported model against an IDS document, returning a per-specification
 * pass/fail report keyed by the specification name. The check is synchronous,
 * never throws, and surfaces all problems as {@link ValidationIssue}s.
 *
 * For each specification the applicability facets select the matching elements,
 * then the requirement facets are evaluated against each applicable element per
 * the spec's cardinality:
 * - `required` — every applicable element must satisfy all requirements
 *   (a failure is an `error`).
 * - `optional` — requirement failures are reported as `info` and never fail.
 * - `prohibited` — an applicable element that *does* satisfy the requirements is
 *   a violation (`error`).
 *
 * Unsupported facet features (the `PartOf` facet, numeric-bound restrictions,
 * and invalid `xs:pattern` dialects) are recorded in
 * {@link IdsCheckReport.unsupportedFacets} and the affected requirement is
 * skipped rather than failing the element.
 */
export function checkModelAgainstIds(model: ImportedModel, ids: IdsDocument): IdsCheckReport {
  const unsupportedFacets: string[] = [];
  const results = ids.specifications.map((spec) =>
    checkSpecification(model.elements, spec, unsupportedFacets)
  );
  return {
    pass: results.every((r) => r.pass),
    results,
    unsupportedFacets,
  };
}

function checkSpecification(
  elements: readonly ImportedElement[],
  spec: IdsSpecification,
  unsupportedFacets: string[]
): IdsCheckResult {
  const issues: ValidationIssue[] = [];

  // Surface unsupported facet features up front so they are reported even when
  // the spec matches no elements (PartOf, invalid xs:pattern dialects).
  scanUnsupported(spec, unsupportedFacets, issues);

  const applicable = elements.filter((el) =>
    spec.applicability.every((facet) =>
      evalFacet(el, facet, spec.name, unsupportedFacets, issues, 'applicability', spec.cardinality)
    )
  );

  let passedCount = 0;
  let failedCount = 0;

  for (const el of applicable) {
    const satisfies = spec.requirements.every((facet) =>
      evalFacet(el, facet, spec.name, unsupportedFacets, issues, 'requirement', spec.cardinality)
    );

    const ok = satisfiesCardinality(spec.cardinality, satisfies);
    if (ok) {
      passedCount += 1;
      continue;
    }
    failedCount += 1;
    issues.push(failureIssue(spec, el));
  }

  const pass = spec.cardinality === 'optional' ? true : failedCount === 0;
  return {
    specificationName: spec.name,
    pass,
    applicableCount: applicable.length,
    passedCount,
    failedCount,
    issues,
  };
}

/**
 * Records every unsupported facet feature in the spec before element evaluation,
 * so the report flags them regardless of whether any element is applicable.
 */
function scanUnsupported(
  spec: IdsSpecification,
  unsupportedFacets: string[],
  issues: ValidationIssue[]
): void {
  for (const facet of [...spec.applicability, ...spec.requirements]) {
    if (facet.kind === 'PartOf') {
      markUnsupported(`PartOf in "${spec.name}"`, unsupportedFacets, issues, spec.name);
      continue;
    }
    const restrictions = restrictionsOf(facet);
    for (const r of restrictions) {
      if (r.kind === 'pattern' && !isValidPattern(r.pattern)) {
        markUnsupported(`unsupported pattern in "${spec.name}"`, unsupportedFacets, issues, spec.name);
      }
    }
  }
}

/** Collects the pattern restrictions carried by a facet for validation. */
function restrictionsOf(
  facet: IdsFacet
): ReadonlyArray<{ readonly kind: string; readonly pattern: string }> {
  const out: { readonly kind: string; readonly pattern: string }[] = [];
  const push = (r: { readonly kind: string; readonly pattern?: string } | undefined): void => {
    if (r?.kind === 'pattern' && r.pattern !== undefined) out.push({ kind: r.kind, pattern: r.pattern });
  };
  switch (facet.kind) {
    case 'Entity':
      push(facet.name);
      push(facet.predefinedType);
      break;
    case 'Attribute':
      push(facet.name);
      push(facet.value);
      break;
    case 'Property':
      push(facet.psetName);
      push(facet.baseName);
      push(facet.value);
      break;
    case 'Classification':
      push(facet.system);
      push(facet.value);
      break;
    case 'Material':
      push(facet.value);
      break;
    case 'PartOf':
      break;
  }
  return out;
}

function satisfiesCardinality(cardinality: IdsSpecification['cardinality'], satisfies: boolean): boolean {
  switch (cardinality) {
    case 'required':
    case 'optional':
      return satisfies;
    case 'prohibited':
      return !satisfies;
  }
}

function failureIssue(spec: IdsSpecification, el: ImportedElement): ValidationIssue {
  if (spec.cardinality === 'prohibited') {
    return issue(
      'error',
      'IDS_PROHIBITED_SATISFIED',
      `Element ${el.name || el.guid} satisfies prohibited requirements of "${spec.name}"`,
      el.expressId,
      { specification: spec.name, guid: el.guid }
    );
  }
  const severity = spec.cardinality === 'optional' ? 'info' : 'error';
  return issue(
    severity,
    'IDS_REQUIREMENT_FAILED',
    `Element ${el.name || el.guid} fails requirements of "${spec.name}"`,
    el.expressId,
    { specification: spec.name, guid: el.guid }
  );
}

/**
 * Evaluates one facet against one element. Unsupported facets register a note in
 * `unsupportedFacets` (once per spec) and resolve to `true` so they never cause a
 * spurious failure — the limitation is surfaced via the report's
 * `unsupportedFacets` list and a per-spec warning issue.
 */
function evalFacet(
  el: ImportedElement,
  facet: IdsFacet,
  specName: string,
  unsupportedFacets: string[],
  issues: ValidationIssue[],
  role: 'applicability' | 'requirement',
  cardinality: IdsSpecification['cardinality']
): boolean {
  switch (facet.kind) {
    case 'Entity':
      return guardPatterns([facet.name, facet.predefinedType], specName, unsupportedFacets, issues, () =>
        evalEntityFacet(el, facet.name, facet.predefinedType)
      );
    case 'Attribute':
      return guardPatterns([facet.name, facet.value], specName, unsupportedFacets, issues, () =>
        evalAttributeFacet(el, facet.name, facet.value)
      );
    case 'Property':
      return guardPatterns([facet.psetName, facet.baseName, facet.value], specName, unsupportedFacets, issues, () =>
        evalPropertyFacet(el, facet.psetName, facet.baseName, facet.value)
      );
    case 'Classification':
      return guardPatterns([facet.system, facet.value], specName, unsupportedFacets, issues, () =>
        evalClassificationFacet(el, facet.system, facet.value)
      );
    case 'Material':
      return guardPatterns([facet.value], specName, unsupportedFacets, issues, () =>
        evalMaterialFacet(el, facet.value)
      );
    case 'PartOf':
      markUnsupported(`PartOf in "${specName}"`, unsupportedFacets, issues, specName);
      // Applicability: non-matching, to avoid over-broad selection. Requirement:
      // neutral per cardinality — 'required'/'optional' treat the unevaluable
      // facet as satisfied (no failure), but 'prohibited' must NOT, else it would
      // raise a false violation for a requirement it cannot actually evaluate.
      if (role === 'applicability') return false;
      return cardinality !== 'prohibited';
  }
}

// Like guardPattern but checks several restriction slots of one facet: if ANY
// carries an unsupported regex pattern the whole facet is marked unsupported and
// resolves safely, instead of silently failing the element via safePatternTest.
function guardPatterns(
  restrictions: ReadonlyArray<{ readonly kind: string; readonly pattern?: string } | undefined>,
  specName: string,
  unsupportedFacets: string[],
  issues: ValidationIssue[],
  evaluate: () => boolean
): boolean {
  for (const r of restrictions) {
    if (r !== undefined && r.kind === 'pattern' && r.pattern !== undefined && !isValidPattern(r.pattern)) {
      markUnsupported(`unsupported pattern in "${specName}"`, unsupportedFacets, issues, specName);
      return true;
    }
  }
  return evaluate();
}

function markUnsupported(
  label: string,
  unsupportedFacets: string[],
  issues: ValidationIssue[],
  specName: string
): void {
  if (unsupportedFacets.includes(label)) return;
  unsupportedFacets.push(label);
  issues.push(
    issue('warning', 'IDS_UNSUPPORTED_FACET', `Unsupported facet feature skipped: ${label}`, specName)
  );
}
