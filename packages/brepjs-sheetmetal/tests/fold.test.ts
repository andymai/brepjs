import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { isValid, measureVolume, isErr, unwrap } from 'brepjs';
import { author, unfold } from '../src/api.js';
import { fold, foldWithWarnings, partToFlatInput, patternToFlatInput } from '../src/foldFns.js';
import type { AuthorSpec } from '../src/authorFns.js';
import type { BendRule, FlatInput } from '../src/types.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const T = 1;
const R = 2;
const K = 0.44;
const rule: BendRule = { innerRadius: R, kFactor: K };
const DEV = (Math.PI / 180) * 90 * (R + K * T);

/**
 * The headline non-circular oracle: author(spec) → partA; unfold → the 2D flat
 * pattern; patternToFlatInput recovers the region tree FROM THE 2D GEOMETRY ALONE
 * (the outline wire + bend-line edges, plus the supplied rule); fold(recovered) →
 * partB. partB must reproduce partA's volume, validity, and bend/flange counts.
 *
 * This is non-circular because the FlatInput fed to fold is parsed back out of the
 * developed wire/edges — never read off partA's feature tree — so a bug in unfold's
 * 2D placement, in the parser, OR in fold breaks the assertion (see the perturbation
 * test below for proof the assertion has teeth).
 */
function roundTrip(name: string, spec: AuthorSpec): void {
  it(`${name}: fold(patternToFlatInput(unfold(author))) reproduces the part`, () => {
    const authored = author(spec);
    expect(authored.ok).toBe(true);
    if (isErr(authored)) return;
    const partA = authored.value;
    expect(partA.solid).toBeDefined();
    if (partA.solid === undefined) return;
    expect(isValid(partA.solid)).toBe(true);
    const volA = unwrap(measureVolume(partA.solid));

    const unfolded = unfold(partA);
    expect(unfolded.ok).toBe(true);
    if (isErr(unfolded)) return;

    // Recover the region tree from the 2D pattern. The rule is a legitimate input (a
    // flat pattern can't encode K-factor); everything geometric is parsed from the
    // wire/edges. Bend lines come out in spanning-tree order, all sharing `rule`.
    const flatInput = patternToFlatInput(unfolded.value.pattern, {
      thickness: T,
      ruleFor: () => rule,
    });
    expect(flatInput.ok).toBe(true);
    if (isErr(flatInput)) return;
    expect(flatInput.value.regions.length).toBe(partA.flanges.length);

    const folded = fold(flatInput.value);
    expect(folded.ok).toBe(true);
    if (isErr(folded)) return;
    const partB = folded.value;
    expect(partB.solid).toBeDefined();
    if (partB.solid === undefined) return;
    expect(isValid(partB.solid)).toBe(true);
    const volB = unwrap(measureVolume(partB.solid));

    expect(volB).toBeCloseTo(volA, 4);
    expect(partB.bends.length).toBe(partA.bends.length);
    expect(partB.flanges.length).toBe(partA.flanges.length);
  });
}

describe('round-trip oracle (a): author → unfold → patternToFlatInput → fold', () => {
  roundTrip('single 90° bracket', {
    thickness: T,
    base: { length: 40, width: 30 },
    flanges: [{ id: 'f', length: 18, angleDeg: 90, rule, side: 'xmax' }],
  });

  roundTrip('U-channel (chain: base → wall → return)', {
    thickness: T,
    base: { length: 40, width: 30 },
    flanges: [
      { id: 'wall', length: 20, angleDeg: 90, rule, side: 'xmax' },
      { id: 'return', length: 10, angleDeg: 90, rule, side: 'ymax', parent: 'wall' },
    ],
  });

  roundTrip('4-sided tray (branching)', {
    thickness: T,
    base: { length: 50, width: 40 },
    flanges: [
      { id: 'xn', length: 12, angleDeg: 90, rule, side: 'xmin' },
      { id: 'xp', length: 12, angleDeg: 90, rule, side: 'xmax' },
      { id: 'yn', length: 12, angleDeg: 90, rule, side: 'ymin' },
      { id: 'yp', length: 12, angleDeg: 90, rule, side: 'ymax' },
    ],
  });

  roundTrip('down-bend', {
    thickness: T,
    base: { length: 40, width: 20 },
    flanges: [{ id: 'd', length: 15, angleDeg: 90, rule, side: 'xmax', direction: 'down' }],
  });

  roundTrip('partial / offset flanges (two on one edge)', {
    thickness: T,
    base: { length: 40, width: 30 },
    flanges: [
      { id: 'a', length: 10, angleDeg: 90, rule, side: 'ymax', offset: 0, width: 15 },
      { id: 'b', length: 10, angleDeg: 90, rule, side: 'ymax', offset: 20, width: 15 },
    ],
  });
});

