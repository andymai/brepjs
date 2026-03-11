const KEYWORDS = new Set([
  'const',
  'let',
  'var',
  'return',
  'function',
  'new',
  'if',
  'else',
  'for',
  'while',
  'import',
  'from',
  'export',
  'await',
  'async',
]);

export const BREPJS_FNS = new Set([
  // Primitives
  'box',
  'cylinder',
  'sphere',
  'cone',
  'torus',
  'ellipsoid',
  'polygon',
  'polyhedron',
  // Curves
  'circle',
  'ellipse',
  'ellipseArc',
  'helix',
  'line',
  'bezier',
  'interpolateCurve',
  'tangentArc',
  'threePointArc',
  // Topology builders
  'wire',
  'face',
  'shell',
  'solid',
  'compound',
  'vertex',
  'createEdge',
  'filledFace',
  'closedWire',
  'orientedFace',
  // Operations
  'cut',
  'cutAll',
  'fuse',
  'fuseAll',
  'intersect',
  'fillet',
  'chamfer',
  'chamferDistAngle',
  'extrude',
  'twistExtrude',
  'complexExtrude',
  'revolve',
  'loft',
  'sweep',
  'genericSweep',
  'guidedSweep',
  'multiSectionSweep',
  'thicken',
  'offset',
  'offsetFace',
  'offsetWire2D',
  'section',
  'sectionToFace',
  'split',
  'slice',
  'mirror',
  'mirrorJoin',
  'scale',
  'translate',
  'rotate',
  'clone',
  'hull',
  'minkowski',
  'roof',
  'drill',
  'boss',
  'pocket',
  'fill',
  'subFace',
  'stretch2D',
  // Patterns
  'circularPattern',
  'linearPattern',
  'rectangularPattern',
  // Sketching
  'draw',
  'drawCircle',
  'drawEllipse',
  'drawPolysides',
  'drawRoundedRectangle',
  'drawText',
  'sketchExtrude',
  'sketchFace',
  'sketchLoft',
  'sketchRevolve',
  'sketchSweep',
  'sketchText',
  'sketchWires',
  'sketch2DOnFace',
  'sketch2DOnPlane',
  'compoundSketchExtrude',
  'compoundSketchFace',
  'compoundSketchLoft',
  'compoundSketchRevolve',
  'sketchRoundedRectangle',
  'sketchCircle',
  // Surfaces
  'surfaceFromGrid',
  'surfaceFromImage',
  // Healing & validation
  'heal',
  'autoHeal',
  'healSolid',
  'isValid',
  'isEmpty',
  'simplify',
  'describe',
  // Measurement
  'measureArea',
  'measureVolume',
  'measureLength',
  'measureDistance',
  // Finders
  'edgeFinder',
  'faceFinder',
  'wireFinder',
  'vertexFinder',
  'cornerFinder',
  // Transforms
  'applyMatrix',
  'transformCopy',
  'composeTransforms',
  'translate2D',
  'rotate2D',
  'scale2D',
  'mirror2D',
  // I/O
  'initFromOC',
  'exportSTEP',
  'exportSTL',
  'exportGltf',
  'exportGlb',
  'exportOBJ',
  'exportDXF',
  'exportIGES',
  'exportThreeMF',
  'importSTEP',
  'importSTL',
  'importOBJ',
  'importDXF',
  'importIGES',
  'importSVG',
  'importThreeMF',
  'toBREP',
  'fromBREP',
  // Mesh
  'mesh',
  'meshEdges',
  'toBufferGeometryData',
  'toLineGeometryData',
  // Text
  'loadFont',
  'textBlueprints',
  'fontMetrics',
  // Helpers
  'unwrap',
  'shape',
  'castShape',
  'getEdges',
  'getFaces',
  'getWires',
  'getVertices',
  'createPlane',
  'getBounds',
  'colorShape',
  'colorFaces',
  'tagFaces',
]);

export function lineHasBrepjsFn(line: string): boolean {
  for (const fn of BREPJS_FNS) {
    if (line.includes(fn)) return true;
  }
  return false;
}

export function highlightLine(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const tokens = line.split(/(\b\w+\b|\/\/.*$|'[^']*'|"[^"]*"|\d+\.?\d*|[[\](){}.,;=])/gm);
  let i = 0;
  for (const token of tokens) {
    if (!token) continue;
    const key = i++;
    if (token.startsWith('//')) {
      parts.push(
        <span key={key} className="text-gray-500">
          {token}
        </span>
      );
    } else if (KEYWORDS.has(token)) {
      parts.push(
        <span key={key} className="text-purple-400">
          {token}
        </span>
      );
    } else if (BREPJS_FNS.has(token)) {
      parts.push(
        <span key={key} className="text-teal-light">
          {token}
        </span>
      );
    } else if (/^\d/.test(token)) {
      parts.push(
        <span key={key} className="text-amber-400">
          {token}
        </span>
      );
    } else if (/^['"]/.test(token)) {
      parts.push(
        <span key={key} className="text-green-400">
          {token}
        </span>
      );
    } else {
      parts.push(<span key={key}>{token}</span>);
    }
  }
  return parts;
}
