/**
 * DXF ASCII export — converts 2D blueprints to DXF R12 format.
 *
 * Supports LINE entities for straight segments and LWPOLYLINE
 * approximations for arcs, ellipses, splines, and other curves.
 */

import type { Point2D, Curve2D } from '../2d/lib/index.js';
import type Blueprint from '../2d/blueprints/Blueprint.js';
import type CompoundBlueprint from '../2d/blueprints/CompoundBlueprint.js';
import type Blueprints from '../2d/blueprints/Blueprints.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single DXF entity. */
export type DXFEntity =
  | { type: 'LINE'; start: Point2D; end: Point2D; layer?: string }
  | { type: 'POLYLINE'; points: Point2D[]; closed?: boolean; layer?: string };

/** Options for DXF export. */
export interface DXFExportOptions {
  /** Default layer name for entities. Default: "0" */
  layer?: string;
  /** Number of segments for curve approximation. Default: 32 */
  curveSegments?: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Export DXF entities to a DXF ASCII string.
 */
export function exportDXF(entities: DXFEntity[], options?: DXFExportOptions): string {
  const layer = options?.layer ?? '0';
  const lines: string[] = [];

  // HEADER section
  lines.push('0', 'SECTION', '2', 'HEADER');
  lines.push('9', '$ACADVER', '1', 'AC1009'); // DXF R12
  lines.push('0', 'ENDSEC');

  // TABLES section — collect all unique layer names from entities
  const layerNames = new Set<string>([layer]);
  for (const entity of entities) {
    if (entity.layer) layerNames.add(entity.layer);
  }
  lines.push('0', 'SECTION', '2', 'TABLES');
  lines.push('0', 'TABLE', '2', 'LAYER', '70', String(layerNames.size));
  for (const ln of layerNames) {
    lines.push('0', 'LAYER', '2', ln, '70', '0', '62', '7', '6', 'CONTINUOUS');
  }
  lines.push('0', 'ENDTAB');
  lines.push('0', 'ENDSEC');

  // ENTITIES section
  lines.push('0', 'SECTION', '2', 'ENTITIES');
  for (const entity of entities) {
    const entLayer = entity.layer ?? layer;
    if (entity.type === 'LINE') {
      lines.push(
        '0',
        'LINE',
        '8',
        entLayer,
        '10',
        String(entity.start[0]),
        '20',
        String(entity.start[1]),
        '30',
        '0',
        '11',
        String(entity.end[0]),
        '21',
        String(entity.end[1]),
        '31',
        '0'
      );
    } else {
      lines.push(
        '0',
        'LWPOLYLINE',
        '8',
        entLayer,
        '90',
        String(entity.points.length),
        '70',
        entity.closed ? '1' : '0'
      );
      for (const pt of entity.points) {
        lines.push('10', String(pt[0]), '20', String(pt[1]));
      }
    }
  }
  lines.push('0', 'ENDSEC');

  // EOF
  lines.push('0', 'EOF');

  return lines.join('\n') + '\n';
}

/**
 * Convert a Blueprint (or CompoundBlueprint/Blueprints) to a DXF string.
 * Each curve becomes a LINE (for straight segments) or an approximated POLYLINE.
 */
export function blueprintToDXF(
  drawing: Blueprint | CompoundBlueprint | Blueprints,
  options?: DXFExportOptions
): string {
  const curveSegments = options?.curveSegments ?? 32;
  const entities: DXFEntity[] = [];
  const blueprintList = flattenBlueprints(drawing);

  for (const bp of blueprintList) {
    for (const curve of bp.curves) {
      entities.push(...curveToEntities(curve, curveSegments));
    }
  }

  return exportDXF(entities, options);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function flattenBlueprints(drawing: Blueprint | CompoundBlueprint | Blueprints): Blueprint[] {
  // Duck-type detection: Blueprints and CompoundBlueprint both have .blueprints
  // Blueprint has .curves directly
  if ('curves' in drawing && Array.isArray(drawing.curves)) {
    return [drawing];
  }
  if ('blueprints' in drawing && Array.isArray(drawing.blueprints)) {
    // Could be CompoundBlueprint or Blueprints — flatten recursively
    const result: Blueprint[] = [];
    for (const item of drawing.blueprints as Array<Blueprint | CompoundBlueprint>) {
      result.push(...flattenBlueprints(item));
    }
    return result;
  }
  return [];
}

function curveToEntities(curve: Curve2D, segments: number): DXFEntity[] {
  const geomType = curve.geomType;

  if (geomType === 'LINE') {
    return [{ type: 'LINE', start: curve.firstPoint, end: curve.lastPoint }];
  }

  // For all other curve types, approximate as polyline
  return [approximateCurveAsPolyline(curve, segments)];
}

function approximateCurveAsPolyline(curve: Curve2D, segments: number): DXFEntity {
  const t0 = curve.firstParameter;
  const t1 = curve.lastParameter;
  const points: Point2D[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = t0 + (t1 - t0) * (i / segments);
    points.push(curve.value(t));
  }

  return { type: 'POLYLINE', points };
}
