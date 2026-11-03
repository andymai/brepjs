import type { Compound, Shell, Solid } from 'brepjs';

export type MeshUnit = 'um' | 'mm' | 'cm' | 'm' | 'in' | 'ft';
export type MeshFormat = 'stl' | 'obj' | 'ply' | '3mf';
export type MeshInput = Blob | ArrayBuffer | ArrayBufferView;

export interface MeshToSolidOptions {
  /**
   * Highest tier to attempt (default 2). Tier 0 builds a faceted solid with coplanar faces merged;
   * tier 1 rebuilds the part from fitted planes, cylinders, cones, spheres and tori; tier 2 also
   * writes it as an editable `.brep.ts` feature program. Each falls back to the tier below.
   */
  readonly tier?: 0 | 1 | 2 | undefined;
  /** File name or extension, used when the content alone doesn't identify the format. */
  readonly fileName?: string | undefined;
  /** Source units. `'auto'` (default) reads 3MF units and assumes millimeters otherwise. */
  readonly units?: MeshUnit | 'auto' | undefined;
  /** Merge and decimation tolerance in millimeters, or `'auto'` (default) to estimate it from the mesh. */
  readonly tolerance?: number | 'auto' | undefined;
  /** Triangle budget after decimation. Default 200,000. */
  readonly maxTriangles?: number | undefined;
  /** `true` (default) fills every hole, `false` none, a number fills holes with at most that many edges. */
  readonly fillHoles?: boolean | number | undefined;
  /** Also return the input mesh with each vertex's distance to the result. */
  readonly heatmap?: boolean | undefined;
}

/** What `inspectMesh` reads off a mesh file before any conversion. */
export interface MeshInspection {
  readonly format: MeshFormat;
  /** The unit the file declares (3MF), or `null` when it declares none. */
  readonly unit: MeshUnit | null;
  readonly triangles: number;
  /** Bounding-box size in the file's own units. */
  readonly size: readonly [number, number, number];
  /** Units worth offering when the file declares none and its size as millimeters looks implausible. */
  readonly suggestions: readonly UnitSuggestion[];
}

export interface UnitSuggestion {
  readonly unit: MeshUnit;
  /** Largest dimension in millimeters if the file were in `unit`. */
  readonly largestDimensionMm: number;
  readonly reason: string;
}

export interface BodyReport {
  /** No open boundary edge. */
  readonly closed: boolean;
  /** Every edge joins exactly two triangles. */
  readonly manifold: boolean;
  /** Mesh volume in mm³ after repair (0 for open bodies). */
  readonly volume: number;
  /** Index of the body this one is a cavity of, or -1. */
  readonly parent: number;
  readonly regions: number;
}

