import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';
import { deriveCobieModel } from '../src/cobie/cobieExport.js';
import { serializeCobieToCsv, serializeCobieToJson } from '../src/cobie/cobieExport.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

function buildModel(): BimModel {
  const model = new BimModel();
  unwrap(model.init({ name: 'Test Project', description: 'COBie export project' }));
  const siteId = model.addSite({ name: 'Test Site' });
  const buildingId = model.addBuilding({ name: 'Test Building' });
  const storeyId = model.addStorey({ name: 'Level 1', elevation: 0 });
  model.aggregate(siteId, buildingId);
  model.aggregate(buildingId, storeyId);

  const spaceId = unwrap(
    model.addSpace({
      name: 'Office 101',
      longName: 'Open Plan Office',
      length: 4000,
      width: 3000,
      height: 2700,
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      materialName: 'Air',
      finishFloor: 'Carpet',
      finishCeiling: 'Acoustic Tile',
    })
  );
  model.placeIn(spaceId, storeyId);

  const wall1 = unwrap(
    model.addWall({
      length: 4000,
      height: 2700,
      thickness: 200,
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      materialName: 'Concrete',
    })
  );
  const wall2 = unwrap(
    model.addWall({
      length: 3000,
      height: 2700,
      thickness: 200,
      origin: [0, 0, 0],
      axisX: [0, 1, 0],
      axisZ: [0, 0, 1],
      materialName: 'Concrete',
    })
  );
  unwrap(
    model.addSlab({
      length: 4000,
      width: 3000,
      thickness: 200,
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      materialName: 'Concrete',
      predefinedType: 'FLOOR',
    })
  );
  model.placeIn(wall1, storeyId);
  model.placeIn(wall2, storeyId);

  return model;
}

describe('deriveCobieModel — Facility sheet', () => {
  it('maps the project to a single Facility row carrying the project GlobalId and name', () => {
    using model = buildModel();
    const cobie = deriveCobieModel(model);
    expect(cobie.facility).toHaveLength(1);
    const facility = cobie.facility[0];
    if (facility === undefined) throw new Error('no facility row');
    const project = model.getProject();
    if (project === null) throw new Error('no project');
    expect(facility.name).toBe('Test Project');
    expect(facility.externalIdentifier).toBe(project.guid);
    expect(facility.projectName).toBe('Test Project');
    expect(facility.siteName).toBe('Test Site');
  });
});

describe('deriveCobieModel — Floor sheet', () => {
  it('maps each storey to a Floor row with the storey GlobalId, name, and elevation', () => {
    using model = buildModel();
    const cobie = deriveCobieModel(model);
    expect(cobie.floor).toHaveLength(1);
    const floor = cobie.floor[0];
    if (floor === undefined) throw new Error('no floor row');
    const storey = model.getAllElements().find((e) => e.category === 'STOREY');
    if (storey === undefined) throw new Error('no storey');
    expect(floor.name).toBe('Level 1');
    expect(floor.externalIdentifier).toBe(storey.guid);
    expect(floor.elevation).toBe(0);
  });
});

describe('deriveCobieModel — Space sheet', () => {
  it('maps each IfcSpace to a Space row with GlobalId, name, and floor link', () => {
    using model = buildModel();
    const cobie = deriveCobieModel(model);
    expect(cobie.space).toHaveLength(1);
    const space = cobie.space[0];
    if (space === undefined) throw new Error('no space row');
    const spaceEl = model.getSpaces()[0];
    if (spaceEl === undefined) throw new Error('no space element');
    expect(space.name).toBe('Office 101');
    expect(space.externalIdentifier).toBe(spaceEl.guid);
    expect(space.floorName).toBe('Level 1');
    expect(space.roomTag).toBe('Office 101');
    expect(space.description).toBe('Open Plan Office');
  });
});

