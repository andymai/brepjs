import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

export const INTEROP_IFC = join(repoRoot, 'packages/brepjs-bim/examples/interop-fixture.ifc');

export interface BimProject {
  readonly dir: string;
  readonly model: string;
  /** Replace exactly one occurrence of `from` in the model source. */
  edit(from: string, to: string): void;
  cleanup(): void;
}

/**
 * A throwaway project: the bimProject model plus the starter-registry families copied in the way
 * `brepjs add` would, resolving brepjs, brepjs-families and zod through the repo's node_modules.
 */
export function makeBimProject(prefix: string): BimProject {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cpSync(fileURLToPath(new URL('./fixtures/bimProject', import.meta.url)), dir, {
    recursive: true,
  });
  cpSync(join(repoRoot, 'packages/brepjs-families/registry/families'), join(dir, 'families'), {
    recursive: true,
  });
  symlinkSync(join(repoRoot, 'node_modules'), join(dir, 'node_modules'), 'dir');
  const model = join(dir, 'model.tsx');
  return {
    dir,
    model,
    edit(from, to) {
      const src = readFileSync(model, 'utf8');
      if (src.split(from).length !== 2)
        throw new Error(`expected exactly one '${from}' in the model`);
      writeFileSync(model, src.replace(from, to));
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
