#!/usr/bin/env tsx
/**
 * sync-brepkit-types — Generate `src/kernel/brepkit/brepkitWasmTypes.ts`
 * from the installed `brepkit-wasm` package's `.d.ts` file.
 *
 * Usage: npx tsx scripts/sync-brepkit-types.ts
 *
 * The script:
 *   1. Reads `node_modules/brepkit-wasm/brepkit_wasm.d.ts`
 *   2. Parses the BrepKernel class methods + standalone interfaces/classes
 *   3. Scans `src/kernel/brepkit/*.ts` for `bk.<method>` references
 *   4. Generates the types file with `@unwired` tags for unused methods
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const UPSTREAM_DTS = join(ROOT, 'node_modules/brepkit-wasm/brepkit_wasm.d.ts');
const OUTPUT_FILE = join(ROOT, 'src/kernel/brepkit/brepkitWasmTypes.ts');
const ADAPTER_DIR = join(ROOT, 'src/kernel/brepkit');

// ── Parse upstream .d.ts ──────────────────────────────────────────

interface ParsedMethod {
  name: string;
  params: string; // raw param string, still snake_case
  returnType: string;
  jsdoc: string;
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Convert parameter names from snake_case to camelCase, and widen typed arrays to accept plain arrays. */
function convertParams(raw: string): string {
  let result = raw;
  // Convert param names from snake_case to camelCase
  result = result.replace(/\b([a-z][a-z0-9_]*)\s*([\?]?\s*:)/g, (_, name: string, colon: string) => {
    return snakeToCamel(name) + colon;
  });
  // Widen typed array params to also accept plain number[]:
  // Float64Array → Float64Array | number[]
  // Uint32Array → Uint32Array | number[]
  result = result.replace(/\bFloat64Array\b/g, 'Float64Array | number[]');
  result = result.replace(/\bUint32Array\b/g, 'Uint32Array | number[]');
  return result;
}

/**
 * Map upstream return types to our interface names, replacing `any` with safe types.
 * Upstream uses `any` for wasm-bindgen JsValue returns (JSON strings and nullable values).
 */
const ANY_RETURN_OVERRIDES: Record<string, string> = {
  // Returns null for line edges, JSON string for NURBS
  getEdgeNurbsData: 'string | null',
};

function mapReturnType(rt: string, methodName: string): string {
  if (rt === 'JsMesh') return 'BrepkitMesh';
  if (rt === 'JsEdgeLines') return 'BrepkitEdgeLines';
  if (rt === 'any') {
    return ANY_RETURN_OVERRIDES[methodName] ?? 'string';
  }
  return rt;
}

function parseUpstreamDts(src: string): {
  methods: ParsedMethod[];
  upstreamVersion: string;
} {
  // Extract version from package.json
  const pkgJson = JSON.parse(
    readFileSync(join(ROOT, 'node_modules/brepkit-wasm/package.json'), 'utf-8')
  );
  const upstreamVersion: string = pkgJson.version;

  // Find the BrepKernel class body
  const classMatch = src.match(/export class BrepKernel \{([\s\S]*?)\n\}\s*\n/);
  if (!classMatch) {
    throw new Error('Could not find BrepKernel class in upstream .d.ts');
  }
  const classBody = classMatch[1];

  // Parse methods: capture JSDoc + signature
  const methods: ParsedMethod[] = [];
  // Split by method boundaries: look for lines that start a new method/property/constructor.
  // Note: [^)]* doesn't handle nested parens (e.g., function-type params). This is fine for
  // wasm-bindgen output which only uses flat primitive/typed-array params. If upstream adds
  // nested types, this regex will need a balanced-paren parser.
  const methodRe =
    /(?:\/\*\*[\s\S]*?\*\/\s*)?((?:readonly\s+)?\w+)(?:\(([^)]*)\)\s*:\s*([^;]+)|:\s*([^;]+));/g;

  let m;
  while ((m = methodRe.exec(classBody)) !== null) {
    const name = m[1];
    // Skip constructor, free, Symbol.dispose, readonly properties
    if (
      name === 'constructor' ||
      name === 'free' ||
      name.startsWith('readonly') ||
      name === '[Symbol'
    ) {
      continue;
    }

    if (m[2] !== undefined) {
      // It's a method — extract JSDoc if it precedes this match
      const beforeMatch = classBody.slice(0, m.index);
      const jsdocMatch = beforeMatch.match(/\/\*\*[\s\S]*?\*\/\s*$/);
      const jsdoc = jsdocMatch ? jsdocMatch[0].trim() : '';

      methods.push({
        name,
        params: m[2],
        returnType: m[3].trim(),
        jsdoc,
      });
    }
    // Skip readonly properties (edgeCount, positions, etc.)
  }

  return { methods, upstreamVersion };
}

