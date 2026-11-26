// Run after workspace builds. Each duration covers every Member in one document.
import 'brepjs/quick';
import { box, unwrap } from 'brepjs';
import { BimDocument, authoring } from 'brepjs-bim';

const placement = {
  kind: 'LOCAL_FRAME',
  frame: { origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1] },
};
console.log('Members\taddAuthoredBody ms\tplaceIn ms\treparent ms');
for (const count of [250, 500, 1000, 2000]) {
  const document = new BimDocument();
  try {
    const storey = unwrap(authoring(document).addStorey({ name: 'L', elevation: 0 }));
    const solids = Array.from({ length: count }, () => box(1, 1, 1));
    const start = performance.now();
    const members = solids.map((solid) =>
      unwrap(document.addAuthoredBody({ category: 'MEMBER', placement, solids: [solid] }))
    );
    const added = performance.now();
    for (const member of members) unwrap(document.placeIn(member, storey));
    const contained = performance.now();
    for (const member of members) unwrap(document.reparent(member, storey, 'KEEP_LOCAL'));
    const placed = performance.now();
    console.log(
      [count, added - start, contained - added, placed - contained].map(Math.round).join('\t')
    );
  } finally {
    document[Symbol.dispose]();
  }
}
