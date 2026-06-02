import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';

export interface SurfaceStyleSpec {
  readonly name: string;
  /** Red channel, 0–1. */
  readonly r: number;
  /** Green channel, 0–1. */
  readonly g: number;
  /** Blue channel, 0–1. */
  readonly b: number;
  /** 0 = opaque (default), 1 = fully transparent. */
  readonly transparency?: number;
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Emits IfcColourRgb + IfcSurfaceStyleRendering + IfcSurfaceStyle and returns the
 * IfcSurfaceStyle express ID. Link the style to geometry items with
 * {@link writeStyledItem}. Colour channels and transparency are clamped to [0,1].
 */
export function writeSurfaceStyle(w: IfcWriter, spec: SurfaceStyleSpec): number {
  const colourId = w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCCOLOURRGB,
    Name: null,
    Red: w.mkType(WebIFC.IFCNORMALISEDRATIOMEASURE, clamp01(spec.r)),
    Green: w.mkType(WebIFC.IFCNORMALISEDRATIOMEASURE, clamp01(spec.g)),
    Blue: w.mkType(WebIFC.IFCNORMALISEDRATIOMEASURE, clamp01(spec.b)),
  });

  const renderingId = w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCSURFACESTYLERENDERING,
    SurfaceColour: w.ref(colourId),
    Transparency: w.mkType(WebIFC.IFCNORMALISEDRATIOMEASURE, clamp01(spec.transparency ?? 0)),
    DiffuseColour: null,
    TransmissionColour: null,
    DiffuseTransmissionColour: null,
    ReflectionColour: null,
    SpecularColour: null,
    SpecularHighlight: null,
    ReflectanceMethod: { type: 3, value: 'NOTDEFINED' },
  });

  const styleId = w.nextId();
  w.writeLine({
    expressID: styleId,
    type: WebIFC.IFCSURFACESTYLE,
    Name: w.mkType(WebIFC.IFCLABEL, spec.name),
    Side: { type: 3, value: 'BOTH' },
    Styles: [w.ref(renderingId)],
  });
  return styleId;
}

/**
 * Emits an IfcStyledItem associating a single geometry representation item
 * (e.g. an IfcExtrudedAreaSolid or IfcTriangulatedFaceSet) with a surface style
 * produced by {@link writeSurfaceStyle}.
 */
export function writeStyledItem(w: IfcWriter, geomItemId: number, styleId: number): void {
  w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCSTYLEDITEM,
    Item: w.ref(geomItemId),
    Styles: [w.ref(styleId)],
    Name: null,
  });
}

/**
 * Emits an IfcPresentationLayerAssignment grouping representation items under a
 * named layer. An empty `itemIds` set is a no-op (IFC requires a non-empty
 * AssignedItems set).
 */
export function writePresentationLayer(
  w: IfcWriter,
  layerName: string,
  itemIds: readonly number[]
): void {
  if (itemIds.length === 0) return;
  w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCPRESENTATIONLAYERASSIGNMENT,
    Name: w.mkType(WebIFC.IFCLABEL, layerName),
    Description: null,
    AssignedItems: itemIds.map((id) => w.ref(id)),
    Identifier: null,
  });
}
