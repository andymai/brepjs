/**
 * Binary framing for the preview model payload: a fixed prelude, a JSON header,
 * then the raw typed-array buffers back to back. Buffers stay out of JSON so
 * multi-megabyte meshes cross HTTP without base64 or per-float text.
 *
 * Layout (little-endian):
 *   [u32 magic 'BPRV'][u32 headerByteLength][header JSON utf8, padded to 4][buffers…]
 *
 * The header's `buffers` entries give each array's element length in payload
 * order: position, normal, index, edges.
 */
import type { FaceGroup, MeshData } from './types.js';
import type { ElementRange } from './model.js';

export const PREVIEW_PAYLOAD_MAGIC = 0x42505256;
export const PREVIEW_PAYLOAD_VERSION = 1;

export interface PreviewTreeNode {
  readonly keyPath: string;
  readonly type: string;
  readonly archetype?: string | undefined;
  readonly name?: string | undefined;
  readonly hasGeometry: boolean;
  readonly children: readonly PreviewTreeNode[];
}

export interface PreviewBounds {
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly zMin: number;
  readonly zMax: number;
}

export interface PreviewMeasurements {
  readonly bounds?: PreviewBounds | undefined;
  readonly elementCount: number;
  readonly failedCount: number;
  readonly triangleCount: number;
}

export interface PreviewModelPayload {
  readonly data: MeshData;
  readonly elements: readonly ElementRange[];
  readonly failed: readonly string[];
  readonly tree: PreviewTreeNode | null;
  readonly measurements: PreviewMeasurements;
}

interface PayloadHeader {
  version: number;
  elements: readonly ElementRange[];
  failed: readonly string[];
  tree: PreviewTreeNode | null;
  measurements: PreviewMeasurements;
  faceGroups?: readonly FaceGroup[] | undefined;
  buffers: { position: number; normal: number; index: number; edges: number };
}

const pad4 = (n: number): number => (n + 3) & ~3;

export function encodePreviewPayload(payload: PreviewModelPayload): ArrayBuffer {
  const { data } = payload;
  const header: PayloadHeader = {
    version: PREVIEW_PAYLOAD_VERSION,
    elements: payload.elements,
    failed: payload.failed,
    tree: payload.tree,
    measurements: payload.measurements,
    ...(data.faceGroups ? { faceGroups: data.faceGroups } : {}),
    buffers: {
      position: data.position.length,
      normal: data.normal.length,
      index: data.index.length,
      edges: data.edges.length,
    },
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const headerSpan = pad4(headerBytes.length);
  const bodyBytes =
    (data.position.length + data.normal.length + data.edges.length + data.index.length) * 4;
  const out = new ArrayBuffer(8 + headerSpan + bodyBytes);
  const view = new DataView(out);
  view.setUint32(0, PREVIEW_PAYLOAD_MAGIC, true);
  view.setUint32(4, headerBytes.length, true);
  new Uint8Array(out, 8, headerBytes.length).set(headerBytes);
  let offset = 8 + headerSpan;
  for (const arr of [data.position, data.normal, data.index, data.edges]) {
    new Uint8Array(out, offset, arr.byteLength).set(
      new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)
    );
    offset += arr.byteLength;
  }
  return out;
}

export function decodePreviewPayload(buffer: ArrayBuffer): PreviewModelPayload {
  const view = new DataView(buffer);
  if (buffer.byteLength < 8 || view.getUint32(0, true) !== PREVIEW_PAYLOAD_MAGIC) {
    throw new Error('not a preview payload (bad magic)');
  }
  const headerLength = view.getUint32(4, true);
  const header = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 8, headerLength))
  ) as PayloadHeader;
  if (header.version !== PREVIEW_PAYLOAD_VERSION) {
    throw new Error(`unsupported preview payload version ${header.version}`);
  }
  let offset = 8 + pad4(headerLength);
  const take = <T extends Float32Array | Uint32Array>(
    ctor: new (b: ArrayBuffer, o: number, l: number) => T,
    length: number
  ): T => {
    const arr = new ctor(buffer, offset, length);
    offset += length * 4;
    return arr;
  };
  const position = take(Float32Array, header.buffers.position);
  const normal = take(Float32Array, header.buffers.normal);
  const index = take(Uint32Array, header.buffers.index);
  const edges = take(Float32Array, header.buffers.edges);
  const data: MeshData = {
    position,
    normal,
    index,
    edges,
    ...(header.faceGroups ? { faceGroups: [...header.faceGroups] } : {}),
  };
  return {
    data,
    elements: header.elements,
    failed: header.failed,
    tree: header.tree,
    measurements: header.measurements,
  };
}