describe('round-trip oracle: the geometry recovered from the 2D pattern is correct', () => {
  // Asserts the parser reads the *right* numbers back out of the wire/edges (not the
  // feature tree): each recovered region's side/offset/span/length/direction must
  // equal the authored flange's. If unfold's 2D placement or the parser were wrong,
  // these would drift even when the volume happened to match.
  it('recovers side/offset/span/length for the chained U-channel', () => {
    const authored = author({
      thickness: T,
      base: { length: 40, width: 30 },
      flanges: [
        { id: 'wall', length: 20, angleDeg: 90, rule, side: 'xmax' },
        { id: 'return', length: 10, angleDeg: 90, rule, side: 'ymax', parent: 'wall' },
      ],
    });
    if (isErr(authored)) throw new Error('author failed');
    const unfolded = unfold(authored.value);
    if (isErr(unfolded)) throw new Error('unfold failed');

    const recovered = patternToFlatInput(unfolded.value.pattern, { thickness: T, ruleFor: () => rule });
    if (isErr(recovered)) throw new Error('patternToFlatInput failed');
    const [wall, ret] = recovered.value.regions;

    expect(recovered.value.baseLength).toBeCloseTo(40, 4);
    expect(recovered.value.width).toBeCloseTo(30, 4);

    expect(wall?.side).toBe('xmax');
    expect(wall?.offset).toBeCloseTo(0, 4);
    expect(wall?.width).toBeCloseTo(30, 4);
    expect(wall?.length).toBeCloseTo(20, 4);
    expect(wall?.parent).toBeUndefined();

    // The return folds off the wall's distal edge — recovered in the WALL's local
    // frame as `ymax`, exactly the authored attachment (a global-frame parser would
    // mislabel this `xmax`).
    expect(ret?.side).toBe('ymax');
    expect(ret?.parent).toBe(wall?.id);
    expect(ret?.length).toBeCloseTo(10, 4);
    expect(ret?.width).toBeCloseTo(30, 4);
  });

  // Demonstrates the oracle has teeth: a deliberately WRONG recovered FlatInput (the
  // flange length halved) folds to a measurably different volume, so the round-trip
  // assertion above would FAIL if the geometry were recovered incorrectly.
  it('a perturbed (wrong) flat input folds to a different volume', () => {
    const authored = author({
      thickness: T,
      base: { length: 40, width: 30 },
      flanges: [{ id: 'f', length: 18, angleDeg: 90, rule, side: 'xmax' }],
    });
    if (isErr(authored)) throw new Error('author failed');
    if (authored.value.solid === undefined) throw new Error('no solid');
    const volA = unwrap(measureVolume(authored.value.solid));

    const unfolded = unfold(authored.value);
    if (isErr(unfolded)) throw new Error('unfold failed');
    const recovered = patternToFlatInput(unfolded.value.pattern, { thickness: T, ruleFor: () => rule });
    if (isErr(recovered)) throw new Error('patternToFlatInput failed');

    const correct = fold(recovered.value);
    if (isErr(correct) || correct.value.solid === undefined) throw new Error('fold failed');
    expect(unwrap(measureVolume(correct.value.solid))).toBeCloseTo(volA, 4);

    const perturbed: FlatInput = {
      ...recovered.value,
      regions: recovered.value.regions.map((r) => ({ ...r, length: r.length / 2 })),
    };
    const wrong = fold(perturbed);
    if (isErr(wrong) || wrong.value.solid === undefined) throw new Error('fold failed');
    const volWrong = unwrap(measureVolume(wrong.value.solid));

    expect(Math.abs(volWrong - volA)).toBeGreaterThan(1);
  });

  // Teeth on a *branching* attribute, not just length: halving each tray flange's
  // recovered width shrinks every wall, so a mis-recovered width (or side) on the
  // four-sided tray diverges the folded volume — the round-trip oracle would catch it.
  it('a perturbed (wrong) tray width folds to a different volume', () => {
    const authored = author({
      thickness: T,
      base: { length: 50, width: 40 },
      flanges: [
        { id: 'xn', length: 12, angleDeg: 90, rule, side: 'xmin' },
        { id: 'xp', length: 12, angleDeg: 90, rule, side: 'xmax' },
        { id: 'yn', length: 12, angleDeg: 90, rule, side: 'ymin' },
        { id: 'yp', length: 12, angleDeg: 90, rule, side: 'ymax' },
      ],
    });
    if (isErr(authored)) throw new Error('author failed');
    if (authored.value.solid === undefined) throw new Error('no solid');
    const volA = unwrap(measureVolume(authored.value.solid));

    const unfolded = unfold(authored.value);
    if (isErr(unfolded)) throw new Error('unfold failed');
    const recovered = patternToFlatInput(unfolded.value.pattern, { thickness: T, ruleFor: () => rule });
    if (isErr(recovered)) throw new Error('patternToFlatInput failed');

    const correct = fold(recovered.value);
    if (isErr(correct) || correct.value.solid === undefined) throw new Error('fold failed');
    expect(unwrap(measureVolume(correct.value.solid))).toBeCloseTo(volA, 4);

    const perturbed: FlatInput = {
      ...recovered.value,
      regions: recovered.value.regions.map((r) =>
        r.width !== undefined ? { ...r, width: r.width / 2 } : r
      ),
    };
    const wrong = fold(perturbed);
    if (isErr(wrong) || wrong.value.solid === undefined) throw new Error('fold failed');
    expect(Math.abs(unwrap(measureVolume(wrong.value.solid)) - volA)).toBeGreaterThan(1);
  });
});

