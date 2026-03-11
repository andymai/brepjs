/**
 * Precompute mesh data for all gallery examples as compact binary .bin files.
 * Also writes the hero mesh (spiral-staircase) in binary format.
 *
 * Binary format per file:
 *   [4 bytes: positionCount (uint32)]
 *   [4 bytes: normalCount   (uint32)]
 *   [4 bytes: indexCount     (uint32)]
 *   [4 bytes: edgesCount     (uint32)]
 *   [positionCount * 4 bytes: Float32Array positions]
 *   [normalCount   * 4 bytes: Float32Array normals]
 *   [indexCount     * 4 bytes: Uint32Array  indices]
 *   [edgesCount     * 4 bytes: Float32Array edges]
 *
 * Run with: npx tsx scripts/precompute-gallery-meshes.ts
 */
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const galleryDir = resolve(__dirname, '../public/gallery-meshes');
mkdirSync(galleryDir, { recursive: true });

// ── Init OpenCascade ──────────────────────────────────────────────────
// Use the local monorepo WASM build (not npm package) to match brepjs v12.
const localOCPath = resolve(__dirname, '../../packages/brepjs-opencascade/src/brepjs_single.js');
const opencascade = (await import(localOCPath)).default;
const oc = await opencascade({
  locateFile: (f: string) => {
    if (f.endsWith('.wasm'))
      return resolve(__dirname, '../../packages/brepjs-opencascade/src/brepjs_single.wasm');
    return f;
  },
});

const brepjs = await import('brepjs');
brepjs.initFromOC(oc);

// ── Inject all brepjs exports onto globalThis so example code can use them ──
// The example .code strings reference brepjs functions as bare globals (e.g.
// box(), shape(), cylinder()).  This is safe: we only evaluate our own
// checked-in example source, never arbitrary user input.
for (const [key, value] of Object.entries(brepjs)) {
  (globalThis as Record<string, unknown>)[key] = value;
}

// ── Load examples ─────────────────────────────────────────────────────
const { examples } = await import('../src/lib/examples.js');

// ── Helpers ───────────────────────────────────────────────────────────
const { mesh, meshEdges, toBufferGeometryData, toLineGeometryData } = brepjs;

/** Pack mesh + edge data into a compact binary buffer. */
function packBinary(
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
  edges: Float32Array,
): Buffer {
  const headerBytes = 4 * 4; // four uint32 counts
  const totalBytes =
    headerBytes +
    positions.byteLength +
    normals.byteLength +
    indices.byteLength +
    edges.byteLength;

  const buf = Buffer.alloc(totalBytes);
  let offset = 0;

  // Header: counts (number of float/uint elements, not bytes)
  buf.writeUInt32LE(positions.length, offset);
  offset += 4;
  buf.writeUInt32LE(normals.length, offset);
  offset += 4;
  buf.writeUInt32LE(indices.length, offset);
  offset += 4;
  buf.writeUInt32LE(edges.length, offset);
  offset += 4;

  // Data sections
  Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength).copy(buf, offset);
  offset += positions.byteLength;

  Buffer.from(normals.buffer, normals.byteOffset, normals.byteLength).copy(buf, offset);
  offset += normals.byteLength;

  Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength).copy(buf, offset);
  offset += indices.byteLength;

  Buffer.from(edges.buffer, edges.byteOffset, edges.byteLength).copy(buf, offset);

  return buf;
}

/** Mesh a shape and return packed binary data. */
function meshToBinary(
  resultShape: unknown,
  tolerances: { tolerance: number; angularTolerance: number },
): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shapeMesh = mesh(resultShape as any, tolerances);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const edgeMesh = meshEdges(resultShape as any, tolerances);

  const bufferData = toBufferGeometryData(shapeMesh);
  const lineData = toLineGeometryData(edgeMesh);

  return packBinary(
    bufferData.position,
    bufferData.normal,
    bufferData.index,
    lineData.position,
  );
}

// ── Process examples ──────────────────────────────────────────────────
const heroTolerances = { tolerance: 2, angularTolerance: 1.5 };
const galleryTolerances = { tolerance: 0.5, angularTolerance: 0.5 };

let succeeded = 0;
let failed = 0;

for (const example of examples) {
  const isHero = example.id === 'spiral-staircase';
  const tolerances = isHero ? heroTolerances : galleryTolerances;

  console.log(`Processing: ${example.title} (${example.id})...`);

  try {
    // Evaluate the example code — each .code string uses brepjs globals
    // injected above and returns a shape via `return ...`.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(example.code) as () => unknown;
    const resultShape = fn();

    if (!resultShape) {
      console.error(`  SKIP: ${example.id} returned falsy value`);
      failed++;
      continue;
    }

    const bin = meshToBinary(resultShape, tolerances);

    // Free the WASM-heap shape now that we have the mesh data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    try { (resultShape as any).delete?.(); } catch { /* already freed */ }

    // Write gallery mesh binary
    const outPath = resolve(galleryDir, `${example.id}.bin`);
    writeFileSync(outPath, bin);
    const sizeKB = (bin.byteLength / 1024).toFixed(1);
    console.log(`  Wrote ${example.id}.bin (${sizeKB} KB)`);

    // Also write hero mesh binary at the top-level public dir
    if (isHero) {
      const heroPath = resolve(__dirname, '../public/hero-mesh.bin');
      writeFileSync(heroPath, bin);
      console.log(`  Wrote hero-mesh.bin (${sizeKB} KB)`);
    }

    succeeded++;
  } catch (error) {
    console.error(`  FAIL: ${example.id}:`, error);
    failed++;
  }
}

console.log(`\nDone: ${succeeded} succeeded, ${failed} failed out of ${examples.length} examples.`);
process.exit(failed > 0 ? 1 : 0);
