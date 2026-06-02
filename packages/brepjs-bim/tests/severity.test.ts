import { describe, it, expect } from 'vitest';
import {
  emptyReport,
  appendIssue,
  appendIssues,
  hasErrors,
  countBySeverity,
  issue,
  type ValidationIssue,
  type ValidationReport,
} from '../src/validation/severity.js';

describe('severity model', () => {
  describe('construction', () => {
    it('emptyReport has no issues', () => {
      const report = emptyReport();
      expect(report.issues).toEqual([]);
      expect(report.issues.length).toBe(0);
    });

    it('issue builds a ValidationIssue with required fields', () => {
      const i = issue('error', 'DUPLICATE_GUID', 'duplicate guid found');
      expect(i.severity).toBe('error');
      expect(i.code).toBe('DUPLICATE_GUID');
      expect(i.message).toBe('duplicate guid found');
      expect(i.entity).toBeUndefined();
    });

    it('issue carries optional entity', () => {
      const i = issue('warning', 'ORPHANED_OPENING', 'orphan', 42);
      expect(i.entity).toBe(42);
    });
  });

  describe('immutability', () => {
    it('appendIssue returns a new report without mutating the original', () => {
      const base = emptyReport();
      const i: ValidationIssue = issue('error', 'PARSE_FAILED', 'bad bytes');
      const next = appendIssue(base, i);

      expect(base.issues.length).toBe(0);
      expect(next.issues.length).toBe(1);
      expect(next).not.toBe(base);
      expect(next.issues[0]).toBe(i);
    });

    it('appendIssues appends many without mutating the original', () => {
      const base: ValidationReport = appendIssue(
        emptyReport(),
        issue('info', 'NOTE', 'first'),
      );
      const more: readonly ValidationIssue[] = [
        issue('error', 'A', 'a'),
        issue('warning', 'B', 'b'),
      ];
      const next = appendIssues(base, more);

      expect(base.issues.length).toBe(1);
      expect(next.issues.length).toBe(3);
      expect(next).not.toBe(base);
    });

    it('appendIssues with empty array returns an equivalent report', () => {
      const base = appendIssue(emptyReport(), issue('info', 'NOTE', 'x'));
      const next = appendIssues(base, []);
      expect(next.issues.length).toBe(1);
    });
  });

  describe('hasErrors', () => {
    it('is false for an empty report', () => {
      expect(hasErrors(emptyReport())).toBe(false);
    });

    it('is false when only warnings and info are present', () => {
      const report = appendIssues(emptyReport(), [
        issue('warning', 'W', 'w'),
        issue('info', 'I', 'i'),
      ]);
      expect(hasErrors(report)).toBe(false);
    });

    it('is true when at least one error is present', () => {
      const report = appendIssues(emptyReport(), [
        issue('warning', 'W', 'w'),
        issue('error', 'E', 'e'),
      ]);
      expect(hasErrors(report)).toBe(true);
    });
  });

  describe('countBySeverity', () => {
    it('counts each severity for an empty report', () => {
      const counts = countBySeverity(emptyReport());
      expect(counts).toEqual({ error: 0, warning: 0, info: 0 });
    });

    it('counts each severity across mixed issues', () => {
      const report = appendIssues(emptyReport(), [
        issue('error', 'E1', 'e1'),
        issue('error', 'E2', 'e2'),
        issue('warning', 'W1', 'w1'),
        issue('info', 'I1', 'i1'),
        issue('info', 'I2', 'i2'),
        issue('info', 'I3', 'i3'),
      ]);
      const counts = countBySeverity(report);
      expect(counts).toEqual({ error: 2, warning: 1, info: 3 });
    });
  });
});
