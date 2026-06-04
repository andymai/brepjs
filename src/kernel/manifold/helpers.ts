// eslint-disable-next-line @typescript-eslint/no-explicit-any -- WASM module type gap
export type ManifoldModule = any;

export function notImplemented(method: string): never {
  throw new Error(`manifold: ${method} is not implemented`);
}

// Ops whose exact intent the replay engine can reconstruct on a B-rep kernel.
// Raw-mesh origins (importMesh/importGLB/importOBJ/importSTL), meshBoolean, and
// arbitrary triangle sewing are deliberately excluded — they have no exact
// B-rep counterpart, so any graph rooted in them stays non-replayable.
const REPLAYABLE_OPS = new Set<string>([
  // primitives
  'makeBox',
  'makeBoxWithCorners',
  'makeCylinder',
  'makeSphere',
  'makeCone',
  'makeTorus',
  'makeEllipsoid',
  // booleans
  'makeFuse',
  'makeCut',
  'makeCommon',
  // transforms
  'translateShape',
  'rotateShape',
  'scaleShape',
  'mirrorShape',
  'transformShape',
  'generalTransform',
  'generalTransformNonOrthogonal',
  'gridPattern',
  // sweeps
  'extrude',
  'revolve',
  'revolveVec',
  'loft',
  'loftAdvanced',
  'sweep',
  'simplePipe',
  'sweepWithOptions',
  'sweepPipeShell',
  'helicalSweep',
  'draftPrism',
  // modifiers
  'fillet',
  'chamfer',
  'chamferDistAngle',
  'shell',
  'thicken',
  'offset',
  'filletVariable',
  'draft',
  'defeature',
  'simplify',
  'reverseShape',
  // builders
  'hull',
  'hullFromPoints',
  'sewAndSolidify',
  // planar profile builders — rebuild real OCCT topology on replay so
  // iterShapes('face')/faceFinder work on extrude/loft results
  'profileEdge',
  'profileWire',
  'profileFace',
]);

export function opIsReplayable(op: string): boolean {
  return REPLAYABLE_OPS.has(op);
}
