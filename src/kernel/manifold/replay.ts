/**
 * Replay engine — reconstruct the exact B-rep for a manifold op-graph.
 *
 * The manifold kernel previews on a triangle mesh while recording an op-node
 * per operation capturing exact intent (radii, axes, selection predicates).
 * `replay` walks that graph post-order and re-issues each op against a real
 * B-rep kernel (normally `getKernel('occt')`), mapping recorded params to the
 * exact adapter method. The result is a true B-rep — the real fillet, the real
 * revolve — not the mesh approximation.
 *
 * Profile/face geometry for sweeps is not B-rep on the manifold side; it travels
 * in the consuming node's params as an outline plus a world frame, so the face
 * is rebuilt on the target kernel from that outline rather than by recursing
 * into the (non-replayable) profile handle.
 *
 * Non-replayable nodes (raw-mesh imports, mesh booleans, triangle sewing) have
 * no exact B-rep counterpart; replaying one throws.
 * @module
 */

import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import type { KernelShape, KernelType } from '@/kernel/types.js';
import type { OpNode } from './opGraph.js';

type Vec2 = readonly [number, number];
type Vec3 = readonly [number, number, number];
type MutVec3 = [number, number, number];
type Mat9 = [number, number, number, number, number, number, number, number, number];

interface Selection {
  readonly kind: 'all' | 'index' | 'box' | 'witness';
  readonly count: number;
  readonly indices?: readonly number[];
  readonly points?: ReadonlyArray<Vec3>;
  readonly regions?: ReadonlyArray<{
    readonly min: Vec3;
    readonly max: Vec3;
  }>;
}

function asVec3(value: unknown, fallback: MutVec3 = [0, 0, 0]): MutVec3 {
  if (Array.isArray(value) && value.length >= 3) {
    return [Number(value[0]), Number(value[1]), Number(value[2])];
  }
  return [...fallback];
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function add3(a: Vec3, b: Vec3): MutVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale3(a: Vec3, s: number): MutVec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

/** World point for an outline coordinate placed on the section frame. */
function worldPoint(p: Vec2, origin: Vec3, xAxis: Vec3, yAxis: Vec3): MutVec3 {
  return add3(origin, add3(scale3(xAxis, p[0]), scale3(yAxis, p[1])));
}

/**
 * Build a planar B-rep face on the target kernel from a recorded outline and
 * frame. The outline is closed (no repeated last point); we connect successive
 * world points with line edges and close the loop.
 */
function faceFromOutline(
  target: KernelAdapter,
  params: Readonly<Record<string, unknown>>
): KernelShape {
  const outline = (params['outline'] as Vec2[] | undefined) ?? [];
  if (outline.length < 3) {
    throw new Error('manifold replay: profile outline needs at least three points');
  }
  const origin = asVec3(params['origin']);
  const xAxis = asVec3(params['xAxis'], [1, 0, 0]);
  const yAxis = asVec3(params['yAxis'], [0, 1, 0]);
  const points = outline.map((p) => worldPoint(p, origin, xAxis, yAxis));

  const edges: KernelShape[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i] ?? origin;
    const b = points[(i + 1) % points.length] ?? origin;
    edges.push(target.makeLineEdge([a[0], a[1], a[2]], [b[0], b[1], b[2]]));
  }
  const wire = target.makeWire(edges);
  const face = target.makeFace(wire, true);
  for (const edge of edges) target.dispose(edge);
  return face;
}

/** Build a section face from a serialized CrossSection record. */
function faceFromSection(
  target: KernelAdapter,
  section: Readonly<Record<string, unknown>>
): KernelShape {
  return faceFromOutline(target, section);
}

