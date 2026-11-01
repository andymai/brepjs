import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTelemetry } from '../bench/langfuse.js';
import { PLAYGROUND_DATASET } from '../bench/playgroundCorpus.js';
import type { EvalResult, Scorecard } from '../bench/score.js';

// pushDatasetRun against a local stand-in for the Langfuse API. Every Langfuse call in the bench is
// best-effort and only warns, so an SDK change that breaks the dataset link would otherwise pass
// silently: this pins that each part reaches its dataset item through the experiment runner, with
// its authored module as the output and its scores on that item's trace.

interface Captured {
  url: string;
  body: string;
}
interface OtlpSpan {
  name: string;
  traceId: string;
  attributes: { key: string; value: { stringValue?: string } }[];
}
interface OtlpExport {
  resourceSpans: { scopeSpans: { spans: OtlpSpan[] }[] }[];
}
interface ScoreRow {
  traceId: string;
  name: string;
  value: number;
}

const datasetItem = (id: string): Record<string, unknown> => ({
  id,
  datasetId: 'ds-1',
  datasetName: PLAYGROUND_DATASET,
  input: `make ${id}`,
  expectedOutput: 'reference module',
  metadata: { category: 'basics' },
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  sourceTraceId: null,
  sourceObservationId: null,
});

function respond(url: string): unknown {
  if (url.startsWith('/api/public/projects')) return { data: [{ id: 'proj-1', name: 'p' }] };
  if (url.includes('dataset-items')) {
    return {
      data: [datasetItem('part-a'), datasetItem('part-b')],
      meta: { page: 1, limit: 50, totalItems: 2, totalPages: 1 },
    };
  }
  if (url.includes('/datasets/')) {
    return {
      id: 'ds-1',
      name: PLAYGROUND_DATASET,
      projectId: 'proj-1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
  }
  if (url.startsWith('/api/public/scores')) return { accepted: 1, rejected: 0, errors: [] };
  return {};
}

const captured: Captured[] = [];
const server = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    const body = req.headers['content-encoding'] === 'gzip' ? gunzipSync(raw) : raw;
    const url = req.url ?? '';
    captured.push({ url, body: body.toString('utf8') });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(respond(url)));
  });
});

const ENV_KEYS = ['LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'LANGFUSE_BASE_URL'] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  process.env['LANGFUSE_PUBLIC_KEY'] = 'pk-lf-test';
  process.env['LANGFUSE_SECRET_KEY'] = 'sk-lf-test';
  process.env['LANGFUSE_BASE_URL'] = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const k of ENV_KEYS) {
    const v = savedEnv[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('createTelemetry: pushDatasetRun', () => {
  it('links each matching part to its dataset item and skips parts with no item', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const matched: EvalResult = {
      id: 'part-a',
      category: 'primitive',
      auto: { pass: true, failures: [] },
      judgePass: true,
      prompt: 'make part-a',
      code: 'AUTHORED-A',
    };
    const drifted: EvalResult = {
      id: 'not-in-dataset',
      category: 'primitive',
      auto: { pass: false, failures: [] },
      code: 'AUTHORED-X',
    };
    const card: Scorecard = {
      model: 'm',
      brepjsVersion: '0.0.0',
      skillVersion: 'skill-test',
      date: '2026-11-01',
      results: [matched, drifted],
    };

    const t = createTelemetry();
    const linked = await t.pushDatasetRun(card);
    await t.shutdown();
    const warnings = warn.mock.calls.map((c) => String(c[0]));
    warn.mockRestore();

    expect(linked).toBe(1);
    expect(warnings).toContain('langfuse: no dataset item for not-in-dataset, skipped');

    const spans = captured
      .filter((c) => c.url.includes('/otel/'))
      .flatMap((c) => (JSON.parse(c.body) as OtlpExport).resourceSpans)
      .flatMap((rs) => rs.scopeSpans.flatMap((ss) => ss.spans));
    const runs = spans.filter((s) => s.name === 'experiment-item-run');
    expect(runs).toHaveLength(1);
    const [run] = runs;
    const attr = (key: string): string | undefined =>
      run?.attributes.find((a) => a.key === key)?.value.stringValue;
    expect(attr('langfuse.experiment.item.id')).toBe('part-a');
    expect(attr('langfuse.experiment.dataset.id')).toBe('ds-1');
    expect(attr('langfuse.experiment.name')).toBe('skill-test');
    expect(attr('langfuse.observation.output')).toBe('AUTHORED-A');

    const scores = captured
      .filter((c) => c.url.startsWith('/api/public/scores'))
      .flatMap((c) => JSON.parse(c.body) as ScoreRow[]);
    const onRun = scores.filter((s) => s.traceId === run?.traceId);
    expect(Object.fromEntries(onRun.map((s) => [s.name, s.value]))).toEqual({
      auto_pass: 1,
      judge_pass: 1,
      eventual_both: 1,
    });
  });
});
