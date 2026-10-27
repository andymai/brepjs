/**
 * A drawing's polylines as files: SVG for reading, DXF for CAD tools. Coordinates stay in model
 * millimetres, so a DXF opens at 1:1 and an SVG can be measured in its own units.
 */

import { BEYOND_LAYER, type Bounds2D, type DrawingGeometry } from './drawing.js';

const SVG_WIDTH_PX = 1600;
const MARGIN = 0.04;

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function padded(b: Bounds2D): Bounds2D {
  const pad = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1) * MARGIN;
  return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
}

/** The pixel size an SVG of these bounds renders at, for rasterizing it. */
export function svgSize(bounds: Bounds2D | undefined): { width: number; height: number } {
  if (bounds === undefined) return { width: SVG_WIDTH_PX, height: SVG_WIDTH_PX / 2 };
  const b = padded(bounds);
  const aspect = (b.maxY - b.minY) / Math.max(b.maxX - b.minX, 1);
  return { width: SVG_WIDTH_PX, height: Math.max(200, Math.round(SVG_WIDTH_PX * aspect)) };
}

/**
 * An SVG with one group per layer: cut layers heavy and black, what lies beyond thin and grey.
 * The y axis is flipped so the drawing reads with its up axis up.
 */
export function drawingSvg(geometry: DrawingGeometry, title: string): string {
  const { width, height } = svgSize(geometry.bounds);
  const b = padded(geometry.bounds ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 });
  const byLayer = new Map<string, string[]>();
  for (const p of geometry.polylines) {
    const d = p.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(-y)}`).join('');
    byLayer.set(p.layer, [...(byLayer.get(p.layer) ?? []), d]);
  }
  // Beyond first, so cut lines draw over it.
  const layers = [...byLayer.keys()].sort((x, y) =>
    x === BEYOND_LAYER ? -1 : y === BEYOND_LAYER ? 1 : x.localeCompare(y)
  );
  const groups = layers.map((layer) => {
    const beyond = layer === BEYOND_LAYER;
    const style = beyond
      ? 'stroke="#7a7a7a" stroke-width="0.8"'
      : 'stroke="#000000" stroke-width="2.2"';
    const paths = (byLayer.get(layer) ?? []).map((d) => `<path d="${d}"/>`).join('');
    return `<g id="${layer}" fill="none" ${style} stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke">${paths}</g>`;
  });
  const viewBox = `${fmt(b.minX)} ${fmt(-b.maxY)} ${fmt(b.maxX - b.minX)} ${fmt(b.maxY - b.minY)}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}">`,
    `<title>${title.replace(/[<&>]/g, '')}</title>`,
    `<rect x="${fmt(b.minX)}" y="${fmt(-b.maxY)}" width="${fmt(b.maxX - b.minX)}" height="${fmt(b.maxY - b.minY)}" fill="#ffffff"/>`,
    // vector-effect on a group doesn't reach its paths in every renderer, so set it per path too.
    `<style>path{vector-effect:non-scaling-stroke}</style>`,
    ...groups,
    '</svg>',
  ].join('\n');
}

export interface DxfLine {
  type: 'LINE';
  start: [number, number];
  end: [number, number];
  layer: string;
}

/**
 * The polylines as brepjs `exportDXF` entities. Each segment is a LINE: exportDXF declares DXF R12,
 * which has no LWPOLYLINE, and LINEs open in every reader of that version.
 */
export function dxfEntities(geometry: DrawingGeometry): DxfLine[] {
  const out: DxfLine[] = [];
  for (const p of geometry.polylines) {
    for (let k = 1; k < p.points.length; k++) {
      const a = p.points[k - 1];
      const b = p.points[k];
      if (a && b)
        out.push({ type: 'LINE', start: [a[0], a[1]], end: [b[0], b[1]], layer: p.layer });
    }
  }
  return out;
}