export interface ConversionReport {
  readonly engineVersion: string;
  readonly tierReached: 0 | 1 | 2;
  /** Present when tier 1 was attempted. */
  readonly tier1?:
    | {
        readonly fitTolerance: number;
        readonly unfitTriangles: number;
        /** Share of the mesh area no fitted surface covers. */
        readonly unfitArea: number;
        /** Neighbouring surfaces found to meet tangentially (fillets), and how many were snapped exact. */
        readonly tangentPairs: number;
        readonly snappedSurfaces: number;
        readonly surfaces: readonly {
          readonly kind: string;
          readonly triangles: number;
          readonly maxResidual: number;
        }[];
        readonly arrangement?:
          | {
              readonly patches: number;
              readonly pieces: number;
              readonly kept: number;
              readonly faces: number;
            }
          | undefined;
        /**
         * Present when no analytic surfaces rebuilt the mesh and it was rebuilt from B-spline
         * faces instead, each fitted to one smooth disc-shaped chart of the mesh.
         */
        readonly freeform?:
          | {
              readonly charts: number;
              /** Chart boundaries, each fitted once as a curve both neighbouring faces share. */
              readonly runs: number;
              readonly faces: number;
              /** Why the analytic rebuild failed. */
              readonly analyticReason: string;
            }
          | undefined;
        /** Why the result fell back to tier 0. */
        readonly fallbackReason?: string | undefined;
      }
    | undefined;
  /** Present when tier 2 was attempted on a tier 1 result. */
  readonly tier2?:
    | {
        /** The recognized features, in build order. */
        readonly features: readonly string[];
        /** Why the result stopped at tier 1. */
        readonly fallbackReason?: string | undefined;
      }
    | undefined;
  readonly format: MeshFormat;
  readonly units: {
    readonly unit: MeshUnit;
    readonly source: 'file' | 'option' | 'assumed';
    readonly scaleToMm: number;
    readonly suggestions: readonly UnitSuggestion[];
  };
  readonly input: {
    readonly rawTriangles: number;
    readonly rawVertices: number;
    readonly triangles: number;
    readonly vertices: number;
    readonly weldedVertices: number;
    readonly bboxMin: readonly [number, number, number];
    readonly bboxMax: readonly [number, number, number];
  };
  readonly repair: {
    readonly degenerateRemoved: number;
    readonly duplicatesRemoved: number;
    readonly flipped: number;
    readonly nonOrientableBodies: number;
    readonly holesFilled: number;
    readonly holeTrianglesAdded: number;
    readonly holesRemaining: number;
    /** Holes left open because their outline is too long to triangulate reliably. */
    readonly holesTooLarge: number;
    readonly nonManifoldEdges: number;
    readonly zeroAreaTriangles: number;
    /** Zero-area triangles removed by edge flips or collapses before faces were built. */
    readonly degeneratesFixed: number;
  };
  readonly estimate: {
    readonly kind: 'cad' | 'scan';
    readonly flatFraction: number;
    readonly quantization: number;
    readonly noiseSigma: number;
    readonly planeResidual: number;
    readonly chordError: number;
    readonly medianEdge: number;
    readonly autoTolerance: number;
  };
  readonly tolerance: { readonly value: number; readonly source: 'auto' | 'option' };
  readonly decimation:
    | { readonly applied: false }
    | {
        readonly applied: true;
        readonly before: number;
        readonly after: number;
        readonly maxError: number;
        readonly overBudgetCollapses: number;
        /** False when collapses that would break the surface were all that was left before reaching `maxTriangles`. */
        readonly budgetReached: boolean;
      };
  readonly regions: {
    readonly count: number;
    readonly polygons: number;
    readonly outputTriangles: number;
    readonly triangleFallbackRegions: number;
    readonly nonPlanarTriangles: number;
    readonly unpinchedVertices: number;
    readonly droppedVertices: number;
    readonly snappedVertices: number;
    readonly maxSnap: number;
    readonly maxPlaneDeviation: number;
  };
  readonly bodies: readonly BodyReport[];
  /** Distances in millimeters between the input mesh and the result. */
  readonly deviation: {
    readonly max: number;
    readonly rms: number;
    readonly p95: number;
    readonly withinTolerance: number;
    /** Largest distance from the result back to the input, sampled at each output triangle's corners and centroid. */
    readonly reverseMax: number;
    readonly samples: number;
  };
  readonly faces: {
    /** Triangles handed to the kernel. */
    readonly triangles: number;
    /** Faces in the result after coplanar triangles were unified. */
    readonly faces: number;
    /**
     * True when the kernel's coplanar-face unification ran and its result passed validation (on a
     * mesh with no coplanar neighbors it merges nothing). False means the shape was kept as built:
     * triangulated at tier 0, or the B-spline faces of a freeform rebuild, which never share a surface.
     */
    readonly unified: boolean;
  };
  readonly timings: {
    /** Parse, repair, analysis and region extraction in the wasm engine. */
    readonly engineMs: number;
    /** B-Rep construction in the kernel. */
    readonly buildMs: number;
  };
  readonly warnings: readonly string[];
}

export interface DeviationHeatmap {
  /** Input mesh vertices (xyz, millimeters, welded). */
  readonly positions: Float64Array;
  readonly indices: Uint32Array;
  /** Distance of each input vertex to the result, millimeters. */
  readonly deviation: Float32Array;
}

export interface MeshToSolidResult {
  /** A solid for one closed body, a shell for one open body, a compound for several. */
  readonly shape: Solid | Shell | Compound;
  /** True when `shape` is a single solid that passes the kernel validity check. */
  readonly solid: boolean;
  readonly report: ConversionReport;
  readonly heatmap?: DeviationHeatmap | undefined;
  /**
   * The part as a `.brep.ts` module (tier 2): its default export rebuilds `shape`, with every
   * dimension as an editable number.
   */
  readonly code?: string | undefined;
}