describe('round-trip oracle (b): stability under repeated fold/unfold', () => {
  it('fold → unfold → patternToFlatInput → fold keeps the volume stable', () => {
    const input: FlatInput = {
      thickness: T,
      baseLength: 40,
      width: 30,
      regions: [
        { id: 'wall', length: 20, angleDeg: 90, direction: 'up', rule, side: 'xmax' },
        { id: 'return', length: 10, angleDeg: 90, direction: 'up', rule, side: 'ymax', parent: 'wall' },
      ],
    };

    const first = fold(input);
    expect(first.ok).toBe(true);
    if (isErr(first)) return;
    if (first.value.solid === undefined) return;
    const vol1 = unwrap(measureVolume(first.value.solid));

    const reInput = partToFlatInput(first.value);
    expect(reInput.ok).toBe(true);
    if (isErr(reInput)) return;

    const second = fold(reInput.value);
    expect(second.ok).toBe(true);
    if (isErr(second)) return;
    if (second.value.solid === undefined) return;
    const vol2 = unwrap(measureVolume(second.value.solid));

    expect(vol2).toBeCloseTo(vol1, 4);
  });
});

describe('round-trip oracle (c): direct FlatInput volume invariant', () => {
  // Analytic check for an up-bend AND a down-bend: the folded solid is the union of
  // three prismatic pieces, so its volume is an exact analytic quantity (not merely
  // developedArea×thickness, which only holds at K=0.5). The base box is
  // baseLength×width×T; the flange flat is flangeLen×span×T; the bend patch is the
  // cylindrical annular sector swept by the fold, cross-section (θ/2)(outerR²−innerR²)
  // = θ·(R+T/2)·T. A down-bend folds the same material the other way, so the volume
  // is identical.
  it.each([
    { name: 'up-bend', direction: 'up' as const },
    { name: 'down-bend', direction: 'down' as const },
  ])('$name: folded volume = base + flange flat + bend patch', ({ direction }) => {
    const baseLength = 40;
    const width = 30;
    const flangeLen = 18;
    const span = width;
    const input: FlatInput = {
      thickness: T,
      baseLength,
      width,
      regions: [{ id: 'f', length: flangeLen, angleDeg: 90, direction, rule, side: 'xmax' }],
    };

    const folded = fold(input);
    expect(folded.ok).toBe(true);
    if (isErr(folded)) return;
    if (folded.value.solid === undefined) return;
    expect(isValid(folded.value.solid)).toBe(true);
    const vol = unwrap(measureVolume(folded.value.solid));

    const theta = (Math.PI / 180) * 90;
    const baseVol = baseLength * width * T;
    const flatVol = flangeLen * span * T;
    const bendVol = theta * (R + T / 2) * T * span;
    expect(vol).toBeCloseTo(baseVol + flatVol + bendVol, 2);

    // The neutral-axis development (K=0.44) underestimates this by the
    // (0.5−K)·T·θ·span sliver, confirming dev is measured at the neutral axis.
    const developedArea = baseLength * width + (DEV + flangeLen) * span;
    const expectedSliver = (0.5 - K) * T * theta * span;
    expect(vol - developedArea * T).toBeCloseTo(expectedSliver, 2);
  });
});

