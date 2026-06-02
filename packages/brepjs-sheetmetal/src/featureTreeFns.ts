import { type Result, ok, err, validationError } from 'brepjs';
import type { BendFeature, FlangeFeature, SheetMetalPart, SheetMetalWarning } from './types.js';

export const ROOT_FLAT_ID = 'root';

/** A flat region in the feature graph (the part's base plus every flange face). */
export interface FlatNode {
  id: string;
  isRoot: boolean;
  flange?: FlangeFeature | undefined;
}

/** A bend connecting two flats. `parent`/`child` are flat ids; `bend` is the recorded feature. */
export interface BendEdge {
  bend: BendFeature;
  parent: string;
  child: string;
}

/** Graph view of an authored part: flats = nodes, bends = edges. */
export interface FeatureGraph {
  nodes: Map<string, FlatNode>;
  edges: BendEdge[];
}

/** A bend that survives in the spanning tree, paired with its source/target flat. */
export interface TreeBend {
  bend: BendFeature;
  parent: string;
  child: string;
}

/** A non-tree edge that must be cut to flatten a closed profile. */
export interface SeamCut {
  bend: BendFeature;
  between: [string, string];
}

export interface FeatureTree {
  rootId: string;
  /** Tree edges in breadth-first order (parents precede their children). */
  bends: TreeBend[];
  seams: SeamCut[];
  nodes: Map<string, FlatNode>;
  warnings: SheetMetalWarning[];
}

/**
 * Build the feature graph for an authored part. Each flange contributes a flat
 * node `flange.id`; bends connect a parent flat to a child flat. A bend whose id
 * matches a flange id (the flange's own fold) is wired parent→flange; any other
 * bend is matched to a flange by id suffix `<flange>::<n>` or defaults to a
 * root-anchored edge so authored parts always produce a connected graph.
 */
export function buildFeatureGraph(part: SheetMetalPart): Result<FeatureGraph> {
  if (!Number.isFinite(part.thickness) || part.thickness <= 0) {
    return err(validationError('INVALID_THICKNESS', `part.thickness must be positive, got ${part.thickness}`));
  }

  const nodes = new Map<string, FlatNode>();
  nodes.set(ROOT_FLAT_ID, { id: ROOT_FLAT_ID, isRoot: true });

  const flangeById = new Map<string, FlangeFeature>();
  for (const flange of part.flanges) {
    if (nodes.has(flange.id)) {
      return err(validationError('DUPLICATE_FLAT', `duplicate flange/flat id '${flange.id}'`));
    }
    nodes.set(flange.id, { id: flange.id, isRoot: false, flange });
    flangeById.set(flange.id, flange);
  }

  const edges: BendEdge[] = [];
  const seenBendIds = new Set<string>();
  for (const bend of part.bends) {
    if (seenBendIds.has(bend.id)) {
      return err(validationError('DUPLICATE_BEND', `duplicate bend id '${bend.id}'`));
    }
    seenBendIds.add(bend.id);

    const child = resolveChildFlat(bend.id, nodes);
    if (child === undefined) {
      return err(
        validationError('UNRESOLVED_BEND', `bend '${bend.id}' does not correspond to any flange flat`)
      );
    }
    const flange = flangeById.get(child);
    const parent = resolveParentFlat(flange, nodes);
    edges.push({ bend, parent, child });
  }

  return ok({ nodes, edges });
}

function resolveChildFlat(bendId: string, nodes: Map<string, FlatNode>): string | undefined {
  if (nodes.has(bendId)) return bendId;
  const sep = bendId.indexOf('::');
  if (sep > 0) {
    const base = bendId.slice(0, sep);
    if (nodes.has(base)) return base;
  }
  return undefined;
}

function resolveParentFlat(flange: FlangeFeature | undefined, nodes: Map<string, FlatNode>): string {
  if (flange === undefined) return ROOT_FLAT_ID;
  const ref = flange.baseEdge;
  return nodes.has(`face-${ref.faceIndex}`) ? `face-${ref.faceIndex}` : ROOT_FLAT_ID;
}

/**
 * Spanning tree over the feature graph, rooted at the base flat. Tree edges are
 * returned BFS-ordered (every parent appears before its children); edges that
 * would close a cycle (box/closed profiles) become seam cuts with a warning.
 */
export function buildFeatureTree(graph: FeatureGraph, rootId: string = ROOT_FLAT_ID): Result<FeatureTree> {
  if (!graph.nodes.has(rootId)) {
    return err(validationError('UNKNOWN_ROOT', `root flat '${rootId}' not present in graph`));
  }

  const adjacency = new Map<string, BendEdge[]>();
  for (const id of graph.nodes.keys()) adjacency.set(id, []);
  for (const edge of graph.edges) {
    adjacency.get(edge.parent)?.push(edge);
    adjacency.get(edge.child)?.push(edge);
  }

  const visited = new Set<string>([rootId]);
  const treeEdges = new Set<BendEdge>();
  const bends: TreeBend[] = [];
  const queue: string[] = [rootId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const edge of adjacency.get(current) ?? []) {
      if (treeEdges.has(edge)) continue;
      const next = edge.parent === current ? edge.child : edge.parent;
      if (visited.has(next)) continue;
      visited.add(next);
      treeEdges.add(edge);
      bends.push({ bend: edge.bend, parent: current, child: next });
      queue.push(next);
    }
  }

  const warnings: SheetMetalWarning[] = [];
  const seams: SeamCut[] = [];
  for (const edge of graph.edges) {
    if (treeEdges.has(edge)) continue;
    seams.push({ bend: edge.bend, between: [edge.parent, edge.child] });
    warnings.push({
      code: 'SEAM_CUT',
      message: `closed profile: bend '${edge.bend.id}' (${edge.parent}↔${edge.child}) becomes a seam cut`,
      featureId: edge.bend.id,
    });
  }

  for (const node of graph.nodes.values()) {
    if (!visited.has(node.id)) {
      return err(
        validationError('DISCONNECTED_FLAT', `flat '${node.id}' is not reachable from root '${rootId}'`)
      );
    }
  }

  return ok({ rootId, bends, seams, nodes: graph.nodes, warnings });
}

/** Convenience: graph + spanning tree in one call. */
export function featureTree(part: SheetMetalPart, rootId: string = ROOT_FLAT_ID): Result<FeatureTree> {
  const graph = buildFeatureGraph(part);
  if (!graph.ok) return graph;
  return buildFeatureTree(graph.value, rootId);
}
