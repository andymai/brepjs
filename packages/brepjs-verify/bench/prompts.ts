// Hand-authored text-to-CAD prompt corpus for the live eval (`eval:live`).
// Each prompt is a natural-language part request scoped to the reliable core
// (primitives, booleans, sketch→extrude, fillet/chamfer, shell, transforms).
//
// Scoring is two-signal (see live.ts): an objective auto-verify (the part is a
// valid solid; plus any pinned `expected` dims within tolerance) AND a
// multimodal LLM judge that looks at the rendered snapshots and decides whether
// the part matches `rubric`. `expected` is optional — only pin dims for fully
// specified parts where placement doesn't change the measurement.

export interface EvalPrompt {
  id: string;
  category:
    | 'primitive'
    | 'boolean'
    | 'sketch'
    | 'modifier'
    | 'transform'
    | 'gridfinity'
    // Playground corpus categories (the `eval:live --corpus playground` quality bar).
    | 'basics'
    | 'mechanical';
  /** The natural-language request handed to the model. */
  prompt: string;
  /** What a correct part must show — handed to the multimodal judge. */
  rubric: string;
  /** Objective dimensional checks, when the prompt pins them unambiguously. */
  expected?: {
    volume?: number;
    bounds?: { x?: [number, number]; y?: [number, number]; z?: [number, number] };
    tolerancePct?: number;
  };
}

export const PROMPTS: readonly EvalPrompt[] = [
  {
    id: 'plate-2holes',
    category: 'sketch',
    prompt:
      'A flat rectangular mounting plate 80 mm wide, 40 mm deep, 5 mm thick, with two 6 mm diameter through-holes centered 20 mm in from each short edge along the centerline.',
    rubric: 'A thin rectangular plate with two round through-holes on its centerline.',
  },
  {
    id: 'l-bracket',
    category: 'boolean',
    prompt:
      'An L-shaped bracket: a 60×40 mm base plate 4 mm thick with a 40 mm tall upright wall along one 60 mm edge, also 4 mm thick.',
    rubric: 'An L-profile bracket — a flat base meeting a vertical wall at a right angle.',
  },
  {
    id: 'flanged-tube',
    category: 'boolean',
    prompt:
      'A pipe flange: a 50 mm diameter cylinder 30 mm tall with a 10 mm diameter bore all the way through, sitting on a 90 mm square base plate 6 mm thick.',
    rubric: 'A bored cylinder rising from a square flange plate; the bore runs fully through.',
  },
  {
    id: 'rounded-box',
    category: 'modifier',
    prompt: 'A 40×30×20 mm box with all twelve edges rounded with a 3 mm fillet.',
    rubric: 'A box whose every edge is visibly rounded, not sharp.',
    expected: { bounds: { x: [0, 40], y: [0, 30], z: [0, 20] }, tolerancePct: 1 },
  },
  {
    id: 'chamfered-cube',
    category: 'modifier',
    prompt: 'A 30 mm cube with every edge chamfered at 2 mm.',
    rubric: 'A cube with flat 45-degree chamfers on all edges.',
  },
  {
    id: 'hollow-enclosure',
    category: 'modifier',
    prompt:
      'A rectangular electronics enclosure 70×50×30 mm, walls 2 mm thick, open at the top (a box shelled to a thin wall with the top face removed).',
    rubric: 'An open-topped thin-walled box — a tray/enclosure, hollow inside.',
  },
  {
    id: 'washer',
    category: 'sketch',
    prompt: 'A flat washer: 20 mm outer diameter, 8 mm inner diameter, 2 mm thick.',
    rubric: 'A thin flat annulus (ring) with a concentric hole.',
  },
  {
    id: 'hex-standoff',
    category: 'sketch',
    prompt:
      'A hexagonal standoff: a hexagon 12 mm across the flats, extruded 25 mm tall, with a 4 mm hole bored down the center axis.',
    rubric: 'A six-sided prism with an axial bore — a hex standoff.',
  },
  {
    id: 'revolved-pulley',
    category: 'sketch',
    prompt:
      'A V-groove pulley revolved about its axis: roughly 50 mm outer diameter, 20 mm wide, with a V-shaped groove around the rim and a 8 mm center bore.',
    rubric: 'A round pulley with a V-groove around the circumference and a center bore.',
  },
  {
    id: 'knob',
    category: 'modifier',
    prompt:
      'A cylindrical control knob 30 mm diameter, 18 mm tall, with the top edge filleted to a 4 mm radius and a 6 mm blind hole in the bottom for a shaft.',
    rubric: 'A short cylinder with a rounded top edge and a blind hole underneath.',
  },
  {
    id: 'spacer-block',
    category: 'boolean',
    prompt:
      'A 50×50×15 mm spacer block with a 25 mm diameter hole through the thickness and the four vertical corners rounded to a 5 mm radius.',
    rubric: 'A square block with a big central through-hole and rounded vertical corners.',
  },
  {
    id: 'angle-bracket-ribs',
    category: 'boolean',
    prompt:
      'A 90-degree angle bracket from two 50×30 mm plates 4 mm thick meeting at a right angle, with a triangular gusset rib reinforcing the inside corner.',
    rubric: 'Two plates at a right angle with a triangular brace in the inner corner.',
  },
  {
    id: 'slotted-plate',
    category: 'sketch',
    prompt:
      'A 100×40 mm plate 5 mm thick with a 40 mm long, 8 mm wide rounded-end slot cut through the middle along its length.',
    rubric: 'A flat plate with an obround (rounded-end) slot cut through it.',
  },
  {
    id: 'stepped-shaft',
    category: 'primitive',
    prompt:
      'A stepped cylindrical shaft: a 20 mm diameter section 40 mm long, then a 12 mm diameter section 30 mm long, coaxial.',
    rubric: 'A round shaft with two coaxial diameters — a step partway along.',
  },
  {
    id: 'dome-cap',
    category: 'boolean',
    prompt: 'A 30 mm diameter cylinder 10 mm tall capped with a hemispherical dome on top.',
    rubric: 'A short cylinder topped by a smooth hemispherical dome.',
  },
  {
    id: 'gridfinity-bin-1x1',
    category: 'gridfinity',
    prompt:
      'A 1×1 Gridfinity bin: 42 mm grid footprint, three height units tall (21 mm), with a hollow cavity and walls about 1.2 mm thick.',
    rubric: 'A small open-top bin on the 42 mm gridfinity footprint, hollow, ~21 mm tall.',
  },
  {
    id: 'gridfinity-baseplate-2x1',
    category: 'gridfinity',
    prompt:
      'A 2×1 Gridfinity baseplate: two 42 mm grid cells side by side, a thin slab with a square socket recess in each cell.',
    rubric: 'A flat 2-cell gridfinity baseplate with a recessed socket per cell.',
    expected: { bounds: { x: [0, 84], y: [0, 42] }, tolerancePct: 2 },
  },
  {
    id: 'bracket-mirror-pair',
    category: 'transform',
    prompt:
      'Two mirror-image mounting tabs: a 30×20×4 mm tab with a 5 mm hole, and its mirror across the YZ plane, joined into one part 70 mm wide overall.',
    rubric: 'Two mirrored tabs (left and right hand) joined as a single part.',
  },
] as const;