describe('fold warnings ride inside the Ok payload', () => {
  it('emits MIN_RADIUS when inner radius < thickness', () => {
    const input: FlatInput = {
      thickness: 3,
      baseLength: 40,
      width: 30,
      regions: [
        { id: 'f', length: 18, angleDeg: 90, direction: 'up', rule: { innerRadius: 1, kFactor: K }, side: 'xmax' },
      ],
    };
    const folded = foldWithWarnings(input);
    expect(folded.ok).toBe(true);
    if (isErr(folded)) return;
    expect(folded.value.warnings.some((w) => w.code === 'MIN_RADIUS')).toBe(true);
  });

  // Fold runs the canonical validator, so it surfaces COLLISION (two un-mitered
  // adjacent flanges overlapping at the corner) — not just MIN_RADIUS.
  it('emits COLLISION for un-mitered adjacent flanges', () => {
    const input: FlatInput = {
      thickness: T,
      baseLength: 40,
      width: 40,
      regions: [
        { id: 'fx', length: 18, angleDeg: 90, direction: 'up', rule, side: 'xmax' },
        { id: 'fy', length: 18, angleDeg: 90, direction: 'up', rule, side: 'ymax' },
      ],
    };
    const folded = foldWithWarnings(input);
    expect(folded.ok).toBe(true);
    if (isErr(folded)) return;
    expect(folded.value.warnings.some((w) => w.code === 'COLLISION')).toBe(true);
  });
});

describe('fold matches author for an equivalent spec', () => {
  it('a hand FlatInput folds to the same volume as the equivalent author spec', () => {
    const baseLength = 40;
    const width = 30;
    const authored = author({
      thickness: T,
      base: { length: baseLength, width },
      flanges: [{ id: 'f', length: 18, angleDeg: 90, rule, side: 'xmax', direction: 'up' }],
    });
    expect(authored.ok).toBe(true);
    if (isErr(authored)) return;
    if (authored.value.solid === undefined) return;
    const volAuthor = unwrap(measureVolume(authored.value.solid));

    const folded = fold({
      thickness: T,
      baseLength,
      width,
      regions: [{ id: 'f', length: 18, angleDeg: 90, direction: 'up', rule, side: 'xmax' }],
    });
    expect(folded.ok).toBe(true);
    if (isErr(folded)) return;
    if (folded.value.solid === undefined) return;
    const volFold = unwrap(measureVolume(folded.value.solid));

    expect(volFold).toBeCloseTo(volAuthor, 6);
  });
});

describe('scale invariance — sub-millimeter parts round-trip (base probe is unit-free)', () => {
  it('recovers the base of a 0.5mm part (would fail a hardcoded 1e-3 mm x probe)', () => {
    const smallRule: BendRule = { innerRadius: 0.1, kFactor: K };
    const authored = author({
      thickness: 0.1,
      base: { length: 0.6, width: 0.5 },
      flanges: [{ id: 'f', length: 0.3, angleDeg: 90, rule: smallRule, side: 'xmax' }],
    });
    expect(authored.ok).toBe(true);
    if (isErr(authored)) return;
    const partA = authored.value;
    if (partA.solid === undefined) return;
    const volA = unwrap(measureVolume(partA.solid));

    const unfolded = unfold(partA);
    if (isErr(unfolded)) return;
    const flatInput = patternToFlatInput(unfolded.value.pattern, {
      thickness: 0.1,
      ruleFor: () => smallRule,
    });
    expect(flatInput.ok).toBe(true);
    if (isErr(flatInput)) return;

    const folded = fold(flatInput.value);
    expect(folded.ok).toBe(true);
    if (isErr(folded)) return;
    if (folded.value.solid === undefined) return;
    expect(isValid(folded.value.solid)).toBe(true);
    expect(unwrap(measureVolume(folded.value.solid))).toBeCloseTo(volA, 6);
  });
});
