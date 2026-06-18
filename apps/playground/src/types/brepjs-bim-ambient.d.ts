/**
 * AUTO-GENERATED — do not edit manually.
 * Run `npm run generate-types` to regenerate from brepjs-bim package types.
 *
 * Ambient type declarations for brepjs-bim available in the playground editor.
 */

import type { BrepError, OrientedFace, PlanarFace, Result, ValidSolid } from 'brepjs';

declare class BimModel {
    #private;
    init(spec: ProjectSpec): Result<LocalId, BimError>;
    [Symbol.dispose](): void;
    addSite(spec: SiteSpec): LocalId;
    addBuilding(spec: BuildingSpec): LocalId;
    addStorey(spec: StoreySpec): LocalId;
    addWall(spec: WallSpec): Result<LocalId, BimError>;
    addSlab(spec: SlabSpec): Result<LocalId, BimError>;
    addBeam(spec: BeamSpec): Result<LocalId, BimError>;
    addColumn(spec: ColumnSpec): Result<LocalId, BimError>;
    addSpace(spec: SpaceSpec): Result<LocalId, BimError>;
    addRoof(spec: RoofSpec): Result<LocalId, BimError>;
    addCurtainWall(spec: CurtainWallSpec): Result<LocalId, BimError>;
    addFooting(spec: FootingSpec): Result<LocalId, BimError>;
    addPile(spec: PileSpec): Result<LocalId, BimError>;
    /**
     * Adds an IfcStair assembly. Geometry for each flight is built and written by
     * the IFC layer from `spec.flights`; the STAIR element itself carries no solid
     * (the assembly container's Representation is null, valid per IFC4).
     */
    addStair(spec: StairSpec): Result<LocalId, BimError>;
    /**
     * Adds an IfcRamp assembly. Geometry for each flight is built and written by the
     * IFC layer from `spec.flights`; the RAMP element carries no solid of its own.
     */
    addRamp(spec: RampSpec): Result<LocalId, BimError>;
    addRailing(spec: RailingSpec): Result<LocalId, BimError>;
    /**
     * Adds an IfcCovering. When `hostLocalId` is supplied, an
     * IfcRelCoversBldgElements linking the covering to its host (e.g. a slab it
     * finishes) is recorded for export.
     */
    addCovering(spec: CoveringSpec, hostLocalId?: LocalId): Result<LocalId, BimError>;
    /**
     * Adds an IfcElementAssembly grouping container. The assembly has no geometry;
     * attach parts with {@link aggregate} (IfcRelAggregates) or {@link nest}
     * (IfcRelNests, order-preserving). Returns the assembly's localId.
     */
    addElementAssembly(spec: ElementAssemblySpec): LocalId;
    /**
     * Adds an IfcZone grouping object (a thermal/fire/occupancy zone). The zone
     * carries no geometry; attach members (spaces or other elements) with
     * {@link assignToGroup}. Returns the zone's localId.
     */
    addZone(spec: ZoneSpec): LocalId;
    /**
     * Adds an IfcSystem grouping object (an HVAC/electrical/plumbing system). The
     * system carries no geometry; attach members with {@link assignToGroup}.
     * Returns the system's localId.
     */
    addSystem(spec: SystemSpec): LocalId;
    /**
     * Assigns members to a zone or system via IfcRelAssignsToGroup. Repeated calls
     * for the same group extend the single relationship in call order. Returns the
     * relationship's localId.
     */
    assignToGroup(groupId: LocalId, memberIds: readonly LocalId[]): LocalId;
    /**
     * Records an order-preserving IfcRelNests decomposing `parentId` into
     * `childId`. Unlike {@link aggregate}, repeated calls extend the same nesting
     * relationship in call order.
     */
    nest(parentId: LocalId, childId: LocalId): void;
    /**
     * Records an IfcRelConnectsElements logical connection between two elements.
     * Returns the relationship's localId.
     */
    connectElements(relatingElementLocalId: LocalId, relatedElementLocalId: LocalId, description?: string): LocalId;
    /**
     * Records an IfcRelConnectsPathElements connection between two path-based
     * elements at the given path ends. Returns the relationship's localId.
     */
    connectPathElements(relatingElementLocalId: LocalId, relatedElementLocalId: LocalId, relatingConnectionType: 'ATSTART' | 'ATEND' | 'ATPATH' | 'NOTDEFINED', relatedConnectionType: 'ATSTART' | 'ATEND' | 'ATPATH' | 'NOTDEFINED', description?: string): LocalId;
    /**
     * Assigns a surface style (colour + transparency) to an element. On export the
     * style is emitted as IfcSurfaceStyle and linked to the element's body geometry
     * via IfcStyledItem (currently honoured for railings and coverings, whose body
     * representation item is surfaced by their geometry writers).
     */
    setSurfaceStyle(elementLocalId: LocalId, style: SurfaceStyleSpec): void;
    getSurfaceStyle(elementLocalId: LocalId): SurfaceStyleSpec | null;
    /**
     * Records an IfcRelSpaceBoundary between a space and one of its bounding
     * building elements. Returns the relationship's localId.
     */
    addSpaceBoundary(spaceLocalId: LocalId, elementLocalId: LocalId, connectionType?: 'PHYSICAL' | 'VIRTUAL' | 'NOTDEFINED'): LocalId;
    /**
     * Associates a classification reference with one or more elements, creating an
     * IfcRelAssociatesClassification on export. Returns the relationship's localId.
     */
    addClassification(ref: ClassificationRef, elementLocalIds: readonly LocalId[]): LocalId;
    /**
     * Adds an IfcBuildingElementProxy. The model TAKES OWNERSHIP of `spec.solid`
     * and disposes it on model disposal; the caller must not dispose it (see
     * {@link ProxySpec.solid}).
     */
    addProxy(spec: ProxySpec): Result<LocalId, BimError>;
    addDoor(spec: DoorSpec): Result<LocalId, BimError>;
    addWindow(spec: WindowSpec): Result<LocalId, BimError>;
    addSlabOpening(input: SlabOpeningInput): Result<LocalId, BimError>;
    getDoors(): BimElement<'DOOR'>[];
    getWindows(): BimElement<'WINDOW'>[];
    aggregate(parentId: LocalId, childId: LocalId): void;
    placeIn(elementId: LocalId, containerId: LocalId): void;
    getProject(): BimElement<'PROJECT'> | null;
    getElement(id: LocalId): AnyBimElement | null;
    /**
     * A serializable summary of the model's structure, rooted at the project and
     * walking the IFC spatial hierarchy (AGGREGATES: project → site → building →
     * storey) plus the elements contained in each storey (placeIn). Useful for a
     * read-only tree view of the model across a worker boundary.
     */
    toTreeSummary(): BimTreeSummary;
    getWalls(): BimElement<'WALL'>[];
    getSlabs(): BimElement<'SLAB'>[];
    getBeams(): BimElement<'BEAM'>[];
    getColumns(): BimElement<'COLUMN'>[];
    getProxies(): BimElement<'PROXY'>[];
    getSpaces(): BimElement<'SPACE'>[];
    getRoofs(): BimElement<'ROOF'>[];
    getCurtainWalls(): BimElement<'CURTAIN_WALL'>[];
    getFootings(): BimElement<'FOOTING'>[];
    getPiles(): BimElement<'PILE'>[];
    getStairs(): BimElement<'STAIR'>[];
    getRamps(): BimElement<'RAMP'>[];
    getRailings(): BimElement<'RAILING'>[];
    getCoverings(): BimElement<'COVERING'>[];
    getElementAssemblies(): BimElement<'ELEMENT_ASSEMBLY'>[];
    getZones(): BimElement<'ZONE'>[];
    getSystems(): BimElement<'SYSTEM'>[];
    getAllElements(): AnyBimElement[];
    getAllRelationships(): BimRelationship[];
}

/**
 * A node in a {@link BimModel}'s spatial/decomposition tree. Fully serializable
 * (plain numbers/strings) so it can be posted across a worker boundary.
 */
interface BimTreeNode {
    /** The element's local id. */
    readonly id: number;
    /** Display label — the element's name, or its category when unnamed. */
    readonly label: string;
    /** The element's IFC category. */
    readonly category: BimCategory;
    readonly children: readonly BimTreeNode[];
}

/** A serializable summary of a model's structure, rooted at the project. */
interface BimTreeSummary {
    /** The project node and its nested spatial structure + contained elements. */
    readonly root: BimTreeNode | null;
    /** Number of nodes in the tree (the project and everything reachable from it). */
    readonly elementCount: number;
}

/**
 * Returns each element's geometry transformed to its world placement, as fresh
 * caller-owned solids, wrapped in a `Result` (Layer-2 code prefers `Result` over
 * throwing). **Dispose the returned solids** (e.g. via `using` / `[Symbol.dispose]`)
 * when you own their lifetime — they are independent of the model
 * (`BimModel[Symbol.dispose]` frees only the stored, unplaced `.geometry`). On any
 * failure the solids already built for this call are disposed before the error is
 * returned, so no partial array is leaked.
 *
 * Stairs carry no element solid (`.geometry` is null), so flight solids are built
 * from `spec.flights` and placed per flight. Curtain walls return placed panels +
 * mullions. Elements with no solid geometry (doors/windows/ramps/groups/spatial)
 * return an empty array.
 */
declare function placedSolids(el: AnyBimElement): Result<readonly ValidSolid[], BimError>;

declare function toIfc(model: BimModel, meta: BimModelMeta): Promise<Result<Uint8Array, BimError>>;

interface ValidatedIfcResult {
    readonly bytes: Uint8Array;
    readonly report: ValidationReport;
}

/**
 * Serializes the model to IFC and runs the full validation suite: a
 * pre-serialization referential-integrity gate, then the post-save EXPRESS/STEP
 * schema gate and the write→read→re-write round-trip check. Returns both the
 * bytes and a combined report. A model that fails the integrity gate returns an
 * INTEGRITY_FAILURE BimError without serializing (unlike plain {@link toIfc},
 * which serializes unconditionally).
 */
declare function toIfcValidated(model: BimModel, meta: BimModelMeta): Promise<Result<ValidatedIfcResult, BimError>>;

/**
 * Override how web-ifc finds its `.wasm` file. Applied by every web-ifc entry
 * point in this package — IFC export ({@link toIfc}), import ({@link fromIfc})
 * and validation. Required when brepjs-bim is bundled into a worker that serves
 * the wasm itself; not needed in Node.
 */
declare function setIfcWasmLocateFile(locate: ((path: string, prefix: string) => string) | undefined): void;

interface FromIfcOptions {
    /** Activate web-ifc's large-coordinate recentering on open. Default false. */
    readonly coordinateToOrigin?: boolean | undefined;
    /** Skip body-geometry reconstruction for fast metadata-only reads. Default false. */
    readonly skipGeometry?: boolean | undefined;
}

/**
 * Reads an IFC STEP-SPF byte buffer into an {@link ImportedModel}: schema, unit
 * scale, spatial tree, and one {@link ImportedElement} per physical product
 * (geometry + Psets + material + classification + void/fill relations).
 *
 * Robustness model: every per-element reconstruction is wrapped in try/catch; a
 * failure pushes a diagnostic (severity `error` if the element could not be read
 * at all, `warning`/`info` for partial geometry) and the import continues. Only
 * fatal failures — bad bytes, unsupported schema, WASM open failure — return
 * `err`. Inspect {@link ImportedModel.diagnostics} for per-element quality.
 *
 * The web-ifc model handle is always closed in a `finally` block.
 */
