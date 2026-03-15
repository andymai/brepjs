import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, exportThreeMF, importThreeMF, measureVolume, mesh, unwrap } from '../src/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('importThreeMF', () => {
  it('round-trips a box through 3MF export/import', async () => {
    const b = box(10, 10, 10);
    const m = mesh(b);
    const threemf = exportThreeMF(m);
    const blob = new Blob([threemf]);
    const result = await importThreeMF(blob);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const vol = unwrap(measureVolume(result.value));
    expect(vol).toBeCloseTo(1000, -1);
  });

  it('fails on invalid data', async () => {
    const blob = new Blob([new ArrayBuffer(10)]);
    const result = await importThreeMF(blob);
    expect(result.ok).toBe(false);
  });

  it('fails on empty geometry', async () => {
    // Build a minimal valid ZIP with 3D/3dmodel.model containing no mesh data
    const xml = '<?xml version="1.0"?><model><resources></resources></model>';
    const encoder = new TextEncoder();
    const xmlBytes = encoder.encode(xml);
    const fileName = '3D/3dmodel.model';
    const nameBytes = encoder.encode(fileName);

    // Build a store-only ZIP manually
    const localHeaderSize = 30 + nameBytes.length;
    const centralHeaderSize = 46 + nameBytes.length;
    const eocdSize = 22;
    const totalSize = localHeaderSize + xmlBytes.length + centralHeaderSize + eocdSize;
    const buf = new ArrayBuffer(totalSize);
    const view = new DataView(buf);
    const arr = new Uint8Array(buf);

    let offset = 0;
    // Local file header
    view.setUint32(offset, 0x04034b50, true);
    offset += 4; // signature
    view.setUint16(offset, 20, true);
    offset += 2; // version needed
    view.setUint16(offset, 0, true);
    offset += 2; // flags
    view.setUint16(offset, 0, true);
    offset += 2; // compression (store)
    view.setUint16(offset, 0, true);
    offset += 2; // mod time
    view.setUint16(offset, 0, true);
    offset += 2; // mod date
    view.setUint32(offset, 0, true);
    offset += 4; // crc32
    view.setUint32(offset, xmlBytes.length, true);
    offset += 4; // compressed size
    view.setUint32(offset, xmlBytes.length, true);
    offset += 4; // uncompressed size
    view.setUint16(offset, nameBytes.length, true);
    offset += 2; // name length
    view.setUint16(offset, 0, true);
    offset += 2; // extra length
    arr.set(nameBytes, offset);
    offset += nameBytes.length;
    arr.set(xmlBytes, offset);
    offset += xmlBytes.length;

    const cdOffset = offset;
    // Central directory header
    view.setUint32(offset, 0x02014b50, true);
    offset += 4;
    view.setUint16(offset, 20, true);
    offset += 2; // version made by
    view.setUint16(offset, 20, true);
    offset += 2; // version needed
    view.setUint16(offset, 0, true);
    offset += 2; // flags
    view.setUint16(offset, 0, true);
    offset += 2; // compression
    view.setUint16(offset, 0, true);
    offset += 2; // mod time
    view.setUint16(offset, 0, true);
    offset += 2; // mod date
    view.setUint32(offset, 0, true);
    offset += 4; // crc32
    view.setUint32(offset, xmlBytes.length, true);
    offset += 4; // compressed
    view.setUint32(offset, xmlBytes.length, true);
    offset += 4; // uncompressed
    view.setUint16(offset, nameBytes.length, true);
    offset += 2; // name len
    view.setUint16(offset, 0, true);
    offset += 2; // extra len
    view.setUint16(offset, 0, true);
    offset += 2; // comment len
    view.setUint16(offset, 0, true);
    offset += 2; // disk start
    view.setUint16(offset, 0, true);
    offset += 2; // internal attrs
    view.setUint32(offset, 0, true);
    offset += 4; // external attrs
    view.setUint32(offset, 0, true);
    offset += 4; // local header offset
    arr.set(nameBytes, offset);
    offset += nameBytes.length;

    const cdSize = offset - cdOffset;
    // EOCD
    view.setUint32(offset, 0x06054b50, true);
    offset += 4;
    view.setUint16(offset, 0, true);
    offset += 2; // disk number
    view.setUint16(offset, 0, true);
    offset += 2; // cd disk
    view.setUint16(offset, 1, true);
    offset += 2; // entries on disk
    view.setUint16(offset, 1, true);
    offset += 2; // total entries
    view.setUint32(offset, cdSize, true);
    offset += 4; // cd size
    view.setUint32(offset, cdOffset, true);
    offset += 4; // cd offset
    view.setUint16(offset, 0, true); // comment len

    const blob = new Blob([arr]);
    const result = await importThreeMF(blob);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('no valid geometry');
    }
  });
});
