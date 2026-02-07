/**
 * Tests that every playground example code string actually runs successfully.
 *
 * This mirrors how the web worker evaluates examples: all brepjs exports are
 * placed on globalThis, then the code string is executed via `new Function(code)`.
 * This catches API mismatches that per-function unit tests would miss.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initOC } from './setup.js';
import * as brepjs from '../src/index.js';

// Read example code strings from the site source at test time.
// We parse the JS module as text to extract the code blocks, avoiding a
// cross-project import that breaks eslint's TypeScript project service.
function loadExampleCodes(): Array<{ id: string; code: string }> {
  const src = readFileSync(resolve(import.meta.dirname, '../site/src/lib/examples.ts'), 'utf-8');
  const constantsSrc = readFileSync(
    resolve(import.meta.dirname, '../site/src/lib/constants.ts'),
    'utf-8'
  );

  // Extract HERO_CODE from constants.ts
  const heroMatch = constantsSrc.match(/export const HERO_CODE = `([\s\S]*?)`;/);
  const heroCode = heroMatch ? heroMatch[1] : '';

  // Extract each example's id and code from the examples array
  const results: Array<{ id: string; code: string }> = [];
  const exampleRegex = /id:\s*'([^']+)',[\s\S]*?code:\s*(?:`([\s\S]*?)`|HERO_CODE)/g;
  let match;
  while ((match = exampleRegex.exec(src)) !== null) {
    const id = match[1];
    const code = match[2] ?? heroCode;
    results.push({ id, code });
  }
  return results;
}

const injectedKeys: string[] = [];

beforeAll(async () => {
  await initOC();

  // Inject all brepjs exports onto globalThis, just like the worker does.
  const g = globalThis as Record<string, unknown>;
  for (const [key, value] of Object.entries(brepjs)) {
    if (key === 'default') continue;
    g[key] = value;
    injectedKeys.push(key);
  }
}, 30000);

afterAll(() => {
  const g = globalThis as Record<string, unknown>;
  for (const key of injectedKeys) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete g[key];
  }
});

/**
 * Execute an example code string the same way the worker does:
 * wrap in `new Function()` and call it.
 */
function runExample(code: string): unknown {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- intentional: mirrors worker eval
  const fn = new Function(code);
  return fn();
}

describe('playground examples', () => {
  const examples = loadExampleCodes();

  // Spiral staircase (16 steps of boolean fuse) is slow
  const SLOW_IDS = new Set(['spiral-staircase']);

  for (const example of examples) {
    const timeout = SLOW_IDS.has(example.id) ? 60000 : 15000;

    it(
      `${example.id}: runs without error and returns geometry`,
      () => {
        const result = runExample(example.code);

        expect(result).toBeDefined();
        expect(result).not.toBeNull();

        // Every example should return something that brepjs identifies as a 3D shape
        const is3D = brepjs.isShape3D(result);
        const isSolid = brepjs.isSolid(result);
        expect(is3D || isSolid).toBe(true);
      },
      timeout
    );
  }
});
