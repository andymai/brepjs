import type { ValidSolid } from 'brepjs';
import type { IfcGuid } from '../identity/ifcGuid.js';
import type { LocalId } from '../identity/localId.js';
import type { WallSpec } from '../specs/wallSpec.js';
import type { SlabSpec } from '../specs/slabSpec.js';
import type { BeamSpec } from '../specs/beamSpec.js';
import type { ColumnSpec } from '../specs/columnSpec.js';
import type { DoorSpec, WindowSpec } from '../specs/openingSpec.js';
import type { ProxySpec } from '../specs/proxySpec.js';
import type { SpaceSpec } from '../specs/spaceSpec.js';
import type { RoofSpec } from '../specs/roofSpec.js';
import type { CurtainWallSpec } from '../specs/curtainWallSpec.js';
import type { CurtainWallGrid } from '../elementFns/curtainWallFns.js';
import type { FootingSpec, PileSpec } from '../specs/foundationSpec.js';
import type { StairSpec } from '../specs/stairSpec.js';
import type { RampSpec } from '../specs/rampSpec.js';
import type { RailingSpec } from '../specs/railingSpec.js';
import type { CoveringSpec } from '../specs/coveringSpec.js';
import type { ElementAssemblySpec } from '../specs/assemblySpec.js';
import type {
  ProjectSpec,
  SiteSpec,
  BuildingSpec,
  StoreySpec,
} from '../specs/spatialSpec.js';

export type BimCategory =
  | 'WALL'
  | 'SLAB'
  | 'BEAM'
  | 'COLUMN'
  | 'OPENING'
  | 'DOOR'
  | 'WINDOW'
  | 'PROXY'
  | 'SPACE'
  | 'ROOF'
  | 'CURTAIN_WALL'
  | 'FOOTING'
  | 'PILE'
  | 'STAIR'
  | 'RAMP'
  | 'RAILING'
  | 'COVERING'
  | 'ELEMENT_ASSEMBLY'
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
    : C extends 'BEAM'
      ? BeamSpec
      : C extends 'COLUMN'
        ? ColumnSpec
        : C extends 'OPENING'
          ? OpeningSpec
          : C extends 'DOOR'
            ? DoorSpec
            : C extends 'WINDOW'
              ? WindowSpec
              : C extends 'PROXY'
                ? ProxySpec
                : C extends 'SPACE'
                  ? SpaceSpec
                  : C extends 'ROOF'
                    ? RoofSpec
                    : C extends 'CURTAIN_WALL'
                      ? CurtainWallSpec
                      : C extends 'FOOTING'
                        ? FootingSpec
                        : C extends 'PILE'
                          ? PileSpec
                          : C extends 'STAIR'
                            ? StairSpec
                            : C extends 'RAMP'
                              ? RampSpec
                              : C extends 'RAILING'
                                ? RailingSpec
                                : C extends 'COVERING'
                                  ? CoveringSpec
                                  : C extends 'ELEMENT_ASSEMBLY'
                                    ? ElementAssemblySpec
                                    : C extends 'PROJECT'
                                      ? ProjectSpec
                                      : C extends 'SITE'
                                        ? SiteSpec
                                        : C extends 'BUILDING'
                                          ? BuildingSpec
                                          : C extends 'STOREY'
                                            ? StoreySpec
                                            : never;

export type BimGeometryFor<C extends BimCategory> = C extends 'CURTAIN_WALL'
  ? CurtainWallGrid
  : C extends
        | 'WALL'
        | 'SLAB'
        | 'BEAM'
        | 'COLUMN'
        | 'PROXY'
        | 'SPACE'
        | 'ROOF'
        | 'FOOTING'
        | 'PILE'
        | 'RAILING'
        | 'COVERING'
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
  | BimElement<'BEAM'>
  | BimElement<'COLUMN'>
  | BimElement<'OPENING'>
  | BimElement<'DOOR'>
  | BimElement<'WINDOW'>
  | BimElement<'PROXY'>
  | BimElement<'SPACE'>
  | BimElement<'ROOF'>
  | BimElement<'CURTAIN_WALL'>
  | BimElement<'FOOTING'>
  | BimElement<'PILE'>
  | BimElement<'STAIR'>
  | BimElement<'RAMP'>
  | BimElement<'RAILING'>
  | BimElement<'COVERING'>
  | BimElement<'ELEMENT_ASSEMBLY'>
  | BimElement<'PROJECT'>
  | BimElement<'SITE'>
  | BimElement<'BUILDING'>
  | BimElement<'STOREY'>;
