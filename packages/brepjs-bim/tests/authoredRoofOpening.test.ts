import * as brep from 'brepjs';
import { expect,it,vi } from 'vitest';
import {BimDocument,authoring} from '../src/index.js';
import {identityPlacement} from '../src/types/placementDefinition.js';
import {cutOpeningSolid} from '../src/elementFns/cutOpeningSolid.js';

const frame={...identityPlacement.frame,origin:[2000,1000,0] as const};
const opening={slot:'skylight',frame,definition:{kind:'ROOF_OPENING' as const,sizeX:1000,sizeY:1000,depth:200}};
it('adopts a notched Roof and existing hole at the authored locations exactly once',()=>{
  using document=new BimDocument();
  using plate=brep.box(6000,4000,200);
  const subtract=(host:brep.ValidSolid,width:number,height:number,x:number,y:number)=>{
    using blank=brep.box(width,height,400);
    return brep.unwrap(cutOpeningSolid({host,hostKind:'SLAB',makeTool:()=>brep.ok(brep.translate(blank,[x,y,-100]))}));
  };
  using notched=subtract(plate,2000,2000,4000,2000);
  const finished=subtract(notched,1000,1000,1500,500);
  const cut=vi.spyOn(brep,'cut');
  const {roof,opening:hole}=brep.unwrap(authoring(document).addRoofWithOpening({
    stableKey:'R-01',placement:{kind:'LOCAL_FRAME',frame:{...identityPlacement.frame,origin:[100,200,300]}},solids:[finished],opening,
  }));
  expect(cut).not.toHaveBeenCalled(); cut.mockRestore();
  expect(brep.unwrap(document.lookupKey('R-01/void/skylight'))).toBe(hole);
  expect(brep.unwrap(document.record(roof)).category).toBe('ROOF');
  expect(brep.unwrap(document.record(hole))).toMatchObject({representation:'NONE',placement:{relativeTo:roof}});
  expect(document.getAllRelationships()).toMatchObject([{kind:'VOIDS',hostLocalId:roof,openingLocalId:hole}]);
  expect(brep.unwrap(document.materialVolume(roof))).toBeCloseTo(3_800_000_000,1);
  const b=brep.unwrap(document.bounds(roof,'WORLD')).bounds;
  [b.xMin,b.xMax,b.yMin,b.yMax,b.zMin,b.zMax].forEach((v,i)=>expect(v).toBeCloseTo([100,6100,200,4200,300,500][i]??NaN,3));
  const source=brep.unwrap(document.placedSolids(roof,'LOCAL'))[0]; if(!source)throw Error('missing roof');
  using held=source;
  for(const [x,y,occupied] of [[2000,1000,false],[5000,3000,false],[3000,2000,true]] as const){
    using sample=subtract(held,10,10,x,y);
    expect(brep.unwrap(brep.measureVolume(sample))).toBeCloseTo(3_800_000_000-(occupied?20000:0),1);
  }
  brep.unwrap(document.move(roof,{...identityPlacement.frame,origin:[1000,0,0]}));
  expect(brep.unwrap(document.frame(hole,'WORLD')).frame.matrix.slice(12,15)).toEqual([3000,1000,0]);
});

it('rolls back a Roof staged before an invalid Opening frame',()=>{
  using doc=new BimDocument();
  const body=brep.box(1,1,1);
  const input={stableKey:'R',solids:[body] as const,placement:identityPlacement,opening};
  const build=authoring(doc);
  expect(build.addRoofWithOpening({...input,opening:{...opening,frame:{...frame,axisZ:[0,0,0]}}}).ok).toBe(false);
  expect(doc.getAllElements()).toHaveLength(0);
  expect(doc.getAllRelationships()).toHaveLength(0);
  expect(doc.lookupKey('R').ok).toBe(false);
  expect(brep.unwrap(brep.measureVolume(body))).toBeCloseTo(1);
  brep.unwrap(build.addRoofWithOpening(input));
});
