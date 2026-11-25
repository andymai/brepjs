import {
type PlacementDefinition
} from '../types/placementDefinition.js';
import type { Result } from 'brepjs';
import type { RecordRef } from '../identity/recordRef.js';
import type { BimError } from '../errors/bimError.js';
import type { WallSpec } from '../specs/wallSpec.js';
import type { SlabSpec } from '../specs/slabSpec.js';
import type { BeamSpec } from '../specs/beamSpec.js';
import type { ColumnSpec } from '../specs/columnSpec.js';
import type { DoorSpec,WindowSpec,SlabOpeningInput } from '../specs/openingSpec.js';
import type { ProxySpec } from '../specs/proxySpec.js';
import type { SpaceSpec } from '../specs/spaceSpec.js';
import type { RoofSpec } from '../specs/roofSpec.js';
import type { CurtainWallSpec } from '../specs/curtainWallSpec.js';
import type { FootingSpec,PileSpec } from '../specs/foundationSpec.js';
import type { StairSpec } from '../specs/stairSpec.js';
import type { RampSpec } from '../specs/rampSpec.js';
import type { RailingSpec } from '../specs/railingSpec.js';
import type { CoveringSpec } from '../specs/coveringSpec.js';
import type { ElementAssemblySpec } from '../specs/assemblySpec.js';
import type { ZoneSpec,SystemSpec } from '../specs/groupSpec.js';
import type { SiteSpec,BuildingSpec,StoreySpec } from '../specs/spatialSpec.js';
import type {
BridgePartSpec,
BridgeSpec,
EarthworksFillSpec,
} from '../specs/infrastructureSpec.js';
import { BimDocument,type ElementIdentityOptions,type OpeningIdentityOptions } from './bimDocument.js';
import { BimAuthoring } from './authoring.js';
export type {BodyCommitReceipt, ElementIdentityOptions, OpeningIdentityOptions} from './bimDocument.js';
export class BimModel extends BimDocument {
 private readonly commands = new BimAuthoring(this);
addSite(spec: SiteSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> { return this.commands.addSite(spec, options); }
addBridge(spec: BridgeSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> { return this.commands.addBridge(spec, options); }
addBridgePart(spec: BridgePartSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> { return this.commands.addBridgePart(spec, options); }
addEarthworksFill(
    spec: EarthworksFillSpec,
    options?: ElementIdentityOptions
  ): Result<RecordRef, BimError> { return this.commands.addEarthworksFill(spec, options); }
addBuilding(spec: BuildingSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> { return this.commands.addBuilding(spec, options); }
addStorey(spec: StoreySpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> { return this.commands.addStorey(spec, options); }
addWall(spec: WallSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> { return this.commands.addWall(spec, options); }
addSlab(spec: SlabSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> { return this.commands.addSlab(spec, options); }
addBeam(spec: BeamSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> { return this.commands.addBeam(spec, options); }
addColumn(spec: ColumnSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> { return this.commands.addColumn(spec, options); }
addSpace(spec: SpaceSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> { return this.commands.addSpace(spec, options); }
addRoof(spec: RoofSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> { return this.commands.addRoof(spec, options); }
addCurtainWall(
    spec: CurtainWallSpec,
    options?: ElementIdentityOptions
  ): Result<RecordRef, BimError> { return this.commands.addCurtainWall(spec, options); }
addFooting(spec: FootingSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> { return this.commands.addFooting(spec, options); }
addPile(spec: PileSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> { return this.commands.addPile(spec, options); }
addStair(spec: StairSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> { return this.commands.addStair(spec, options); }
addRamp(spec: RampSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> { return this.commands.addRamp(spec, options); }
addRailing(spec: RailingSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> { return this.commands.addRailing(spec, options); }
addCovering(
    spec: CoveringSpec,
    hostLocalId?: RecordRef,
    options?: ElementIdentityOptions
  ): Result<RecordRef, BimError> { return this.commands.addCovering(spec, hostLocalId, options); }
addElementAssembly(
    spec: ElementAssemblySpec,
    options?: ElementIdentityOptions
  ): Result<RecordRef, BimError> { return this.commands.addElementAssembly(spec, options); }
addZone(spec: ZoneSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> { return this.commands.addZone(spec, options); }
addSystem(spec: SystemSpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> { return this.commands.addSystem(spec, options); }
addProxy(spec: ProxySpec, options?: ElementIdentityOptions): Result<RecordRef, BimError> { return this.commands.addProxy(spec, options); }
addFillerPanel(input: {
    category: 'DOOR' | 'WINDOW';
    width: number;
    height: number;
    materialName: string;
    placement: PlacementDefinition;
    stableKey?: string;
    openingLocalId?: RecordRef;
  }): Result<RecordRef, BimError> { return this.commands.addFillerPanel(input); }
addDoorAndCutWall(spec: DoorSpec, options?: OpeningIdentityOptions): Result<RecordRef, BimError> { return this.commands.addDoorAndCutWall(spec, options); }
addWindowAndCutWall(
    spec: WindowSpec,
    options?: OpeningIdentityOptions
  ): Result<RecordRef, BimError> { return this.commands.addWindowAndCutWall(spec, options); }
addSlabOpening(
    input: SlabOpeningInput,
    options?: ElementIdentityOptions
  ): Result<RecordRef, BimError> { return this.commands.addSlabOpening(input, options); }
}
