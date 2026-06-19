import { describe, it, expect } from 'vitest';
import { skillVersion } from '../bench/skillVersion.js';

// The skill version stamps every eval run so score movements are attributable to a specific SKILL.md
// edit. It must be a pure function of the skill content + package version (no clock, no env).

describe('skillVersion', () => {
  it('is stable for the same skill content + package version', () => {
    expect(skillVersion('# Skill\nauthoring rules', '1.2.3')).toBe(
      skillVersion('# Skill\nauthoring rules', '1.2.3')
    );
  });

  it('changes when the skill content changes', () => {
    expect(skillVersion('rules A', '1.0.0')).not.toBe(skillVersion('rules B', '1.0.0'));
  });

  it('changes when the package version changes', () => {
    expect(skillVersion('same', '1.0.0')).not.toBe(skillVersion('same', '1.0.1'));
  });

  it('embeds the package version for readability', () => {
    expect(skillVersion('x', '9.9.9')).toContain('9.9.9');
  });
});
