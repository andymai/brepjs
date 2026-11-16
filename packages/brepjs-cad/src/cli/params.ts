import { InvalidArgumentError } from 'commander';

/** Commander collector for a repeatable `--param name=value` flag. */
export function collectParam(
  value: string,
  previous: Record<string, string> = {}
): Record<string, string> {
  const eq = value.indexOf('=');
  if (eq <= 0) throw new InvalidArgumentError(`expected name=value, got "${value}"`);
  return { ...previous, [value.slice(0, eq)]: value.slice(eq + 1) };
}

export const PARAM_FLAG = '--param <name=value>';
export const PARAM_HELP =
  'set a parameter the part declares with defineParams (repeat the flag for more than one)';
