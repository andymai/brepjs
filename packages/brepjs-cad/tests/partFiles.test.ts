import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPartFiles, PublishError } from '@/publish/partFiles.js';

const fix = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));

describe('collectPartFiles', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'brep-part-files-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const write = (path: string, text: string) => {
    const full = join(dir, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, text);
    return full;
  };

  it('emits the entry and the files it imports as browser modules', async () => {
    const part = await collectPartFiles(fix('paramPlate/plate.brep.ts'), '../brepjs.js');
    expect(part.entry).toBe('plate.brep.js');
    expect(part.files.map((f) => [f.path, f.outPath])).toEqual([
      ['lib/holes.ts', 'lib/holes.js'],
      ['plate.brep.ts', 'plate.brep.js'],
    ]);
    const entry = part.files.find((f) => f.outPath === part.entry);
    expect(entry?.js).toContain('from "../brepjs.js"');
    expect(entry?.js).toContain('from "./lib/holes.js"');
    expect(entry?.js).not.toContain("'brepjs'");
    expect(entry?.text).toContain("from 'brepjs'");
  });

  it('removes the types', async () => {
    const part = await collectPartFiles(fix('paramPlate/plate.brep.ts'), '../brepjs.js');
    const holes = part.files.find((f) => f.outPath === 'lib/holes.js');
    expect(holes?.js).not.toContain('BoltSize');
    expect(holes?.js).toContain('export function clearanceRadius(size)');
  });

  it('points brepjs at the bundle from a file in a subdirectory', async () => {
    write(
      'lib/shape.ts',
      "import { box } from 'brepjs';\nexport const cube = () => box(1, 1, 1);\n"
    );
    const entry = write(
      'part.brep.ts',
      "import { cube } from './lib/shape';\nexport default () => cube();\n"
    );
    const part = await collectPartFiles(entry, '../brepjs.js');
    expect(part.files.find((f) => f.outPath === 'lib/shape.js')?.js).toContain(
      'from "../../brepjs.js"'
    );
    expect(part.files.find((f) => f.outPath === 'part.brep.js')?.js).toContain(
      'from "./lib/shape.js"'
    );
  });

  it('keeps a file above the entry directory inside the part root', async () => {
    write('shared/size.ts', 'export const SIZE = 5;\n');
    const entry = write(
      'parts/cube.brep.ts',
      "import { box } from 'brepjs';\nimport { SIZE } from '../shared/size.js';\nexport default () => box(SIZE, SIZE, SIZE);\n"
    );
    const part = await collectPartFiles(entry, '../brepjs.js');
    expect(part.entry).toBe('parts/cube.brep.js');
    expect(part.files.map((f) => f.outPath)).toEqual(['parts/cube.brep.js', 'shared/size.js']);
    const js = part.files.find((f) => f.outPath === part.entry)?.js;
    expect(js).toContain('from "../shared/size.js"');
    expect(js).toContain('from "../../brepjs.js"');
  });

  it('follows an import cycle once', async () => {
    write(
      'a.ts',
      "import { b } from './b.js';\nexport const a = 1;\nexport const viaB = () => b;\n"
    );
    write(
      'b.ts',
      "import { a } from './a.js';\nexport const b = 2;\nexport const viaA = () => a;\n"
    );
    const entry = write('part.brep.ts', "import { a } from './a.js';\nexport default () => a;\n");
    const part = await collectPartFiles(entry, '../brepjs.js');
    expect(part.files.map((f) => f.outPath)).toEqual(['a.js', 'b.js', 'part.brep.js']);
  });

  it('rejects an import of a package other than brepjs', async () => {
    const entry = write(
      'part.brep.ts',
      "import { box } from 'brepjs';\nimport _ from 'lodash';\nexport default () => box(_.clamp(1, 1, 2), 1, 1);\n"
    );
    await expect(collectPartFiles(entry, '../brepjs.js')).rejects.toMatchObject({
      name: 'PublishError',
      code: 'PUBLISH_UNSUPPORTED_IMPORT',
    });
    await expect(collectPartFiles(entry, '../brepjs.js')).rejects.toBeInstanceOf(PublishError);
  });

  it('rejects an import() with a computed path', async () => {
    write('lib/shape.ts', 'export const size = 1;\n');
    const entry = write(
      'part.brep.ts',
      "const path = './lib/shape.js';\nexport default async () => (await import(path)).size;\n"
    );
    await expect(collectPartFiles(entry, '../brepjs.js')).rejects.toMatchObject({
      code: 'PUBLISH_UNSUPPORTED_IMPORT',
      message: expect.stringContaining('not a string literal') as string,
    });
  });

  it('follows an import() with a literal path', async () => {
    write('lib/shape.ts', 'export const size = 1;\n');
    const entry = write(
      'part.brep.ts',
      "export default async () => (await import('./lib/shape')).size;\n"
    );
    const part = await collectPartFiles(entry, '../brepjs.js');
    expect(part.files.map((f) => f.outPath)).toEqual(['lib/shape.js', 'part.brep.js']);
    expect(part.files.find((f) => f.outPath === part.entry)?.js).toContain(
      'import("./lib/shape.js")'
    );
  });

  it('rejects two files that become the same page file', async () => {
    write('shape.ts', 'export const a = 1;\n');
    write('shape.mjs', 'export const b = 2;\n');
    const entry = write(
      'part.brep.ts',
      "import { a } from './shape.ts';\nimport { b } from './shape.mjs';\nexport default () => a + b;\n"
    );
    await expect(collectPartFiles(entry, '../brepjs.js')).rejects.toMatchObject({
      code: 'PUBLISH_PATH_COLLISION',
    });
  });

  it('rejects a relative import with no source file', async () => {
    const entry = write(
      'part.brep.ts',
      "import data from './data.json';\nexport default () => data;\n"
    );
    await expect(collectPartFiles(entry, '../brepjs.js')).rejects.toMatchObject({
      code: 'PUBLISH_IMPORT_NOT_FOUND',
    });
  });
});
