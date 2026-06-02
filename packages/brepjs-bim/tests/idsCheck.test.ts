import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { fromIfc } from '../src/import/fromIfc.js';
import { parseIdsXml } from '../src/ids/idsParser.js';
import { checkModelAgainstIds } from '../src/ids/idsCheck.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const META = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };

/**
 * IDS requiring every IfcWall to carry Pset_WallCommon.IsExternal. Applicability
 * is the Entity facet (IFCWALL); the single requirement is the Property facet.
 */
const WALL_IS_EXTERNAL_IDS = `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS">
  <info>
    <title>Wall IsExternal requirement</title>
  </info>
  <specifications>
    <specification name="Walls must declare IsExternal" ifcVersion="IFC4">
      <applicability minOccurs="1" maxOccurs="unbounded">
        <entity>
          <name>
            <simpleValue>IFCWALL</simpleValue>
          </name>
        </entity>
      </applicability>
      <requirements>
        <property>
          <propertySet>
            <simpleValue>Pset_WallCommon</simpleValue>
          </propertySet>
          <baseName>
            <simpleValue>IsExternal</simpleValue>
          </baseName>
        </property>
      </requirements>
    </specification>
  </specifications>
</ids>`;

const WALL_PROHIBITED_PARTOF_IDS = `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS">
  <info>
    <title>Walls must not be part of an assembly</title>
  </info>
  <specifications>
    <specification name="No wall in assembly" ifcVersion="IFC4" cardinality="prohibited">
      <applicability minOccurs="1" maxOccurs="unbounded">
        <entity>
          <name>
            <simpleValue>IFCWALL</simpleValue>
          </name>
        </entity>
      </applicability>
      <requirements>
        <partOf relation="IFCRELAGGREGATES">
          <entity>
            <name>
              <simpleValue>IFCELEMENTASSEMBLY</simpleValue>
            </name>
          </entity>
        </partOf>
      </requirements>
    </specification>
  </specifications>
</ids>`;