describe('deriveCobieModel — Component sheet', () => {
  it('emits one Component row per physical occurrence with its GlobalId and name', () => {
    using model = buildModel();
    const cobie = deriveCobieModel(model);
    // 2 walls + 1 slab = 3 physical components.
    expect(cobie.component).toHaveLength(3);

    const walls = model.getWalls();
    const slabs = model.getSlabs();
    const guids = new Set(cobie.component.map((c) => c.externalIdentifier));
    for (const w of walls) expect(guids.has(w.guid)).toBe(true);
    for (const s of slabs) expect(guids.has(s.guid)).toBe(true);

    const names = new Set(cobie.component.map((c) => c.name));
    expect(names.has('Wall 1')).toBe(true);
    expect(names.has('Wall 2')).toBe(true);
    expect(names.has('Slab 1')).toBe(true);

    // Every component references a Type row.
    const typeNames = new Set(cobie.type.map((t) => t.name));
    for (const c of cobie.component) {
      expect(typeNames.has(c.typeName)).toBe(true);
    }
  });
});

describe('deriveCobieModel — Type sheet', () => {
  it('derives one Type row per (category, predefinedType) group', () => {
    using model = buildModel();
    const cobie = deriveCobieModel(model);
    // WALL (NOTDEFINED), SLAB (FLOOR), SPACE (NOTDEFINED) => 3 type rows.
    const typeNames = cobie.type.map((t) => t.name).sort();
    expect(typeNames).toContain('WallType');
    expect(typeNames).toContain('SlabType_FLOOR');
    expect(cobie.type.length).toBeGreaterThanOrEqual(2);
  });
});

describe('deriveCobieModel — Contact sheet', () => {
  it('is empty when no contact metadata is supplied', () => {
    using model = buildModel();
    const cobie = deriveCobieModel(model);
    expect(cobie.contact).toHaveLength(0);
  });

  it('emits a Contact row keyed on email when contact metadata is supplied', () => {
    using model = buildModel();
    const cobie = deriveCobieModel(model, {
      contact: {
        email: 'jane@example.com',
        givenName: 'Jane',
        familyName: 'Doe',
        organizationName: 'Acme',
      },
    });
    expect(cobie.contact).toHaveLength(1);
    const contact = cobie.contact[0];
    if (contact === undefined) throw new Error('no contact row');
    expect(contact.email).toBe('jane@example.com');
    expect(contact.givenName).toBe('Jane');
    expect(contact.familyName).toBe('Doe');
    expect(contact.company).toBe('Acme');
  });
});

describe('serializeCobieToCsv', () => {
  it('produces a CSV sheet per table with a header row plus data rows', () => {
    using model = buildModel();
    const cobie = deriveCobieModel(model);
    const sheets = serializeCobieToCsv(cobie);

    const facilityCsv = sheets.get('Facility');
    if (facilityCsv === undefined) throw new Error('no Facility sheet');
    const facilityLines = facilityCsv.split('\r\n');
    expect(facilityLines[0]).toContain('Name');
    expect(facilityLines).toHaveLength(2); // header + 1 facility

    const componentCsv = sheets.get('Component');
    if (componentCsv === undefined) throw new Error('no Component sheet');
    const componentLines = componentCsv.split('\r\n');
    expect(componentLines).toHaveLength(4); // header + 3 components
  });

  it('RFC 4180 quotes values containing commas', () => {
    using model = buildModel();
    const cobie = deriveCobieModel(model, {
      contact: { email: 'a@b.com', company: 'Acme, Inc.' },
    });
    const sheets = serializeCobieToCsv(cobie);
    const contactCsv = sheets.get('Contact');
    if (contactCsv === undefined) throw new Error('no Contact sheet');
    expect(contactCsv).toContain('"Acme, Inc."');
  });
});

describe('serializeCobieToJson', () => {
  it('returns all tables as plain arrays', () => {
    using model = buildModel();
    const cobie = deriveCobieModel(model);
    const json = serializeCobieToJson(cobie);
    expect(Array.isArray(json.Facility)).toBe(true);
    expect(json.Facility).toHaveLength(1);
    expect(json.Component).toHaveLength(3);
    expect(json.Floor).toHaveLength(1);
    expect(json.Space).toHaveLength(1);
  });
});
