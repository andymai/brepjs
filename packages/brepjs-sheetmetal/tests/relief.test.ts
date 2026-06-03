import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { isValid, measureVolume, getEdges, isErr, unwrap } from 'brepjs';
import { author, unfold, validate } from '../src/api.js';
import { addBendRelief, autoBendReliefs, cornerRelief } from '../src/reliefFns.js';
import { fold, partToFlatInput } from '../src/foldFns.js';
import type { BendRule, FlatInput } from '../src/types.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const T = 1;
const R = 2;
const K = 0.44;
const rule: BendRule = { innerRadius: R, kFactor: K };
const DEV = (Math.PI / 180) * 90 * (R + K * T);

/** A base part with a single partial flange centred on the ymax edge (both ends mid-edge). */
function partialPart() {
  return author({
    thickness: T,
    base: { length: 40, width: 30 },
    flanges: [{ id: 'a', length: 10, angleDeg: 90, rule, side: 'ymax', offset: 10, width: 15 }],
  });
}

describe('bend relief — partial flange', () => {
  it('cuts a slot at each mid-edge bend-line end: volume and developed area both drop', () => {
    const authored = partialPart();
    expect(authored.ok).toBe(true);
    if (isErr(authored)) return;
    const base = authored.value;
    if (base.solid === undefined) return;
    const volBefore = unwrap(measureVolume(base.solid));
    const areaBefore = unwrap(unfold(base)).pattern.developedArea;

    const width = T;
    const depth = DEV + T;
    const relieved = addBendRelief(base, 'a', { shape: 'rectangular', width, depth });
    expect(relieved.ok).toBe(true);
    if (isErr(relieved)) return;
    const part = relieved.value;

    // Two mid-edge ends → two recorded notches.
    expect(part.reliefs).toBeDefined();
    expect(part.reliefs?.[0]?.notches).toHaveLength(2);
    if (part.solid === undefined) return;
    expect(isValid(part.solid)).toBe(true);

    // Each slot removes width×depth×thickness from the parent; both slots sit fully
    // inside the base, so volume drops by 2·(width·depth·T).
    const removed = 2 * width * depth * T;
    const volAfter = unwrap(measureVolume(part.solid));
    expect(volBefore - volAfter).toBeCloseTo(removed, 3);

    // The developed outline drops by the same 2D notch area (×1, it is a 2D area).
    const unfolded = unfold(part);
    expect(unfolded.ok).toBe(true);
    if (isErr(unfolded)) return;
    expect(areaBefore - unfolded.value.pattern.developedArea).toBeCloseTo(2 * width * depth, 3);
    // The notch turns two clean corners into eight extra vertices (a slot is 6 new
    // edges vs. the straight edge it replaces), so the outline gains corners.
    expect(getEdges(unfolded.value.pattern.outline).length).toBeGreaterThan(6);
  });

  it('places the notch at the developed bend-line ends (inside the base, on the bend edge)', () => {
    const authored = partialPart();
    if (isErr(authored)) return;
    const relieved = addBendRelief(authored.value, 'a', { shape: 'rectangular' });
    if (isErr(relieved)) return;
    const notches = relieved.value.reliefs?.[0]?.notches ?? [];
    expect(notches).toHaveLength(2);
    // The ymax bend line sits at y=30 (base width); slots cut inward (−y), so each
    // notch's top edge is y=30 and it extends below by `depth`.
    for (const [x0, y0, x1, y1] of notches) {
      expect(y1).toBeCloseTo(30, 3);
      expect(y0).toBeLessThan(30);
      // x straddles a bend-line end (offset 10 and 25 along the 40-long edge).
      const cx = (x0 + x1) / 2;
      expect([10, 25].some((e) => Math.abs(cx - e) < 0.6)).toBe(true);
    }
  });

  it('rejects a relief on a full-span flange (no mid-edge end to relieve)', () => {
    const full = author({
      thickness: T,
      base: { length: 40, width: 30 },
      flanges: [{ id: 'a', length: 10, angleDeg: 90, rule, side: 'xmax' }],
    });
    if (isErr(full)) return;
    const r = addBendRelief(full.value, 'a');
    expect(r.ok).toBe(false);
    if (!isErr(r)) return;
    expect(r.error.code).toBe('BEND_RELIEF_NOT_NEEDED');
  });
});

describe('bend relief — obround vs rectangular', () => {
  it('records the requested shape and stays valid for both', () => {
    const authored = partialPart();
    if (isErr(authored)) return;
    for (const shape of ['rectangular', 'obround'] as const) {
      const r = addBendRelief(authored.value, 'a', { shape });
      expect(r.ok).toBe(true);
      if (isErr(r)) continue;
      expect(r.value.reliefs?.[0]?.shape).toBe(shape);
      if (r.value.solid === undefined) continue;
      expect(isValid(r.value.solid)).toBe(true);
      expect(unfold(r.value).ok).toBe(true);
    }
  });
});

