import {box,unwrap} from 'brepjs';
import {expect,it} from 'vitest';
import {authoring,BimDocument} from '../src/index.js';
import {identityPlacement} from '../src/types/placementDefinition.js';

it('adopts caller items in the same document as generated curtain children',()=>{
  using document=new BimDocument();
  const builder=authoring(document);
  const curtain=unwrap(builder.addCurtainWall({
    width:3000,height:2400,panelThickness:80,columns:2,rows:2,mullionWidth:40,mullionDepth:90,
    origin:[100,200,300],axisX:[1,0,0],axisZ:[0,0,1],materialName:'Aluminium',
  },{stableKey:'facade'}));
  expect(unwrap(document.record(curtain)).representation).toBe('NONE');
  const children=document.getChildren(curtain);
  expect(children.some(c=>c.category==='MEMBER')).toBe(true);
  expect(children.some(c=>c.category==='PLATE')).toBe(true);
  for(const c of children) expect(c.placement).toMatchObject({relativeTo:curtain});
  const plate=children.find(c=>c.category==='PLATE');
  if(!plate) throw Error('missing panel');
  const replacement=box(5,6,7);
  unwrap(document.replaceBody({localId:plate.localId,body:{kind:'AUTHORITATIVE',solids:[replacement]}}));
  expect(unwrap(document.materialVolume(plate.localId))).toBeCloseTo(210);
  expect(document.isRecipeQuantityEligible(plate.localId)).toBe(false);
  unwrap(document.move(curtain,identityPlacement.frame));
  expect(unwrap(document.record(plate.localId)).guid).toBe(plate.guid);
  expect(document.getChildren(curtain)).toHaveLength(children.length);
});