declare function fromIfc(bytes: Uint8Array, options?: FromIfcOptions): Promise<Result<ImportedModel, BimError>>;

/** Schema strings web-ifc reports and this reader supports. */
type ImportedSchema = 'IFC2X3' | 'IFC4' | 'IFC4X3';

/**
 * How faithfully a product's body geometry was reconstructed:
 * - `PARAMETRIC` — rebuilt losslessly from a swept solid (extrude/revolve).
 * - `TESSELLATED_MANIFOLD` — a tessellated mesh was recovered as a closed solid
 *   via an STL round-trip; geometrically faithful but topology was re-derived.
 * - `TESSELLATED_LOSSY` — geometry exists only as raw triangles (mesh did not
 *   close into a solid); `solid` is null, `meshVertices`/`meshIndices` carry it.
 * - `NONE` — no recognised body representation was found.
 */
type GeometryFidelity = 'PARAMETRIC' | 'TESSELLATED_MANIFOLD' | 'TESSELLATED_LOSSY' | 'NONE';

interface ImportedGeometry {
    readonly fidelity: GeometryFidelity;
    /** The reconstructed solid; null when fidelity is `NONE` or `TESSELLATED_LOSSY`. */
    readonly solid: ValidSolid | null;
    /** Raw triangle vertices (interleaved xyz), present only for `TESSELLATED_LOSSY`. */
    readonly meshVertices?: Float32Array | undefined;
    /** Raw triangle indices, present only for `TESSELLATED_LOSSY`. */
    readonly meshIndices?: Uint32Array | undefined;
}

interface ImportedPset {
    readonly name: string;
    /** `true` when sourced from an IfcElementQuantity rather than an IfcPropertySet. */
    readonly isQuantity: boolean;
    readonly properties: Readonly<Record<string, string | number | boolean>>;
    /**
     * Per-property IFC measure-type codes (web-ifc type constants), keyed by the
     * same property name as `properties`. Lets callers distinguish e.g. an
     * IfcThermalTransmittanceMeasure from a plain IfcReal. Absent entries fall back
     * to the value's JS type.
     */
    readonly measureTypes: Readonly<Record<string, number>>;
}

interface ImportedMaterial {
    readonly kind: 'SIMPLE' | 'LAYER_SET';
    readonly name: string;
    readonly layers?: readonly {
        readonly name: string;
        readonly thicknessMm: number;
    }[] | undefined;
}

interface ImportedClassification {
    readonly system: string;
    readonly code: string;
    readonly description?: string | undefined;
}

type ImportedElementCategory = 'WALL' | 'SLAB' | 'BEAM' | 'COLUMN' | 'DOOR' | 'WINDOW' | 'OPENING' | 'SPACE' | 'ROOF' | 'CURTAIN_WALL' | 'FOOTING' | 'PILE' | 'STAIR' | 'RAMP' | 'RAILING' | 'COVERING' | 'ELEMENT_ASSEMBLY' | 'PROXY';

interface ImportedElement {
    readonly expressId: number;
    readonly guid: IfcGuid;
    readonly name: string;
    readonly category: ImportedElementCategory;
    readonly predefinedType?: string | undefined;
    readonly storeyExpressId?: number | undefined;
    readonly geometry: ImportedGeometry;
    readonly psets: readonly ImportedPset[];
    readonly material: ImportedMaterial | null;
    readonly classification: ImportedClassification | null;
    /** Express ids of opening elements that void this element. */
    readonly voidedBy: readonly number[];
    /** Express id of the opening this element fills (doors/windows only). */
    readonly fills?: number | undefined;
}

interface ImportedSpatialNode {
    readonly expressId: number;
    readonly guid: IfcGuid;
    readonly name: string;
    readonly category: 'PROJECT' | 'SITE' | 'BUILDING' | 'STOREY';
    readonly elevationMm?: number | undefined;
    readonly children: readonly ImportedSpatialNode[];
    readonly containedElements: readonly number[];
}

/**
 * Frees every reconstructed solid handle held by an imported model. The
 * geometry are live WASM handles, so callers MUST call this once they are done
 * with the model (it is not reclaimed automatically when the model is GC'd).
 */
declare function disposeImportedModel(model: ImportedModel): void;

/**
 * The reconstructed model. Holds live WASM solid handles in `elements[].geometry`;
 * call {@link disposeImportedModel} when finished to avoid leaking them.
 */
interface ImportedModel {
    readonly schema: ImportedSchema;
    readonly spatialTree: ImportedSpatialNode | null;
    readonly elements: readonly ImportedElement[];
    /** Express id → ImportedElement for fast lookup. */
    readonly byExpressId: ReadonlyMap<number, ImportedElement>;
    readonly diagnostics: ValidationReport;
    readonly applicationName?: string | undefined;
}

interface SpfReaderSettings {
    /**
     * Activate web-ifc's built-in large-coordinate recentering on open. Defaults
     * to false; set true for georeferenced models with far-from-origin geometry.
     */
    readonly coordinateToOrigin?: boolean;
}

declare class SpfReader {
    #private;
    readonly schema: ImportedSchema;
    readonly modelId: number;
    private constructor();
    static create(bytes: Uint8Array, settings?: SpfReaderSettings): Promise<Result<SpfReader, BimError>>;
    /** Always issues CloseModel; safe to call more than once. */
    close(): void;
    [Symbol.dispose](): void;
    /**
     * Raw line object for an express id. With `flatten=false` (default) references
     * appear as `{ type, value }` wrappers and nested entities are not resolved;
     * pass `flatten=true` to recursively inline referenced lines.
     */
    getLine<T = unknown>(expressId: number, flatten?: boolean): T | null;
    /** Express ids of every line whose type equals `type` (no inherited types). */
    getLinesOfType(type: number): number[];
    /** Express ids of every line in the model. */
    getAllLines(): number[];
    /** IFC type code for an express id. */
    getLineType(expressId: number): number;
    /** Builds web-ifc's internal GUID→expressId index; call before guid lookups. */
    buildGuidMap(): void;
    /** expressId for a GlobalId, or undefined. Requires {@link buildGuidMap} first. */
    expressIdFromGuid(guid: string): number | undefined;
    /** GlobalId for an express id, or undefined. Requires {@link buildGuidMap} first. */
    guidFromExpressId(expressId: number): string | undefined;
    /**
     * Composed world transform (column-major 16-float matrix) for a placement
     * express id, resolving the full IfcLocalPlacement chain.
     */
    getWorldTransform(placementExpressId: number): number[];
    /** Streams placed meshes for the given product express ids. */
    streamMeshes(expressIds: number[], cb: (mesh: FlatMesh, index: number, total: number) => void): void;
    /** Geometry buffers for a geometry express id; caller MUST call `.delete()`. */
    getGeometry(geometryExpressId: number): IfcGeometry;
    /** Reads a Float32Array view of vertex data from a WASM pointer. */
    getVertexArray(ptr: number, size: number): Float32Array;
    /** Reads a Uint32Array view of index data from a WASM pointer. */
    getIndexArray(ptr: number, size: number): Uint32Array;
    /** Decodes IFC STEP string escapes (`\X2\`, `\S\`, `\X\`) in a raw value. */
    decodeText(s: string): string;
}

/** A straight wall aligned along an arbitrary axis in 3D. All dimensions in mm. */
interface WallSpec {
    readonly length: number;
    readonly height: number;
    readonly thickness: number;
    readonly origin: [number, number, number];
    readonly axisX: [number, number, number];
    readonly axisZ: [number, number, number];
    readonly materialName: string;
    readonly isExternal?: boolean | undefined;
    readonly fireRating?: string | undefined;
    readonly acousticRating?: string | undefined;
    readonly thermalTransmittance?: number | undefined;
    readonly loadBearing?: boolean | undefined;
    readonly status?: string | undefined;
    /**
     * When present, the wall is associated via a layered IfcMaterialLayerSet built
     * from these layers instead of the bare `materialName` IfcMaterial.
     */
    readonly materialLayers?: readonly MaterialLayer[] | undefined;
    readonly layerSetName?: string | undefined;
    /** When present, associates the wall with an external classification code. */
    readonly classification?: ClassificationRef | undefined;
    readonly manufacturerName?: string | undefined;
    readonly manufacturerModel?: string | undefined;
    readonly manufacturerProductionYear?: number | undefined;
    readonly customProperties?: Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>> | undefined;
}

declare function parseWallSpec(input: unknown): Result<WallSpec, BimError>;

type SlabPredefinedType = 'FLOOR' | 'ROOF' | 'LANDING' | 'BASESLAB';

interface SlabSpec {
    readonly length: number;
    readonly width: number;
    readonly thickness: number;
    readonly origin: [number, number, number];
    readonly axisX: [number, number, number];
    readonly axisZ: [number, number, number];
    readonly predefinedType: SlabPredefinedType;
    readonly materialName: string;
    readonly isExternal?: boolean | undefined;
    readonly fireRating?: string | undefined;
    readonly acousticRating?: string | undefined;
    readonly thermalTransmittance?: number | undefined;
    readonly loadBearing?: boolean | undefined;
    readonly combustible?: boolean | undefined;
    readonly compartmentation?: boolean | undefined;
    readonly status?: string | undefined;
    /**
     * When present, the slab is associated via a layered IfcMaterialLayerSet built
     * from these layers instead of the bare `materialName` IfcMaterial.
     */
    readonly materialLayers?: readonly MaterialLayer[] | undefined;
    readonly layerSetName?: string | undefined;
    /** When present, associates the slab with an external classification code. */
    readonly classification?: ClassificationRef | undefined;
    readonly manufacturerName?: string | undefined;
    readonly manufacturerModel?: string | undefined;
    readonly manufacturerProductionYear?: number | undefined;
    readonly customProperties?: Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>> | undefined;
}

declare function parseSlabSpec(input: unknown): Result<SlabSpec, BimError>;

type BeamPredefinedType = 'BEAM' | 'JOIST' | 'LINTEL' | 'HOLLOWCORE' | 'PURLIN' | 'RAFTER' | 'SPANDREL' | 'T_BEAM' | 'NOTDEFINED';

interface BeamSpec {
    readonly length: number;
    readonly profile: Profile;
    readonly origin: [number, number, number];
    readonly axisX: [number, number, number];
    readonly axisZ: [number, number, number];
    readonly predefinedType?: BeamPredefinedType | undefined;
    readonly materialName: string;
    readonly isExternal?: boolean | undefined;
    readonly loadBearing?: boolean | undefined;
    readonly fireRating?: string | undefined;
    readonly acousticRating?: string | undefined;
    readonly thermalTransmittance?: number | undefined;
    readonly status?: string | undefined;
    /**
     * When present, the beam is associated via a layered IfcMaterialLayerSet built
     * from these layers instead of the bare `materialName` IfcMaterial.
     */
    readonly materialLayers?: readonly MaterialLayer[] | undefined;
    readonly layerSetName?: string | undefined;
    /** When present, associates the beam with an external classification code. */
    readonly classification?: ClassificationRef | undefined;
    readonly manufacturerName?: string | undefined;
    readonly manufacturerModel?: string | undefined;
    readonly manufacturerProductionYear?: number | undefined;
    readonly customProperties?: Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>> | undefined;
}

declare function parseBeamSpec(input: unknown): Result<BeamSpec, BimError>;

type ColumnPredefinedType = 'COLUMN' | 'PILASTER' | 'NOTDEFINED';

