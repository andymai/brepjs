import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'yaml';

// The plugin installs from git into a directory outside this repo, without the gitignored
// `reference/` build output. Flat installers (APM) copy each skill directory into the project's
// skills folder and parse its frontmatter with a strict YAML reader.
const PKG = resolve(import.meta.dirname, '..');

const SKILLS = readdirSync(join(PKG, 'skills'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const PLUGIN_FILES = [
  ...SKILLS.map((s) => join('skills', s, 'SKILL.md')),
  ...readdirSync(join(PKG, 'agents')).map((f) => join('agents', f)),
  ...readdirSync(join(PKG, 'commands')).map((f) => join('commands', f)),
];

function frontmatter(file: string): Record<string, unknown> {
  const text = readFileSync(join(PKG, file), 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match?.[1]) throw new Error(`${file}: no frontmatter`);
  return parse(match[1]) as Record<string, unknown>;
}

describe('plugin files', () => {
  it.each(PLUGIN_FILES)('%s has frontmatter that parses as YAML', (file) => {
    expect(typeof frontmatter(file).description).toBe('string');
  });

  it.each(SKILLS)('skill %s is named after its directory, with the brepjs- prefix', (dir) => {
    expect(dir.startsWith('brepjs-')).toBe(true);
    expect(frontmatter(join('skills', dir, 'SKILL.md')).name).toBe(dir);
  });

  it('plugin.json lists every skill directory', () => {
    const manifest = JSON.parse(
      readFileSync(join(PKG, '.claude-plugin', 'plugin.json'), 'utf8')
    ) as { skills: string[] };
    expect([...manifest.skills].sort()).toEqual(SKILLS.map((s) => `./skills/${s}`));
  });

  it.each(PLUGIN_FILES)('%s does not point at paths that exist only in the brepjs repo', (file) => {
    const text = readFileSync(join(PKG, file), 'utf8');
    expect(text).not.toMatch(/packages\/brepjs-cad\//);
    expect(text).not.toMatch(/(^|[\s`(])reference\/llms/);
  });

  it.each(SKILLS)('skill %s links only to sibling skill files that exist', (dir) => {
    const text = readFileSync(join(PKG, 'skills', dir, 'SKILL.md'), 'utf8');
    for (const [, rel] of text.matchAll(/`(\.\.\/[\w./-]+)`/g)) {
      if (rel === undefined) continue;
      expect(existsSync(resolve(dirname(join(PKG, 'skills', dir, 'SKILL.md')), rel)), rel).toBe(
        true
      );
    }
  });
});
