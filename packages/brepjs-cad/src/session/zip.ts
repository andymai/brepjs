/**
 * Just enough ZIP for BCF containers: read stored and deflated entries, write deflated ones.
 * brepjs-bim's BCF reader and writer work on a path-to-text map, and packaging is left to the
 * caller; node:zlib covers deflate and CRC-32, so no archive dependency is needed.
 */

import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const STORED = 0;
const DEFLATED = 8;
// Bit 11: names are UTF-8.
const UTF8_FLAG = 0x0800;
// An archive comes from someone else, so expansion is bounded: a BCF file is XML and a few
// snapshots, far under these.
export const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 256 * 1024 * 1024;

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

/**
 * Every file entry in a ZIP archive, by name. Directory entries are skipped. An entry that expands
 * past `entryBytes`, or an archive past `totalBytes`, is rejected while it inflates.
 */
export function readZip(
  bytes: Uint8Array,
  limits: { readonly entryBytes?: number; readonly totalBytes?: number } = {}
): Map<string, Uint8Array> {
  const entryCap = limits.entryBytes ?? MAX_ENTRY_BYTES;
  const totalCap = limits.totalBytes ?? MAX_TOTAL_BYTES;
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  // The end record sits in the last 22 bytes plus up to 64 KiB of comment.
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipError('not a ZIP archive (no end-of-central-directory record)');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const files = new Map<string, Uint8Array>();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== CENTRAL) throw new ZipError('corrupt central directory');
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const localAt = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (buf.readUInt32LE(localAt) !== LOCAL) throw new ZipError(`corrupt local header for ${name}`);
    const dataAt = localAt + 30 + buf.readUInt16LE(localAt + 26) + buf.readUInt16LE(localAt + 28);
    const data = buf.subarray(dataAt, dataAt + size);
    const budget = Math.min(entryCap, totalCap - total);
    let out: Uint8Array;
    if (method === STORED) {
      if (data.length > budget) throw new ZipError(`${name} is larger than this reader accepts`);
      out = new Uint8Array(data);
    } else if (method === DEFLATED) {
      try {
        out = new Uint8Array(inflateRawSync(data, { maxOutputLength: Math.max(1, budget) }));
      } catch (e) {
        if (e instanceof RangeError) {
          throw new ZipError(`${name} expands past the size this reader accepts`);
        }
        throw new ZipError(`${name} is corrupt: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      throw new ZipError(`${name} uses compression method ${method}, which this reader lacks`);
    }
    total += out.length;
    files.set(name, out);
  }
  return files;
}

/** A ZIP archive of `files`, each deflated. */
export function writeZip(files: ReadonlyMap<string, Uint8Array | string>): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of files) {
    const raw = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
    const data = deflateRawSync(raw);
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(DEFLATED, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(DEFLATED, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END, 0);
  end.writeUInt16LE(files.size, 8);
  end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, ...centrals, end]));
}
