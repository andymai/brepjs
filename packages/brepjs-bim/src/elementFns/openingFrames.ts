import type { FrameInput } from '../placementFrame.js';
import type { SlabOpeningSpec, WallOpeningSpec } from '../types/bimTypes.js';

/** Panel XY is upright in wall coordinates. Its local Z points into the wall. */
export function wallOpeningFrame(spec: WallOpeningSpec, thickness: number): FrameInput {
  return {
    origin: [
      spec.offsetAlongWall + spec.width / 2,
      thickness,
      spec.offsetFromFloor + spec.height / 2,
    ],
    axisZ: [0, -1, 0],
    axisX: [1, 0, 0],
  };
}
export function slabOpeningFrame(spec: SlabOpeningSpec): FrameInput {
  return {
    origin: [spec.offsetX + spec.sizeX / 2, spec.offsetY + spec.sizeY / 2, 0],
    axisZ: [0, 0, 1],
    axisX: [1, 0, 0],
  };
}
