/**
 * Single-candidate validator used by the scad-to-playground workflow.
 *
 * The workflow writes a candidate example's source to a file and runs:
 *   CANDIDATE_FILE=tmp/candidates/<id>.ts npx vitest run tests/validateCandidate.test.ts
 *
 * It passes only if the candidate evaluates and produces a non-empty mesh —
 * the same check the permanent suite applies, but against an un-integrated file
 * so failures never touch the committed example set. With no CANDIDATE_FILE set
 * (the normal test run) the whole suite skips, so it never gates ordinary CI.
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { initOC } from './setup.js';
import { evalAndMeshExample } from './helpers/playgroundExampleEval.js';

const candidateFile = process.env.CANDIDATE_FILE;

beforeAll(async () => {
  await initOC();
}, 60000);

describe.skipIf(!candidateFile)('candidate playground example', () => {
  it('evaluates and meshes', async () => {
    const code = readFileSync(candidateFile as string, 'utf-8');
    const { shapeCount, totalVertices } = await evalAndMeshExample(code);
    expect(shapeCount).toBeGreaterThan(0);
    expect(totalVertices).toBeGreaterThan(0);
  });
});
