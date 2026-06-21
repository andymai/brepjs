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
// empty edge list → FILLET_NO_EDGES
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
    id: 'zero-extrude',
    expect: { code: 'EXTRUDE_ZERO_VECTOR' },
    source: `import { drawRoundedRectangle } from 'brepjs';
// sketch extruded by 0 — the common version of the zero-length mistake (EXTRUDE_ZERO_VECTOR,
// distinct from the sweepFns ZERO_LENGTH_EXTRUSION).
export default () => drawRoundedRectangle(40, 20, 4).sketchOnPlane('XY').extrude(0);`,
  },
  {
    id: 'bad-expected-key',
    expect: { code: 'EXPECTED_UNKNOWN_KEY' },
    source: `import { box } from 'brepjs';
export default () => box(10, 10, 10);
// wrong bounds shape — { min, max } instead of { xMin, ... } → EXPECTED_UNKNOWN_KEY.
export const expected = { bounds: { min: 0, max: 10 } };`,
  },
  {
    id: 'dup-vertex',
    expect: { code: 'DEGENERATE_EDGE' },
    source: `import { polygon, extrude, unwrap } from 'brepjs';
// coincident consecutive points ([10,0] repeated) → a zero-length edge: the kernel throws
// 'makeLineEdge: construction failed' with no code → classified as DEGENERATE_EDGE. Common in
// computed tooth/gear loops where a land and a groove point land on the same coordinate.
export default () => {
  const pts: [number, number, number][] = [
    [0, 0, 0], [10, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0],
  ];
  return unwrap(extrude(unwrap(polygon(pts)), 5));
};`,
  },
];
