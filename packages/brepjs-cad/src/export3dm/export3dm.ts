import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
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
// rhino3dm objects are Emscripten-bound wasm allocations; the typings do not declare
// the embind delete(), so release through a guarded probe. File3dm.objects().add copies
// into the document, which makes the staging objects safe to free immediately.
function release(obj: unknown): void {
  const d = (obj as { delete?: () => void }).delete;
  if (typeof d === 'function') d.call(obj);
}

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
  try {
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
      addElementMesh(rh, doc, node.mesh.value, keyPath, layerIndex);
      elements += 1;
    }
    const bytes = doc.toByteArray();
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, bytes);
    return { elements, failed };
  } finally {
    release(doc);
  }
}

type RhinoModule = Awaited<ReturnType<typeof rhino3dm>>;

function addElementMesh(
  rh: RhinoModule,
  doc: InstanceType<RhinoModule['File3dm']>,
  m: { vertices: Float32Array; normals: Float32Array; triangles: Uint32Array },
  keyPath: string,
  layerIndex: number
): void {
  const mesh = new rh.Mesh();
  const attrs = new rh.ObjectAttributes();
  let vertices: unknown;
  let normals: unknown;
  let faces: unknown;
  try {
    const v = mesh.vertices();
    vertices = v;
    for (let i = 0; i + 2 < m.vertices.length; i += 3) {
      v.add(m.vertices[i] ?? 0, m.vertices[i + 1] ?? 0, m.vertices[i + 2] ?? 0);
    }
    const n = mesh.normals();
    normals = n;
    for (let i = 0; i + 2 < m.normals.length; i += 3) {
      n.add(m.normals[i] ?? 0, m.normals[i + 1] ?? 0, m.normals[i + 2] ?? 0);
    }
    const f = mesh.faces();
    faces = f;
    for (let i = 0; i + 2 < m.triangles.length; i += 3) {
      f.addTriFace(m.triangles[i] ?? 0, m.triangles[i + 1] ?? 0, m.triangles[i + 2] ?? 0);
    }
    attrs.name = keyPath;
    attrs.layerIndex = layerIndex;
    // addMesh(mesh) has no attributes overload — the generic add carries them.
    doc.objects().add(mesh, attrs);
  } finally {
    // The doc copied what it needs; the staging wasm objects are freed on every
    // path, including a throw mid-construction.
    release(vertices);
    release(normals);
    release(faces);
    release(mesh);
    release(attrs);
  }
}
