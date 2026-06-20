// Request → expected-spec fixtures for reviewing the front-of-pipeline skills (brainstorm/design),
// which have no automated heal loop. The skill-reviewer agent feeds each request through the
// brainstorm skill and checks the produced spec resolves every `expectedSpecFields` entry — a
// repeatable signal for manual prose edits, not an automated gate.

export interface SpecFixture {
  request: string;
  /** Fields the brainstorm spec MUST resolve (explicitly or via a stated assumption). */
  expectedSpecFields: string[];
}

export const SPEC_FIXTURES: SpecFixture[] = [
  {
    request: 'a wall bracket for a 40mm pipe with two M4 mounting holes',
    expectedSpecFields: [
      'pipe diameter (40mm)',
      'bracket envelope',
      'M4 hole size + clearance',
      'hole spacing/pattern',
      'mounting datum (wall face)',
      'material (assume FDM)',
    ],
  },
  {
    request: 'a gridfinity bin, 2x1, with a label tab',
    expectedSpecFields: [
      'grid units (2x1 → 84x42mm footprint)',
      'height units',
      'baseplate compatibility (42mm grid)',
      'label tab geometry',
      'stacking lip',
    ],
  },
  {
    request: 'a knob for a 6mm D-shaft',
    expectedSpecFields: [
      'shaft size (6mm) + D-flat',
      'knob diameter + height',
      'grip feature (knurl/flutes)',
      'set-screw or press-fit retention',
      'material',
    ],
  },
  {
    request: 'a phone stand',
    // Deliberately under-specified — the spec must surface the open questions, not guess silently.
    expectedSpecFields: [
      'phone size / envelope range',
      'viewing angle',
      'landscape vs portrait',
      'cable cutout (yes/no)',
      'footprint / stability',
    ],
  },
];
