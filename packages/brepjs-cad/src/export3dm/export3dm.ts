import { writeFileSync } from 'node:fs';
import rhino3dm from 'rhino3dm';
import type { PreviewTreeNode } from 'brepjs-viewer';
import { evaluateElements } from '../preview/evaluate.js';

// Distinct-but-stable layer colors: index into a small palette, wrapping.
const LAYER_COLORS: readonly { r: number; g: number; b: number; a: number }[] = [
  { r: 204, g: 92, b: 74, a: 255 },
  { r: 74, g: 144, b: 204, a: 255 },
  { r: 96, g: 178, b: 110, a: 255 },
  { r: 224, g: 172, b: 70, a: 255 },
  { r: 158, g: 108, b: 196, a: 255 },
  { r: 92, g: 184, b: 186, a: 255 },
];

export interface Export3dmResult {
  readonly elements: number;
  readonly failed: readonly string[];
}

interface ElementIdentity {
  readonly archetype?: string | undefined;
  readonly type: string;
}

function identityByKeyPath(tree: PreviewTreeNode): Map<string, ElementIdentity> {
  const map = new Map<string, ElementIdentity>();
  const walk = (node: PreviewTreeNode): void => {
    map.set(node.keyPath, { archetype: node.archetype, type: node.type });
    for (const child of node.children) walk(child);
  };
  walk(tree);
  return map;
}

/** Layer name: the element's archetype when declared, else the key path's first
 *  segment (the containing family/group), else the element type. */
function layerNameFor(keyPath: string, identity: ElementIdentity | undefined): string {
  if (identity?.archetype !== undefined) return identity.archetype;
  const prefix = keyPath.split('/')[0];
  if (prefix !== undefined && prefix !== keyPath) return prefix;
  return identity?.type ?? 'default';
}

/**
 * Export the evaluated model as a Rhino .3dm: one named mesh object per element
 * (ObjectAttributes.name = key path), layered by archetype/key-path prefix. The
 * loaded-module contract is preview's: element tree, resolved tree, or plain shape.
 */
export async function export3dm(entryPath: string, outPath: string): Promise<Export3dmResult> {
  const { nodes, tree } = await evaluateElements(entryPath);
  const rh = await rhino3dm();
  const doc = new rh.File3dm();
  const layerIndexByName = new Map<string, number>();
  const identities = identityByKeyPath(tree);
  const failed: string[] = [];
  let elements = 0;
  for (const [keyPath, node] of nodes) {
    if (!node.mesh.ok) {
      failed.push(keyPath);
      continue;
    }
    const layerName = layerNameFor(keyPath, identities.get(keyPath));
    let layerIndex = layerIndexByName.get(layerName);
    if (layerIndex === undefined) {
      const color = LAYER_COLORS[layerIndexByName.size % LAYER_COLORS.length];
      layerIndex = doc.layers().addLayer(layerName, color ?? { r: 128, g: 128, b: 128, a: 255 });
      layerIndexByName.set(layerName, layerIndex);
    }
    const m = node.mesh.value;
    const mesh = new rh.Mesh();
    const vertices = mesh.vertices();
    for (let i = 0; i + 2 < m.vertices.length; i += 3) {
      vertices.add(m.vertices[i] ?? 0, m.vertices[i + 1] ?? 0, m.vertices[i + 2] ?? 0);
    }
    const normals = mesh.normals();
    for (let i = 0; i + 2 < m.normals.length; i += 3) {
      normals.add(m.normals[i] ?? 0, m.normals[i + 1] ?? 0, m.normals[i + 2] ?? 0);
    }
    const faces = mesh.faces();
    for (let i = 0; i + 2 < m.triangles.length; i += 3) {
      faces.addTriFace(m.triangles[i] ?? 0, m.triangles[i + 1] ?? 0, m.triangles[i + 2] ?? 0);
    }
    const attrs = new rh.ObjectAttributes();
    attrs.name = keyPath;
    attrs.layerIndex = layerIndex;
    // addMesh(mesh) has no attributes overload — the generic add carries them.
    doc.objects().add(mesh, attrs);
    elements += 1;
  }
  writeFileSync(outPath, doc.toByteArray());
  return { elements, failed };
}
