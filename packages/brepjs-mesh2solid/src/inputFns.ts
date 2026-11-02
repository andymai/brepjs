import type { MeshInput } from './types.js';

export async function toBytes(input: MeshInput): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input))
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await input.arrayBuffer());
}

/** The engine's format hint: the given file name, else a `File`'s own name. */
export function hintFor(input: MeshInput, o: { readonly fileName?: string | undefined }): string {
  if (o.fileName !== undefined) return o.fileName;
  if (typeof File !== 'undefined' && input instanceof File) return input.name;
  return '';
}

export function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