interface ColumnSpec {
    readonly height: number;
    readonly profile: Profile;
    readonly origin: [number, number, number];
    readonly axisX: [number, number, number];
    readonly axisZ: [number, number, number];
    readonly predefinedType?: ColumnPredefinedType | undefined;
    readonly materialName: string;
    readonly isExternal?: boolean | undefined;
    readonly loadBearing?: boolean | undefined;
    readonly fireRating?: string | undefined;
    readonly acousticRating?: string | undefined;
    readonly thermalTransmittance?: number | undefined;
    readonly status?: string | undefined;
    /**
     * When present, the column is associated via a layered IfcMaterialLayerSet
     * built from these layers instead of the bare `materialName` IfcMaterial.
     */
    readonly materialLayers?: readonly MaterialLayer[] | undefined;
    readonly layerSetName?: string | undefined;
    /** When present, associates the column with an external classification code. */
    readonly classification?: ClassificationRef | undefined;
    readonly manufacturerName?: string | undefined;
    readonly manufacturerModel?: string | undefined;
    readonly manufacturerProductionYear?: number | undefined;
    readonly customProperties?: Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>> | undefined;
}

declare function parseColumnSpec(input: unknown): Result<ColumnSpec, BimError>;

type RectangularProfile = {
    readonly kind: 'RECTANGULAR';
    readonly width: number;
    readonly height: number;
};

type CircularProfile = {
    readonly kind: 'CIRCULAR';
    readonly radius: number;
};

type IShapeProfile = {
    readonly kind: 'I_BEAM';
    readonly overallWidth: number;
    readonly overallDepth: number;
    readonly flangeThickness: number;
    readonly webThickness: number;
    readonly filletRadius?: number | undefined;
};

type CoreProfile = RectangularProfile | CircularProfile | IShapeProfile;

type Profile = CoreProfile | ExtendedProfile;

/** Narrows a profile to the extended (non-core) variants. */
declare function isExtendedProfile(profile: Profile): profile is ExtendedProfile;

declare function parseProfile(input: unknown): Result<Profile, BimError>;

interface LShapeProfile {
    readonly kind: 'L_SHAPE';
    readonly depth: number;
    readonly width: number;
    readonly legThickness: number;
    readonly filletRadius?: number | undefined;
}

interface TShapeProfile {
    readonly kind: 'T_SHAPE';
    readonly depth: number;
    readonly flangeWidth: number;
    readonly webThickness: number;
    readonly flangeThickness: number;
    readonly filletRadius?: number | undefined;
}

interface UShapeProfile {
    readonly kind: 'U_SHAPE';
    readonly depth: number;
    readonly flangeWidth: number;
    readonly webThickness: number;
    readonly flangeThickness: number;
}

interface ZShapeProfile {
    readonly kind: 'Z_SHAPE';
    readonly depth: number;
    readonly flangeWidth: number;
    readonly webThickness: number;
    readonly flangeThickness: number;
}

interface CShapeProfile {
    readonly kind: 'C_SHAPE';
    readonly depth: number;
    readonly width: number;
    readonly wallThickness: number;
    readonly girth: number;
    readonly internalFilletRadius?: number | undefined;
}

interface AsymmetricIShapeProfile {
    readonly kind: 'ASYMMETRIC_I';
    readonly overallDepth: number;
    readonly webThickness: number;
    readonly topFlangeWidth: number;
    readonly topFlangeThickness: number;
    readonly bottomFlangeWidth: number;
    readonly bottomFlangeThickness: number;
}

interface EllipseProfile {
    readonly kind: 'ELLIPSE';
    readonly semiAxis1: number;
    readonly semiAxis2: number;
}

interface TrapeziumProfile {
    readonly kind: 'TRAPEZIUM';
    readonly bottomXDim: number;
    readonly topXDim: number;
    readonly yDim: number;
    readonly topXOffset: number;
}

interface RectangleHollowProfile {
    readonly kind: 'RECTANGLE_HOLLOW';
    readonly xDim: number;
    readonly yDim: number;
    readonly wallThickness: number;
    readonly innerFilletRadius?: number | undefined;
    readonly outerFilletRadius?: number | undefined;
}

interface CircleHollowProfile {
    readonly kind: 'CIRCLE_HOLLOW';
    readonly radius: number;
    readonly wallThickness: number;
}

interface ArbitraryClosedProfile {
    readonly kind: 'ARBITRARY_CLOSED';
    readonly points: ReadonlyArray<Pt2>;
}

interface ArbitraryProfileWithVoids {
    readonly kind: 'ARBITRARY_WITH_VOIDS';
    readonly outerPoints: ReadonlyArray<Pt2>;
    readonly voids: ReadonlyArray<ReadonlyArray<Pt2>>;
}

type ExtendedProfile = LShapeProfile | TShapeProfile | UShapeProfile | ZShapeProfile | CShapeProfile | AsymmetricIShapeProfile | EllipseProfile | TrapeziumProfile | RectangleHollowProfile | CircleHollowProfile | ArbitraryClosedProfile | ArbitraryProfileWithVoids;

declare function extendedProfileArea(profile: ExtendedProfile): number;

declare function extendedProfileToFace(profile: ExtendedProfile): Result<OrientedFace & PlanarFace, BimError>;

type SpacePredefinedType = 'SPACE' | 'PARKING' | 'GFA' | 'INTERNAL' | 'EXTERNAL' | 'NOTDEFINED';

interface SpaceSpec {
    readonly name: string;
    readonly length: number;
    readonly width: number;
    readonly height: number;
    readonly origin: [number, number, number];
    readonly axisX: [number, number, number];
    readonly axisZ: [number, number, number];
    readonly materialName: string;
    readonly predefinedType?: SpacePredefinedType | undefined;
    readonly longName?: string | undefined;
    readonly isExternal?: boolean | undefined;
    readonly status?: string | undefined;
    readonly finishCeiling?: string | undefined;
    readonly finishFloor?: string | undefined;
    /** When present, associates the space with an external classification code. */
    readonly classification?: ClassificationRef | undefined;
    readonly customProperties?: Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>> | undefined;
}

declare function parseSpaceSpec(input: unknown): Result<SpaceSpec, BimError>;

type RoofPredefinedType = 'FLAT_ROOF' | 'SHED_ROOF' | 'GABLE_ROOF' | 'HIP_ROOF' | 'HIPPED_GABLE_ROOF' | 'GAMBREL_ROOF' | 'MANSARD_ROOF' | 'BARREL_ROOF' | 'RAINBOW_ROOF' | 'BUTTERFLY_ROOF' | 'PAVILION_ROOF' | 'DOME_ROOF' | 'FREEFORM' | 'NOTDEFINED';

interface RoofSpec {
    readonly length: number;
    readonly width: number;
    readonly thickness: number;
    readonly origin: [number, number, number];
    readonly axisX: [number, number, number];
    readonly axisZ: [number, number, number];
    readonly predefinedType: RoofPredefinedType;
    readonly materialName: string;
    readonly isExternal?: boolean | undefined;
    readonly fireRating?: string | undefined;
    readonly thermalTransmittance?: number | undefined;
    readonly status?: string | undefined;
    /**
     * Optional roof slope in degrees (0 < pitch < 90). Its PRESENCE opts the roof
     * into shaped geometry built for `predefinedType` (shed/gable/hip/dome); when
     * absent the roof is a flat slab regardless of predefinedType (backward-
     * compatible). Ignored geometrically for DOME_ROOF (a hemisphere).
     */
    readonly pitch?: number | undefined;
    /**
     * When present, the roof is associated via a layered IfcMaterialLayerSet built
     * from these layers instead of the bare `materialName` IfcMaterial.
     */
    readonly materialLayers?: readonly MaterialLayer[] | undefined;
    readonly layerSetName?: string | undefined;
    /** When present, associates the roof with an external classification code. */
    readonly classification?: ClassificationRef | undefined;
    readonly manufacturerName?: string | undefined;
    readonly manufacturerModel?: string | undefined;
    readonly manufacturerProductionYear?: number | undefined;
    readonly customProperties?: Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>> | undefined;
}

declare function parseRoofSpec(input: unknown): Result<RoofSpec, BimError>;

type CurtainWallPredefinedType = 'CURTAIN_WALL' | 'NOTDEFINED' | 'USERDEFINED';

/**
 * A planar curtain wall, modelled as a rectangular grid of glazing panels
 * (IfcPlate) framed by mullions (IfcMember). The wall spans `width` (along the
 * local X axis) by `height` (local Z), and is subdivided into `columns` × `rows`
 * panels. Mullions run along every internal and boundary grid line.
 *
 * All dimensions in mm. Geometry is unplaced template geometry built in the
 * local XY/XZ plane; origin/axisX/axisZ place the assembly in world space via
 * IfcLocalPlacement.
 */
interface CurtainWallSpec {
    readonly width: number;
    readonly height: number;
    readonly columns: number;
    readonly rows: number;
    readonly panelThickness: number;
    readonly mullionWidth: number;
    readonly mullionDepth: number;
    readonly origin: [number, number, number];
    readonly axisX: [number, number, number];
    readonly axisZ: [number, number, number];
    readonly materialName: string;
    readonly predefinedType?: CurtainWallPredefinedType | undefined;
    readonly panelMaterialName?: string | undefined;
    readonly mullionMaterialName?: string | undefined;
    readonly isExternal?: boolean | undefined;
    readonly fireRating?: string | undefined;
    readonly thermalTransmittance?: number | undefined;
    readonly status?: string | undefined;
    readonly classification?: ClassificationRef | undefined;
    readonly customProperties?: Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>> | undefined;
}

declare function parseCurtainWallSpec(input: unknown): Result<CurtainWallSpec, BimError>;

type FootingPredefinedType = 'CAISSON_FOUNDATION' | 'FOOTING_BEAM' | 'PAD_FOOTING' | 'PILE_CAP' | 'STRIP_FOOTING' | 'NOTDEFINED';

type PilePredefinedType = 'BORED' | 'DRIVEN' | 'JETGROUTING' | 'NOTDEFINED';

type PileConstructionType = 'CAST_IN_PLACE' | 'COMPOSITE' | 'PRECAST_CONCRETE' | 'PREFAB_STEEL';

interface FootingSpec {
    readonly length: number;
    readonly width: number;
    readonly thickness: number;
    readonly origin: [number, number, number];
    readonly axisX: [number, number, number];
    readonly axisZ: [number, number, number];
    readonly predefinedType?: FootingPredefinedType | undefined;
    readonly materialName: string;
    readonly isExternal?: boolean | undefined;
    readonly loadBearing?: boolean | undefined;
    readonly fireRating?: string | undefined;
    readonly status?: string | undefined;
    /**
     * When present, the footing is associated via a layered IfcMaterialLayerSet
     * built from these layers instead of the bare `materialName` IfcMaterial.
     */
    readonly materialLayers?: readonly MaterialLayer[] | undefined;
    readonly layerSetName?: string | undefined;
    /** When present, associates the footing with an external classification code. */
    readonly classification?: ClassificationRef | undefined;
    readonly customProperties?: Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>> | undefined;
}

interface PileSpec {
    readonly length: number;
    readonly profile: Profile;
    readonly origin: [number, number, number];
    readonly axisX: [number, number, number];
    readonly axisZ: [number, number, number];
    readonly predefinedType?: PilePredefinedType | undefined;
    readonly constructionType?: PileConstructionType | undefined;
    readonly materialName: string;
    readonly loadBearing?: boolean | undefined;
    readonly status?: string | undefined;
    readonly materialLayers?: readonly MaterialLayer[] | undefined;
    readonly layerSetName?: string | undefined;
    /** When present, associates the pile with an external classification code. */
    readonly classification?: ClassificationRef | undefined;
    readonly customProperties?: Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>> | undefined;
}

