import type { ValidSolid } from 'brepjs';
import type { IfcGuid } from '../identity/ifcGuid.js';
import type { LocalId } from '../identity/localId.js';
import type { WallSpec } from '../specs/wallSpec.js';
import type { SlabSpec } from '../specs/slabSpec.js';
import type { DoorSpec, WindowSpec } from '../specs/openingSpec.js';
import type {
  ProjectSpec,
  SiteSpec,
  BuildingSpec,
  StoreySpec,
} from '../specs/spatialSpec.js';

export type BimCategory =
  | 'WALL'
  | 'SLAB'
  | 'OPENING'
  | 'DOOR'
  | 'WINDOW'
  | 'PROJECT'
  | 'SITE'
  | 'BUILDING'
  | 'STOREY';

export type WallOpeningSpec = {
  readonly kind: 'WALL_OPENING';
  readonly width: number;
  readonly height: number;
  readonly offsetAlongWall: number;
  readonly offsetFromFloor: number;
};

export type SlabOpeningSpec = {
  readonly kind: 'SLAB_OPENING';
  readonly sizeX: number;
  readonly sizeY: number;
  readonly offsetX: number;
  readonly offsetY: number;
};

export type OpeningSpec = WallOpeningSpec | SlabOpeningSpec;

export function isWallOpening(spec: OpeningSpec): spec is WallOpeningSpec {
  return spec.kind === 'WALL_OPENING';
}

export function isSlabOpening(spec: OpeningSpec): spec is SlabOpeningSpec {
  return spec.kind === 'SLAB_OPENING';
}

export type BimSpecFor<C extends BimCategory> = C extends 'WALL'
  ? WallSpec
  : C extends 'SLAB'
    ? SlabSpec
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

export type BimGeometryFor<C extends BimCategory> = C extends 'WALL' | 'SLAB'
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
  | BimElement<'SLAB'>
  | BimElement<'OPENING'>
  | BimElement<'DOOR'>
  | BimElement<'WINDOW'>
  | BimElement<'PROJECT'>
  | BimElement<'SITE'>
  | BimElement<'BUILDING'>
  | BimElement<'STOREY'>;