// ── Detect wired methods ──────────────────────────────────────────

interface WiredInfo {
  /** Methods directly called: bk.method(...) */
  wired: Set<string>;
  /** Methods referenced but behind feature guards (typeof bk.method === 'function') */
  featureGuarded: Set<string>;
}

function findWiredMethods(): WiredInfo {
  const wired = new Set<string>();
  const featureGuarded = new Set<string>();
  const files = readdirSync(ADAPTER_DIR).filter(
    (f) => f.endsWith('.ts') && f !== 'brepkitWasmTypes.ts'
  );

  for (const file of files) {
    const content = readFileSync(join(ADAPTER_DIR, file), 'utf-8');
    // Match bk.methodName( direct call patterns
    for (const match of content.matchAll(/\bbk\.(\w+)\s*\(/g)) {
      wired.add(match[1]);
    }
    // Also match this.bk.methodName( patterns
    for (const match of content.matchAll(/\bthis\.bk\.(\w+)\s*\(/g)) {
      wired.add(match[1]);
    }
    // Detect feature-guarded references:
    //   typeof bk.method === 'function'
    //   'method' in bk
    //   if (bk.method) { ... }  (truthy check)
    for (const match of content.matchAll(/typeof\s+(?:this\.)?bk\.(\w+)/g)) {
      featureGuarded.add(match[1]);
    }
    for (const match of content.matchAll(/'(\w+)'\s+in\s+(?:this\.)?bk/g)) {
      featureGuarded.add(match[1]);
    }
    // Truthy guards: if (bk.method) — but exclude direct calls (bk.method(...))
    for (const match of content.matchAll(/if\s*\(\s*(?:this\.)?bk\.(\w+)\s*\)/g)) {
      featureGuarded.add(match[1]);
    }
  }

  return { wired, featureGuarded };
}

// ── Categorize methods ──────────────────────────────────────────

interface Section {
  label: string;
  methods: string[];
}

const METHOD_SECTIONS: Section[] = [
  {
    label: 'Primitives',
    methods: [
      'makeBox', 'makeCylinder', 'makeSphere', 'makeCone', 'makeTorus',
      'makeEllipsoid', 'makeRectangle', 'makePolygon', 'makeCircle',
      'makeCircleFace',
    ],
  },
  {
    label: 'Shape construction',
    methods: [
      'makeVertex', 'makeLineEdge', 'makeCircleArc3d', 'makeTangentArc3d',
      'makeNurbsEdge', 'makeWire', 'makePolygonWire', 'makeRegularPolygonWire',
      'makeFaceFromWire', 'makeCompound', 'makeSolid', 'solidFromShell',
      'addHolesToFace', 'removeHolesFromFace', 'reverseShape',
    ],
  },
  {
    label: 'Boolean ops',
    methods: [
      'fuse', 'cut', 'intersect', 'compoundCut', 'convexHull',
      'section', 'split',
    ],
  },
  {
    label: 'Evolution tracking',
    methods: [
      'fuseWithEvolution', 'cutWithEvolution', 'intersectWithEvolution',
    ],
  },
  {
    label: 'Sweep / Loft',
    methods: [
      'extrude', 'revolve', 'sweep', 'sweepSmooth', 'sweepAlongEdges',
      'sweepWithOptions', 'pipe', 'loft', 'loftSmooth', 'loftWithOptions',
      'helicalSweep',
    ],
  },
  {
    label: 'Modifiers',
    methods: [
      'fillet', 'filletV2', 'filletVariable', 'chamfer', 'chamferV2',
      'chamferDistanceAngle', 'shell', 'offsetSolid', 'offsetSolidV2',
      'offsetFace', 'offsetWire', 'offsetWireWithJoinType', 'thicken', 'draft',
      'defeature', 'detectSmallFeatures', 'recognizeFeatures', 'unifyFaces',
    ],
  },
  {
    label: 'Transform',
    methods: [
      'transformSolid', 'transformWire', 'copySolid', 'copyWire',
      'copyAndTransformSolid', 'mirror', 'linearPattern', 'circularPattern',
      'gridPattern', 'composeTransforms',
    ],
  },
  {
    label: 'Sewing',
    methods: ['sewFaces', 'weldShellsAndFaces', 'fillCoonsPatch', 'untrimFace'],
  },
  {
    label: 'Topology',
    methods: [
      'getSolidFaces', 'getSolidEdges', 'getSolidVertices', 'getFaceEdges',
      'getFaceVertices', 'getFaceNormal', 'getFaceOuterWire', 'getFaceWires',
      'faceWires', 'getWireEdges', 'getEdgeVertices', 'getEdgeVertexHandles',
      'getVertexPosition', 'getEntityCounts', 'getShellFaces',
      'getShapeOrientation', 'adjacentFaces', 'sharedEdges', 'edgeToFaceMap',
      'isEdgeForwardInWire', 'isWireClosed', 'getCompoundSolids',
    ],
  },
  {
    label: 'Geometry',
    methods: [
      'getSurfaceType', 'getSurfaceDomain', 'getAnalyticSurfaceParams',
      'getEdgeCurveType', 'getEdgeCurveParameters', 'getEdgeNurbsData',
      'evaluateEdgeCurve', 'evaluateEdgeCurveD1', 'evaluateSurface',
      'evaluateSurfaceNormal', 'projectPointOnSurface',
      'liftCurve2dToPlane',
    ],
  },
  {
    label: 'Measurement',
    methods: [
      'boundingBox', 'volume', 'surfaceArea', 'faceArea', 'facePerimeter',
      'edgeLength', 'wireLength', 'centerOfMass',
      'measureCurvatureAtEdge', 'measureCurvatureAtSurface',
      'pointToSolidDistance', 'pointToFaceDistance', 'pointToEdgeDistance',
      'solidToSolidDistance',
    ],
  },
  {
    label: 'Classification',
    methods: [
      'classifyPoint', 'classifyPointWinding', 'classifyPointRobust',
    ],
  },
  {
    label: 'Validation & repair',
    methods: [
      'validateSolid', 'validateSolidRelaxed', 'validateSolidWithOptions',
      'healSolid', 'repairSolid', 'fixFaceOrientations',
      'mergeCoincidentVertices', 'removeDegenerateEdges',
    ],
  },
  {
    label: 'Tessellation',
    methods: [
      'tessellateFace', 'tessellateSolid', 'tessellateSolidGrouped',
      'tessellateSolidUV', 'tessellateEdge', 'meshEdges', 'meshEdgesAll',
      'meshBoolean',
    ],
  },
  {
    label: 'Export',
    methods: [
      'exportStep', 'exportStl', 'exportStlAscii', 'exportIges',
      'export3mf', 'exportObj', 'exportGlb', 'exportPly',
    ],
  },
  {
    label: 'Import',
    methods: [
      'importStep', 'importStl', 'importIges', 'import3mf',
      'importObj', 'importGlb', 'importIndexedMesh',
    ],
  },
  {
    label: 'NURBS curves & surfaces',
    methods: [
      'interpolatePoints', 'approximateCurve', 'approximateCurveLspia',
      'curveKnotInsert', 'curveKnotRemove', 'curveSplit', 'curveDegreeElevate',
      'interpolateSurface', 'approximateSurfaceLspia',
    ],
  },
  {
    label: 'Sketch',
    methods: [
      'sketchNew', 'sketchAddPoint', 'sketchAddArc', 'sketchAddConstraint',
      'sketchSolve', 'sketchDof',
    ],
  },
  {
    label: '2D polygon ops',
    methods: [
      'offsetPolygon2d', 'chamfer2d', 'fillet2d', 'polygonsIntersect2d',
      'intersectPolygons2d', 'commonSegment2d', 'pointInPolygon2d',
    ],
  },
  {
    label: 'Batch & checkpoint',
    methods: [
      'executeBatch', 'checkpoint', 'checkpointCount', 'restore',
      'discardCheckpoint',
    ],
  },
  {
    label: 'Assembly',
    methods: ['assemblyNew', 'assemblyAddRoot', 'assemblyAddChild', 'assemblyFlatten', 'assemblyBom'],
  },
  {
    label: 'BREP serialization',
    methods: ['toBREP', 'fromBREP'],
  },
];

// ── Generate output ────────────────────────────────────────────

function formatMethodSignature(
  method: ParsedMethod,
  isWired: boolean
): string {
  const tag = isWired ? '' : '  /** @unwired */\n';
  const params = convertParams(method.params);
  const ret = mapReturnType(method.returnType, method.name);
  return `${tag}  ${method.name}(${params}): ${ret};`;
}

function generate(): void {
  const src = readFileSync(UPSTREAM_DTS, 'utf-8');
  const { methods, upstreamVersion } = parseUpstreamDts(src);
  const { wired, featureGuarded } = findWiredMethods();

  // Build a lookup by method name
  const methodMap = new Map<string, ParsedMethod>();
  for (const m of methods) {
    methodMap.set(m.name, m);
  }

  // Identify feature-guarded methods that don't exist upstream — these need optional stubs
  const missingGuarded = new Set<string>();
  for (const name of featureGuarded) {
    if (!methodMap.has(name)) {
      missingGuarded.add(name);
    }
  }

  // Track which methods we've emitted (to catch any we missed in sections)
  const emitted = new Set<string>();

  const lines: string[] = [];

  // Module header
  lines.push(`/**`);
  lines.push(` * Type-safe interface for the brepkit WASM kernel (\`BrepKernel\`).`);
  lines.push(` *`);
  lines.push(` * AUTO-GENERATED by \`npm run sync:brepkit-types\`.`);
  lines.push(` * Synced against \`brepkit-wasm@${upstreamVersion}\`.`);
  lines.push(` *`);
  lines.push(` * Methods not yet referenced in the adapter layer are tagged \`@unwired\`.`);
  lines.push(` *`);
  lines.push(` * @module`);
  lines.push(` */`);
  lines.push('');

  // Mesh result interfaces (keep backward-compatible names)
  lines.push('// ── Mesh result from tessellation ────────────────────────────────');
  lines.push('');
  lines.push('/** Triangle mesh returned by `tessellateFace` / `tessellateSolid`. */');
  lines.push('export interface BrepkitMesh {');
  lines.push('  /** Flattened vertex positions `[x, y, z, ...]`. */');
  lines.push('  readonly positions: Float64Array;');
  lines.push('  /** Flattened per-vertex normals `[nx, ny, nz, ...]`. */');
  lines.push('  readonly normals: Float64Array;');
  lines.push('  /** Triangle indices (groups of 3). */');
  lines.push('  readonly indices: Uint32Array;');
  lines.push('  /** Number of vertices. */');
  lines.push('  readonly vertexCount: number;');
  lines.push('  /** Number of triangles. */');
  lines.push('  readonly triangleCount: number;');
  lines.push('  /** All mesh data in a single packed buffer for efficient FFI transfer. */');
  lines.push('  packedBuffer(): Uint8Array;');
  lines.push('}');
  lines.push('');
  lines.push('/** Edge polylines returned by `meshEdges`. */');
  lines.push('export interface BrepkitEdgeLines {');
  lines.push('  /** Flattened vertex positions `[x, y, z, ...]`. */');
  lines.push('  readonly positions: Float64Array;');
  lines.push('  /** Start index into positions for each edge polyline (already ×3). */');
  lines.push('  readonly offsets: Uint32Array;');
  lines.push('  /** Number of edges. */');
  lines.push('  readonly edgeCount: number;');
  lines.push('}');
  lines.push('');

  // Main kernel interface
  lines.push('// ── Main kernel interface ────────────────────────────────────────');
  lines.push('');
  lines.push('/**');
  lines.push(' * Type-safe view of brepkit\'s WASM `BrepKernel` class.');
  lines.push(' *');
  lines.push(' * All handle parameters and return values are `number` (u32 arena indices).');
  lines.push(' * Coordinate arrays are flat `number[]` (`[x,y,z, ...]`).');
  lines.push(' * Matrices are 16-element row-major `number[]`.');
  lines.push(' */');
  lines.push('export interface BrepkitKernel {');

  // Emit sections
  for (const section of METHOD_SECTIONS) {
    const sectionMethods = section.methods
      .map((name) => methodMap.get(name))
      .filter((m): m is ParsedMethod => m !== undefined);

    if (sectionMethods.length === 0) continue;

    lines.push(`  // ── ${section.label} ${'─'.repeat(Math.max(0, 58 - section.label.length))}`);
    lines.push('');

    for (const method of sectionMethods) {
      lines.push(formatMethodSignature(method, wired.has(method.name)));
      lines.push('');
      emitted.add(method.name);
    }
  }

  // Emit any methods not captured in sections
  const uncategorized = methods.filter((m) => !emitted.has(m.name) && m.name !== 'free');
  if (uncategorized.length > 0) {
    lines.push('  // ── Uncategorized ──────────────────────────────────────────────');
    lines.push('');
    for (const method of uncategorized) {
      lines.push(formatMethodSignature(method, wired.has(method.name)));
      lines.push('');
    }
  }

  // Emit optional stubs for feature-guarded methods missing from upstream.
  // These are methods the adapter references behind typeof/in guards but that
  // the current WASM doesn't export. They need proper type signatures to avoid
  // type errors at call sites.
  const FUTURE_STUBS: Record<string, string> = {
    compoundFuse: 'compoundFuse?(solidIds: Uint32Array | number[]): number;',
    chamferAsymmetric:
      'chamferAsymmetric?(solid: number, edgeHandles: Uint32Array | number[], d1: number, d2: number): number;',
    copyFace: 'copyFace?(face: number): number;',
    copyEdge: 'copyEdge?(edge: number): number;',
    transformFace: 'transformFace?(face: number, matrix: Float64Array | number[]): void;',
    transformEdge: 'transformEdge?(edge: number, matrix: Float64Array | number[]): void;',
    validateSolidDetails: 'validateSolidDetails?(solid: number): string;',
  };

  const futureToEmit = [...missingGuarded]
    .sort()
    .filter((name) => FUTURE_STUBS[name]);
  if (futureToEmit.length > 0) {
    lines.push('  // ── Feature-guarded stubs (not in current WASM) ─────────────────');
    lines.push('');
    for (const name of futureToEmit) {
      lines.push(`  /** @future Not in brepkit-wasm ${upstreamVersion}. Referenced with feature detection in adapter. */`);
      lines.push(`  ${FUTURE_STUBS[name]}`);
      lines.push('');
    }
  }

  // Warn about any feature-guarded methods not in FUTURE_STUBS
  const unhandled = [...missingGuarded].filter((n) => !FUTURE_STUBS[n]);
  if (unhandled.length > 0) {
    console.warn(
      `⚠ Feature-guarded methods missing from FUTURE_STUBS: ${unhandled.join(', ')}\n` +
      '  Add typed signatures to FUTURE_STUBS in sync-brepkit-types.ts'
    );
  }

  // Destructor
  lines.push('  // ── wasm-bindgen destructor ────────────────────────────────────');
  lines.push('');
  lines.push('  /** Release the entire arena. */');
  lines.push('  free(): void;');
  lines.push('}');
  lines.push('');

  writeFileSync(OUTPUT_FILE, lines.join('\n'));

  const wiredCount = methods.filter((m) => wired.has(m.name)).length;
  const totalCount = methods.length;
  console.log(
    `✓ Generated ${OUTPUT_FILE}\n` +
    `  ${totalCount} methods from brepkit-wasm@${upstreamVersion}\n` +
    `  ${wiredCount} wired, ${totalCount - wiredCount} @unwired`
  );
}

generate();
