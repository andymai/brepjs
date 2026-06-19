import { createHash } from 'node:crypto';

/**
 * A stable identity for the skill prompt + library version, stamped on every eval run so score
 * movements are attributable to a specific SKILL.md edit — the mechanism that makes skill versions
 * A/B-comparable in Langfuse. Pure: a function of content only (no clock, no env), so the same skill
 * + version always hash the same. Hash the SKILL.md FILE bytes, never the assembled system prompt
 * (which appends a fixed instruction suffix) or a runtime-resolved version that can be 'unknown'.
 */
export function skillVersion(skillMd: string, pkgVersion: string): string {
  const hash = createHash('sha256').update(skillMd).digest('hex').slice(0, 8);
  return `${pkgVersion}+skill.${hash}`;
}