declare function parseFootingSpec(input: unknown): Result<FootingSpec, BimError>;

declare function parsePileSpec(input: unknown): Result<PileSpec, BimError>;

type StairPredefinedType = 'STRAIGHT_RUN_STAIR' | 'TWO_STRAIGHT_RUN_STAIR' | 'QUARTER_WINDING_STAIR' | 'QUARTER_TURN_STAIR' | 'HALF_WINDING_STAIR' | 'HALF_TURN_STAIR' | 'TWO_QUARTER_WINDING_STAIR' | 'TWO_QUARTER_TURN_STAIR' | 'THREE_QUARTER_WINDING_STAIR' | 'THREE_QUARTER_TURN_STAIR' | 'SPIRAL_STAIR' | 'DOUBLE_RETURN_STAIR' | 'CURVED_RUN_STAIR' | 'TWO_CURVED_RUN_STAIR' | 'NOTDEFINED';

interface StairFlightSpec {
    readonly width: number;
    readonly riserHeight: number;
    readonly treadLength: number;
    readonly numberOfRisers: number;
    readonly origin: [number, number, number];
    readonly axisX: [number, number, number];
    readonly axisZ: [number, number, number];
    readonly materialName: string;
}

interface StairSpec {
    readonly name?: string | undefined;
    readonly predefinedType?: StairPredefinedType | undefined;
    readonly flights: readonly StairFlightSpec[];
    readonly materialName: string;
    readonly status?: string | undefined;
    readonly classification?: ClassificationRef | undefined;
}

declare function parseStairFlightSpec(input: unknown): Result<StairFlightSpec, BimError>;

declare function parseStairSpec(input: unknown): Result<StairSpec, BimError>;

type RampPredefinedType = 'STRAIGHT_RUN_RAMP' | 'TWO_STRAIGHT_RUN_RAMP' | 'QUARTER_TURN_RAMP' | 'TWO_QUARTER_TURN_RAMP' | 'HALF_TURN_RAMP' | 'SPIRAL_RAMP' | 'NOTDEFINED';

type RampFlightPredefinedType = 'STRAIGHT' | 'SPIRAL' | 'NOTDEFINED';

interface RampFlightSpec {
    readonly width: number;
    readonly length: number;
    readonly slope: number;
    readonly thickness: number;
    readonly origin: [number, number, number];
    readonly axisX: [number, number, number];
    readonly axisZ: [number, number, number];
    readonly materialName: string;
    readonly predefinedType?: RampFlightPredefinedType | undefined;
}

interface RampSpec {
    readonly name?: string | undefined;
    readonly predefinedType?: RampPredefinedType | undefined;
    readonly flights: readonly RampFlightSpec[];
    readonly materialName: string;
    readonly status?: string | undefined;
    readonly classification?: ClassificationRef | undefined;
}

declare function parseRampFlightSpec(input: unknown): Result<RampFlightSpec, BimError>;

declare function parseRampSpec(input: unknown): Result<RampSpec, BimError>;

type RailingPredefinedType = 'BALUSTRADE' | 'GUARDRAIL' | 'HANDRAIL' | 'NOTDEFINED';

/**
 * A straight railing run: a rail of rectangular cross-section (thickness × height)
 * swept along the run length. All dimensions in mm. The cross-section profile lies
 * in the local YZ plane and is swept along local +X by `length`.
 * origin/axisX/axisZ position the railing in world space via IfcLocalPlacement.
 */
interface RailingSpec {
    readonly length: number;
    readonly height: number;
    readonly thickness: number;
    readonly origin: [number, number, number];
    readonly axisX: [number, number, number];
    readonly axisZ: [number, number, number];
    readonly predefinedType?: RailingPredefinedType | undefined;
    readonly materialName: string;
    /**
     * Geometric infill style. 'PANEL' (default) is a single swept panel; 'POSTED'
     * is vertical posts plus top & bottom rails. Orthogonal to `predefinedType`
     * (which is the IFC usage role, not a geometry descriptor).
     */
    readonly infill?: 'PANEL' | 'POSTED' | undefined;
    readonly isExternal?: boolean | undefined;
    readonly fireRating?: string | undefined;
    readonly status?: string | undefined;
    readonly materialLayers?: readonly MaterialLayer[] | undefined;
    readonly layerSetName?: string | undefined;
    readonly classification?: ClassificationRef | undefined;
    readonly manufacturerName?: string | undefined;
    readonly manufacturerModel?: string | undefined;
    readonly manufacturerProductionYear?: number | undefined;
    readonly customProperties?: Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>> | undefined;
}

declare function parseRailingSpec(input: unknown): Result<RailingSpec, BimError>;

type CoveringPredefinedType = 'CEILING' | 'FLOORING' | 'CLADDING' | 'ROOFING' | 'MOLDING' | 'SKIRTINGBOARD' | 'INSULATION' | 'MEMBRANE' | 'SLEEVING' | 'WRAPPING' | 'NOTDEFINED';

/**
 * A thin rectangular covering sheet (floor finish, ceiling, cladding panel).
 * All dimensions in mm. The footprint rectangle (length × width) lies in the
 * local XY plane and extrudes along local +Z by `thickness`.
 * origin/axisX/axisZ position the covering in world space via IfcLocalPlacement.
 */
interface CoveringSpec {
    readonly length: number;
    readonly width: number;
    readonly thickness: number;
    readonly origin: [number, number, number];
    readonly axisX: [number, number, number];
    readonly axisZ: [number, number, number];
    readonly predefinedType?: CoveringPredefinedType | undefined;
    readonly materialName: string;
    readonly isExternal?: boolean | undefined;
    readonly fireRating?: string | undefined;
    readonly thermalTransmittance?: number | undefined;
    readonly status?: string | undefined;
    readonly materialLayers?: readonly MaterialLayer[] | undefined;
    readonly layerSetName?: string | undefined;
    readonly classification?: ClassificationRef | undefined;
    readonly manufacturerName?: string | undefined;
    readonly manufacturerModel?: string | undefined;
    readonly manufacturerProductionYear?: number | undefined;
    readonly customProperties?: Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>> | undefined;
}

declare function parseCoveringSpec(input: unknown): Result<CoveringSpec, BimError>;

type AssemblyPredefinedType = 'ACCESSORY_ASSEMBLY' | 'ARCH' | 'BEAM_GRID' | 'BRACED_FRAME' | 'GIRDER' | 'REINFORCEMENT_UNIT' | 'RIGID_FRAME' | 'SLAB_FIELD' | 'TRUSS' | 'USERDEFINED' | 'NOTDEFINED';

type AssemblyPlace = 'SITE' | 'FACTORY' | 'NOTDEFINED';

/**
 * A grouping container (IfcElementAssembly). Carries no geometry of its own;
 * parts are attached via {@link BimModel.aggregate} (IfcRelAggregates) or
 * {@link BimModel.nest} (IfcRelNests, order-preserving).
 */
interface ElementAssemblySpec {
    readonly name?: string | undefined;
    readonly predefinedType?: AssemblyPredefinedType | undefined;
    readonly assemblyPlace?: AssemblyPlace | undefined;
}

declare function parseElementAssemblySpec(input: unknown): Result<ElementAssemblySpec, BimError>;

/**
 * A spatial zone — an IfcZone grouping spaces (or other zones) that share a
 * functional purpose such as a thermal, fire, or occupancy zone. Membership is
 * established separately via an ASSIGNS_TO_GROUP relationship referencing the
 * member localIds; the zone itself carries no geometry.
 */
interface ZoneSpec {
    readonly name: string;
    readonly longName?: string | undefined;
    readonly description?: string | undefined;
    readonly objectType?: string | undefined;
}

/**
 * A system — an IfcSystem grouping elements that together provide a service
 * (HVAC supply, electrical circuit, plumbing run). Like a zone, the system is a
 * pure grouping object; members are linked via an ASSIGNS_TO_GROUP relationship.
 */
interface SystemSpec {
    readonly name: string;
    readonly longName?: string | undefined;
    readonly description?: string | undefined;
    readonly objectType?: string | undefined;
}

declare function parseZoneSpec(input: unknown): Result<ZoneSpec, BimError>;

declare function parseSystemSpec(input: unknown): Result<SystemSpec, BimError>;

interface SurfaceStyleSpec {
    readonly name: string;
    /** Red channel, 0–1. */
    readonly r: number;
    /** Green channel, 0–1. */
    readonly g: number;
    /** Blue channel, 0–1. */
    readonly b: number;
    /** 0 = opaque (default), 1 = fully transparent. */
    readonly transparency?: number;
}

declare function parseSurfaceStyleSpec(input: unknown): Result<SurfaceStyleSpec, BimError>;

/** A door opening in a wall. All dimensions in mm. */
interface DoorSpec {
    readonly width: number;
    readonly height: number;
    readonly offsetAlongWall: number;
    readonly offsetFromFloor: number;
    readonly wallLocalId: LocalId;
    readonly materialName: string;
    readonly isExternal?: boolean | undefined;
    readonly fireRating?: string | undefined;
    readonly acousticRating?: string | undefined;
}

/** A window opening in a wall. All dimensions in mm. */
interface WindowSpec {
    readonly width: number;
    readonly height: number;
    readonly offsetAlongWall: number;
    readonly offsetFromFloor: number;
    readonly wallLocalId: LocalId;
    readonly materialName: string;
    readonly isExternal?: boolean | undefined;
    readonly fireRating?: string | undefined;
    readonly acousticRating?: string | undefined;
    readonly thermalTransmittance?: number | undefined;
}

declare function parseDoorSpec(input: unknown): Result<DoorSpec, BimError>;

declare function parseWindowSpec(input: unknown): Result<WindowSpec, BimError>;

/**
 * Input for BimModel.addSlabOpening — a vertical through-hole in a slab.
 * All dimensions in mm, offsets in the slab's local XY frame.
 */
interface SlabOpeningInput {
    readonly sizeX: number;
    readonly sizeY: number;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly slabLocalId: LocalId;
}

declare function parseSlabOpeningInput(input: unknown): Result<SlabOpeningInput, BimError>;

type IfcGuid = string & {
    readonly [__ifcGuidBrand]: true;
};

declare function newIfcGuid(): IfcGuid;

declare function isValidIfcGuid(s: string): s is IfcGuid;

/**
 * Synchronously derives a stable IFC GlobalId from an arbitrary stable key.
 * Re-running with the same key always yields the same GUID, so serializing an
 * identical model twice produces byte-for-byte identical GlobalIds. Distinct
 * keys yield distinct, format-valid (22-char) GlobalIds.
 */
declare function deriveIfcGuidSync(stableKey: string): IfcGuid;

/**
 * Async wrapper over {@link deriveIfcGuidSync} for callers that prefer a Promise
 * surface. The derivation itself is synchronous and deterministic.
 */
declare function deriveIfcGuid(stableKey: string): Promise<IfcGuid>;

type LocalId = number & {
    readonly [__localIdBrand]: true;
};

interface LocalIdCounter {
    next(): LocalId;
    current(): LocalId;
}

declare function makeLocalIdCounter(start?: number): LocalIdCounter;

interface ModelGraph {
    readonly elements: readonly AnyBimElement[];
    readonly relationships: readonly BimRelationship[];
}

type IntegrityInput = ModelGraph | ModelAccessor;

