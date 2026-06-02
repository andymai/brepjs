import { describe, it, expect, beforeAll } from 'vitest';
import * as WebIFC from 'web-ifc';
import { polygon, extrude, isValidSolid } from 'brepjs';
import type { ValidSolid } from 'brepjs';
import { initOCCT } from '../../../tests/setup.js';
import { IfcWriter } from '../src/ifc-writer/ifcWriter.js';
import { writeHeader } from '../src/ifc-writer/headerWriter.js';
import {
  writeTessellation,
  writeWallAxisRepresentation,
} from '../src/ifc-writer/tessellationWriter.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const META = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };

// 1000mm × 1000mm × 1000mm box solid at the origin.
function makeBoxSolid(): ValidSolid {
  const profile = polygon([
    [0, 0, 0],
    [1000, 0, 0],
    [1000, 1000, 0],
    [0, 1000, 0],
  ]);
  if (!profile.ok) throw new Error('failed to build box profile');
  using p = profile.value;
  const solid = extrude(p, [0, 0, 1000]);
  if (!solid.ok) throw new Error('failed to extrude box');
  if (!isValidSolid(solid.value)) throw new Error('box solid is not valid');
  return solid.value;
}

async function makeWriter(): Promise<IfcWriter> {
  const result = await IfcWriter.create();
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

async function openSaved(w: IfcWriter): Promise<{ api: WebIFC.IfcAPI; mid: number }> {
  const saved = w.save();
  if (!saved.ok) throw new Error(saved.error.message);
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const mid = api.OpenModel(saved.value);
  return { api, mid };
}

describe('tessellationWriter', () => {
  it('meshes a box solid into an IfcTriangulatedFaceSet with non-empty coordinates and indices', async () => {
    const w = await makeWriter();
    const { geomSubContextId } = writeHeader(w, META);
    using solid = makeBoxSolid();

    const result = writeTessellation(w, solid, geomSubContextId, null);
    expect(result.usedFallback).toBe(false);
    expect(result.productDefinitionShapeId).toBeGreaterThan(0);

    const { api, mid } = await openSaved(w);

    const faceSetIds = api.GetLineIDsWithType(mid, WebIFC.IFCTRIANGULATEDFACESET);
    expect(faceSetIds.size()).toBe(1);

    const faceSet = api.GetLine(mid, faceSetIds.get(0)) as Record<string, unknown>;
    const coordIndex = faceSet['CoordIndex'] as unknown[];
    expect(Array.isArray(coordIndex)).toBe(true);
    expect(coordIndex.length).toBeGreaterThan(0);
    // A box has 12 triangles (2 per face × 6 faces).
    expect(coordIndex.length).toBe(12);

    const pointListIds = api.GetLineIDsWithType(mid, WebIFC.IFCCARTESIANPOINTLIST3D);
    expect(pointListIds.size()).toBe(1);
    const pointList = api.GetLine(mid, pointListIds.get(0)) as Record<string, unknown>;
    const coordList = pointList['CoordList'] as unknown[];
    expect(Array.isArray(coordList)).toBe(true);
    expect(coordList.length).toBeGreaterThan(0);

    api.CloseModel(mid);
  });

  it('emits 1-based coordinate indices and coordinates in metres', async () => {
    const w = await makeWriter();
    const { geomSubContextId } = writeHeader(w, META);
    using solid = makeBoxSolid();

    writeTessellation(w, solid, geomSubContextId, null);

    const { api, mid } = await openSaved(w);

    const faceSet = api.GetLine(
      mid,
      api.GetLineIDsWithType(mid, WebIFC.IFCTRIANGULATEDFACESET).get(0)
    ) as Record<string, unknown>;
    const coordIndex = faceSet['CoordIndex'] as Array<Array<{ value?: number } | number>>;
    let minIndex = Number.POSITIVE_INFINITY;
    for (const tri of coordIndex) {
      for (const entry of tri) {
        const v = typeof entry === 'number' ? entry : (entry.value ?? 0);
        if (v < minIndex) minIndex = v;
      }
    }
    // IFC coordinate indices are 1-based.
    expect(minIndex).toBeGreaterThanOrEqual(1);

    const pointList = api.GetLine(
      mid,
      api.GetLineIDsWithType(mid, WebIFC.IFCCARTESIANPOINTLIST3D).get(0)
    ) as Record<string, unknown>;
    const coordList = pointList['CoordList'] as Array<Array<{ value?: number } | number>>;
    let maxCoord = 0;
    for (const pt of coordList) {
      for (const entry of pt) {
        const v = typeof entry === 'number' ? entry : (entry.value ?? 0);
        maxCoord = Math.max(maxCoord, Math.abs(v));
      }
    }
    // A 1000mm box converted to metres must have coordinates ≤ ~1, never 1000.
    expect(maxCoord).toBeLessThan(2);
    expect(maxCoord).toBeGreaterThan(0);

    api.CloseModel(mid);
  });

  it('wraps the face set in an IfcShapeRepresentation with RepresentationType Tessellation', async () => {
    const w = await makeWriter();
    const { geomSubContextId } = writeHeader(w, META);
    using solid = makeBoxSolid();

    writeTessellation(w, solid, geomSubContextId, null);

    const { api, mid } = await openSaved(w);
    const repIds = api.GetLineIDsWithType(mid, WebIFC.IFCSHAPEREPRESENTATION);
    expect(repIds.size()).toBeGreaterThanOrEqual(1);
    let foundTessellation = false;
    for (let i = 0; i < repIds.size(); i++) {
      const rep = api.GetLine(mid, repIds.get(i)) as Record<string, unknown>;
      const repType = (rep['RepresentationType'] as { value?: string } | undefined)?.value;
      if (repType === 'Tessellation') foundTessellation = true;
    }
    expect(foundTessellation).toBe(true);
    api.CloseModel(mid);
  });

  it('serializes a product definition shape that survives a round-trip', async () => {
    const w = await makeWriter();
    const { geomSubContextId } = writeHeader(w, META);
    using solid = makeBoxSolid();

    const result = writeTessellation(w, solid, geomSubContextId, null);

    const { api, mid } = await openSaved(w);
    const shape = api.GetLine(mid, result.productDefinitionShapeId) as Record<string, unknown>;
    expect(shape['type']).toBe(WebIFC.IFCPRODUCTDEFINITIONSHAPE);
    const reps = (shape['Representations'] ?? []) as unknown[];
    expect(reps.length).toBeGreaterThanOrEqual(1);
    api.CloseModel(mid);
  });
});

describe('writeWallAxisRepresentation', () => {
  it('writes a Curve2D Axis representation containing an IfcPolyline', async () => {
    const w = await makeWriter();
    const { geomSubContextId } = writeHeader(w, META);

    // 5000mm wall length → 5m polyline from (0,0) to (5,0).
    const repId = writeWallAxisRepresentation(w, 5000, geomSubContextId);
    expect(repId).toBeGreaterThan(0);

    const { api, mid } = await openSaved(w);

    const polylineIds = api.GetLineIDsWithType(mid, WebIFC.IFCPOLYLINE);
    expect(polylineIds.size()).toBe(1);

    const rep = api.GetLine(mid, repId) as Record<string, unknown>;
    const repId2 = (rep['RepresentationIdentifier'] as { value?: string } | undefined)?.value;
    const repType = (rep['RepresentationType'] as { value?: string } | undefined)?.value;
    expect(repId2).toBe('Axis');
    expect(repType).toBe('Curve2D');

    api.CloseModel(mid);
  });
});
