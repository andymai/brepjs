import { describe, it, expect, beforeAll } from 'vitest';
import { pathToFileURL } from 'node:url';
// @ts-expect-error -- hand-authored ESM hook without type declarations
import { initialize, resolve } from '../src/loader/brepjsResolve.mjs';

type Resolution = { url: string };
type NextResolve = (specifier: string, context: { parentURL?: string }) => Promise<Resolution>;
type ResolveFn = (
  specifier: string,
  context: { parentURL?: string },
  next: NextResolve
) => Promise<Resolution>;

const TOOL = '/opt/npx-cache/node_modules/brepjs-cad';
const PROJECT = '/home/me/project';
const toolFile = pathToFileURL(`${TOOL}/dist/verify/brepjsRuntime.js`).href;
const partFile = pathToFileURL(`${PROJECT}/part.brep.ts`).href;

// Stands in for Node's resolver: a `brepjs` copy exists under each root listed in `installs`,
// and resolution walks up from the importing file the way node_modules lookup does.
function fakeResolver(installs: readonly string[]): NextResolve {
  return (specifier, context) => {
    const from = context.parentURL ? new URL(context.parentURL).pathname : '/';
    const root = installs
      .filter((dir) => from.startsWith(`${dir}/`))
      .sort((a, b) => b.length - a.length)[0];
    if (!root) return Promise.reject(new Error(`Cannot find package '${specifier}'`));
    return Promise.resolve({ url: pathToFileURL(`${root}/node_modules/${specifier}/dist/index.js`).href });
  };
}

const run = resolve as ResolveFn;

describe('brepjsResolve hook', () => {
  beforeAll(async () => {
    await (initialize as (data: unknown) => Promise<void>)({ toolDir: TOOL, projectDir: PROJECT });
  });

  it("binds the tool's own brepjs import to the project's copy when the project has one", async () => {
    const next = fakeResolver([TOOL, PROJECT]);
    const tool = await run('brepjs', { parentURL: toolFile }, next);
    const part = await run('brepjs', { parentURL: partFile }, next);
    expect(tool.url).toBe(part.url);
    expect(tool.url).toContain(`${PROJECT}/node_modules/brepjs`);
  });

  it('binds a part outside the project (an MCP sandbox under /tmp) to the project copy too', async () => {
    const next = fakeResolver([TOOL, PROJECT]);
    const sandboxPart = pathToFileURL('/tmp/brep-sandbox-1/part.brep.ts').href;
    const tool = await run('brepjs', { parentURL: toolFile }, next);
    const part = await run('brepjs', { parentURL: sandboxPart }, next);
    expect(part.url).toBe(tool.url);
    expect(part.url).toContain(`${PROJECT}/node_modules/brepjs`);
  });

  it('falls back to the bundled copy for both when the project has none', async () => {
    const next = fakeResolver([TOOL]);
    const tool = await run('brepjs', { parentURL: toolFile }, next);
    const part = await run('brepjs', { parentURL: partFile }, next);
    expect(tool.url).toBe(part.url);
    expect(tool.url).toContain(`${TOOL}/node_modules/brepjs`);
  });
});