/**
 * Validates the in-memory model graph for referential integrity and spatial
 * containment completeness, returning a ValidationReport. Flags:
 *
 *  - orphaned physical elements (not contained in any spatial structure),
 *  - elements contained in more than one structure,
 *  - voids/fills inconsistencies (a void referencing a missing host or opening,
 *    a fill referencing a missing opening or filler),
 *  - openings referenced by no void rel (warning).
 */
declare function checkReferentialIntegrity(input: IntegrityInput): ValidationReport;

/**
 * EXPRESS/STEP self-validation gate.
 *
 * Re-opens produced IFC bytes with a fresh web-ifc model and checks that:
 *  - the model parses and is non-empty;
 *  - the required roots exist (one IfcProject and a spatial structure element);
 *  - every IfcRoot.GlobalId is a valid 22-character IFC GUID;
 *  - GlobalIds are unique across the model (a collision is an error).
 *
 * The web-ifc model lifecycle is fully owned here: it is always closed before
 * returning, even when a check throws.
 */
declare function checkSchema(bytes: Uint8Array): Promise<ValidationReport>;

interface EntityCounts {
    /** Total number of entity lines in the model. */
    readonly totalCount: number;
    /** Count per key entity, keyed by IFC entity name. */
    readonly typeCounts: Readonly<Record<string, number>>;
}

/**
 * Write→read→re-write round-trip self-check. Opens the produced IFC bytes,
 * re-saves them, re-opens the re-saved bytes, and reports any count delta in the
 * total entity-line count or the key per-type counts (per the severity model).
 */
declare function checkRoundTrip(bytes: Uint8Array): Promise<RoundTripReport>;

/**
 * GEOMETRY-VALIDITY gate.
 *
 * Validates one or more brepjs ValidSolids for IFC export readiness:
 *  - BRepCheck validity (isValid). Invalid topology that autoHeal cannot
 *    repair is an error; geometry that only became valid after healing is a
 *    warning (the exported solid differs from the authored one).
 *  - Non-zero volume (measureVolume > MIN_VOLUME_MM3). Zero/negative volume
 *    is an error — such a solid carries no usable geometry.
 *
 * The brand `ValidSolid` only asserts validity at construction time; transforms
 * (scaling, boolean ops, sweeps) can still yield degenerate or invalid results,
 * so the runtime checks here are not redundant with the type.
 *
 * `entity` is the human-readable identifier surfaced on each ValidationIssue.
 * When validating a list it is appended with the element index.
 */
declare function checkGeometryValidity(solids: ValidSolid | readonly ValidSolid[], entity?: string): ValidationReport;

type ValidationSeverity = 'error' | 'warning' | 'info';

interface ValidationIssue {
    readonly code: string;
    readonly severity: ValidationSeverity;
    readonly message: string;
    readonly entity?: string | number;
    readonly context?: Readonly<Record<string, unknown>>;
}

interface ValidationReport {
    readonly issues: readonly ValidationIssue[];
}

declare function issue(severity: ValidationSeverity, code: string, message: string, entity?: string | number, context?: Readonly<Record<string, unknown>>): ValidationIssue;

declare function emptyReport(): ValidationReport;

declare function hasErrors(report: ValidationReport): boolean;

type SeverityCounts = Readonly<Record<ValidationSeverity, number>>;

declare function countBySeverity(report: ValidationReport): SeverityCounts;

type IfcTypeName = 'IFCWALLTYPE' | 'IFCSLABTYPE' | 'IFCBEAMTYPE' | 'IFCCOLUMNTYPE' | 'IFCDOORTYPE' | 'IFCWINDOWTYPE' | 'IFCSPACETYPE' | 'IFCFOOTINGTYPE' | 'IFCPILETYPE' | 'IFCRAILINGTYPE' | 'IFCCOVERINGTYPE';

interface TypeWriteResult {
    typeExpressId: number;
    relExpressId: number;
}

/**
 * Writes one IfcXxxType plus an IfcRelDefinesByType that
 * links it to the given occurrence expressIDs. `typeGuid`/`relGuid` are the
 * deterministic GUIDs derived for the type object and its relationship.
 */
declare function writeIfcType(w: IfcWriter, ownerHistoryId: number, typeName: IfcTypeName, typeGuid: IfcGuid, relGuid: IfcGuid, predefinedType: string, occurrenceExpressIds: readonly number[]): TypeWriteResult;

/**
 * Emits an IfcZone grouping object. `longName` (a descriptive label such as
 * "Top Floor Thermal Zone") maps to the entity Description since IfcZone has no
 * LongName attribute; `objectType` maps to ObjectType.
 */
declare function writeZoneEntity(w: IfcWriter, guid: IfcGuid, name: string, longName: string | null, objectType: string | null, ownerHistoryId: number): number;

/**
 * Emits an IfcSystem grouping object. As with {@link writeZoneEntity}, `longName`
 * maps to Description and `objectType` to ObjectType.
 */
declare function writeSystemEntity(w: IfcWriter, guid: IfcGuid, name: string, longName: string | null, objectType: string | null, ownerHistoryId: number): number;

/**
 * Links a group (zone or system) to its members via IfcRelAssignsToGroup.
 * `groupExpressId` becomes RelatingGroup; each member id becomes a RelatedObjects
 * reference. Member entities must already be written so their express ids exist.
 */
declare function writeRelAssignsToGroup(w: IfcWriter, guid: IfcGuid, ownerHistoryId: number, groupExpressId: number, memberExpressIds: readonly number[]): void;

/**
 * IFC schema-version abstraction for the writer.
 *
 * The writer targets a single IFC schema per model. This module is the single
 * source of truth for which schemas are supported, the FILE_SCHEMA token that
 * goes into the STEP header (and into web-ifc's `CreateModel({ schema })`), and
 * a guard helper for entities that exist only in a given schema.
 *
 * Selection is wired in by the writer integrator via `BimModelMeta.ifcSchema`;
 * the default is {@link DEFAULT_IFC_SCHEMA}.
 */
/** Writer-supported IFC schemas, in declared order. */
declare const IFC_SCHEMAS: readonly ["IFC4", "IFC4X3"];

/** Union of writer-supported IFC schema identifiers. */
type IfcSchema = (typeof IFC_SCHEMAS)[number];

/** Schema used when none is specified in model meta. */
declare const DEFAULT_IFC_SCHEMA: IfcSchema;

/**
 * The FILE_SCHEMA token for the STEP header and `CreateModel({ schema })`.
 *
 * web-ifc identifies schemas by these exact strings, and the STEP serializer
 * emits `FILE_SCHEMA(('<token>'));`. For the supported set the token equals the
 * schema identifier itself, but callers should route through this function so a
 * future schema whose header token diverges from its identifier stays correct.
 */
declare function fileSchemaString(schema: IfcSchema): string;

/** Type guard narrowing an unknown value to a supported {@link IfcSchema}. */
declare function isIfcSchema(value: unknown): value is IfcSchema;

/**
 * Whether `entityName` may be written in `schema`.
 *
 * Used by entity writers to gate emission of schema-specific entities: an
 * IFC4X3-only entity must not be written into an IFC4 model. Unknown entity
 * names default to supported so the guard never blocks schema-agnostic writes.
 */
declare function schemaSupports(schema: IfcSchema, entityName: string): boolean;

/** IfcAssemblyPlaceEnum values; SITE for in-place assemblies, FACTORY for prefabricated. */
type AssemblyPlaceIfc = 'SITE' | 'FACTORY' | 'NOTDEFINED';

/** IfcElementAssemblyTypeEnum values (IFC4). */
type ElementAssemblyPredefinedTypeIfc = 'ACCESSORY_ASSEMBLY' | 'ARCH' | 'BEAM_GRID' | 'BRACED_FRAME' | 'GIRDER' | 'REINFORCEMENT_UNIT' | 'RIGID_FRAME' | 'SLAB_FIELD' | 'TRUSS' | 'USERDEFINED' | 'NOTDEFINED';

/**
 * Emits an IfcElementAssembly grouping container. The assembly itself carries no
 * own geometry by default — parts contribute geometry and are linked via
 * {@link writeRelAggregatesElements} (or {@link writeRelNests} for ordered nesting).
 * Pass `productDefinitionShapeId` only when the assembly has an explicit envelope.
 */
declare function writeElementAssemblyEntity(w: IfcWriter, guid: IfcGuid, name: string, predefinedType: ElementAssemblyPredefinedTypeIfc, ownerHistoryId: number, localPlacementId: number | null, productDefinitionShapeId: number | null, assemblyPlace?: AssemblyPlaceIfc): number;

/**
 * Links child elements to an assembly via IfcRelAggregates. Use this for the
 * element-level (non-spatial) decomposition of an IfcElementAssembly into parts.
 * `relatedObjectIds` must be non-empty; an empty set is a no-op.
 */
declare function writeRelAggregatesElements(w: IfcWriter, guid: IfcGuid, ownerHistoryId: number, relatingObjectId: number, relatedObjectIds: readonly number[]): void;

/**
 * Links ordered child elements to a parent via IfcRelNests. Unlike
 * IfcRelAggregates, IfcRelNests preserves the order of `relatedObjectIds`,
 * which is the correct relationship for ordered members (e.g. stair/ramp
 * flights within their assembly). An empty set is a no-op.
 */
declare function writeRelNests(w: IfcWriter, guid: IfcGuid, ownerHistoryId: number, relatingObjectId: number, relatedObjectIds: readonly number[]): void;

/**
 * Emits IfcColourRgb + IfcSurfaceStyleRendering + IfcSurfaceStyle and returns the
 * IfcSurfaceStyle express ID. Link the style to geometry items with
 * {@link writeStyledItem}. Colour channels and transparency are clamped to [0,1].
 */
declare function writeSurfaceStyle(w: IfcWriter, spec: SurfaceStyleSpec): number;

/**
 * Emits an IfcStyledItem associating a single geometry representation item
 * (e.g. an IfcExtrudedAreaSolid or IfcTriangulatedFaceSet) with a surface style
 * produced by {@link writeSurfaceStyle}.
 */
declare function writeStyledItem(w: IfcWriter, geomItemId: number, styleId: number): void;

/**
 * Emits an IfcPresentationLayerAssignment grouping representation items under a
 * named layer. An empty `itemIds` set is a no-op (IFC requires a non-empty
 * AssignedItems set).
 */
declare function writePresentationLayer(w: IfcWriter, layerName: string, itemIds: readonly number[]): void;

/** IfcConnectionTypeEnum values used by IfcRelConnectsPathElements path ends. */
type PathConnectionTypeIfc = 'ATSTART' | 'ATEND' | 'ATPATH' | 'NOTDEFINED';

/**
 * Emits an IfcRelConnectsElements recording a physical connection between two
 * elements. `description` optionally annotates the connection; geometry of the
 * connection is left null (logical connectivity only).
 */
declare function writeRelConnectsElements(w: IfcWriter, guid: IfcGuid, ownerHistoryId: number, relatingElementId: number, relatedElementId: number, description?: string | null): void;

/**
 * Emits an IfcRelConnectsPathElements recording a connection between two
 * path-based elements (e.g. walls, beams) at specified path ends. Priority
 * arrays are emitted empty; connection geometry is left null.
 */
declare function writeRelConnectsPathElements(w: IfcWriter, guid: IfcGuid, ownerHistoryId: number, relatingElementId: number, relatedElementId: number, relatingConnectionType: PathConnectionTypeIfc, relatedConnectionType: PathConnectionTypeIfc, description?: string | null): void;

