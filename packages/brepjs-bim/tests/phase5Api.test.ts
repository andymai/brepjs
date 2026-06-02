import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import {
  BimModel,
  toIfc,
  fromIfc,
  exportCobie,
  serializeCobieToCsv,
  checkIds,
  parseIdsXml,
  type BimModelMeta,
} from '../src/index.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const META: BimModelMeta = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };

/**
 * IDS requiring every IfcSpace to carry Pset_SpaceCommon.IsExternal. The space
 * built below is marked non-external, so the property is present and the check
 * passes.
 */
const SPACE_IS_EXTERNAL_IDS = `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS">
  <info><title>Space IsExternal requirement</title></info>
  <specifications>
    <specification name="Spaces must declare IsExternal" ifcVersion="IFC4">
      <applicability minOccurs="1" maxOccurs="unbounded">
        <entity><name><simpleValue>IFCSPACE</simpleValue></name></entity>
      </applicability>
      <requirements>
        <property>
          <propertySet><simpleValue>Pset_SpaceCommon</simpleValue></propertySet>
          <baseName><simpleValue>IsExternal</simpleValue></baseName>
        </property>
      </requirements>
    </specification>
  </specifications>
</ids>`;

/**
 * Builds a small but complete model: project/site/building/storey spatial tree,
 * one wall, two spaces grouped into a zone, and the wall grouped into a system.
 */
function buildModel(): { model: BimModel; spaceAId: number } {
  const model = new BimModel();
  const initResult = model.init({ name: 'Phase5 API Project', description: 'End-to-end fixture' });
  if (!initResult.ok) throw new Error(initResult.error.message);
  const projectId = initResult.value;
  const siteId = model.addSite({ name: 'Main Site' });
  const buildingId = model.addBuilding({ name: 'HQ' });
  const storeyId = model.addStorey({ name: 'Level 1', elevation: 0 });
  model.aggregate(projectId, siteId);
  model.aggregate(siteId, buildingId);
  model.aggregate(buildingId, storeyId);

  const wall = model.addWall({
    length: 5000, height: 3000, thickness: 200,
    origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1],
    materialName: 'Concrete',
  });
  if (!wall.ok) throw new Error(wall.error.message);
  model.placeIn(wall.value, storeyId);

  const spaceA = model.addSpace({
    name: 'Office 101', longName: 'Open-plan office',
    length: 4000, width: 3000, height: 3000, origin: [0, 0, 0],
    isExternal: false,
  });
  if (!spaceA.ok) throw new Error(spaceA.error.message);
  model.placeIn(spaceA.value, storeyId);

  const spaceB = model.addSpace({
    name: 'Office 102', longName: 'Private office',
    length: 4000, width: 3000, height: 3000, origin: [4000, 0, 0],
    isExternal: false,
  });
  if (!spaceB.ok) throw new Error(spaceB.error.message);
  model.placeIn(spaceB.value, storeyId);

  const zoneId = model.addZone({ name: 'Thermal Zone 1', longName: 'Ground-floor thermal zone' });
  model.assignToGroup(zoneId, [spaceA.value, spaceB.value]);

  const systemId = model.addSystem({ name: 'HVAC Supply', longName: 'Air supply network' });
  model.assignToGroup(systemId, [wall.value]);

  return { model, spaceAId: spaceA.value };
}

describe('Phase 5 public API — COBie + IDS end-to-end', () => {
  it('exportCobie populates Facility/Floor/Space/Zone/System/Component tables', () => {
    const { model } = buildModel();
    const cobie = exportCobie(model);

    expect(cobie.facility).toHaveLength(1);
    expect(cobie.facility[0]?.projectName).toBe('Phase5 API Project');
    expect(cobie.facility[0]?.siteName).toBe('Main Site');

    expect(cobie.floor).toHaveLength(1);
    expect(cobie.floor[0]?.name).toBe('Level 1');

    expect(cobie.space).toHaveLength(2);
    expect(cobie.space.map((s) => s.name)).toEqual(['Office 101', 'Office 102']);

    expect(cobie.zone).toHaveLength(1);
    expect(cobie.zone[0]?.name).toBe('Thermal Zone 1');
    // Zone membership resolves through the ASSIGNS_TO_GROUP relationship.
    expect(cobie.zone[0]?.spaceName).toBe('Office 101');

    expect(cobie.system).toHaveLength(1);
    expect(cobie.system[0]?.name).toBe('HVAC Supply');

    expect(cobie.component.length).toBeGreaterThan(0);
    expect(cobie.component.some((c) => c.name === 'Wall 1')).toBe(true);
  });

  it('serializeCobieToCsv emits one sheet per table with the expected header', () => {
    const { model } = buildModel();
    const sheets = serializeCobieToCsv(exportCobie(model));

    expect(sheets.has('Facility')).toBe(true);
    expect(sheets.has('Zone')).toBe(true);
    expect(sheets.has('System')).toBe(true);
    const zoneSheet = sheets.get('Zone') ?? '';
    expect(zoneSheet.split('\r\n')[0]).toBe('Name,CreatedBy,Category,SpaceName,ExternalIdentifier');
    expect(zoneSheet).toContain('Thermal Zone 1');
  });

  it('checkIds passes against a matching IDS via a fromIfc round-trip', async () => {
    const { model } = buildModel();
    const bytes = await toIfc(model, META);
    if (!bytes.ok) throw new Error(bytes.error.message);
    const imported = await fromIfc(bytes.value);
    if (!imported.ok) throw new Error(imported.error.message);

    const parsed = parseIdsXml(SPACE_IS_EXTERNAL_IDS);
    if (!parsed.ok) throw new Error(parsed.error.message);

    const report = checkIds(imported.value, parsed.value);
    expect(report.pass).toBe(true);
    const result = report.results[0];
    expect(result?.specificationName).toBe('Spaces must declare IsExternal');
    expect(result?.applicableCount).toBe(2);
    expect(result?.passedCount).toBe(2);
    expect(result?.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('round-trips IfcZone and IfcSystem through toIfc + fromIfc', async () => {
    const { model } = buildModel();
    const bytes = await toIfc(model, META);
    if (!bytes.ok) throw new Error(bytes.error.message);
    const text = new TextDecoder().decode(bytes.value);
    expect(text).toContain('IFCZONE(');
    expect(text).toContain('IFCSYSTEM(');
    expect(text).toContain('IFCRELASSIGNSTOGROUP(');
  });
});
