import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readZip, writeZip, ZipError } from '@/session/zip.js';

const hasZipTools = (() => {
  try {
    execFileSync('zip', ['-v'], { stdio: 'ignore' });
    execFileSync('unzip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('zip', () => {
  it('reads back what it writes, names and bytes intact', () => {
    const files = new Map<string, Uint8Array | string>([
      ['bcf.version', '<?xml version="1.0"?><Version VersionId="3.0"/>'],
      ['3f2a/markup.bcf', 'ä é ü '.repeat(200)],
      ['3f2a/snapshot.png', new Uint8Array([137, 80, 78, 71, 0, 255])],
    ]);
    const back = readZip(writeZip(files));
    expect([...back.keys()]).toEqual([...files.keys()]);
    expect(Buffer.from(back.get('3f2a/markup.bcf') ?? []).toString('utf8')).toBe(
      'ä é ü '.repeat(200)
    );
    expect(Array.from(back.get('3f2a/snapshot.png') ?? [])).toEqual([137, 80, 78, 71, 0, 255]);
  });

  it('rejects bytes that are not an archive', () => {
    expect(() => readZip(new Uint8Array(64))).toThrow(ZipError);
  });

  it('stops an entry or an archive that expands past its limit', () => {
    // 10 kB of zeros deflates to a few dozen bytes: the shape of a decompression bomb.
    const bomb = writeZip(
      new Map([
        ['a.xml', new Uint8Array(10_000)],
        ['b.xml', new Uint8Array(10_000)],
      ])
    );
    expect(() => readZip(bomb, { entryBytes: 5_000 })).toThrow(/a\.xml expands past/);
    expect(() => readZip(bomb, { totalBytes: 15_000 })).toThrow(/b\.xml expands past/);
    expect(readZip(bomb, { entryBytes: 10_000, totalBytes: 20_000 }).size).toBe(2);
  });

  it.skipIf(!hasZipTools)('round-trips with the zip and unzip command-line tools', () => {
    const dir = mkdtempSync(join(tmpdir(), 'brepjs-cad-zip-'));
    try {
      writeFileSync(join(dir, 'ours.zip'), writeZip(new Map([['a/b.txt', 'hello from writeZip']])));
      expect(
        execFileSync('unzip', ['-p', join(dir, 'ours.zip'), 'a/b.txt'], { encoding: 'utf8' })
      ).toBe('hello from writeZip');
      writeFileSync(join(dir, 'x.txt'), 'deflate me '.repeat(500));
      writeFileSync(join(dir, 'y.txt'), 'stored');
      execFileSync('zip', ['-q', 'theirs.zip', 'x.txt'], { cwd: dir });
      execFileSync('zip', ['-q', '-0', 'theirs.zip', 'y.txt'], { cwd: dir });
      const theirs = readZip(readFileSync(join(dir, 'theirs.zip')));
      expect(Buffer.from(theirs.get('x.txt') ?? []).toString()).toBe('deflate me '.repeat(500));
      expect(Buffer.from(theirs.get('y.txt') ?? []).toString()).toBe('stored');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
