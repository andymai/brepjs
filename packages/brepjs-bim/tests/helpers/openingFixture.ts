import { bodySolids } from '../../src/types/productBody.js';
import { getKernel, getSolids, isValidSolid, unwrap } from 'brepjs';
import type { BimModel } from '../../src/model/bimModel.js';
import type { WallSpec } from '../../src/specs/wallSpec.js';
import type { LocalId } from '../../src/identity/localId.js';

export const OPENING_WALL: WallSpec = {
  length: 10,
  height: 6,
  thickness: 1,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Brick',
};

export const DOOR = {
  width: 2,
  height: 3,
  offsetAlongWall: 1,
  offsetFromFloor: 0,
  materialName: 'Wood',
};

export const WINDOW = {
  width: 1,
  height: 1,
  offsetAlongWall: 6,
  offsetFromFloor: 3,
  materialName: 'Glass',
};

export type OpeningCommand = 'Door' | 'Window' | 'Slab';

export function openingHost(model: BimModel, kind: OpeningCommand) {
  const hostId = unwrap(
    kind === 'Slab'
      ? model.addSlab({ ...OPENING_WALL, width: 10, predefinedType: 'FLOOR' })
      : model.addWall(OPENING_WALL)
  );
  return {
    hostId,
    volume: kind === 'Slab' ? 100 : 60,
    cutVolume: kind === 'Slab' ? 94 : kind === 'Door' ? 54 : 59,
    cutPrefix: kind === 'Slab' ? 'SLAB_OPENING' : 'WALL_OPENING',
    toolPrefix: kind === 'Slab' ? 'SLAB_OPENING' : 'OPENING',
    solid() {
      const host = model.getElement(hostId);
      if (host?.category === 'SLAB') return host.geometry;
      return singletonWallSolid(model, hostId);
    },
    open() {
      if (kind === 'Slab')
        return model.addSlabOpening(
          { slabLocalId: hostId, sizeX: 2, sizeY: 3, offsetX: 1, offsetY: 1 },
          { stableKey: 'opening' }
        );
      return model[kind === 'Door' ? 'addDoor' : 'addWindow'](
        { ...(kind === 'Door' ? DOOR : WINDOW), wallLocalId: hostId },
        { stableKey: 'filler', openingStableKey: 'opening' }
      );
    },
  };
}

export function singletonWallSolid(model: BimModel, id: LocalId) {
  const wall = model.getElement(id);
  if (wall?.category !== 'WALL' || bodySolids(wall.geometry).length !== 1) {
    throw new Error('Expected a singleton Wall Body');
  }
  const retained = bodySolids(wall.geometry)[0];
  if (getKernel().shapeType(retained.wrapped) !== 'compound') return retained;
  const [child, ...others] = getSolids(retained);
  if (!child || others.length !== 0 || !isValidSolid(child))
    throw new Error('Expected one solid in recipe wrapper');
  return child;
}
