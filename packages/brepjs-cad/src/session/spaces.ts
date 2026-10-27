/**
 * Space geometry measured from the solid: the floor outline (a section just above the space's
 * lowest point), its area and perimeter, and the volume. brepjs-bim has no space area or boundary
 * API, and a solid reads the same whether a families program authored it or an IFC file held it.
 */

import type { AnyShape } from 'brepjs';
import type { BrepNs } from '../verify/brepjsRuntime.js';
import { errorMessage } from './records.js';

/** How far above the floor the outline is cut, so the plane misses the floor face itself. */
const FLOOR_OFFSET_MM = 10;
const JOIN_MM = 1e-3;

export interface SpaceGeometry {
  readonly id: string;
  /** Floor area, m². */
  readonly area?: number;
  /** Outline length, m. */
  readonly perimeter?: number;
  /** m³. */
  readonly volume?: number;
  /** The floor's elevation, mm. */
  readonly floor?: number;
  readonly height?: number;
  /** The outer boundary first, then any holes; plan points in mm. */
  readonly loops?: readonly (readonly (readonly [number, number])[])[];
  readonly error?: string;
}

/**
 * A wire's outline as one ordered loop. meshEdges lists each edge's segments in the edge's own
 * direction and the edges in no set order, so segments are chained by shared endpoints.
 */
function loopPoints(brep: BrepNs, wire: AnyShape): [number, number][] {
  const mesh = brep.meshEdges(wire);
  const segments: [[number, number], [number, number]][] = [];
  for (let v = 0; v + 1 < mesh.lines.length / 3; v += 2) {
    segments.push([
      [mesh.lines[v * 3] ?? 0, mesh.lines[v * 3 + 1] ?? 0],
      [mesh.lines[(v + 1) * 3] ?? 0, mesh.lines[(v + 1) * 3 + 1] ?? 0],
    ]);
  }
  const first = segments.shift();
  if (first === undefined) return [];
  const loop: [number, number][] = [first[0], first[1]];
  const near = (a: [number, number], b: [number, number]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1]) < JOIN_MM;
  while (segments.length > 0) {
    const end = loop[loop.length - 1] ?? first[1];
    const k = segments.findIndex(([a, b]) => near(a, end) || near(b, end));
    if (k < 0) break;
    const [a, b] = segments.splice(k, 1)[0] ?? [end, end];
    loop.push(near(a, end) ? b : a);
  }
  const head = loop[0];
  const tail = loop[loop.length - 1];
  if (head && tail && loop.length > 1 && near(head, tail)) loop.pop();
  return loop;
}

export function measureSpace(brep: BrepNs, id: string, shapes: readonly AnyShape[]): SpaceGeometry {
  const shape = shapes[0];
  if (shape === undefined) return { id, error: 'no geometry' };
  if (shapes.length > 1) return { id, error: `${shapes.length} solids; measured the first` };
  const b = brep.getBounds(shape);
  const height = b.zMax - b.zMin;
  const z = b.zMin + Math.min(FLOOR_OFFSET_MM, height / 2);
  const plane = brep.createPlane([0, 0, z], null, [0, 0, 1]);
  const face = brep.sectionToFace(shape, plane);
  if (!face.ok) return { id, floor: b.zMin, height, error: errorMessage(face.error) };
  try {
    const wires = brep.getWires(face.value);
    const outer = brep.outerWire(face.value);
    try {
      const loops = [loopPoints(brep, outer)];
      for (const w of wires) if (!brep.isSameShape(w, outer)) loops.push(loopPoints(brep, w));
      let perimeter: number | undefined = 0;
      for (const w of wires) {
        const length = brep.measureLength(w);
        perimeter = length.ok && perimeter !== undefined ? perimeter + length.value : undefined;
      }
      const area = brep.measureArea(face.value);
      const volume = brep.isShape3D(shape) ? brep.measureVolume(shape) : undefined;
      return {
        id,
        ...(area.ok ? { area: area.value / 1e6 } : {}),
        ...(perimeter !== undefined ? { perimeter: perimeter / 1000 } : {}),
        ...(volume?.ok ? { volume: volume.value / 1e9 } : {}),
        floor: b.zMin,
        height,
        loops,
      };
    } finally {
      outer[Symbol.dispose]();
    }
  } finally {
    face.value[Symbol.dispose]();
  }
}
