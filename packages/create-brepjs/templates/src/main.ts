/**
 * A minimal brepjs-families model: a wall with a doorway, resolved to an
 * element tree and materialized as a mesh. Run with `npm start`.
 *
 * Copy in richer starter families with `npx brepjs add room storey slab` —
 * they land in src/families/ as code you own.
 */

import 'brepjs/quick';
import { csg } from 'brepjs';
import { family, el, resolve, evaluateModel, tTranslate } from 'brepjs-families';

const Doorway = family<{ readonly width: number; readonly height: number; readonly at: number }>(
  'Doorway',
  (p) =>
    el('Box', {
      size: [p.width, 300, p.height],
      transform: [tTranslate([p.at, 0, 0])],
    }),
  { role: 'fill' }
);

const Wall = family<{ readonly length: number; readonly height: number }>('Wall', (p) =>
  el('Box', {
    size: [p.length, 200, p.height],
    voids: [Doorway({ key: 'door', width: 1000, height: 2100, at: 1500 })],
  })
);

using evaluator = new csg.Evaluator();
const model = evaluateModel(resolve(Wall({ key: 'wall-1', length: 4000, height: 2700 })), evaluator);

for (const [keyPath, node] of model.byKeyPath) {
  if (node.mesh.ok) {
    const triangles = node.mesh.value.triangles.length / 3;
    console.log(`${keyPath}: ${triangles} triangles`);
  } else {
    console.error(`${keyPath}: ${node.mesh.error.message}`);
  }
}