function subCenter(target: KernelAdapter, sub: KernelShape): Vec3 {
  const box = target.boundingBox(sub);
  return [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
}

function dist2(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

function resolveSelection(
  target: KernelAdapter,
  shape: KernelShape,
  selection: Selection | undefined,
  kind: 'edge' | 'face'
): KernelShape[] {
  const subs: KernelShape[] = target.iterShapes(shape, kind);
  if (!selection || selection.kind === 'all') return subs;

  // Geometric selection: for each recorded witness point, pick the sub-shape
  // whose bounding-box center is nearest. This re-identifies the right OCCT
  // sub-shape regardless of iteration order, which positional indices cannot.
  if (selection.kind === 'witness') {
    const points = selection.points ?? [];
    const centers = subs.map((sub) => subCenter(target, sub));
    const picked: KernelShape[] = [];
    const used = new Set<number>();
    for (const point of points) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < subs.length; i++) {
        if (used.has(i)) continue;
        const d = dist2(point, centers[i] ?? [0, 0, 0]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      const sub = subs[best];
      if (best >= 0 && sub !== undefined) {
        used.add(best);
        picked.push(sub);
      }
    }
    return picked;
  }

  if (selection.kind === 'index') {
    const indices = selection.indices ?? [];
    const picked: KernelShape[] = [];
    for (const i of indices) {
      const sub = subs[i];
      if (sub !== undefined) picked.push(sub);
    }
    return picked;
  }

  // box: pick sub-shapes whose bounding-box center lies inside any region.
  const regions = selection.regions ?? [];
  const inside = (c: Vec3): boolean =>
    regions.some(
      (r) =>
        c[0] >= r.min[0] &&
        c[0] <= r.max[0] &&
        c[1] >= r.min[1] &&
        c[1] <= r.max[1] &&
        c[2] >= r.min[2] &&
        c[2] <= r.max[2]
    );
  return subs.filter((sub: KernelShape) => inside(subCenter(target, sub)));
}

function selectionOf(params: Readonly<Record<string, unknown>>): Selection | undefined {
  const sel = params['selection'];
  return sel === undefined ? undefined : (sel as Selection);
}

type ReplayHandler = (
  target: KernelAdapter,
  params: Readonly<Record<string, unknown>>,
  inputs: readonly KernelShape[]
) => KernelShape;

function input0(inputs: readonly KernelShape[]): KernelShape {
  const first = inputs[0];
  if (first === undefined) {
    throw new Error('manifold replay: op requires an input shape');
  }
  return first;
}

function axisFor(target: KernelAdapter, origin: Vec3, direction: Vec3): KernelType {
  return target.createAxis1(
    origin[0],
    origin[1],
    origin[2],
    direction[0],
    direction[1],
    direction[2]
  );
}

function revolveHandler(originKey: string, dirKey: string): ReplayHandler {
  return (target, params) => {
    const face = faceFromOutline(target, params);
    const origin = asVec3(params[originKey]);
    const direction = asVec3(params[dirKey], [0, 0, 1]);
    const angleDeg = num(params['angleDeg'], 360);
    return target.revolve(face, axisFor(target, origin, direction), angleDeg * (Math.PI / 180));
  };
}

const HANDLERS: Readonly<Record<string, ReplayHandler>> = {
  // --- Primitives ---
  makeBox: (t, p) => t.makeBox(num(p['width']), num(p['height']), num(p['depth'])),
  makeBoxWithCorners: (t, p) => t.makeBoxFromCorners(asVec3(p['p1']), asVec3(p['p2'])),
  makeCylinder: (t, p) =>
    t.makeCylinder(
      num(p['radius']),
      num(p['height']),
      asVec3(p['center']),
      asVec3(p['direction'], [0, 0, 1])
    ),
  makeSphere: (t, p) => t.makeSphere(num(p['radius']), asVec3(p['center'])),
  makeCone: (t, p) =>
    t.makeCone(
      num(p['radius1']),
      num(p['radius2']),
      num(p['height']),
      asVec3(p['center']),
      asVec3(p['direction'], [0, 0, 1])
    ),
  makeTorus: (t, p) =>
    t.makeTorus(
      num(p['majorRadius']),
      num(p['minorRadius']),
      asVec3(p['center']),
      asVec3(p['direction'], [0, 0, 1])
    ),
  makeEllipsoid: (t, p) => t.makeEllipsoid(num(p['aLength']), num(p['bLength']), num(p['cLength'])),

  // --- Booleans ---
  makeFuse: (t, _p, inputs) => {
    if (inputs.length < 2) return input0(inputs);
    // Pairwise fuse mirrors the manifold-side intent (sequential add) and, unlike
    // the batch fuseAll path, reliably removes coincident shared faces between
    // face-overlapping operands so the replayed B-rep matches a direct fuse.
    let acc = input0(inputs);
    for (const tool of inputs.slice(1)) acc = t.fuse(acc, tool);
    return acc;
  },
  makeCut: (t, _p, inputs) => {
    const base = input0(inputs);
    return t.cutAll(base, inputs.slice(1));
  },
  makeCommon: (t, _p, inputs) => {
    let acc = input0(inputs);
    for (const tool of inputs.slice(1)) acc = t.intersect(acc, tool);
    return acc;
  },

  // --- Transforms ---
  translateShape: (t, p, inputs) =>
    t.translate(input0(inputs), num(p['x']), num(p['y']), num(p['z'])),
  rotateShape: (t, p, inputs) =>
    t.rotate(input0(inputs), num(p['angle']), asVec3(p['axis'], [0, 0, 1]), asVec3(p['center'])),
  scaleShape: (t, p, inputs) => t.scale(input0(inputs), asVec3(p['center']), num(p['factor'], 1)),
  mirrorShape: (t, p, inputs) =>
    t.mirror(input0(inputs), asVec3(p['origin']), asVec3(p['normal'], [1, 0, 0])),
  transformShape: (t, p, inputs) => t.transform(input0(inputs), p['matrix'] as KernelType),
  generalTransform: (t, p, inputs) =>
    t.generalTransform(
      input0(inputs),
      p['linear'] as Mat9,
      asVec3(p['translation']),
      Boolean(p['isOrthogonal'])
    ),
  generalTransformNonOrthogonal: (t, p, inputs) =>
    t.generalTransformNonOrthogonal(input0(inputs), p['linear'] as Mat9, asVec3(p['translation'])),
  gridPattern: (t, p, inputs) => {
    if (typeof t.gridPattern !== 'function') {
      throw new Error('manifold replay: target kernel lacks gridPattern');
    }
    return t.gridPattern(
      input0(inputs),
      asVec3(p['directionX']),
      asVec3(p['directionY']),
      num(p['spacingX']),
      num(p['spacingY']),
      num(p['countX'], 1),
      num(p['countY'], 1)
    );
  },

  // --- Sweeps ---
  extrude: (t, p) => {
    const face = faceFromOutline(t, p);
    return t.extrude(face, asVec3(p['direction'], [0, 0, 1]), num(p['length'], 1));
  },
  revolve: revolveHandler('axisOrigin', 'axisDirection'),
  revolveVec: revolveHandler('center', 'direction'),
  loft: (t, p) => {
    const sections = (p['sections'] as Array<Record<string, unknown>> | undefined) ?? [];
    const wires = sections.map((s) => sectionWire(t, s));
    return t.loft(wires, Boolean(p['ruled']));
  },
  loftAdvanced: (t, p) => {
    const sections = (p['sections'] as Array<Record<string, unknown>> | undefined) ?? [];
    const wires = sections.map((s) => sectionWire(t, s));
    const options: { solid?: boolean; ruled?: boolean; tolerance?: number } = {
      solid: p['solid'] !== false,
      ruled: Boolean(p['ruled']),
    };
    if (typeof p['tolerance'] === 'number') options.tolerance = p['tolerance'];
    return t.loftAdvanced(wires, options);
  },
  sweep: (t, p) => t.sweep(sweepFace(t, p), spineWire(t, p)),
  simplePipe: (t, p) => t.simplePipe(sweepFace(t, p), spineWire(t, p)),
  sweepWithOptions: (t, p) =>
    t.sweepWithOptions(
      sweepFace(t, p),
      spineWire(t, p),
      str(p['contactMode']),
      (p['scaleValues'] as number[] | undefined) ?? [],
      num(p['segments'], 0)
    ),
  sweepPipeShell: (t, p) => {
    const result = t.sweepPipeShell(sweepFace(t, p), spineWire(t, p));
    return isShellResult(result) ? result.shape : result;
  },
  helicalSweep: (t, p) =>
    t.helicalSweep(
      sweepFace(t, p),
      asVec3(p['axisOrigin']),
      asVec3(p['axisDirection'], [0, 0, 1]),
      num(p['radius']),
      num(p['pitch']),
      num(p['turns'], 1)
    ),
  draftPrism: (t, p) => {
    // OCCT's draftPrism derives geometry from the profile face; it ignores the
    // base/endFace and fuse args (the fuse case is replayed by the wrapping
    // makeFuse node), so we forward the recorded fuse purely for contract parity.
    const face = faceFromOutline(t, p);
    return t.draftPrism(face, face, face, num(p['height']), num(p['angleDeg']), Boolean(p['fuse']));
  },

  // --- Modifiers ---
  fillet: (t, p, inputs) => {
    const shape = input0(inputs);
    const edges = resolveSelection(t, shape, selectionOf(p), 'edge');
    const radii = p['radii'] as Array<number | [number, number]> | undefined;
    const scalar = p['radius'] as number | [number, number] | undefined;
    if (radii && radii.length > 1) {
      // resolveSelection returns edges in recorded order, so radii[i] aligns
      // with edges[i]; a per-edge callback preserves the distinct radii.
      const byEdge = new Map<KernelShape, number | [number, number]>();
      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        const r = radii[i] ?? radii[radii.length - 1];
        if (edge !== undefined && r !== undefined) byEdge.set(edge, r);
      }
      return t.fillet(shape, edges, (edge) => byEdge.get(edge) ?? 0);
    }
    const radius = radii?.[0] ?? scalar;
    return t.fillet(shape, edges, radius ?? 0);
  },
  chamfer: (t, p, inputs) => {
    const shape = input0(inputs);
    const edges = resolveSelection(t, shape, selectionOf(p), 'edge');
    return t.chamfer(shape, edges, p['radius'] as number | [number, number]);
  },
  chamferDistAngle: (t, p, inputs) => {
    const shape = input0(inputs);
    const edges = resolveSelection(t, shape, selectionOf(p), 'edge');
    return t.chamferDistAngle(shape, edges, num(p['distance']), num(p['angleDeg']));
  },
  shell: (t, p, inputs) => {
    const shape = input0(inputs);
    const faces = resolveSelection(t, shape, selectionOf(p), 'face');
    return typeof p['tolerance'] === 'number'
      ? t.shell(shape, faces, num(p['thickness']), p['tolerance'])
      : t.shell(shape, faces, num(p['thickness']));
  },
  thicken: (t, p, inputs) => t.thicken(input0(inputs), num(p['thickness'])),
  offset: (t, p, inputs) =>
    typeof p['tolerance'] === 'number'
      ? t.offset(input0(inputs), num(p['distance']), p['tolerance'])
      : t.offset(input0(inputs), num(p['distance'])),
  filletVariable: (t, p, inputs) => t.filletVariable(input0(inputs), str(p['spec'])),
  draft: (t, p, inputs) => {
    const shape = input0(inputs);
    const faces = resolveSelection(t, shape, selectionOf(p), 'face');
    return t.draft(
      shape,
      faces,
      asVec3(p['pullDirection'], [0, 0, 1]),
      asVec3(p['neutralPlane']),
      num(p['angleDeg'])
    );
  },
  defeature: (t, p, inputs) => {
    const shape = input0(inputs);
    const faces = resolveSelection(t, shape, selectionOf(p), 'face');
    return t.defeature(shape, faces);
  },
  simplify: (t, _p, inputs) => t.simplify(input0(inputs)),
  reverseShape: (t, _p, inputs) => t.reverseShape(input0(inputs)),

  // --- Builders ---
  hull: (t, p, inputs) => t.hull([...inputs], num(p['tolerance'])),
  hullFromPoints: (t, p) => {
    const coords = (p['points'] as Vec3[] | undefined) ?? [];
    return t.hullFromPoints(
      coords.map((c) => ({ x: c[0], y: c[1], z: c[2] })),
      num(p['tolerance'])
    );
  },
  sewAndSolidify: (t, p, inputs) => t.sewAndSolidify([...inputs], num(p['tolerance'])),
};

function sectionWire(
  target: KernelAdapter,
  section: Readonly<Record<string, unknown>>
): KernelShape {
  // Lofts consume wires, not faces.
  const face = faceFromSection(target, section);
  const wires: KernelShape[] = target.iterShapes(face, 'wire');
  const first = wires[0];
  return first ?? face;
}

function sweepFace(target: KernelAdapter, params: Readonly<Record<string, unknown>>): KernelShape {
  const section = params['section'] as Record<string, unknown> | undefined;
  if (section) return faceFromSection(target, section);
  return faceFromOutline(target, params);
}

function spineWire(target: KernelAdapter, params: Readonly<Record<string, unknown>>): KernelShape {
  const path = (params['path'] as Vec3[] | undefined) ?? [];
  if (path.length < 2) {
    throw new Error('manifold replay: sweep spine needs at least two path points');
  }
  const edges: KernelShape[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i] ?? [0, 0, 0];
    const b = path[i + 1] ?? [0, 0, 0];
    edges.push(target.makeLineEdge([a[0], a[1], a[2]], [b[0], b[1], b[2]]));
  }
  const wire = target.makeWire(edges);
  for (const edge of edges) target.dispose(edge);
  return wire;
}

