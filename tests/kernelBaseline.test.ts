import { describe, expect, it } from 'vitest';
import {
  FILE_LEVEL,
  type KnownFailures,
  type Report,
  failuresByFile,
  findProblems,
  updatedList,
} from '../scripts/lib/kernelBaseline.js';

const ROOT = '/repo';

type Status = 'passed' | 'failed' | 'skipped';

function report(files: Record<string, Record<string, Status>>, crashed: string[] = []): Report {
  return {
    testResults: [
      ...Object.entries(files).map(([file, tests]) => ({
        name: `${ROOT}/${file}`,
        status: Object.values(tests).includes('failed') ? 'failed' : 'passed',
        assertionResults: Object.entries(tests).map(([title, status]) => ({
          ancestorTitles: ['suite'],
          title,
          status,
        })),
      })),
      ...crashed.map((file) => ({
        name: `${ROOT}/${file}`,
        status: 'failed',
        assertionResults: [],
      })),
    ],
  };
}

const known: KnownFailures = {
  kernel: 'brepkit',
  files: { 'tests/a.test.ts': { tracking: 'andymai/brepkit#1', tests: ['suite > broken'] } },
};

describe('findProblems', () => {
  it('passes when the failures match the list', () => {
    const results = failuresByFile(
      report({ 'tests/a.test.ts': { broken: 'failed', ok: 'passed' }, 'tests/b.test.ts': {} }),
      ROOT
    );
    expect(findProblems(known, results)).toEqual([]);
  });

  it('reports a failure the list does not hold', () => {
    const results = failuresByFile(
      report({ 'tests/a.test.ts': { broken: 'failed', ok: 'failed' } }),
      ROOT
    );
    expect(findProblems(known, results)).toEqual([
      'new brepkit failure: tests/a.test.ts :: suite > ok',
    ]);
  });

  it.each<Status>(['passed', 'skipped'])('reports a listed test that is now %s', (status) => {
    const results = failuresByFile(report({ 'tests/a.test.ts': { broken: status } }), ROOT);
    expect(findProblems(known, results)).toEqual([
      'listed test no longer fails: tests/a.test.ts :: suite > broken',
    ]);
  });

  it('reports a listed file that did not run', () => {
    const results = failuresByFile(report({ 'tests/b.test.ts': { ok: 'passed' } }), ROOT);
    expect(findProblems(known, results)).toEqual(['listed file did not run: tests/a.test.ts']);
  });

  it('reports a listed file without a tracking issue', () => {
    const untracked: KnownFailures = {
      kernel: 'brepkit',
      files: { 'tests/a.test.ts': { tracking: 'TODO', tests: ['suite > broken'] } },
    };
    const results = failuresByFile(report({ 'tests/a.test.ts': { broken: 'failed' } }), ROOT);
    expect(findProblems(untracked, results)).toEqual([
      'tests/a.test.ts has no tracking issue (owner/repo#number): "TODO"',
    ]);
  });

  it('names a file that fails outside any test', () => {
    const results = failuresByFile(report({}, ['tests/c.test.ts']), ROOT);
    expect(results.get('tests/c.test.ts')).toEqual(new Set([FILE_LEVEL]));
    expect(findProblems({ kernel: 'brepkit', files: {} }, results)).toEqual([
      `new brepkit failure: tests/c.test.ts :: ${FILE_LEVEL}`,
    ]);
  });
});

describe('updatedList', () => {
  it('keeps tracking issues, marks a new file TODO, and drops files with no failure', () => {
    const results = failuresByFile(
      report({
        'tests/a.test.ts': { broken: 'failed', ok: 'passed' },
        'tests/b.test.ts': { worse: 'failed' },
        'tests/d.test.ts': { ok: 'passed' },
      }),
      ROOT
    );
    expect(updatedList(known, results)).toEqual({
      kernel: 'brepkit',
      files: {
        'tests/a.test.ts': { tracking: 'andymai/brepkit#1', tests: ['suite > broken'] },
        'tests/b.test.ts': { tracking: 'TODO', tests: ['suite > worse'] },
      },
    });
  });
});