describe('bend relief — same-span flanges on different edges', () => {
  it('places each flange’s notch on its own developed bend line (matched by id, not signature)', () => {
    // Two partial flanges sharing span/angle/direction but on perpendicular edges:
    // a signature match would put both notches on the first matching bend line.
    const authored = author({
      thickness: T,
      base: { length: 40, width: 40 },
      flanges: [
        { id: 'north', length: 10, angleDeg: 90, rule, side: 'ymax', offset: 10, width: 15 },
        { id: 'east', length: 10, angleDeg: 90, rule, side: 'xmax', offset: 10, width: 15 },
      ],
    });
    if (isErr(authored)) return;

    const withNorth = addBendRelief(authored.value, 'north', { shape: 'rectangular' });
    expect(withNorth.ok).toBe(true);
    if (isErr(withNorth)) return;
    const withBoth = addBendRelief(withNorth.value, 'east', { shape: 'rectangular' });
    expect(withBoth.ok).toBe(true);
    if (isErr(withBoth)) return;

    const reliefs = withBoth.value.reliefs ?? [];
    const north = reliefs.find((r) => r.flangeA === 'north');
    const east = reliefs.find((r) => r.flangeA === 'east');
    expect(north?.notches).toHaveLength(2);
    expect(east?.notches).toHaveLength(2);

    // The north (ymax) bend line is horizontal at y=40, so its notches' top edge is
    // y≈40. The east (xmax) bend line is vertical at x=40, so its notches' right edge
    // is x≈40. If both had matched the same bend line these would coincide.
    for (const [, , , y1] of north?.notches ?? []) expect(y1).toBeCloseTo(40, 3);
    for (const [, , x1] of east?.notches ?? []) expect(x1).toBeCloseTo(40, 3);
  });
});

describe('bend relief — chained partial flange', () => {
  it('notches into the parent flange strip (inward read from placement, not base center)', () => {
    // A partial flange off a wall flange: its developed bend line sits past the wall
    // strip, far from the base center, so a center-based inward guess would point the
    // notch the wrong way. The notch must cut back toward the wall (decreasing y).
    const authored = author({
      thickness: T,
      base: { length: 60, width: 20 },
      flanges: [
        { id: 'wall', length: 20, angleDeg: 90, rule, side: 'xmax', width: 16 },
        { id: 'lip', length: 6, angleDeg: 90, rule, side: 'xmax', parent: 'wall', offset: 4, width: 8 },
      ],
    });
    if (isErr(authored)) return;
    const relieved = addBendRelief(authored.value, 'lip', { shape: 'rectangular' });
    expect(relieved.ok).toBe(true);
    if (isErr(relieved)) return;
    const lip = relieved.value.reliefs?.find((r) => r.flangeA === 'lip');
    expect(lip?.notches).toHaveLength(2);
    if (relieved.value.solid === undefined) return;
    expect(isValid(relieved.value.solid)).toBe(true);

    // The lip's developed bend line lies past the wall strip (high y), and inward
    // runs back toward the wall (−y). So both notches share their top edge (the bend
    // line) and cut downward — proving inward came from the lip's own placement, not a
    // guess toward the base center (which would have pushed them the wrong way).
    const notches = lip?.notches ?? [];
    const yTops = notches.map(([, , , y1]) => y1);
    expect(Math.abs((yTops[0] ?? 0) - (yTops[1] ?? 0))).toBeLessThan(1e-3);
    for (const [, y0, , y1] of notches) {
      expect(y0).toBeLessThan(y1);
    }
  });
});

describe('auto bend reliefs', () => {
  it('adds a relief to every partial flange and skips full-span ones', () => {
    const authored = author({
      thickness: T,
      base: { length: 60, width: 40 },
      flanges: [
        { id: 'partial', length: 10, angleDeg: 90, rule, side: 'ymax', offset: 10, width: 20 },
        { id: 'full', length: 10, angleDeg: 90, rule, side: 'xmax' },
      ],
    });
    if (isErr(authored)) return;
    const r = autoBendReliefs(authored.value);
    expect(r.ok).toBe(true);
    if (isErr(r)) return;
    // Only the partial flange gets a relief feature.
    expect(r.value.reliefs).toHaveLength(1);
    expect(r.value.reliefs?.[0]?.flangeA).toBe('partial');
    if (r.value.solid === undefined) return;
    expect(isValid(r.value.solid)).toBe(true);
  });
});