/** Builds a minimal spatial tree plus one wall, optionally marking it external. */
function buildWallModel(withIsExternal: boolean): BimModel {
  const model = new BimModel();
  const initResult = model.init({ name: 'IDS Project' });
  if (!initResult.ok) throw new Error(initResult.error.message);
  const projectId = initResult.value;
  const siteId = model.addSite({ name: 'Site' });
  const buildingId = model.addBuilding({ name: 'Building' });
  const storeyId = model.addStorey({ name: 'Level 1', elevation: 0 });
  model.aggregate(projectId, siteId);
  model.aggregate(siteId, buildingId);
  model.aggregate(buildingId, storeyId);

  const wall = model.addWall({
    length: 5000,
    height: 3000,
    thickness: 200,
    origin: [0, 0, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Concrete',
    // isExternal drives Pset_WallCommon.IsExternal; omitting it yields a wall
    // with no IsExternal property, which the IDS requirement must flag.
    ...(withIsExternal ? { isExternal: true } : {}),
  });
  if (!wall.ok) throw new Error(wall.error.message);
  model.placeIn(wall.value, storeyId);

  return model;
}

describe('IDS check — Pset_WallCommon.IsExternal requirement', () => {
  it('parses the IDS document into specifications with applicability and requirements', () => {
    const parsed = parseIdsXml(WALL_IS_EXTERNAL_IDS);
    if (!parsed.ok) throw new Error(parsed.error.message);
    const doc = parsed.value;

    expect(doc.title).toBe('Wall IsExternal requirement');
    expect(doc.specifications).toHaveLength(1);
    const spec = doc.specifications[0];
    expect(spec?.name).toBe('Walls must declare IsExternal');
    expect(spec?.cardinality).toBe('required');
    expect(spec?.applicability).toHaveLength(1);
    expect(spec?.applicability[0]?.kind).toBe('Entity');
    expect(spec?.requirements).toHaveLength(1);
    expect(spec?.requirements[0]?.kind).toBe('Property');
  });

  it('passes when the wall carries Pset_WallCommon.IsExternal', async () => {
    const model = buildWallModel(true);
    const bytes = await toIfc(model, META);
    if (!bytes.ok) throw new Error(bytes.error.message);
    const imported = await fromIfc(bytes.value);
    if (!imported.ok) throw new Error(imported.error.message);

    const parsed = parseIdsXml(WALL_IS_EXTERNAL_IDS);
    if (!parsed.ok) throw new Error(parsed.error.message);

    const report = checkModelAgainstIds(imported.value, parsed.value);
    expect(report.pass).toBe(true);
    expect(report.results).toHaveLength(1);
    const result = report.results[0];
    expect(result?.specificationName).toBe('Walls must declare IsExternal');
    expect(result?.pass).toBe(true);
    expect(result?.applicableCount).toBe(1);
    expect(result?.passedCount).toBe(1);
    expect(result?.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('fails when the wall is missing the required property', async () => {
    const model = buildWallModel(false);
    const bytes = await toIfc(model, META);
    if (!bytes.ok) throw new Error(bytes.error.message);
    const imported = await fromIfc(bytes.value);
    if (!imported.ok) throw new Error(imported.error.message);

    const parsed = parseIdsXml(WALL_IS_EXTERNAL_IDS);
    if (!parsed.ok) throw new Error(parsed.error.message);

    const report = checkModelAgainstIds(imported.value, parsed.value);
    expect(report.pass).toBe(false);
    const result = report.results[0];
    expect(result?.pass).toBe(false);
    expect(result?.applicableCount).toBe(1);
    expect(result?.failedCount).toBe(1);
    const errors = result?.issues.filter((i) => i.severity === 'error') ?? [];
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.code).toBe('IDS_REQUIREMENT_FAILED');
  });

  it('flags unsupported facets without aborting the check', () => {
    const idsWithPartOf = `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS">
  <info><title>PartOf demo</title></info>
  <specifications>
    <specification name="PartOf spec" ifcVersion="IFC4">
      <applicability>
        <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>
      </applicability>
      <requirements>
        <partOf relation="IFCRELAGGREGATES">
          <entity><name><simpleValue>IFCBUILDINGSTOREY</simpleValue></name></entity>
        </partOf>
      </requirements>
    </specification>
  </specifications>
</ids>`;
    const parsed = parseIdsXml(idsWithPartOf);
    if (!parsed.ok) throw new Error(parsed.error.message);

    const model = buildWallModel(true);
    // Native BimModel path is out of scope here; an empty ImportedModel-shaped
    // stub exercises the unsupported-facet flagging without WASM.
    const emptyModel = {
      schema: 'IFC4' as const,
      spatialTree: null,
      elements: [],
      byExpressId: new Map(),
      diagnostics: { issues: [] },
    };
    const report = checkModelAgainstIds(emptyModel, parsed.value);
    expect(report.unsupportedFacets.length).toBeGreaterThan(0);
    expect(report.unsupportedFacets.some((f) => f.includes('PartOf'))).toBe(true);
    // The model used to build the IFC is not needed for this pure-parse path.
    void model;
  });

  it('does not flag a prohibited spec whose requirement is an unsupported PartOf', async () => {
    const model = buildWallModel(true);
    const bytes = await toIfc(model, META);
    if (!bytes.ok) throw new Error(bytes.error.message);
    const imported = await fromIfc(bytes.value);
    if (!imported.ok) throw new Error(imported.error.message);
    const parsed = parseIdsXml(WALL_PROHIBITED_PARTOF_IDS);
    if (!parsed.ok) throw new Error(parsed.error.message);
    const report = checkModelAgainstIds(imported.value, parsed.value);
    // The PartOf requirement is unsupported; a prohibited spec must NOT raise a
    // spurious violation for a facet it cannot evaluate.
    expect(report.pass).toBe(true);
    expect(report.unsupportedFacets.some((f) => f.includes('PartOf'))).toBe(true);
  });
});
