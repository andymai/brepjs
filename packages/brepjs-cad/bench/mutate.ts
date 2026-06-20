// Known-bad fixtures for the verify-heal precision/recall harness (bench/verifyEval.ts).
//
// Each fixture is a minimal part that violates exactly ONE precondition and must fail the *right*
// way. The expected `code` is what a correct verifier SHOULD emit — defined by the geometry/intent,
// NOT read back from the hint table — so the eval measures the verifier, not its own prose. The
// codes are emitted by the real kernel/runtime (e.g. FILLET_NO_EDGES from modifierFns), independent
// of HINT_TABLE (which only supplies the actionable fix text).
//
// Maintenance: when a new failure code is added to the kernel/report, add a fixture here (and a
// good seed in the corpus that satisfies its precondition) — otherwise recall silently understates
// the gap. This set is a lower bound on coverage, not the whole failure surface.

export interface BadFixture {
  id: string;
  /** A correct verifier must mark this part invalid; if `code` is set, it must also emit that code. */
  expect: { code?: string };
  /** Type-check the part first (for TS-code fixtures like a missing import). */
  check?: boolean;
  source: string;
}

export const BAD_FIXTURES: BadFixture[] = [
  {
    id: 'fillet-no-edges',
    expect: { code: 'FILLET_NO_EDGES' },
    source: `import { box, fillet, unwrap } from 'brepjs';
// fillet with an empty edge list — the kernel rejects it (FILLET_NO_EDGES).
export default () => unwrap(fillet(box(10, 10, 10), [], 2));`,
  },
  {
    id: 'wrong-size',
    // No specific code: a valid solid whose declared bounds are wrong → a failed assertion.
    expect: {},
    source: `import { box } from 'brepjs';
export default () => box(10, 10, 10);
export const expected = { bounds: { xMax: 999 }, tolerancePct: 0.5 };`,
  },
  {
    id: 'missing-import',
    check: true,
    expect: { code: 'TYPECHECK' },
    source: `// 'box' is never imported — fails --check with TS2304 before any geometry runs.
export default () => box(10, 10, 10);`,
  },
  {
    id: 'bad-expected-key',
    expect: { code: 'EXPECTED_UNKNOWN_KEY' },
    source: `import { box } from 'brepjs';
export default () => box(10, 10, 10);
// wrong bounds shape — { min, max } instead of { xMin, ... } → EXPECTED_UNKNOWN_KEY.
export const expected = { bounds: { min: 0, max: 10 } };`,
  },
];