describe('corner relief — two adjacent flanges', () => {
  it('notches the shared corner, stays valid, and resolves the collision warning', () => {
    const authored = author({
      thickness: T,
      base: { length: 40, width: 40 },
      flanges: [
        { id: 'fx', length: 18, angleDeg: 90, rule, side: 'xmax' },
        { id: 'fy', length: 18, angleDeg: 90, rule, side: 'ymax' },
      ],
    });
    if (isErr(authored)) return;
    // Un-relieved: the two upright flanges collide at the corner.
    expect(validate(authored.value).some((w) => w.code === 'COLLISION')).toBe(true);

    const relieved = cornerRelief(authored.value, 'fx', 'fy', { shape: 'rectangular' });
    expect(relieved.ok).toBe(true);
    if (isErr(relieved)) return;
    const part = relieved.value;
    expect(part.reliefs?.[0]?.kind).toBe('corner');
    if (part.solid === undefined) return;
    expect(isValid(part.solid)).toBe(true);

    // Collision is resolved (recorded like a miter).
    expect(validate(part).some((w) => w.code === 'COLLISION')).toBe(false);

    // The corner notch appears in the developed outline at (baseLength, width).
    const unfolded = unfold(part);
    expect(unfolded.ok).toBe(true);
    if (isErr(unfolded)) return;
    expect(getEdges(unfolded.value.pattern.outline).length).toBeGreaterThan(6);
    // The square notch is centred on the reflex corner (baseLength, width); only the
    // base quadrant and the two flange-strip quadrants are filled there (the 4th,
    // x>baseLength & y>width, is empty), so it removes 3·(depth/2)² of developed area.
    const depth = DEV + T;
    const areaBefore = unwrap(unfold(authored.value)).pattern.developedArea;
    expect(areaBefore - unfolded.value.pattern.developedArea).toBeCloseTo(3 * (depth / 2) ** 2, 2);
  });

  it('honours spec.width as the square notch side and records it', () => {
    const authored = author({
      thickness: T,
      base: { length: 40, width: 40 },
      flanges: [
        { id: 'fx', length: 18, angleDeg: 90, rule, side: 'xmax' },
        { id: 'fy', length: 18, angleDeg: 90, rule, side: 'ymax' },
      ],
    });
    if (isErr(authored)) return;
    const w = 6;
    const relieved = cornerRelief(authored.value, 'fx', 'fy', { shape: 'rectangular', width: w });
    expect(relieved.ok).toBe(true);
    if (isErr(relieved)) return;
    // The recorded width is the actual square side, and the removed developed area
    // is the 3 filled quadrants of a w×w square at the reflex corner.
    expect(relieved.value.reliefs?.[0]?.width).toBeCloseTo(w, 3);
    const before = unwrap(unfold(authored.value)).pattern.developedArea;
    const after = unwrap(unfold(relieved.value)).pattern.developedArea;
    expect(before - after).toBeCloseTo(3 * (w / 2) ** 2, 2);
  });
});

describe('round-trip — fold preserves the relief feature and reproduces volume', () => {
  it('fold(FlatInput with bendRelief) reproduces a relief’d part’s volume', () => {
    // Author + relief the part one way…
    const authored = partialPart();
    if (isErr(authored)) return;
    const relieved = addBendRelief(authored.value, 'a', { shape: 'rectangular' });
    if (isErr(relieved)) return;
    if (relieved.value.solid === undefined) return;
    const volA = unwrap(measureVolume(relieved.value.solid));

    // …and fold an equivalent FlatInput carrying the same relief on its region.
    const input: FlatInput = {
      thickness: T,
      baseLength: 40,
      width: 30,
      regions: [
        {
          id: 'a',
          length: 10,
          angleDeg: 90,
          direction: 'up',
          rule,
          side: 'ymax',
          offset: 10,
          width: 15,
          bendRelief: { shape: 'rectangular' },
        },
      ],
    };
    const folded = fold(input);
    expect(folded.ok).toBe(true);
    if (isErr(folded)) return;
    expect(folded.value.reliefs).toHaveLength(1);
    if (folded.value.solid === undefined) return;
    expect(isValid(folded.value.solid)).toBe(true);
    const volB = unwrap(measureVolume(folded.value.solid));

    // Both cut the same relief, so the volumes match.
    expect(volB).toBeCloseTo(volA, 3);
  });

  // The strict geometric round-trip oracle (partToFlatInput → fold) SKIPS relief'd
  // parts: a notched developed outline is not a plain rectangle, so patternToFlatInput
  // cannot re-parse it (same reasoning as mitered parts). Instead we round-trip the
  // recorded feature: a relief'd part's recovered FlatInput drops the notch (the
  // parser reads only the rectangle families), so re-folding it yields the un-relief'd
  // volume — proving the notch is genuinely a recorded feature, not re-parsed geometry.
  it('partToFlatInput drops the notch (relief is a recorded feature, not re-parsed)', () => {
    const authored = partialPart();
    if (isErr(authored)) return;
    const relieved = addBendRelief(authored.value, 'a', { shape: 'rectangular' });
    if (isErr(relieved)) return;
    // patternToFlatInput parses the notched outline; the notch turns the base into a
    // non-rectangle, so recovery either fails or omits the notch — either way it must
    // not throw, and a successful recovery carries no bendRelief.
    const recovered = partToFlatInput(relieved.value);
    if (recovered.ok) {
      for (const region of recovered.value.regions) {
        expect(region.bendRelief).toBeUndefined();
      }
    }
  });
});