interface MaterialLayerSetSpec {
    readonly kind: 'LAYER_SET';
    readonly layerSetName: string;
    readonly layers: readonly MaterialLayer[];
    /** Offset of the layer set from the element reference line, in mm (default 0). */
    readonly offsetFromReferenceLine?: number | undefined;
}

interface MaterialProfileSpec {
    readonly kind: 'PROFILE_SET';
    readonly profileSetName: string;
    /** Name of the profile; the profile geometry is referenced by name only. */
    readonly profileName: string;
    readonly materialName: string;
}

type MaterialSpec = MaterialLayerSetSpec | MaterialProfileSpec;

/**
 * Writes IfcMaterialLayer × N + IfcMaterialLayerSet + IfcMaterialLayerSetUsage,
 * then associates the usage with the related objects via IfcRelAssociatesMaterial.
 * The rel GlobalId comes from `guid` (a deterministic, caller-supplied GUID).
 * Returns the IfcRelAssociatesMaterial express ID, or 0 if the layer list is
 * empty (nothing is written).
 */
declare function writeMaterialLayerSet(w: IfcWriter, guid: IfcGuid, ownerHistoryId: number, spec: MaterialLayerSetSpec, relatedObjectIds: readonly number[], direction?: 'AXIS2' | 'AXIS3'): number;

/**
 * Writes a IfcMaterialProfileSet referencing a single named profile + material,
 * then associates it with the related objects via IfcRelAssociatesMaterial.
 * Profile geometry is referenced by name only (no IfcProfileDef geometry).
 * Returns the IfcRelAssociatesMaterial express ID.
 */
declare function writeMaterialProfileSet(w: IfcWriter, guid: IfcGuid, ownerHistoryId: number, spec: MaterialProfileSpec, relatedObjectIds: readonly number[]): number;

/**
 * Writes a bare IfcMaterial + IfcRelAssociatesMaterial. This is the
 * single-material path used when no layer/profile spec is present.
 */
declare function writeMaterialSimple(w: IfcWriter, guid: IfcGuid, ownerHistoryId: number, materialName: string, relatedObjectIds: readonly number[]): void;

/**
 * Writes the IFC classification entities for a set of references and associates
 * each to its elements.
 *
 * For every distinct classification system a single `IfcClassification` is
 * emitted (deduplicated by system name within this call). Each reference yields
 * one `IfcClassificationReference` pointing at that system, plus one
 * `IfcRelAssociatesClassification` linking the reference to its related objects.
 * The rel's GlobalId is derived deterministically from the reference's
 * system/code so re-exports stay byte-stable.
 *
 * @param refs maps each classification reference to the express IDs of the IFC
 *   elements it classifies.
 */
declare function writeClassificationRefs(w: IfcWriter, ownerHistoryId: number, refs: ReadonlyMap<ClassificationRef, readonly number[]>): void;

/**
 * IFC measure types used by the standard Pset_*Common property sets.
 * Each maps to a web-ifc defined-type constant via {@link webIfcConstantFor}.
 */
type PsetMeasureType = 'IFCBOOLEAN' | 'IFCIDENTIFIER' | 'IFCLABEL' | 'IFCTEXT' | 'IFCREAL' | 'IFCINTEGER' | 'IFCLENGTHMEASURE' | 'IFCPOSITIVELENGTHMEASURE' | 'IFCAREAMEASURE' | 'IFCVOLUMEMEASURE' | 'IFCRATIOMEASURE' | 'IFCPOSITIVERATIOMEASURE' | 'IFCPLANEANGLEMEASURE' | 'IFCTHERMALTRANSMITTANCEMEASURE';

/** The element categories that carry a standard Pset_*Common set. */
type PsetCategory = 'WALL' | 'SLAB' | 'BEAM' | 'COLUMN' | 'DOOR' | 'WINDOW' | 'SPACE' | 'ROOF' | 'CURTAIN_WALL' | 'FOOTING' | 'PILE' | 'STAIR' | 'RAMP' | 'RAILING' | 'COVERING';

type PsetPropertyTemplate = SingleValueTemplate | EnumeratedValueTemplate;

interface PsetTemplate {
    readonly psetName: string;
    readonly properties: readonly PsetPropertyTemplate[];
}

/**
 * Per-property IFC measure type for every property appearing in the standard
 * Pset_*Common sets. The psetWriter consults this to emit the correct measure
 * type instead of the legacy everything-is-IFCREAL heuristic. Properties absent
 * from this table have no standard measure type and the writer falls back to its
 * JS-type heuristic.
 */
declare const PSET_PROPERTY_TYPE_TABLE: Readonly<Record<string, PsetMeasureType>>;

/** Standard Pset_*Common template keyed by element category. */
declare const PSET_TEMPLATES: Readonly<Record<PsetCategory, PsetTemplate>>;

/** Looks up the standard IFC measure type for a Pset property name. */
declare function measureTypeFor(propertyName: string): PsetMeasureType | undefined;

/** Returns the standard Pset_*Common template for an element category. */
declare function templateFor(category: PsetCategory): PsetTemplate;

type LengthUnit = 'mm' | 'm' | 'in' | 'ft';

interface UnitSystem {
    readonly length: LengthUnit;
}

declare const DEFAULT_UNITS: UnitSystem;

declare function toLengthMm(value: number, unit: LengthUnit): number;

declare function toIfcLengthM(mm: number): number;

type BimErrorKind = 'BIM_SPEC' | 'BIM_IFC' | 'BIM_GEOMETRY' | 'BIM_IMPORT' | 'BIM_BCF' | 'BIM_IDS';

interface BimError {
    readonly kind: BimErrorKind;
    readonly code: string;
    readonly message: string;
    readonly cause?: unknown;
    readonly metadata?: Readonly<Record<string, unknown>>;
}

declare function specError(code: string, message: string, cause?: unknown): BimError;

declare function ifcError(code: string, message: string, cause?: unknown): BimError;

declare function geometryError(code: string, message: string, cause?: unknown): BimError;

/**
 * IFC-import error factory. Codes used by the reader subsystem:
 * - `OPEN_MODEL_FAILED` — web-ifc returned an invalid model id on OpenModel
 * - `SCHEMA_UNSUPPORTED` — schema string not in `['IFC2X3', 'IFC4', 'IFC4X3']`
 * - `UNSUPPORTED_PROFILE` — profile entity type not in the supported set
 * - `GEOMETRY_RECONSTRUCTION_FAILED` — parametric reconstruction threw
 * - `TESSELLATION_NOT_MANIFOLD` — STL round-trip did not produce a closed solid
 * - `PLACEMENT_READ_FAILED` — placement chain produced a degenerate matrix
 * - `UNIT_ASSIGNMENT_MISSING` — no IfcUnitAssignment found (assume metres, warn)
 */
declare function importError(code: string, message: string, cause?: unknown): BimError;

/**
 * BCF (BIM Collaboration Format) error factory. Codes used by the BCF subsystem:
 * - `BCF_PARSE_FAILED` — an XML file could not be parsed into the BCF data model
 * - `BCF_VERSION_UNSUPPORTED` — `bcf.version` declares a version other than 3.0
 * - `BCF_MISSING_FILE` — a required container file (`bcf.version`, `project.bcfp`) is absent
 */
declare function bcfError(code: string, message: string, cause?: unknown): BimError;

/**
 * IDS (Information Delivery Specification) error factory. Codes used by the IDS
 * subsystem:
 * - `IDS_PARSE_FAILED` — the IDS XML could not be parsed into a document tree
 * - `IDS_INVALID_SCHEMA` — the root element is not `<ids>` or has no specifications
 * - `IDS_UNSUPPORTED_VERSION` — the document declares an IDS version this subset rejects
 */
declare function idsError(code: string, message: string, cause?: unknown): BimError;

declare function fromBrepError(inner: BrepError, code: string, message: string): BimError;

/**
 * A placed box component of the curtain wall. `origin` is the corner of the box
 * in the wall's local frame (X across the wall, Y through its depth, Z up);
 * `size` is its extent along each local axis (all mm). The owning IfcPlate /
 * IfcMember placement carries `origin`; `solid` is the local-origin template
 * geometry (corner at 0,0,0).
 */
interface CurtainWallComponent {
    readonly origin: [number, number, number];
    readonly size: [number, number, number];
    readonly solid: ValidSolid;
}

/** A curtain wall decomposed into glazing panels (plates) and mullions (members). */
interface CurtainWallGrid {
    readonly panels: readonly CurtainWallComponent[];
    readonly mullions: readonly CurtainWallComponent[];
}

/**
 * Specification for an IfcBuildingElementProxy — arbitrary geometry that does
 * not map to a typed element (wall/slab/beam/column). The solid is exported via
 * the tessellation path (IfcTriangulatedFaceSet). All custom-property values are
 * grouped by pset name. The solid is a brepjs ValidSolid handle, so this spec is
 * not a plain serializable object and is validated structurally, not via Zod.
 */
interface ProxySpec {
    readonly name: string;
    /**
     * The proxy body. OWNERSHIP TRANSFERS to the BimModel on addProxy(): the model
     * disposes this handle when it is disposed, so the caller MUST NOT dispose it
     * itself (no `using`) — doing so double-frees the underlying WASM shape.
     */
    readonly solid: ValidSolid;
    readonly materialName?: string | undefined;
    readonly predefinedType?: 'COMPLEX' | 'ELEMENT' | 'NOTDEFINED' | 'PARTIAL' | undefined;
    readonly customProperties?: Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>> | undefined;
}

interface ProjectSpec {
    readonly name: string;
    readonly description?: string;
    /**
     * Optional stable, globally-unique project identifier used to scope all derived
     * GlobalIds. Supply a UUID (or any stable unique string) when the model will be
     * federated/diffed/exported to COBie/BCF so its GlobalIds are unique across
     * models. When omitted, the scope falls back to the project name+description
     * (stable, but unique only per distinct name).
     */
    readonly projectId?: string;
}

interface SiteSpec {
    readonly name: string;
    readonly description?: string;
}

interface BuildingSpec {
    readonly name: string;
    readonly description?: string;
}

interface StoreySpec {
    readonly name: string;
    readonly elevation: number;
}

type BimCategory = 'WALL' | 'SLAB' | 'BEAM' | 'COLUMN' | 'OPENING' | 'DOOR' | 'WINDOW' | 'PROXY' | 'SPACE' | 'ROOF' | 'CURTAIN_WALL' | 'FOOTING' | 'PILE' | 'STAIR' | 'RAMP' | 'RAILING' | 'COVERING' | 'ELEMENT_ASSEMBLY' | 'ZONE' | 'SYSTEM' | 'PROJECT' | 'SITE' | 'BUILDING' | 'STOREY';

type WallOpeningSpec = {
    readonly kind: 'WALL_OPENING';
    readonly width: number;
    readonly height: number;
    readonly offsetAlongWall: number;
    readonly offsetFromFloor: number;
};

type SlabOpeningSpec = {
    readonly kind: 'SLAB_OPENING';
    readonly sizeX: number;
    readonly sizeY: number;
    readonly offsetX: number;
    readonly offsetY: number;
};

type OpeningSpec = WallOpeningSpec | SlabOpeningSpec;

declare function isWallOpening(spec: OpeningSpec): spec is WallOpeningSpec;

declare function isSlabOpening(spec: OpeningSpec): spec is SlabOpeningSpec;

