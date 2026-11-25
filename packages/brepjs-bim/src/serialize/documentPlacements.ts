import {err,ok,type Result} from 'brepjs';
import {ifcError,type BimError} from '../errors/bimError.js';
import type {RecordRef} from '../identity/recordRef.js';
import type {AnyBimElement} from '../types/bimTypes.js';
import type {FrameInput} from '../placementFrame.js';
import type {IfcWriter} from '../ifc-writer/ifcWriter.js';
import {writeBodyPlacement} from '../ifc-writer/tessellationWriter.js';

interface Entry {readonly record:RecordRef;readonly parent?:RecordRef;readonly frame:FrameInput}

/** Plan once before allocating the IFC writer. Insert parents before products in either branch. */
export function placementSchedule(records: readonly AnyBimElement[]):Result<readonly Entry[],BimError> {
  const pending=new Map<RecordRef,Entry>();
  for(const record of records) {
    const placement=record.placement;
    if(!placement) continue;
    if(placement.kind!=='LOCAL_FRAME') return err(ifcError('PLACEMENT_REFERENCE_UNRESOLVED',`IFC cannot encode ${placement.kind}`,undefined,{record:record.localId}));
    pending.set(record.localId,{record:record.localId,frame:placement.frame,...(placement.relativeTo===undefined?{}:{parent:placement.relativeTo})});
  }
  const ordered:Entry[]=[];
  const emitted=new Set<RecordRef>();
  for(const ref of pending.keys()){
    let current:RecordRef|undefined=ref;
    const chain:Entry[]=[];
    const visited=new Set<RecordRef>();
    while(current!==undefined&&!emitted.has(current)) {
      const entry=pending.get(current);
      if(!entry||visited.has(current)) return err(ifcError('IFC_UNREPRESENTABLE_PLACEMENT_PARENT','Cannot encode placement parent',undefined,{record:ref,parent:current}));
      chain.push(entry);visited.add(current);current=entry.parent;
    }
    for(const entry of chain.reverse()){ordered.push(entry);emitted.add(entry.record);}
  }
  return ok(ordered);
}

export function writeDocumentPlacements(w:IfcWriter,ordered:readonly Entry[]) {
  const placements=new Map<RecordRef,number>();
  const placementOf=(ref:RecordRef):number=>{
    const id=placements.get(ref);
    if(id===undefined) throw new Error('Missing preflighted document placement');
    return id;
  };
  for(const entry of ordered) placements.set(entry.record,writeBodyPlacement(w,entry.frame,entry.parent===undefined?null:placementOf(entry.parent)));
  return placementOf;
}
