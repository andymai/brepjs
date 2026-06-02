export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  readonly code: string;
  readonly severity: ValidationSeverity;
  readonly message: string;
  readonly entity?: string | number;
  readonly context?: Readonly<Record<string, unknown>>;
}

export interface ValidationReport {
  readonly issues: readonly ValidationIssue[];
}

export function issue(
  severity: ValidationSeverity,
  code: string,
  message: string,
  entity?: string | number,
  context?: Readonly<Record<string, unknown>>,
): ValidationIssue {
  // entity/context are exactOptionalPropertyTypes-sensitive: omit when undefined.
  const base: ValidationIssue = { severity, code, message };
  return {
    ...base,
    ...(entity !== undefined ? { entity } : {}),
    ...(context !== undefined ? { context } : {}),
  };
}

export function emptyReport(): ValidationReport {
  return { issues: [] };
}

export function appendIssue(report: ValidationReport, next: ValidationIssue): ValidationReport {
  return { issues: [...report.issues, next] };
}

export function appendIssues(
  report: ValidationReport,
  next: readonly ValidationIssue[],
): ValidationReport {
  if (next.length === 0) return report;
  return { issues: [...report.issues, ...next] };
}

export function hasErrors(report: ValidationReport): boolean {
  return report.issues.some((i) => i.severity === 'error');
}

export type SeverityCounts = Readonly<Record<ValidationSeverity, number>>;

export function countBySeverity(report: ValidationReport): SeverityCounts {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const i of report.issues) {
    counts[i.severity] += 1;
  }
  return counts;
}