type AnyBimElement = BimElement<'WALL'> | BimElement<'SLAB'> | BimElement<'BEAM'> | BimElement<'COLUMN'> | BimElement<'OPENING'> | BimElement<'DOOR'> | BimElement<'WINDOW'> | BimElement<'PROXY'> | BimElement<'SPACE'> | BimElement<'ROOF'> | BimElement<'CURTAIN_WALL'> | BimElement<'FOOTING'> | BimElement<'PILE'> | BimElement<'STAIR'> | BimElement<'RAMP'> | BimElement<'RAILING'> | BimElement<'COVERING'> | BimElement<'ELEMENT_ASSEMBLY'> | BimElement<'ZONE'> | BimElement<'SYSTEM'> | BimElement<'PROJECT'> | BimElement<'SITE'> | BimElement<'BUILDING'> | BimElement<'STOREY'>;

interface AssociatesMaterialRel {
    readonly kind: 'ASSOCIATES_MATERIAL';
    readonly guid: IfcGuid;
    readonly localId: LocalId;
    readonly materialName: string;
    readonly relatedObjects: readonly LocalId[];
    /**
     * When present, the element is associated via an IfcMaterialLayerSet built from
     * these layers instead of the bare `materialName` IfcMaterial.
     */
    readonly materialLayers?: readonly MaterialLayer[] | undefined;
    readonly layerSetName?: string | undefined;
}

interface AssociatesClassificationRel {
    readonly kind: 'ASSOCIATES_CLASSIFICATION';
    readonly guid: IfcGuid;
    readonly localId: LocalId;
    readonly ref: ClassificationRef;
    readonly relatedObjects: readonly LocalId[];
}

interface VoidsWallRel {
    readonly kind: 'VOIDS_WALL';
    readonly guid: IfcGuid;
    readonly localId: LocalId;
    readonly wallLocalId: LocalId;
    readonly openingLocalId: LocalId;
}

interface VoidsSlabRel {
    readonly kind: 'VOIDS_SLAB';
    readonly guid: IfcGuid;
    readonly localId: LocalId;
    readonly slabLocalId: LocalId;
    readonly openingLocalId: LocalId;
}

interface FillsOpeningRel {
    readonly kind: 'FILLS_OPENING';
    readonly guid: IfcGuid;
    readonly localId: LocalId;
    readonly openingLocalId: LocalId;
    readonly fillerLocalId: LocalId;
}

interface SpaceBoundaryRel {
    readonly kind: 'SPACE_BOUNDARY';
    readonly guid: IfcGuid;
    readonly localId: LocalId;
    readonly spaceLocalId: LocalId;
    readonly elementLocalId: LocalId;
    readonly connectionType: 'PHYSICAL' | 'VIRTUAL' | 'NOTDEFINED';
}

/** Element-level decomposition of an IfcElementAssembly into its parts. */
interface NestsRel {
    readonly kind: 'NESTS';
    readonly guid: IfcGuid;
    readonly localId: LocalId;
    readonly relatingObject: LocalId;
    readonly relatedObjects: readonly LocalId[];
}

/** Logical connection between two elements (IfcRelConnectsElements). */
interface ConnectsElementsRel {
    readonly kind: 'CONNECTS_ELEMENTS';
    readonly guid: IfcGuid;
    readonly localId: LocalId;
    readonly relatingElementLocalId: LocalId;
    readonly relatedElementLocalId: LocalId;
    readonly description?: string | undefined;
}

/** Connection between two path-based elements at specified ends (IfcRelConnectsPathElements). */
interface ConnectsPathElementsRel {
    readonly kind: 'CONNECTS_PATH_ELEMENTS';
    readonly guid: IfcGuid;
    readonly localId: LocalId;
    readonly relatingElementLocalId: LocalId;
    readonly relatedElementLocalId: LocalId;
    readonly relatingConnectionType: 'ATSTART' | 'ATEND' | 'ATPATH' | 'NOTDEFINED';
    readonly relatedConnectionType: 'ATSTART' | 'ATEND' | 'ATPATH' | 'NOTDEFINED';
    readonly description?: string | undefined;
}

/** Links a covering to the building element it covers (IfcRelCoversBldgElements). */
interface CoversElementRel {
    readonly kind: 'COVERS_ELEMENT';
    readonly guid: IfcGuid;
    readonly localId: LocalId;
    readonly hostLocalId: LocalId;
    readonly coveringLocalId: LocalId;
}

/**
 * Assigns members to a grouping object — a zone or system (IfcRelAssignsToGroup).
 * `groupLocalId` is the IfcZone/IfcSystem; `memberLocalIds` are the assigned
 * spaces or elements.
 */
interface AssignsToGroupRel {
    readonly kind: 'ASSIGNS_TO_GROUP';
    readonly guid: IfcGuid;
    readonly localId: LocalId;
    readonly groupLocalId: LocalId;
    readonly memberLocalIds: readonly LocalId[];
}

type BimRelationship = AggregatesRel | ContainedInRel | AssociatesMaterialRel | AssociatesClassificationRel | VoidsWallRel | VoidsSlabRel | FillsOpeningRel | SpaceBoundaryRel | NestsRel | ConnectsElementsRel | ConnectsPathElementsRel | CoversElementRel | AssignsToGroupRel;

/**
 * Shared material-association value types. Pure data, no imports, so they are
 * safe to reference from both the type layer (relationships, specs) and the
 * ifc-writer layer without risking a circular import.
 */
/** One physical layer in a layered material set (e.g. a wall build-up). */
interface MaterialLayer {
    readonly name: string;
    readonly thicknessMm: number;
    readonly isVentilated?: boolean | undefined;
    readonly priority?: number | undefined;
    /** Bulk density (kg/m³) for analytic weight quantities; nominal lookup used when absent. */
    readonly densityKgM3?: number | undefined;
}

/**
 * A reference into an external classification system (e.g. Uniclass 2015 or
 * OmniClass). Pure data, no imports, so it is safe to import from any layer.
 */
interface ClassificationRef {
    /** Classification system name, e.g. 'Uniclass2015'. */
    readonly system: string;
    /** Edition of the system, e.g. '2015'. */
    readonly edition?: string | undefined;
    /** URL locating the system or table. */
    readonly location?: string | undefined;
    /** The classification code, e.g. 'Ss_15_10_30_14'. */
    readonly code: string;
    /** Human-readable label for the referenced code. */
    readonly description?: string | undefined;
}

interface BimModelMeta {
    applicationName: string;
    applicationVersion: string;
    /** MVD ViewDefinition declared in the STEP FILE_DESCRIPTION header. */
    mvdViewDefinition?: string | undefined;
    /** Authoring person for the IfcOwnerHistory chain. Defaults to an empty person. */
    author?: OwnerHistoryAuthor | undefined;
    /** Owning organization name for the IfcOwnerHistory chain. Defaults to "Unknown". */
    organizationName?: string | undefined;
    /**
     * Unix epoch seconds for IfcOwnerHistory.CreationDate. Defaults to 0 (epoch)
     * so serialized output stays byte-deterministic; pass a real timestamp to
     * record authoring time.
     */
    creationTimestamp?: number | undefined;
    /** Target IFC schema (FILE_SCHEMA + CreateModel). Defaults to IFC4. */
    ifcSchema?: IfcSchema | undefined;
}

/** Authoring person for the IfcOwnerHistory chain. */
interface OwnerHistoryAuthor {
    readonly givenName?: string | undefined;
    readonly familyName?: string | undefined;
    /** Optional contact email; emitted as an IfcTelecomAddress on the person. */
    readonly email?: string | undefined;
}

/**
 * Configurable owner-history metadata. All identity values are passed in so the
 * writer never reads wall-clock time — `creationTimestamp` defaults to 0 (epoch)
 * to keep serialized output byte-deterministic.
 */
interface OwnerHistoryMeta {
    readonly author: OwnerHistoryAuthor;
    readonly organizationName: string;
    readonly applicationName: string;
    readonly applicationVersion: string;
    /** Unix epoch seconds for IfcOwnerHistory.CreationDate. Default 0 (epoch). */
    readonly creationTimestamp?: number | undefined;
}

/**
 * Derives a {@link CobieModel} from an in-memory {@link BimModel}, reading only
 * its public getters. The derivation is a single O(N) pass that mirrors the
 * spatial-tree and type-layer conventions of {@link toIfc} so that COBie
 * Component/Type names line up with the exported IFC.
 *
 * Optional element categories from later phases (ZONE, SYSTEM) are picked up
 * generically when present; their absence is not an error.
 */
declare function deriveCobieModel(model: BimModel, meta?: CobieExportMeta): CobieModel;

/**
 * Serializes a {@link CobieModel} to CSV — one sheet per COBie table, keyed by
 * sheet name. Each sheet is a CRLF-delimited RFC 4180 document with a header row
 * followed by one row per record.
 */
declare function serializeCobieToCsv(model: CobieModel): Map<string, string>;

/** Serializes a {@link CobieModel} to a JSON object — one array per sheet. */
declare function serializeCobieToJson(model: CobieModel): CobieJson;

/**
 * COBie (Construction-Operations Building information exchange) table row types.
 *
 * Each interface models one COBie sheet. Column names follow the COBie 2.4
 * spreadsheet schema (camelCased). Rows are derived from a {@link BimModel} by
 * {@link deriveCobieModel}; the resulting {@link CobieModel} is a pure value
 * object that can be serialized to CSV or JSON.
 *
 * Several required-but-not-yet-modelled COBie columns (CreatedBy, CreatedOn,
 * Category) are emitted as empty strings rather than omitted, because COBie
 * validators expect the columns to be present. The fields that brepjs-bim can
 * populate from a {@link BimModel} carry real data.
 */
/** Minimal contact metadata used to populate the COBie Contact sheet. */
interface CobieContactMeta {
    readonly email?: string | undefined;
    readonly givenName?: string | undefined;
    readonly familyName?: string | undefined;
    readonly organizationName?: string | undefined;
    readonly company?: string | undefined;
    readonly phone?: string | undefined;
}

/** Optional metadata consumed by {@link deriveCobieModel}. */
interface CobieExportMeta {
    readonly contact?: CobieContactMeta | undefined;
}

interface CobieContactRow {
    /** COBie Contact key — the contact's email address. */
    readonly email: string;
    readonly givenName: string;
    readonly familyName: string;
    readonly company: string;
    readonly phone: string;
}

interface CobieFacilityRow {
    readonly name: string;
    readonly createdBy: string;
    readonly category: string;
    readonly projectName: string;
    readonly siteName: string;
    readonly description: string;
    /** IfcProject GlobalId. */
    readonly externalIdentifier: string;
}

interface CobieFloorRow {
    readonly name: string;
    readonly createdBy: string;
    readonly category: string;
    readonly description: string;
    readonly elevation: number;
    /** IfcBuildingStorey GlobalId. */
    readonly externalIdentifier: string;
}

interface CobieSpaceRow {
    readonly name: string;
    readonly createdBy: string;
    readonly category: string;
    /** Name of the Floor this space sits on (resolved via the spatial tree). */
    readonly floorName: string;
    readonly description: string;
    readonly roomTag: string;
    /** IfcSpace GlobalId. */
    readonly externalIdentifier: string;
}

interface CobieZoneRow {
    readonly name: string;
    readonly createdBy: string;
    readonly category: string;
    /** Name of a space that is a member of this zone. */
    readonly spaceName: string;
    readonly externalIdentifier: string;
}

interface CobieTypeRow {
    readonly name: string;
    readonly createdBy: string;
    readonly category: string;
    readonly description: string;
    readonly assetType: string;
}

