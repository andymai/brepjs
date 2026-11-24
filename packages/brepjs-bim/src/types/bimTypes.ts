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
import type { ZoneSpec, SystemSpec } from '../specs/groupSpec.js';
import type { ProjectSpec, SiteSpec, BuildingSpec, StoreySpec } from '../specs/spatialSpec.js';
import type {
  BridgePartSpec,
  BridgeSpec,
  EarthworksFillSpec,
} from '../specs/infrastructureSpec.js';
import type { PlacementDefinition } from './placementDefinition.js';
import type { ProductBody } from './productBody.js';

export const bodyClassifications = [
  'WALL',
  'RAILING',
  'MEMBER',
  'DOOR',
  'WINDOW',
  'STAIR',
  'RAMP',
  'SLAB',
  'ROOF',
  'SPACE',
  'COVERING',
  'BEAM',
  'COLUMN',
  'FOOTING',
  'PILE',
  'PROXY',
  'EARTHWORKS_FILL',
] as const;
export type BodyClassification = (typeof bodyClassifications)[number];

export type BimCategory =
  | BodyClassification
  | 'OPENING'
  | 'CURTAIN_WALL'
  | 'ELEMENT_ASSEMBLY'
  | 'ZONE'
  | 'SYSTEM'
  | 'PROJECT'
  | 'SITE'
  | 'BRIDGE'
  | 'BRIDGE_PART'
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
            ? Omit<DoorSpec, 'wallLocalId' | 'offsetFromFloor' | 'offsetAlongWall'>
            : C extends 'WINDOW'
              ? Omit<WindowSpec, 'wallLocalId' | 'offsetFromFloor' | 'offsetAlongWall'>
              : C extends 'PROXY'
                ? Omit<ProxySpec, 'solid'>
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
                                    : C extends 'ZONE'
                                      ? ZoneSpec
                                      : C extends 'SYSTEM'
                                        ? SystemSpec
                                        : C extends 'PROJECT'
                                          ? ProjectSpec
                                          : C extends 'SITE'
                                            ? SiteSpec
                                            : C extends 'BRIDGE'
                                              ? BridgeSpec
                                              : C extends 'BRIDGE_PART'
                                                ? BridgePartSpec
                                                : C extends 'EARTHWORKS_FILL'
                                                  ? Omit<EarthworksFillSpec, 'solid'>
                                                  : C extends 'BUILDING'
                                                    ? BuildingSpec
                                                    : C extends 'STOREY'
                                                      ? StoreySpec
                                                      : never;

export type BimGeometryFor<C extends BimCategory> = C extends 'CURTAIN_WALL'
  ? CurtainWallGrid
  : C extends BodyClassification
    ? ProductBody
    : null;

type BodySpec<C extends BimCategory> =
  BimGeometryFor<C> extends ProductBody ? BimSpecFor<C> | null : BimSpecFor<C>;

type RecordGeometry<C extends BimCategory> =
  BimGeometryFor<C> extends ProductBody
    ? {
        readonly representation: 'BODY';
        readonly placement: PlacementDefinition;
        readonly geometry: BimGeometryFor<C>;
      }
    : { readonly representation?: never; readonly geometry: BimGeometryFor<C> };

export type BimElement<C extends BimCategory> = RecordGeometry<C> & {
  readonly guid: IfcGuid;
  readonly localId: LocalId;
  readonly category: C;
  readonly spec: BodySpec<C>;
};

export type AnyBimElement = { [C in BimCategory]: BimElement<C> }[BimCategory];
