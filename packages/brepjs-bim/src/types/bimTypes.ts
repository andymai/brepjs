import type { ValidSolid } from 'brepjs';
import type { IfcGuid } from '../identity/ifcGuid.js';
import type { LocalId } from '../identity/localId.js';
import type { WallSpec } from '../specs/wallSpec.js';
import type { DoorSpec, WindowSpec } from '../specs/openingSpec.js';
import type {
  ProjectSpec,
  SiteSpec,
  BuildingSpec,
  StoreySpec,
} from '../specs/spatialSpec.js';

export type BimCategory = 'WALL' | 'OPENING' | 'DOOR' | 'WINDOW' | 'PROJECT' | 'SITE' | 'BUILDING' | 'STOREY';

export type OpeningSpec = {
  readonly width: number;
  readonly height: number;
  readonly offsetAlongWall: number;
  readonly offsetFromFloor: number;
};

export type BimSpecFor<C extends BimCategory> = C extends 'WALL'
  ? WallSpec
  : C extends 'OPENING'
    ? OpeningSpec
    : C extends 'DOOR'
      ? DoorSpec
      : C extends 'WINDOW'
        ? WindowSpec
        : C extends 'PROJECT'
          ? ProjectSpec
          : C extends 'SITE'
            ? SiteSpec
            : C extends 'BUILDING'
              ? BuildingSpec
              : C extends 'STOREY'
                ? StoreySpec
                : never;

export type BimGeometryFor<C extends BimCategory> = C extends 'WALL'
  ? ValidSolid
  : null;

export interface BimElement<C extends BimCategory> {
  readonly guid: IfcGuid;
  readonly localId: LocalId;
  readonly category: C;
  readonly spec: BimSpecFor<C>;
  readonly geometry: BimGeometryFor<C>;
}

export type AnyBimElement =
  | BimElement<'WALL'>
  | BimElement<'OPENING'>
  | BimElement<'DOOR'>
  | BimElement<'WINDOW'>
  | BimElement<'PROJECT'>
  | BimElement<'SITE'>
  | BimElement<'BUILDING'>
  | BimElement<'STOREY'>;
