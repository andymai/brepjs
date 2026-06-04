import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';

describe('snapshot dependency guard', () => {
  let stderr: string;
  const writeSpy = vi.spyOn(process.stderr, 'write');

  beforeEach(() => {
    stderr = '';
    process.exitCode = undefined;
    writeSpy.mockImplementation((chunk: unknown) => {
      stderr += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    writeSpy.mockReset();
    process.exitCode = undefined;
    vi.resetModules();
    vi.doUnmock('../src/snapshot/shoot.js');
  });

  afterAll(() => {
    writeSpy.mockRestore();
  });

  it('prints a friendly message and sets a non-zero exit code when puppeteer is missing', async () => {
    vi.doMock('../src/snapshot/shoot.js', () => {
      throw new Error("Cannot find package 'puppeteer'");
    });
    const { loadSnapshotShoot } = await import('../src/cli/main.js');

    let shoot: unknown;
    await expect((async () => {
      shoot = await loadSnapshotShoot();
    })()).resolves.toBeUndefined();

    expect(shoot).toBeUndefined();
    expect(process.exitCode).toBe(1);
    expect(stderr).toContain('snapshots need puppeteer/Chrome');
    expect(stderr).toContain('npm i puppeteer');
  });
});
