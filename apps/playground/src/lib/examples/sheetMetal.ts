/**
 * Sheet-metal examples — parametric folded parts authored with the
 * `brepjs-sheetmetal` domain package (flange/bend authoring, auto-miter, form
 * features, hems). See the module-authoring rules in ./types.
 */
import type { Example } from './types';

export const SHEET_METAL_EXAMPLES: readonly Example[] = [
  {
    id: 'sheet-metal-bracket',
    label: 'Mitered Motor Bracket',
    description:
      'A mounting bracket for a NEMA 17 stepper motor, folded from one blank of 14 gauge steel: a face and two ribs fold up from the base, and each rib meets the face in a mitered corner. The gauge, the motor face, its hole pattern and its shaft are published figures. The kernel unfolds the bracket to the flat blank, with the bend allowance, and measures the mass. The motor, the pulley and the screws are a display model. The DXF button downloads the flat blank.',
    code: `import { box, clone, compound, cutAll, cylinder, extrude, measureVolume, polygon, revolve, rotate, translate, unwrap } from 'brepjs/quick';
import { addPolygonCutout, author, flatPatternToPolylines, miterCorner, toDXF, unfold } from 'brepjs-sheetmetal';
import { color, present } from 'brepjs/playground';

// Mounting bracket for a NEMA 17 stepper motor, folded from one blank of 14 gauge steel.
// The face and two ribs fold up from the base. Each rib meets the face in a mitered corner, with a gap for the weld.
// The gauge, the motor face, its hole pattern and its shaft are published figures. The rest is a display model.
interface BracketParams {
  fold?: number; // 0 to 1: how far each bend is folded. Below 1 the example shows only the sheet, before the miter cuts
  rib?: number; // height of the ribs in millimetres. Try 30
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof box>;
type Part = Extract<ReturnType<typeof author>, { ok: true }>['value'];

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const T = 1.897; // 14 gauge steel sheet, 0.0747 inch
const STEEL = 7.85e-3; // grams per cubic millimetre
const MOTOR = { face: 42.3, holes: 31, screw: 3, shaft: 5 }; // NEMA 17: four M3 holes on a square of 31 mm

// ---- display model
const RULE = { innerRadius: 2, kFactor: 0.44 }; // air bend
const S = T + RULE.innerRadius; // a 90 degree bend takes this much of each leg
const BASE = { length: 62, width: 56 };
const FACE = 52; // flat height of the face
const AXIS = S + FACE / 2; // height of the motor axis
const PILOT = { diameter: 22, height: 2 }; // the boss on the motor that centres it in the face
const BODY = { front: 9, stack: 20, rear: 11, shaft: 24 }; // a motor of 40 mm
const MITER = 1; // gap setting of the miter cut
const SLOTS = [14, 42]; // Y of the two slots in the base

const made = (r: ReturnType<typeof author>): Part => {
  const p = unwrap(r);
  if (p.solid) own(p.solid);
  return p;
};
const ngon = (x: number, y: number, r: number, n: number): P2[] =>
  Array.from({ length: n }, (_, i): P2 => [x + r * Math.cos((i * 2 * Math.PI) / n), y + r * Math.sin((i * 2 * Math.PI) / n)]);
// An obround slot along X, as a polygon.
const slot = (x: number, y: number, length: number, width: number): P2[] => {
  const r = width / 2, d = length / 2 - r, n = 8;
  const end = (cx: number, from: number): P2[] => Array.from({ length: n + 1 }, (_, i): P2 => [cx + r * Math.cos(from + (i * Math.PI) / n), y + r * Math.sin(from + (i * Math.PI) / n)]);
  return [...end(x + d, -Math.PI / 2), ...end(x - d, Math.PI / 2)];
};

// The blank: the face and the ribs fold from the base.
function blank(rib: number, angle: number): Part {
  const bend = { angleDeg: angle, rule: RULE };
  let p = made(author({ thickness: T, base: BASE, flanges: [
    { id: 'face', side: 'xmin', length: FACE, ...bend },
    { id: 'ribLeft', side: 'ymin', length: rib, ...bend }, { id: 'ribRight', side: 'ymax', length: rib, ...bend },
  ] }));
  // The miter is a cut on a vertical plane through the corner, so it is correct only at 90 degrees.
  if (angle === 90) for (const id of ['ribLeft', 'ribRight']) p = made(miterCorner(p, id, 'face', MITER));
  // Base: two slots for the fixing screws. Face: the bore for the pilot and the four motor holes.
  for (const y of SLOTS) p = made(addPolygonCutout(p, 'base', slot(36, y, 26, 5.5)));
  const mid = BASE.width / 2, h = MOTOR.holes / 2;
  p = made(addPolygonCutout(p, 'face', ngon(mid, FACE / 2, PILOT.diameter / 2 + 0.25, 40)));
  for (const [u, v] of [[-h, -h], [h, -h], [h, h], [-h, h]]) p = made(addPolygonCutout(p, 'face', ngon(mid + u!, FACE / 2 + v!, MOTOR.screw / 2 + 0.2, 16)));
  return p;
}

const block = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Shape => own(translate(own(box(x1 - x0, y1 - y0, z1 - z0)), [x0, y0, z0])) as Shape;
const rod = (r: number, x0: number, x1: number, y: number, z: number): Shape => own(cylinder(r, x1 - x0, { at: [x0, y, z], axis: [1, 0, 0] })) as Shape;
// A solid of revolution about the X axis through (y, z). The profile is [x, r].
const turned = (profile: P2[], y: number, z: number): Shape =>
  own(translate(own(unwrap(revolve(own(unwrap(polygon(profile.map(([x, r]): P3 => [x, r, 0])))), { axis: [1, 0, 0] }))), [0, y, z])) as Shape;

// The motor is behind the face. Its pilot sits in the bore, and four screws go through the face into it.
function hardware() {
  const mid = BASE.width / 2, f = MOTOR.face / 2, h = MOTOR.holes / 2, x = -S;
  const spots: P2[] = [[-h, -h], [h, -h], [h, h], [-h, h]];
  // A square section with cut corners, from x0 to x1.
  const frame = (x0: number, x1: number, corner: number): Shape => {
    const pts: P2[] = [[f - corner, -f], [f, -f + corner], [f, f - corner], [f - corner, f], [-f + corner, f], [-f, f - corner], [-f, -f + corner], [-f + corner, -f]];
    return own(unwrap(extrude(own(unwrap(polygon(pts.map(([y, z]): P3 => [x0, mid + y, AXIS + z])))), [x1 - x0, 0, 0]))) as Shape;
  };
  const x1 = x - BODY.front, x2 = x1 - BODY.stack, x3 = x2 - BODY.rear;
  const front = own(unwrap(cutAll(frame(x1, x, 4.5), spots.map(([u, v]) => rod(MOTOR.screw / 2, x - 4.5, x, mid + u, AXIS + v))))) as Shape;
  const alloy = [front, frame(x3, x2, 4.5), turned([[x, 0], [x, PILOT.diameter / 2], [x + PILOT.height, PILOT.diameter / 2], [x + PILOT.height, 0]], mid, AXIS)];
  const dark = [frame(x2, x1, 3), block(x3, mid - 8, AXIS + f, x3 + 10, mid + 8, AXIS + f + 5.5)];
  // The shaft, with a flat for the set screws of the pulley.
  const shaft = own(unwrap(cutAll(rod(MOTOR.shaft / 2, x + PILOT.height, x + BODY.shaft, mid, AXIS), [block(x + 9, mid - 3, AXIS + 2, x + 30, mid + 3, AXIS + 3)]))) as Shape;
  // A belt pulley with two flanges. Its bore is cut with the shaft, so the flat stays free.
  const p0 = x + 9.5;
  const pulleyBlank = turned([[p0, 0], [p0, 8], [p0 + 7.5, 8], [p0 + 7.5, 6.5], [p0 + 8.5, 6.5], [p0 + 8.5, 6], [p0 + 15, 6], [p0 + 15, 6.5], [p0 + 16, 6.5], [p0 + 16, 0]], mid, AXIS);
  const pulley = own(unwrap(cutAll(pulleyBlank, [rod(MOTOR.shaft / 2, p0 - 1, p0 + 17, mid, AXIS), rod(1.5, 0, 9, 0, 0)]))) as Shape;
  // Socket head screws: four M3 into the motor, and two M5 with washers in the slots of the base.
  const cap = (d: number, k: number, length: number): P2[] => [[0, 0], [0, d * 0.75], [k, d * 0.75], [k, d * 0.42], [k * 0.4, d * 0.42], [k * 0.4, 0]].map(([a, r]): P2 => [k - a!, r!]).concat([[0, d / 2], [-length, d / 2], [-length, 0]]);
  const m3 = turned(cap(3, 3, T + 4.5).reverse(), 0, 0);
  const m5 = own(rotate(turned(cap(5, 5, T + 1).reverse(), 0, 0), -90, { axis: [0, 1, 0] })) as Shape;
  const washer = own(unwrap(revolve(own(unwrap(polygon([[2.65, 0, 0], [5, 0, 0], [5, 0, 1], [2.65, 0, 1]])))))) as Shape;
  const steel = [
    shaft, pulley,
    ...spots.map(([u, v]) => own(translate(m3, [x + T, mid + u, AXIS + v])) as Shape),
    ...SLOTS.flatMap((y) => [own(translate(washer, [44, y, T])) as Shape, own(translate(m5, [44, y, T + 1])) as Shape]),
  ];
  return { alloy: compound(alloy) as Shape, dark: compound(dark) as Shape, steel: compound(steel) as Shape };
}

function bracket({ fold = 1, rib = 18 }: BracketParams = {}) {
  const part = blank(rib, 90 * Math.min(1, Math.max(0.02, fold)));
  // The report and the flat blank come from the full bracket, also when the view is part folded.
  const full = fold < 1 ? blank(rib, 90) : part;
  const flat = unwrap(unfold(full));
  [flat.pattern.outline, ...flat.pattern.holes, ...flat.pattern.bendLines.map((l) => l.line)].forEach((handle) => own(handle));
  const info = {
    dxf: unwrap(toDXF(flat.pattern)), overlay2d: flatPatternToPolylines(flat.pattern),
    size: flat.report.totalFlatSize, allowance: flat.report.bends[0]?.allowance ?? 0, bends: flat.report.bends.length,
    grams: unwrap(measureVolume(full.solid as Shape)) * STEEL,
  };
  const sheet = unwrap(clone(part.solid as Shape)) as Shape;
  return fold < 1 ? { sheet, ...info } : { sheet, ...hardware(), ...info };
}

// Try bracket({ fold: 0.5 }) to see the blank half folded, or bracket({ rib: 30 }).
const model = freeing(() => bracket());
console.log(
  model.bends + ' bends, each with an allowance of ' + model.allowance.toFixed(2) + ' mm. Flat blank: ' + model.size.map((v) => v.toFixed(1)).join(' x ') + ' mm. ' +
    'Mass of the bracket: ' + model.grams.toFixed(0) + ' g from the kernel volume.',
);

// The DXF button downloads the flat blank with its bend lines, miters, slots and holes.
export default present(
  [color(model.sheet, '#12b5b0'), ...('alloy' in model ? [color(model.alloy, '#c3c9d1'), color(model.dark, '#2b2f36'), color(model.steel, '#e9ebee')] : [])],
  { dxf: model.dxf, overlay2d: model.overlay2d },
);`,
  },
  {
    id: 'sheet-metal-u-channel',
    label: 'Slotted Strut Channel',
    description:
      'A slotted strut channel, folded from one strip with six bends, as a trapeze hanger: two threaded rods carry it and two U-bolts hold a pipe each. The 41 mm section, the 2.5 mm gauge, the 14 x 28 mm slots at 50 mm and the mass for each metre are published figures. The kernel unfolds the section to the flat strip and measures the mass. The lips, the pipes and the hardware are a display model. The DXF button downloads the flat strip.',
    code: `import { box, circle, clone, compound, cut, cylinder, extrude, face, measureVolume, polygon, revolve, rotate, translate, unwrap, wire } from 'brepjs/quick';
import { addPolygonCutout, author, flatPatternToPolylines, toDXF, unfold } from 'brepjs-sheetmetal';
import { color, present } from 'brepjs/playground';

// Slotted strut channel, 41 x 41 mm, as a trapeze hanger: two threaded rods carry it, and two U-bolts hold a pipe each.
// One strip of steel makes the section: a back, two walls, and two lips that turn in and down. That is six bends.
// The section size, the gauge, the slots and the mass are published figures. The lips, the pipes and the hardware are a display model.
interface ChannelParams {
  fold?: number; // 0 to 1: how far each bend is folded. Below 1 the example shows only the strip
  length?: number; // millimetres, a multiple of the slot pitch
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof box>;
type Part = Extract<ReturnType<typeof author>, { ok: true }>['value'];

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (strut channel 41 x 41 x 2.5, slotted)
const SIZE = 41; // width and height of the section
const T = 2.5; // sheet thickness
const SLOT = { width: 14, length: 28, pitch: 50 };
const CATALOGUE = { plain: 2.61, slotted: 2.4 }; // kilograms per metre
const STEEL = 7.85e-6; // kilograms per cubic millimetre

// ---- display model
const RULE = { innerRadius: 1.25, kFactor: 0.44 }; // a tight roll-formed corner
const S = T + RULE.innerRadius; // a 90 degree bend takes this much of each leg
const OPENING = 22; // between the lips
const RETURN = 9.5; // how far each lip turns down
const ROD = { radius: 5, height: 120, nut: 16, nutHeight: 8.4 }; // M10 threaded rod
const PIPE = { radius: 21.2, wall: 3.2, length: 200 };
const UBOLT = { radius: 4, nut: 13, nutHeight: 6.5 }; // M8

const made = (r: ReturnType<typeof author>): Part => {
  const p = unwrap(r);
  if (p.solid) own(p.solid);
  return p;
};
// An obround slot along X, as a polygon.
const slot = (x: number, y: number, length: number, width: number): P2[] => {
  const r = width / 2, d = length / 2 - r, n = 8;
  const end = (cx: number, from: number): P2[] => Array.from({ length: n + 1 }, (_, i): P2 => [cx + r * Math.cos(from + (i * Math.PI) / n), y + r * Math.sin(from + (i * Math.PI) / n)]);
  return [...end(x + d, -Math.PI / 2), ...end(x - d, Math.PI / 2)];
};
const lathe = (pts: P2[]): Shape => own(unwrap(revolve(own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z])))))) as Shape);
const at = (s: Shape, x: number, y: number, z: number): Shape => own(translate(s, [x, y, z]) as Shape);
// A hex nut with its hole, flat on Z = 0.
const hexNut = (across: number, height: number, bore: number): Shape => {
  const r = across / Math.sqrt(3);
  const hex = own(unwrap(extrude(own(unwrap(polygon(Array.from({ length: 6 }, (_, i): P3 => [r * Math.cos((i * Math.PI) / 3), r * Math.sin((i * Math.PI) / 3), 0])))), height)));
  return own(unwrap(cut(hex, own(cylinder(bore, height)))) as Shape);
};

// The strip: the back with its slots, two walls, two lips and two returns.
function strip(length: number, angle: number): Part {
  const bend = { angleDeg: angle, rule: RULE };
  const flat = SIZE - 2 * S;
  const lip = (SIZE - OPENING) / 2 - 2 * S;
  let p = made(author({ thickness: T, base: { length, width: flat }, flanges: [
    { id: 'left', side: 'ymin', length: flat, ...bend }, { id: 'right', side: 'ymax', length: flat, ...bend },
    { id: 'lipLeft', parent: 'left', side: 'ymax', length: lip, ...bend }, { id: 'lipRight', parent: 'right', side: 'ymax', length: lip, ...bend },
    { id: 'returnLeft', parent: 'lipLeft', side: 'ymax', length: RETURN - S, ...bend }, { id: 'returnRight', parent: 'lipRight', side: 'ymax', length: RETURN - S, ...bend },
  ] }));
  for (let x = SLOT.pitch / 2; x < length; x += SLOT.pitch) p = made(addPolygonCutout(p, 'base', slot(x, flat / 2, SLOT.length, SLOT.width)));
  return p;
}

function channel({ fold = 1, length = 400 }: ChannelParams = {}) {
  const angle = 90 * Math.min(1, Math.max(0.02, fold));
  const part = strip(length, angle);
  // The report and the flat strip come from the full section, also when the view is part folded.
  const full = fold < 1 ? strip(length, 90) : part;
  const flat = unwrap(unfold(full));
  [flat.pattern.outline, ...flat.pattern.holes, ...flat.pattern.bendLines.map((l) => l.line)].forEach((handle) => own(handle));
  const info = {
    dxf: unwrap(toDXF(flat.pattern)), overlay2d: flatPatternToPolylines(flat.pattern),
    blank: flat.report.totalFlatSize, allowance: flat.report.bends[0]?.allowance ?? 0, bends: flat.report.bends.length,
    perMetre: (unwrap(measureVolume(full.solid as Shape)) * STEEL * 1000) / length,
  };
  // The section is centred on Y. Part folded, it lies on its back. Complete, its back is on top and its opening is down.
  const centred = own(translate(part.solid as Shape, [0, -(SIZE - 2 * S) / 2, 0]) as Shape);
  if (fold < 1) return { steel: unwrap(clone(centred)) as Shape, ...info };
  const steel = rotate(centred, 180, { axis: [1, 0, 0], at: [0, 0, SIZE / 2] }) as Shape;

  const zinc: Shape[] = [], pipes: Shape[] = [];
  const slots = Array.from({ length: Math.floor(length / SLOT.pitch) }, (_, i) => SLOT.pitch / 2 + i * SLOT.pitch);
  const inside = SIZE - T; // the under side of the back
  // Two threaded rods through the end slots. A washer and a nut on each side of the back clamp the channel.
  const washer = (outer: number, inner: number): Shape => lathe([[inner, 0], [outer, 0], [outer, 2], [inner, 2]]);
  const rodNut = hexNut(ROD.nut, ROD.nutHeight, ROD.radius), rodWasher = washer(11, ROD.radius);
  for (const x of [slots[0]!, slots[slots.length - 1]!]) {
    zinc.push(own(cylinder(ROD.radius, ROD.height, { at: [x, 0, inside - 22] })));
    zinc.push(at(rodWasher, x, 0, SIZE), at(rodNut, x, 0, SIZE + 2), at(rodWasher, x, 0, inside - 2), at(rodNut, x, 0, inside - 2 - ROD.nutHeight));
  }
  // A pipe lies on the back between two slots. The legs of its U-bolt go through the slots to a nut each.
  const reach = PIPE.radius + UBOLT.radius;
  const tube = own(rotate(lathe([[PIPE.radius - PIPE.wall, 0], [PIPE.radius, 0], [PIPE.radius, PIPE.length], [PIPE.radius - PIPE.wall, PIPE.length]]), 90, { axis: [1, 0, 0] }) as Shape);
  const round = own(unwrap(face(own(unwrap(wire([own(circle(UBOLT.radius, { at: [reach, 0, 0] }))]))) as never)));
  const arch = own(unwrap(revolve(round, { axis: [0, 1, 0], angle: -Math.PI })) as Shape);
  const boltNut = hexNut(UBOLT.nut, UBOLT.nutHeight, UBOLT.radius), boltWasher = washer(8, UBOLT.radius);
  const pairs = slots.length >= 6 ? [1, slots.length - 3] : [];
  pairs.forEach((first, n) => {
    const x = (slots[first]! + slots[first + 1]!) / 2, z = SIZE + PIPE.radius;
    pipes[n] = translate(tube, [x, PIPE.length / 2, z]) as Shape;
    zinc.push(at(arch, x, 0, z));
    for (const side of [-1, 1]) {
      zinc.push(own(cylinder(UBOLT.radius, z - inside + 14, { at: [x + side * reach, 0, inside - 14] })));
      zinc.push(at(boltWasher, x + side * reach, 0, inside - 2), at(boltNut, x + side * reach, 0, inside - 2 - UBOLT.nutHeight));
    }
  });
  return { steel, zinc: compound(zinc) as Shape, pipes, ...info };
}

// Try channel({ fold: 0.5 }) to see the strip half folded, or channel({ length: 600 }).
const model = freeing(() => channel());
console.log(
  model.bends + ' bends, each with an allowance of ' + model.allowance.toFixed(2) + ' mm. Flat strip: ' + model.blank.map((v) => v.toFixed(1)).join(' x ') + ' mm. ' +
    'Mass: ' + model.perMetre.toFixed(2) + ' kg/m from the kernel volume. The catalogue has ' + CATALOGUE.slotted + ' kg/m slotted and ' + CATALOGUE.plain + ' kg/m plain.',
);

// Turn the hanger so that the pipes point toward the camera.
const show = (s: Shape, css: string) => {
  const turned = rotate(s, 90, { axis: [0, 0, 1] });
  s.delete();
  return color(turned, css);
};
// The DXF button downloads the flat strip with its bend lines and slots.
export default present(
  [show(model.steel, '#c3c9d1'), ...('zinc' in model ? [show(model.zinc, '#e9ebee'), ...model.pipes.map((s, i) => show(s, i ? '#ff5a1f' : '#12b5b0'))] : [])],
  { dxf: model.dxf, overlay2d: model.overlay2d },
);`,
  },
  {
    id: 'sheet-metal-louvered-panel',
    label: 'Louvered Enclosure Cover',
    description:
      'The louvered cover of an equipment enclosure, from 20 gauge steel, with its screws, a name plate and the enclosure behind it. Each louver is a cut on three sides with the flap formed out along the fourth side, so the flat blank keeps all its material. The gauge is a published figure. The kernel unfolds the cover to the flat blank and measures its mass. The size, the louvers, the enclosure and the hardware are a display model. The DXF button downloads the flat blank.',
    code: `import { box, clone, compound, cutAll, cylinder, measureVolume, polygon, revolve, rotate, translate, unwrap } from 'brepjs/quick';
import { addPolygonCutout, author, flatPatternToPolylines, louver, toDXF, unfold } from 'brepjs-sheetmetal';
import { color, present } from 'brepjs/playground';

// Louvered cover of an equipment enclosure, from 20 gauge steel. Each louver is a cut on three sides:
// a press forms the flap out along the fourth side, so no material leaves the blank.
// The gauge and the density are published figures. The size, the louvers, the enclosure and the hardware are a display model.
interface PanelParams {
  fold?: number; // 0 to 1: how far the four edge flanges are folded. Below 1 the example shows only the cover
  rows?: number; // rows of louvers, 1 to 9
  height?: number; // formed height of each louver in millimetres
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof box>;
type Part = Extract<ReturnType<typeof author>, { ok: true }>['value'];

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const T = 0.912; // 20 gauge steel sheet, 0.0359 inch
const STEEL = 7.85e-3; // grams per cubic millimetre

// ---- display model
const RULE = { innerRadius: 1, kFactor: 0.44 }; // air bend
const COVER = { width: 240, height: 320, flange: 12, notch: 6 }; // the flanges stop short of each corner
const LOUVER = { length: 90, width: 10, pitch: 22, columns: [65, 175], top: 76 }; // top: from the top edge to the first row
const SCREWS: P2[] = [[10, 10], [230, 10], [10, 160], [230, 160], [10, 310], [230, 310]];
const BOX = { depth: 90, rim: 20 };
const PLATE = { width: 70, height: 22, y: 20 }; // the name plate

const made = (r: ReturnType<typeof author>): Part => {
  const p = unwrap(r);
  if (p.solid) own(p.solid);
  return p;
};
const ngon = (x: number, y: number, r: number, n: number): P2[] =>
  Array.from({ length: n }, (_, i): P2 => [x + r * Math.cos((i * 2 * Math.PI) / n), y + r * Math.sin((i * 2 * Math.PI) / n)]);

// The cover is made face down: X is across, Y is from the top edge down, and the flanges fold up. The louvers go out of the face and open toward +Y.
function cover(rows: number, height: number, angle: number): Part {
  const flange = (id: string, side: 'xmin' | 'xmax' | 'ymin' | 'ymax', edge: number) =>
    ({ id, side, length: COVER.flange, angleDeg: angle, rule: RULE, offset: COVER.notch, width: edge - 2 * COVER.notch });
  let p = made(author({ thickness: T, base: { length: COVER.width, width: COVER.height }, flanges: [
    flange('left', 'xmin', COVER.height), flange('right', 'xmax', COVER.height), flange('top', 'ymin', COVER.width), flange('bottom', 'ymax', COVER.width),
  ] }));
  for (let row = 0; row < rows; row++) {
    for (const x of LOUVER.columns) p = made(louver(p, { region: 'base', x, y: LOUVER.top + row * LOUVER.pitch, length: LOUVER.length, width: LOUVER.width, height }));
  }
  for (const [x, y] of SCREWS) p = made(addPolygonCutout(p, 'base', ngon(x, y, 2.4, 16)));
  return p;
}

const block = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Shape => own(translate(own(box(x1 - x0, y1 - y0, z1 - z0)), [x0, y0, z0])) as Shape;
const lathe = (profile: P2[]): Shape => own(unwrap(revolve(own(unwrap(polygon(profile.map(([r, z]): P3 => [r, 0, z])))))) as Shape);

// The enclosure and the small parts, in the frame of the cover: the face is on Z = 0, and the back is on Z = T.
function hardware() {
  const { width: w, height: h } = COVER;
  const outward = (s: Shape): Shape => own(rotate(s, 180, { axis: [1, 0, 0] })) as Shape; // a turned part that points out of the face
  // The enclosure: a box with a rim for the screws. The cover lies on the rim, and its flanges go around the box.
  const holes = SCREWS.map(([x, y]) => own(cylinder(1.6, 12, { at: [x, y, T] })));
  const body = own(unwrap(cutAll(block(0, 0, T, w, h, T + BOX.depth), [block(BOX.rim, BOX.rim, T - 1, w - BOX.rim, h - BOX.rim, T + BOX.depth - 2), ...holes]))) as Shape;
  // Pan head screws with a cross recess.
  const head = lathe([[0, 0], [3.6, 0], [3.6, 1.2], [2.2, 2.6], [0, 2.6]]);
  const cross = [0, 90].map((turn) => own(rotate(block(-2.1, -0.4, 1.7, 2.1, 0.4, 3), turn)));
  const screw = outward(own(unwrap(cutAll(head, cross))) as Shape);
  const shank = own(cylinder(1.6, T + 10));
  const screws = SCREWS.flatMap(([x, y]) => [own(translate(screw, [x, y, 0])) as Shape, own(translate(shank, [x, y, 0])) as Shape]);
  // The name plate, with a rivet at each end.
  const px = w / 2 - PLATE.width / 2;
  const plate = block(px, PLATE.y, -0.8, px + PLATE.width, PLATE.y + PLATE.height, 0);
  const rivet = outward(lathe([[0, 0], [1.8, 0], [1.2, 0.8], [0, 0.8]]));
  const rivets = [px + 5, px + PLATE.width - 5].map((x) => own(translate(rivet, [x, PLATE.y + PLATE.height / 2, -0.8])) as Shape);
  // Two cable glands under the box: a hex nut, a dome nut, and a piece of cable.
  const hex = (r: number, z0: number, z1: number): Shape =>
    own(unwrap(cutAll(own(cylinder(r * 1.3, z1 - z0, { at: [0, 0, z0] })), [0, 60, 120].flatMap((turn) => [-1, 1].map((side) => own(rotate(block(-2 * r, side > 0 ? r : -3 * r, z0 - 1, 2 * r, side > 0 ? 3 * r : -r, z1 + 1), turn))))))) as Shape;
  const gland = [hex(9, 0, 5), lathe([[0, 5], [8, 5], [8, 13], [6.5, 17], [0, 17]])];
  const cable = own(cylinder(4, 28, { at: [0, 0, 17] }));
  const down = (s: Shape, x: number): Shape => own(translate(own(rotate(s, -90, { axis: [1, 0, 0] })), [x, h, T + BOX.depth / 2])) as Shape;
  const glands = [70, 170].flatMap((x) => gland.map((s) => down(s, x)));
  const cables = [70, 170].map((x) => down(cable, x));
  return { body: unwrap(clone(body)) as Shape, bright: compound([...screws, ...rivets, ...glands]) as Shape, plate: unwrap(clone(plate)) as Shape, cables: compound(cables) as Shape };
}

function panel({ fold = 1, rows = 9, height = 6 }: PanelParams = {}) {
  const n = Math.min(9, Math.max(1, Math.round(rows)));
  const part = cover(n, height, 90 * Math.min(1, Math.max(0.02, fold)));
  // The report and the flat blank come from the full cover, also when the view is part folded.
  const full = fold < 1 ? cover(n, height, 90) : part;
  const flat = unwrap(unfold(full));
  [flat.pattern.outline, ...flat.pattern.holes, ...flat.pattern.formCuts, ...flat.pattern.formMarkers, ...flat.pattern.formHinges, ...flat.pattern.bendLines.map((l) => l.line)].forEach((handle) => own(handle));
  const count = n * LOUVER.columns.length;
  const info = {
    dxf: unwrap(toDXF(flat.pattern)), overlay2d: flatPatternToPolylines(flat.pattern),
    size: flat.report.totalFlatSize, allowance: flat.report.bends[0]?.allowance ?? 0, bends: flat.report.bends.length,
    grams: unwrap(measureVolume(full.solid as Shape)) * STEEL, count, vent: (count * LOUVER.length * height) / 100,
  };
  const sheet = unwrap(clone(part.solid as Shape)) as Shape;
  return fold < 1 ? { sheet, ...info } : { sheet, ...hardware(), ...info };
}

// Try panel({ fold: 0.4 }) to see the flanges part folded, or panel({ rows: 5, height: 9 }).
const model = freeing(() => panel());
console.log(
  model.count + ' louvers with a free area of ' + model.vent.toFixed(0) + ' cm2. ' + model.bends + ' bends, each with an allowance of ' + model.allowance.toFixed(2) + ' mm. ' +
    'Flat blank: ' + model.size.map((v) => v.toFixed(1)).join(' x ') + ' mm. Mass of the cover: ' + model.grams.toFixed(0) + ' g from the kernel volume.',
);

// Stand the cover up, with its face toward the camera. The louvers open down.
const show = (s: Shape, css: string) => {
  const up = rotate(s, -90, { axis: [1, 0, 0] });
  const turned = rotate(up, 90, { axis: [0, 0, 1] });
  s.delete();
  up.delete();
  return color(turned, css);
};
// The DXF button downloads the flat blank: the outline, the bend lines, the holes, and the three cuts of each louver.
export default present(
  [show(model.sheet, '#12b5b0'), ...('body' in model ? [show(model.body, '#48515c'), show(model.bright, '#e9ebee'), show(model.plate, '#f5f2ea'), show(model.cables, '#2b2f36')] : [])],
  { dxf: model.dxf, overlay2d: model.overlay2d },
);`,
  },
  {
    id: 'sheet-metal-hemmed-panel',
    label: 'Hemmed Parts Tray',
    description:
      'A parts tray from 16 gauge steel with a hemmed safe edge, in cutaway: the top of each wall folds back on itself, and the cut shows the section of two hems. Set the type of the hem to closed, open, teardrop or rolled. The gauge is a published figure. The kernel gives the sheet that one hem takes, unfolds the tray to the flat blank and measures its mass. The size, the handles, the feet and the hardware in the tray are a display model. The DXF button downloads the flat blank.',
    code: `import { box, compound, cut, cylinder, extrude, measureVolume, polygon, revolve, translate, unwrap } from 'brepjs/quick';
import { addPolygonCutout, author, flatPatternToPolylines, hem, relieveCorner, toDXF, unfold } from 'brepjs-sheetmetal';
import { color, present } from 'brepjs/playground';

// Parts tray with a hemmed safe edge, from 16 gauge steel, in cutaway. The top of each wall folds back on itself:
// the hem hides the sharp cut edge and makes the wall stiff. The cut shows the section of two hems.
// The gauge and the density are published figures. The size, the handles, the feet and the hardware in the tray are a display model.
interface TrayParams {
  fold?: number; // 0 to 1: how far the four walls are folded
  type?: 'closed' | 'open' | 'teardrop' | 'rolled'; // the shape of the hem
  cutaway?: number; // 0 to 0.8: the part of the length to cut away (0 = whole tray)
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof box>;
type Part = Extract<ReturnType<typeof author>, { ok: true }>['value'];

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const T = 1.519; // 16 gauge steel sheet, 0.0598 inch
const STEEL = 7.85e-3; // grams per cubic millimetre

// ---- display model
const RULE = { innerRadius: 1.5, kFactor: 0.44 }; // air bend
const TRAY = { length: 150, width: 100, wall: 26 };
const HEM = { length: 8, inset: 6 }; // the return leg, and the distance from each end of a wall
const HANDLE = { length: 44, width: 12, y: 13 }; // a slot in each end wall
const FOOT = { radius: 7, height: 5, inset: 16 };

const made = (r: ReturnType<typeof author>): Part => {
  const p = unwrap(r);
  if (p.solid) own(p.solid);
  return p;
};
// An obround slot along X, as a polygon.
const slot = (x: number, y: number, length: number, width: number): P2[] => {
  const r = width / 2, d = length / 2 - r, n = 8;
  const end = (cx: number, from: number): P2[] => Array.from({ length: n + 1 }, (_, i): P2 => [cx + r * Math.cos(from + (i * Math.PI) / n), y + r * Math.sin(from + (i * Math.PI) / n)]);
  return [...end(x + d, -Math.PI / 2), ...end(x - d, Math.PI / 2)];
};

// The tray: four walls with a relief at each corner, a hem on each wall, and a handle slot in each end wall.
function tray(type: NonNullable<TrayParams['type']>, angle: number): Part {
  const wall = { length: TRAY.wall, angleDeg: angle, rule: RULE };
  let p = made(author({ thickness: T, base: { length: TRAY.length, width: TRAY.width }, flanges: [
    { id: 'left', side: 'xmin', ...wall }, { id: 'right', side: 'xmax', ...wall }, { id: 'front', side: 'ymin', ...wall }, { id: 'back', side: 'ymax', ...wall },
  ] }));
  for (const [a, b] of [['left', 'front'], ['front', 'right'], ['right', 'back'], ['back', 'left']]) p = made(relieveCorner(p, a!, b!));
  for (const [region, edge] of [['left', TRAY.width], ['right', TRAY.width], ['front', TRAY.length], ['back', TRAY.length]] as const) {
    p = made(hem(p, { region, side: 'ymax', type, length: HEM.length, rule: RULE, offset: HEM.inset, width: edge - 2 * HEM.inset }));
  }
  for (const region of ['left', 'right']) p = made(addPolygonCutout(p, region, slot(TRAY.width / 2, HANDLE.y, HANDLE.length, HANDLE.width)));
  return p;
}

function hemmedTray({ fold = 1, type = 'open', cutaway = 0.3 }: TrayParams = {}) {
  const part = tray(type, 90 * Math.min(1, Math.max(0.02, fold)));
  // The report and the flat blank come from the full tray, also when the view is part folded.
  const full = fold < 1 ? tray(type, 90) : part;
  const flat = unwrap(unfold(full));
  [flat.pattern.outline, ...flat.pattern.holes, ...flat.pattern.bendLines.map((l) => l.line)].forEach((handle) => own(handle));
  const overlay2d = flatPatternToPolylines(flat.pattern);
  const xs = overlay2d.outline.map((p) => p[0]), ys = overlay2d.outline.map((p) => p[1]);
  const info = {
    dxf: unwrap(toDXF(flat.pattern)), overlay2d, type,
    size: [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)],
    hem: full.hems?.[0]?.developedLength ?? 0, allowance: flat.report.bends[0]?.allowance ?? 0,
    grams: unwrap(measureVolume(full.solid as Shape)) * STEEL,
  };
  // Four rubber feet under the base.
  const foot = own(unwrap(revolve(own(unwrap(polygon([[0, 0, 0], [FOOT.radius, 0, 0], [FOOT.radius - 1.5, 0, -FOOT.height], [0, 0, -FOOT.height]]))))) as Shape);
  const spots: P2[] = [FOOT.inset, TRAY.length - FOOT.inset].flatMap((x) => [FOOT.inset, TRAY.width - FOOT.inset].map((y): P2 => [x, y]));
  // The cutaway takes one end off the tray, and the feet under that end.
  const edge = TRAY.length * (1 - Math.min(0.8, Math.max(0, cutaway)));
  const feet = spots.filter(([x]) => cutaway <= 0 || x + FOOT.radius < edge).map(([x, y]) => own(translate(foot, [x, y, 0])) as Shape);
  const far = own(translate(own(box(400, 600, 400)), [edge, -300, -200])) as Shape;
  const steel = cutaway > 0 ? (unwrap(cut(part.solid as Shape, far)) as Shape) : (translate(part.solid as Shape, [0, 0, 0]) as Shape);
  // Hardware in the tray, at the end that stays: three hex bolts and a stack of washers.
  const AF = 10, r = AF / Math.sqrt(3), z = T + AF / 2;
  const inTray = (x: number): boolean => cutaway <= 0 || x + 6 < edge;
  const bolts = [28, 46, 64].filter(inTray).flatMap((x) => [
    own(unwrap(extrude(own(unwrap(polygon(Array.from({ length: 6 }, (_, i): P3 => [x + r * Math.cos((i * Math.PI) / 3), 22, z + r * Math.sin((i * Math.PI) / 3)])))), [0, 4, 0]))) as Shape,
    own(cylinder(3, 30, { at: [x, 26, z], axis: [0, 1, 0] })) as Shape,
  ]);
  const washer = own(unwrap(revolve(own(unwrap(polygon([[3.2, 0, 0], [6, 0, 0], [6, 0, 1.6], [3.2, 0, 1.6]]))))) as Shape);
  const washers = [0, 1, 2, 3].filter(() => inTray(46)).map((i) => own(translate(washer, [46, 78, T + i * 1.6])) as Shape);
  const group = (list: Shape[]): Shape[] => (list.length ? [compound(list) as Shape] : []);
  return { steel, feet: group(feet), parts: group([...bolts, ...washers]), ...info };
}

// Try hemmedTray({ type: 'teardrop' }), hemmedTray({ fold: 0.5 }) or hemmedTray({ cutaway: 0 }).
const model = freeing(() => hemmedTray());
console.log(
  'A hem of the type ' + model.type + ' takes ' + model.hem.toFixed(2) + ' mm of sheet. Each wall bend has an allowance of ' + model.allowance.toFixed(2) + ' mm. ' +
    'Flat blank: ' + model.size.map((v) => v.toFixed(1)).join(' x ') + ' mm. Mass of the tray: ' + model.grams.toFixed(0) + ' g from the kernel volume.',
);

// The DXF button downloads the flat blank of the whole tray, with the bend lines of the walls and the hems.
export default present([color(model.steel, '#12b5b0'), ...model.feet.map((s) => color(s, '#2b2f36')), ...model.parts.map((s) => color(s, '#e9ebee'))], { dxf: model.dxf, overlay2d: model.overlay2d });`,
  },
];