interface CobieComponentRow {
    readonly name: string;
    readonly createdBy: string;
    /** Name of the Type row this component is an occurrence of. */
    readonly typeName: string;
    /** Name of the Space this component is contained in, when resolvable. */
    readonly space: string;
    readonly description: string;
    /** Element GlobalId. */
    readonly externalIdentifier: string;
}

interface CobieSystemRow {
    readonly name: string;
    readonly createdBy: string;
    readonly category: string;
    /** Name of a component that is a member of this system. */
    readonly componentNames: string;
    readonly externalIdentifier: string;
}

interface CobieAttributeRow {
    readonly name: string;
    readonly createdBy: string;
    /** Name of the sheet row this attribute belongs to (e.g. a component name). */
    readonly sheetName: string;
    readonly rowName: string;
    readonly value: string;
}

/** All populated COBie sheets derived from a model. */
interface CobieModel {
    readonly contact: readonly CobieContactRow[];
    readonly facility: readonly CobieFacilityRow[];
    readonly floor: readonly CobieFloorRow[];
    readonly space: readonly CobieSpaceRow[];
    readonly zone: readonly CobieZoneRow[];
    readonly type: readonly CobieTypeRow[];
    readonly component: readonly CobieComponentRow[];
    readonly system: readonly CobieSystemRow[];
    readonly attribute: readonly CobieAttributeRow[];
}

/** JSON serialization of a {@link CobieModel} — one array per sheet name. */
interface CobieJson {
    readonly Contact: readonly CobieContactRow[];
    readonly Facility: readonly CobieFacilityRow[];
    readonly Floor: readonly CobieFloorRow[];
    readonly Space: readonly CobieSpaceRow[];
    readonly Zone: readonly CobieZoneRow[];
    readonly Type: readonly CobieTypeRow[];
    readonly Component: readonly CobieComponentRow[];
    readonly System: readonly CobieSystemRow[];
    readonly Attribute: readonly CobieAttributeRow[];
}

/**
 * Parses an IDS 1.0 XML document string into a typed {@link IdsDocument}.
 *
 * Supported structure: `<ids><info><title/></info><specifications>` with one or
 * more `<specification>` carrying `<applicability>` and `<requirements>`. Inside
 * those, the facets `entity`, `attribute`, `property`, `classification`,
 * `material`, and `partOf` are recognised. Each value field accepts either a
 * `<simpleValue>` or an `<xs:restriction>` with `<xs:enumeration>` or
 * `<xs:pattern>` children.
 *
 * Cardinality is read from the specification's `minOccurs`/`maxOccurs` (or the
 * `cardinality` attribute when present): `prohibited` when `maxOccurs="0"`,
 * `optional` when `minOccurs="0"`, otherwise `required`.
 *
 * Never throws — malformed XML or a missing root returns `err(idsError(...))`.
 */
declare function parseIdsXml(xml: string): Result<IdsDocument, BimError>;

/**
 * Checks an imported model against an IDS document, returning a per-specification
 * pass/fail report keyed by the specification name. The check is synchronous,
 * never throws, and surfaces all problems as {@link ValidationIssue}s.
 *
 * For each specification the applicability facets select the matching elements,
 * then the requirement facets are evaluated against each applicable element per
 * the spec's cardinality:
 * - `required` — every applicable element must satisfy all requirements
 *   (a failure is an `error`).
 * - `optional` — requirement failures are reported as `info` and never fail.
 * - `prohibited` — an applicable element that *does* satisfy the requirements is
 *   a violation (`error`).
 *
 * Unsupported facet features (the `PartOf` facet, numeric-bound restrictions,
 * and invalid `xs:pattern` dialects) are recorded in
 * {@link IdsCheckReport.unsupportedFacets} and the affected requirement is
 * skipped rather than failing the element.
 */
declare function checkModelAgainstIds(model: ImportedModel, ids: IdsDocument): IdsCheckReport;

/**
 * A value constraint on an IDS facet field. IDS expresses these either as a
 * literal `<simpleValue>` or as an `<xs:restriction>` carrying an enumeration or
 * a pattern. The numeric bound dialect (`xs:minInclusive` etc.) is intentionally
 * not modelled — facets that use it fall through to a `pattern`-less restriction
 * and are reported as unsupported by the checker.
 */
type IdsRestriction = {
    readonly kind: 'simple';
    readonly value: string;
} | {
    readonly kind: 'enumeration';
    readonly values: readonly string[];
} | {
    readonly kind: 'pattern';
    readonly pattern: string;
};

/**
 * The IDS facet kinds this subset understands. `PartOf` is parsed but always
 * reported as unsupported by the checker (spatial-tree resolution is out of
 * scope); every other kind is fully evaluated.
 */
type IdsFacet = {
    readonly kind: 'Entity';
    readonly name: IdsRestriction;
    readonly predefinedType?: IdsRestriction | undefined;
} | {
    readonly kind: 'Attribute';
    readonly name: IdsRestriction;
    readonly value?: IdsRestriction | undefined;
} | {
    readonly kind: 'Property';
    readonly psetName: IdsRestriction;
    readonly baseName: IdsRestriction;
    readonly value?: IdsRestriction | undefined;
} | {
    readonly kind: 'Classification';
    readonly system?: IdsRestriction | undefined;
    readonly value?: IdsRestriction | undefined;
} | {
    readonly kind: 'Material';
    readonly value?: IdsRestriction | undefined;
} | {
    readonly kind: 'PartOf';
    readonly relation?: string | undefined;
};

type IdsCardinality = 'required' | 'optional' | 'prohibited';

interface IdsSpecification {
    readonly name: string;
    readonly ifcVersion: readonly string[];
    /**
     * Cardinality of the *requirements* against applicable elements:
     * - `required` — every applicable element must satisfy all requirement facets.
     * - `optional` — requirements are informational; failures are reported as
     *   warnings and do not fail the spec.
     * - `prohibited` — applicable elements must *not* satisfy the requirements.
     */
    readonly cardinality: IdsCardinality;
    readonly applicability: readonly IdsFacet[];
    readonly requirements: readonly IdsFacet[];
}

interface IdsDocument {
    readonly title: string;
    readonly specifications: readonly IdsSpecification[];
}

interface IdsCheckResult {
    readonly specificationName: string;
    readonly pass: boolean;
    /** Number of model elements matched by the applicability facets. */
    readonly applicableCount: number;
    /** Applicable elements that satisfied the cardinality contract. */
    readonly passedCount: number;
    /** Applicable elements that violated the cardinality contract. */
    readonly failedCount: number;
    readonly issues: readonly ValidationIssue[];
}

interface IdsCheckReport {
    readonly pass: boolean;
    readonly results: readonly IdsCheckResult[];
    /**
     * Human-readable identifiers of facet features that were encountered but not
     * evaluated (e.g. `PartOf in 'spec name'`). Their presence never aborts the
     * check; the affected requirement is skipped with a warning.
     */
    readonly unsupportedFacets: readonly string[];
}

/**
 * BCF 3.0 (BIM Collaboration Format) typed data model.
 *
 * Container packaging note (`FLAG: BCF_ZIP_PACKAGING_ABSENT`): a real `.bcfzip`
 * is a ZIP archive of these XML files. No declared ZIP dependency exists in the
 * brepjs-bim workspace, so this module's stable interchange surface is the
 * unzipped structure: `BcfFiles = Map<path, xml-string>`. Callers that need the
 * binary `.bcfzip` must bring their own ZIP library and pack/unpack the map.
 */
/** Unzipped BCF container: archive path → XML file contents. */
type BcfFiles = Map<string, string>;

interface BcfContainerData {
    readonly version: BcfVersion;
    readonly project: BcfProject;
    readonly topics: readonly BcfTopic[];
}

interface BcfVersion {
    readonly versionId: '3.0';
    readonly detailedVersion?: string | undefined;
}

interface BcfProject {
    readonly projectId: string;
    readonly name: string;
}

interface BcfTopic {
    readonly guid: string;
    readonly title: string;
    readonly topicType?: string | undefined;
    readonly topicStatus?: string | undefined;
    readonly priority?: string | undefined;
    readonly index?: number | undefined;
    readonly labels?: readonly string[] | undefined;
    /** ISO 8601 timestamp. */
    readonly creationDate?: string | undefined;
    readonly creationAuthor?: string | undefined;
    readonly modifiedDate?: string | undefined;
    readonly modifiedAuthor?: string | undefined;
    readonly description?: string | undefined;
    readonly assignedTo?: string | undefined;
    readonly dueDate?: string | undefined;
    readonly comments: readonly BcfComment[];
    readonly viewpoints: readonly BcfViewpoint[];
    readonly relatedTopics?: readonly string[] | undefined;
}

interface BcfComment {
    readonly guid: string;
    readonly date: string;
    readonly author: string;
    readonly comment: string;
    /** GUID of a viewpoint owned by the same topic. */
    readonly viewpointRef?: string | undefined;
    readonly modifiedDate?: string | undefined;
    readonly modifiedAuthor?: string | undefined;
}

interface BcfViewpoint {
    readonly guid: string;
    readonly viewpointFile?: string | undefined;
    readonly snapshotFile?: string | undefined;
    readonly index?: number | undefined;
    readonly components?: BcfComponents | undefined;
}

interface BcfComponents {
    readonly selection?: readonly BcfComponent[] | undefined;
    readonly coloring?: readonly BcfColoring[] | undefined;
    readonly visibility?: BcfVisibility | undefined;
}

interface BcfComponent {
    /** IFC GlobalId of the referenced element. */
    readonly ifcGuid?: string | undefined;
    readonly originatingSystem?: string | undefined;
    readonly authoringToolId?: string | undefined;
}

interface BcfColoring {
    /** Hex ARGB colour, e.g. `FFFF0000`. */
    readonly color: string;
    readonly components: readonly BcfComponent[];
}

interface BcfVisibility {
    readonly defaultVisibility: boolean;
    readonly exceptions?: readonly BcfComponent[] | undefined;
}

/**
 * Serialize a BCF 3.0 container into its unzipped file structure
 * (`Map<path, xml-string>`):
 *
 * - `bcf.version` — container version marker
 * - `project.bcfp` — project metadata
 * - `{topicGuid}/markup.bcf` — one markup file per topic (topic, comments, viewpoints)
 *
 * `FLAG: BCF_ZIP_PACKAGING_ABSENT` — to produce an actual `.bcfzip`, ZIP these
 * entries with an external library; no ZIP dependency is declared in the
 * workspace.
 */
declare function serializeBcfFiles(data: BcfContainerData): BcfFiles;

/**
 * Parse an unzipped BCF 3.0 container (`Map<path, xml-string>`) back into the
 * typed data model. The inverse of `serializeBcfFiles`.
 *
 * `FLAG: BCF_ZIP_PACKAGING_ABSENT` — callers holding a `.bcfzip` binary must
 * unzip it into a `Map<path, string>` (external ZIP library) before calling.
 */
declare function parseBcfFiles(files: BcfFiles): Result<BcfContainerData, BimError>;

interface RoundTripReport extends ValidationReport {
    readonly firstPass: EntityCounts;
    readonly secondPass: EntityCounts;
}

interface BimElement<C extends BimCategory> {
    readonly guid: IfcGuid;
    readonly localId: LocalId;
    readonly category: C;
    readonly spec: BimSpecFor<C>;
    readonly geometry: BimGeometryFor<C>;
}

// ── Aliases ──

declare const exportCobie: typeof deriveCobieModel;
declare const checkIds: typeof checkModelAgainstIds;
