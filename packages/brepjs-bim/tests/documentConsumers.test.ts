import { beforeAll, expect, it } from 'vitest';
import { csg, unwrap } from 'brepjs';
import { el, family, resolve, tTranslate } from 'brepjs-families';
import { familiesToBim } from '../src/index.js';
import { initKernel } from '../../../tests/setup.js';

beforeAll(async () => { await initKernel(); });
const Pad = family('Pad', () => el('Box', { size: [8, 6, 4], transform: [tTranslate([10,0,0])] }), {archetype:'footing'});
const Level = family('Level', () => el('Group', { transform: [tTranslate([100,0,0])] }, [Pad({key:'pad'})]), {archetype:'storey'});
function fixture() {
  const root = resolve(Level({key:'level'}));
  return {...root, props:{...root.props,elevation:400}, children:root.children.map(child=>({...child,props:{...child.props,length:8,width:6,thickness:4,materialName:'Concrete'}}))};
}
it('addresses the projected occurrence by key and resolves the storey translation and elevation once', () => {
  const projected = unwrap(familiesToBim(fixture(), {project:{name:'Document'}}));
  using doc = projected.model;
  const pad = unwrap(doc.lookupKey('level/pad'));
  const storey = unwrap(doc.lookupKey('level'));
  expect(projected.idByKeyPath.get('level/pad')).toBe(pad);
  expect(unwrap(doc.frame(pad,storey)).frame.matrix.slice(12,15)).toEqual([10,0,0]);
  expect(unwrap(doc.frame(pad,'WORLD')).frame.matrix.slice(12,15)).toEqual([110,0,400]);
});
it('rejects a mismatched occurrence wrapper with the affected key',()=>{
  const root=fixture();
  const children=root.children.map(child=>({...child,geometry:csg.translate(child.geometry,[999,0,0])}));
  expect(familiesToBim({...root,children},{project:{name:'Invalid'}})).toMatchObject({ok:false,error:{code:'FAMILIES_INVALID_PLACEMENT',message:expect.stringContaining('level/pad')}});
});
