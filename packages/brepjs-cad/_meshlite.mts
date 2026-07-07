import { init } from 'brepjs';
await init();
const { default: gear } = await import('./skills/implement/examples/spur-gear.brep.ts');
const { translate, rotate, intersect, measureVolume, unwrap } = await import('brepjs');
const A = gear();
let minVol = Infinity;
for (const ph of [9.0, 13.5, 18.0]) { // around the half-tooth (toothDeg=18) meshing phase
  let B = rotate(gear(), ph, [0,0,0], [0,0,1]);
  B = translate(B, [40, 0, 0]);
  const inter = intersect(A, B);
  if (!inter.ok) { console.log('phase', ph, 'intersect-err'); continue; }
  const v = unwrap(measureVolume(unwrap(inter)));
  console.log('phase', ph, 'deg -> interference', v.toFixed(4), 'mm^3');
  if (v < minVol) minVol = v;
}
console.log('MIN', minVol.toFixed(4), minVol < 2 ? '=> MESHES (clearance)' : '=> JAMS');
