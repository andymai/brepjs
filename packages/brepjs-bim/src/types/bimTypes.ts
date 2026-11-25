import type { IfcGuid } from '../identity/ifcGuid.js';
import type { RecordRef } from '../identity/recordRef.js';
import type { WallSpec } from '../specs/wallSpec.js';
import type { SlabSpec } from '../specs/slabSpec.js';
import type { BeamSpec } from '../specs/beamSpec.js';
import type { ColumnSpec } from '../specs/columnSpec.js';
import type { DoorSpec, WindowSpec } from '../specs/openingSpec.js';
import type { ProxySpec } from '../specs/proxySpec.js';
import type { SpaceSpec } from '../specs/spaceSpec.js';
import type { RoofSpec } from '../specs/roofSpec.js';
import type { CurtainWallSpec } from '../specs/curtainWallSpec.js';
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
import type { Body } from './body.js';

export const bodyClassifications = [
  'WALL',
  'RAILING',
  'MEMBER',
  'PLATE',
  'SIGN',
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

export interface CurtainComponentSpec {
  readonly name: string;
  readonly size: readonly [number, number, number];
}

interface ClassificationSpecs {
  WALL: WallSpec;
  SLAB: SlabSpec;
  BEAM: BeamSpec;
  COLUMN: ColumnSpec;
  OPENING: OpeningSpec;
  DOOR: Omit<DoorSpec, 'wallLocalId' | 'offsetFromFloor' | 'offsetAlongWall'>;
  WINDOW: Omit<WindowSpec, 'wallLocalId' | 'offsetFromFloor' | 'offsetAlongWall'>;
  PROXY: Omit<ProxySpec, 'solid'>;
  SPACE: SpaceSpec;
  ROOF: RoofSpec;
  CURTAIN_WALL: CurtainWallSpec;
  FOOTING: FootingSpec;
  PILE: PileSpec;
  STAIR: StairSpec;
  RAMP: RampSpec;
  RAILING: RailingSpec;
  COVERING: CoveringSpec;
  ELEMENT_ASSEMBLY: ElementAssemblySpec;
  ZONE: ZoneSpec;
  SYSTEM: SystemSpec;
  PROJECT: ProjectSpec;
  SITE: SiteSpec;
  BRIDGE: BridgeSpec;
  BRIDGE_PART: BridgePartSpec;
  EARTHWORKS_FILL: Omit<EarthworksFillSpec, 'solid'>;
  BUILDING: BuildingSpec;
  STOREY: StoreySpec;
  MEMBER: CurtainComponentSpec;
  PLATE: CurtainComponentSpec;
  SIGN: never;
}

export type BimSpecFor<C extends BimCategory> = ClassificationSpecs[C];

export type BimGeometryFor<C extends BimCategory> = C extends BodyClassification ? Body : null;

type BodySpec<C extends BimCategory> =
  BimGeometryFor<C> extends Body ? BimSpecFor<C> | null : BimSpecFor<C>;

type RecordGeometry<C extends BimCategory> =
  BimGeometryFor<C> extends Body
    ? {
        readonly representation: 'BODY';
        readonly placement: PlacementDefinition;
        readonly geometry: BimGeometryFor<C>;
      }
    : {
        readonly representation: 'NONE';
        readonly reason: 'ASSEMBLY' | 'OPENING_REFERENCE' | 'SPATIAL' | 'GROUP';
        readonly geometry: null;
        readonly placement: PlacementDefinition | null;
      };

export type BimElement<C extends BimCategory> = RecordGeometry<C> & {
  readonly metadata?: Readonly<{ name?: string; description?: string }>;
  readonly guid: IfcGuid;
  readonly localId: RecordRef;
  readonly category: C;
  readonly spec: BodySpec<C>;
};

export type AnyBimElement = { [C in BimCategory]: BimElement<C> }[BimCategory];