function isShellResult(
  value: KernelShape | { shape: KernelShape; firstShape: KernelShape; lastShape: KernelShape }
): value is { shape: KernelShape; firstShape: KernelShape; lastShape: KernelShape } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'shape' in value &&
    'firstShape' in value &&
    'lastShape' in value
  );
}

function replayNode(
  node: OpNode,
  targetKernel: KernelAdapter,
  cache: Map<OpNode, KernelShape>,
  allocated: Set<KernelShape>
): KernelShape {
  const cached = cache.get(node);
  if (cached !== undefined) return cached;

  if (!node.replayable) {
    throw new Error(
      `manifold replay: op '${node.op}' is not replayable (raw-mesh origin or unsupported)`
    );
  }

  const handler = HANDLERS[node.op];
  if (!handler) {
    throw new Error(`manifold replay: no replay handler for op '${node.op}'`);
  }

  const inputs = node.inputs.map((child) => replayNode(child, targetKernel, cache, allocated));
  const result = handler(targetKernel, node.params, inputs);
  cache.set(node, result);
  allocated.add(result);
  return result;
}

/**
 * Replay an op-graph onto `targetKernel`, returning the exact B-rep shape.
 *
 * Memoized post-order: each node's inputs are replayed first (deduplicated via
 * the shared cache so a DAG with reused sub-graphs replays each node once), then
 * the node's own handler runs. Throws on any non-replayable node or unmapped op.
 *
 * Every node produces an intermediate OCCT WASM-heap shape, but only the root is
 * returned (and retained by the caller's `brepCache`). To avoid leaking the rest
 * for the lifetime of the session, the intermediates this call allocated are
 * disposed once the full recursion completes — they are only inputs to copying
 * ops (booleans/modifiers), so the root holds its own geometry. Shapes the caller
 * pre-seeded into `cache` are not in `allocated` and so are never disposed here.
 */
export function replay(
  node: OpNode,
  targetKernel: KernelAdapter,
  cache: Map<OpNode, KernelShape> = new Map()
): KernelShape {
  const allocated = new Set<KernelShape>();
  const root = replayNode(node, targetKernel, cache, allocated);
  for (const shape of allocated) {
    if (shape !== root) targetKernel.dispose(shape);
  }
  return root;
}
