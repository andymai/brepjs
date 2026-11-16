import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishPart, type PartManifest } from '@/publish/publish.js';

const fix = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));
// publishPart copies the page runtime, which exists only after `npm run build`.
const runtimeBuilt = existsSync(
  fileURLToPath(new URL('../viewer/dist/publish/index.html', import.meta.url))
);

describe.skipIf(!runtimeBuilt)('publishPart', () => {
  let out: string;
  beforeEach(() => {
    out = mkdtempSync(join(tmpdir(), 'brep-publish-'));
  });
  afterEach(() => {
    rmSync(out, { recursive: true, force: true });
  });

  it('writes a page that has all it needs to run', async () => {
    const result = await publishPart(fix('paramPlate/plate.brep.ts'), out, { title: 'Plate' });
    expect(result).toMatchObject({ ok: true, errors: [] });
    for (const file of [
      'index.html',
      'brepjs.js',
      'wasm/occt-wasm.js',
      'wasm/occt-wasm.wasm',
      'fonts/Inter-Bold.ttf',
      'fonts/Inter-LICENSE.txt',
      'part/plate.brep.js',
      'part/lib/holes.js',
      'part.json',
    ]) {
      expect(existsSync(join(out, file)), file).toBe(true);
    }
    const manifest = JSON.parse(readFileSync(join(out, 'part.json'), 'utf8')) as PartManifest;
    expect(manifest).toMatchObject({
      name: 'plate',
      title: 'Plate',
      entry: 'part/plate.brep.js',
      generator: { name: 'brepjs-cad' },
    });
    expect(manifest.sources.map((s) => s.path)).toEqual(['lib/holes.ts', 'plate.brep.ts']);
  }, 60000);

  it('uses the file name as the title by default', async () => {
    await publishPart(fix('paramBox.brep.ts'), out);
    const manifest = JSON.parse(readFileSync(join(out, 'part.json'), 'utf8')) as PartManifest;
    expect(manifest.title).toBe('paramBox');
  }, 60000);

  it('writes again into a directory that holds an earlier publish', async () => {
    await publishPart(fix('paramBox.brep.ts'), out);
    const again = await publishPart(fix('paramBox.brep.ts'), out);
    expect(again.ok).toBe(true);
  }, 60000);

  it('refuses a directory that holds other files', async () => {
    writeFileSync(join(out, 'notes.txt'), 'keep me');
    const result = await publishPart(fix('paramBox.brep.ts'), out);
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe('PUBLISH_OUT_NOT_EMPTY');
    expect(existsSync(join(out, 'index.html'))).toBe(false);
    expect(readFileSync(join(out, 'notes.txt'), 'utf8')).toBe('keep me');
  }, 60000);

  it('refuses a directory with a part.json from another tool', async () => {
    writeFileSync(join(out, 'part.json'), JSON.stringify({ name: 'theirs' }));
    writeFileSync(join(out, 'index.html'), '<p>theirs</p>');
    const result = await publishPart(fix('paramBox.brep.ts'), out);
    expect(result.errors[0]?.code).toBe('PUBLISH_OUT_NOT_EMPTY');
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toBe('<p>theirs</p>');
  }, 60000);

  it('writes into such a directory with force', async () => {
    writeFileSync(join(out, 'notes.txt'), 'keep me');
    const result = await publishPart(fix('paramBox.brep.ts'), out, { force: true });
    expect(result.ok).toBe(true);
    expect(readFileSync(join(out, 'notes.txt'), 'utf8')).toBe('keep me');
  }, 60000);

  it('does not publish a part that fails verification', async () => {
    const result = await publishPart(fix('filletFailed.brep.ts'), out);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(existsSync(join(out, 'index.html'))).toBe(false);
  }, 60000);
});
