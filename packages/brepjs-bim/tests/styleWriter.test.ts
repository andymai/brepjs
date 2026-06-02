import { describe, it, expect } from 'vitest';
import * as WebIFC from 'web-ifc';
import { IfcWriter } from '../src/ifc-writer/ifcWriter.js';
import {
  writeSurfaceStyle,
  writeStyledItem,
  writePresentationLayer,
} from '../src/ifc-writer/styleWriter.js';

async function makeWriter(): Promise<IfcWriter> {
  const result = await IfcWriter.create();
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

// A minimal representation item (a single Cartesian point) usable as a styling/layer target.
function writePoint(w: IfcWriter): number {
  return w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCCARTESIANPOINT,
    Coordinates: [
      w.mkType(WebIFC.IFCLENGTHMEASURE, 0),
      w.mkType(WebIFC.IFCLENGTHMEASURE, 0),
      w.mkType(WebIFC.IFCLENGTHMEASURE, 0),
    ],
  });
}

async function openSaved(w: IfcWriter): Promise<{ api: WebIFC.IfcAPI; mid: number }> {
  const saved = w.save();
  if (!saved.ok) throw new Error(saved.error.message);
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const mid = api.OpenModel(saved.value);
  return { api, mid };
}

describe('styleWriter', () => {
  it('writes IfcColourRgb + IfcSurfaceStyleRendering + IfcSurfaceStyle with the given colour', async () => {
    const w = await makeWriter();
    const styleId = writeSurfaceStyle(w, {
      name: 'Concrete',
      r: 0.5,
      g: 0.5,
      b: 0.5,
      transparency: 0.25,
    });

    const { api, mid } = await openSaved(w);

    const colourIds = api.GetLineIDsWithType(mid, WebIFC.IFCCOLOURRGB);
    expect(colourIds.size()).toBe(1);
    const colour = api.GetLine(mid, colourIds.get(0)) as Record<string, unknown>;
    expect((colour['Red'] as { value?: number } | undefined)?.value).toBeCloseTo(0.5, 6);

    const renderIds = api.GetLineIDsWithType(mid, WebIFC.IFCSURFACESTYLERENDERING);
    expect(renderIds.size()).toBe(1);
    const render = api.GetLine(mid, renderIds.get(0)) as Record<string, unknown>;
    expect((render['Transparency'] as { value?: number } | undefined)?.value).toBeCloseTo(0.25, 6);
    expect((render['SurfaceColour'] as { value?: number } | undefined)?.value).toBe(
      colourIds.get(0)
    );

    const styleIds = api.GetLineIDsWithType(mid, WebIFC.IFCSURFACESTYLE);
    expect(styleIds.size()).toBe(1);
    expect(styleIds.get(0)).toBe(styleId);
    const style = api.GetLine(mid, styleId) as Record<string, unknown>;
    expect((style['Name'] as { value?: string } | undefined)?.value).toBe('Concrete');

    api.CloseModel(mid);
  });

  it('defaults transparency to opaque (0) when not provided', async () => {
    const w = await makeWriter();
    writeSurfaceStyle(w, { name: 'Steel', r: 0.7, g: 0.7, b: 0.75 });
    const { api, mid } = await openSaved(w);
    const renderIds = api.GetLineIDsWithType(mid, WebIFC.IFCSURFACESTYLERENDERING);
    const render = api.GetLine(mid, renderIds.get(0)) as Record<string, unknown>;
    expect((render['Transparency'] as { value?: number } | undefined)?.value).toBeCloseTo(0, 6);
    api.CloseModel(mid);
  });

  it('writes an IfcStyledItem linking a geometry item to a surface style', async () => {
    const w = await makeWriter();
    const styleId = writeSurfaceStyle(w, { name: 'Glass', r: 0.6, g: 0.8, b: 0.9, transparency: 0.6 });
    const geomItem = writePoint(w);

    writeStyledItem(w, geomItem, styleId);

    const { api, mid } = await openSaved(w);
    const styledIds = api.GetLineIDsWithType(mid, WebIFC.IFCSTYLEDITEM);
    expect(styledIds.size()).toBe(1);
    const styled = api.GetLine(mid, styledIds.get(0)) as Record<string, unknown>;
    expect((styled['Item'] as { value?: number } | undefined)?.value).toBe(geomItem);
    const styles = (styled['Styles'] ?? []) as Array<{ value: number }>;
    expect(styles.map((s) => s.value)).toContain(styleId);
    api.CloseModel(mid);
  });

  it('writes an IfcPresentationLayerAssignment grouping items by layer name', async () => {
    const w = await makeWriter();
    const a = writePoint(w);
    const b = writePoint(w);

    writePresentationLayer(w, 'A-WALL', [a, b]);

    const { api, mid } = await openSaved(w);
    const layerIds = api.GetLineIDsWithType(mid, WebIFC.IFCPRESENTATIONLAYERASSIGNMENT);
    expect(layerIds.size()).toBe(1);
    const layer = api.GetLine(mid, layerIds.get(0)) as Record<string, unknown>;
    expect((layer['Name'] as { value?: string } | undefined)?.value).toBe('A-WALL');
    const items = (layer['AssignedItems'] ?? []) as Array<{ value: number }>;
    expect(items.map((i) => i.value).sort()).toEqual([a, b].sort());
    api.CloseModel(mid);
  });
});
