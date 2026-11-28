import { unwrap } from 'brepjs';
import type { BimDocument } from '../../src/index.js';
import { authoring, type RecordRef } from '../../src/index.js';

/** Give an isolated exchange fixture a real spatial home without changing its placement. */
export function addDeliveryStorey(document: BimDocument, ...elements: RecordRef[]) {
  const project = document.getProject();
  if (!project) throw Error('Expected fixture project');
  const commands = authoring(document);
  const site = unwrap(commands.addSite({ name: 'Site' }));
  const building = unwrap(commands.addBuilding({ name: 'Building' }, { placementParent: site }));
  const storey = unwrap(
    commands.addStorey({ name: 'Level', elevation: 0 }, { placementParent: building })
  );
  unwrap(document.aggregate(project.localId, site));
  unwrap(document.aggregate(site, building));
  unwrap(document.aggregate(building, storey));
  for (const ref of elements) unwrap(document.placeIn(ref, storey));
  return storey;
}
