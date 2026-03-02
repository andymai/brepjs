/**
 * DXF file import -- parse ASCII DXF entities into kernel wires.
 */

import { getKernel } from '../kernel/index.js';
import type { Wire } from '../core/shapeTypes.js';
import { createWire } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { ioError, BrepErrorCode } from '../core/errors.js';

export interface DXFImportOptions {
  readonly layer?: string;
}

interface DXFEntity {
  readonly type: string;
  readonly layer: string;
  readonly data: Map<number, string>;
}

// ---------------------------------------------------------------------------
// DXF Parser
// ---------------------------------------------------------------------------

function parseEntities(text: string): DXFEntity[] {
  const lines = text.split(/\r?\n/);
  const entities: DXFEntity[] = [];
  let inEntities = false;
  let current: { type: string; layer: string; data: Map<number, string> } | undefined;

  for (let i = 0; i < lines.length - 1; i += 2) {
    const codeLine = lines[i];
    const valueLine = lines[i + 1];
    if (codeLine === undefined || valueLine === undefined) continue;
    const code = parseInt(codeLine.trim(), 10);
    const value = valueLine.trim();

    if (isNaN(code)) continue;

    if (code === 2 && value === 'ENTITIES') {
      inEntities = true;
      continue;
    }

    if (!inEntities) continue;

    if (code === 0) {
      if (value === 'ENDSEC' || value === 'EOF') {
        if (current) entities.push(current);
        break;
      }

      if (current) entities.push(current);
      current = { type: value, layer: '0', data: new Map() };
      continue;
    }

    if (current) {
      if (code === 8) {
        current.layer = value;
      } else {
        current.data.set(code, value);
      }
    }
  }

  return entities;
}

// ---------------------------------------------------------------------------
// Entity -> Edge conversion
// ---------------------------------------------------------------------------

function getNum(data: Map<number, string>, code: number, fallback = 0): number {
  const v = data.get(code);
  if (v === undefined) return fallback;
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

function entityToEdge(entity: DXFEntity): unknown {
  const { type, data } = entity;
  const kernel = getKernel();

  if (type === 'LINE') {
    return kernel.makeLineEdge(
      [getNum(data, 10), getNum(data, 20), getNum(data, 30)],
      [getNum(data, 11), getNum(data, 21), getNum(data, 31)]
    );
  }

  if (type === 'CIRCLE') {
    return kernel.makeCircleEdge(
      [getNum(data, 10), getNum(data, 20), getNum(data, 30)],
      [0, 0, 1],
      getNum(data, 40)
    );
  }

  if (type === 'ARC') {
    const startAngle = (getNum(data, 50) * Math.PI) / 180;
    const endAngle = (getNum(data, 51) * Math.PI) / 180;
    return kernel.makeCircleArc(
      [getNum(data, 10), getNum(data, 20), getNum(data, 30)],
      [0, 0, 1],
      getNum(data, 40),
      startAngle,
      endAngle
    );
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Import a DXF file from a Blob, returning kernel wires.
 *
 * Parses ASCII DXF LINE, CIRCLE, and ARC entities.
 * Edges are assembled into wires using `BRepBuilderAPI_MakeWire`.
 *
 * @param blob - A Blob containing ASCII DXF data.
 * @param options - Optional import settings (layer filter).
 * @returns A `Result` wrapping an array of wires.
 */
export async function importDXF(blob: Blob, options?: DXFImportOptions): Promise<Result<Wire[]>> {
  let text: string;
  try {
    text = await blob.text();
  } catch (cause: unknown) {
    return err(ioError(BrepErrorCode.DXF_IMPORT_FAILED, 'Failed to read DXF blob', cause));
  }

  const allEntities = parseEntities(text);
  const entities =
    options?.layer !== undefined
      ? allEntities.filter((e) => e.layer === options.layer)
      : allEntities;

  if (entities.length === 0) {
    return ok([]);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel edge types
  const edges: Array<any> = [];
  try {
    for (const entity of entities) {
      const edge = entityToEdge(entity);
      if (edge !== undefined) {
        edges.push(edge);
      }
    }

    if (edges.length === 0) {
      return ok([]);
    }

    const wire = getKernel().makeWire(edges);
    return ok([createWire(wire)]);
  } catch (cause: unknown) {
    return err(
      ioError(BrepErrorCode.DXF_IMPORT_FAILED, 'Failed to convert DXF entities to geometry', cause)
    );
  } finally {
    for (const edge of edges) {
      edge.delete();
    }
  }
}
