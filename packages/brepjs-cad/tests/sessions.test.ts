import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { matcher, parseWhere } from '@/session/query.js';
import { SessionManager, type Session } from '@/session/sessions.js';
import { INTEROP_IFC, makeBimProject, type BimProject } from './bimFixture.js';

const ANNEX_HEIGHT = 'length={4000}\n        height={2700}';

describe('BIM sessions', () => {
  let project: BimProject;
  let sessions: SessionManager;
  let families: Session;

  beforeAll(() => {
    project = makeBimProject('brepjs-cad-sessions-');
    sessions = new SessionManager({ cwd: project.dir });
  });

  afterAll(() => {
    sessions.closeAll();
    project.cleanup();
  });

  it('opens a starter-registry building with key paths, storeys, psets, and volumes', async () => {
    const r = await sessions.open('model.tsx');
    if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
    families = r.session;
    const els = families.build.index;
    expect(families.kind).toBe('families');
    expect(els.get('ground')).toMatchObject({
      category: 'storey',
      name: 'Ground floor',
      hasGeometry: false,
    });
    expect([...els.keys()]).toEqual(
      expect.arrayContaining(['ground/lobby/south/voids:door/fill', 'ground/annex/voids:w1/fill'])
    );
    const annex = els.get('ground/annex');
    expect(annex).toMatchObject({
      category: 'wall',
      type: 'Wall',
      keyed: true,
      storey: { id: 'ground', name: 'Ground floor' },
      psets: { Pset_WallCommon: { IsExternal: true, FireRating: 'REI60' } },
      props: { length: 4000, height: 2700, fireRating: 'REI60' },
      relationships: [{ kind: 'Voids', target: 'ground/annex/voids:w1' }],
    });
    // 4000 x 200 x 2700 wall less the 1200 x 1200 window cut through its 200 mm thickness.
    expect(annex?.volume).toBeCloseTo(4000 * 200 * 2700 - 1200 * 1200 * 200, -3);
    expect(annex?.bounds?.zMax).toBeCloseTo(2700, 6);
    expect(families.build.summary.diagnostics).toEqual([]);
  });

  it('marks the session stale after an edit and diffs exactly the edited key path', async () => {
    project.edit(ANNEX_HEIGHT, 'length={4000}\n        height={3000}');
    expect((await sessions.status())[0]?.stale).toBe(true);

    const before = families.build.buildHash;
    const r = await sessions.rebuild(families.id);
    if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
    expect(r.previousBuildHash).toBe(before);
    expect(families.build.buildHash).not.toBe(before);
    expect(r.diff.added).toEqual([]);
    expect(r.diff.removed).toEqual([]);
    expect(r.diff.changed.map((c) => c.id)).toEqual(['ground/annex']);
    expect(r.diff.changed[0]).toMatchObject({
      props: { height: { before: 2700, after: 3000 } },
      geometryChanged: true,
      boundsDelta: { zMax: 300 },
    });
    expect(r.diff.changed[0]?.volumeDelta).toBeCloseTo(4000 * 200 * 300, -3);
    expect((await sessions.status())[0]?.stale).toBe(false);
  });

  it('keeps serving the last good build when a rebuild fails, and recovers after a fix', async () => {
    const good = families.build.buildHash;
    project.edit('height={3000}', "height={'tall'}");
    const failed = await sessions.rebuild(families.id);
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.diagnostics[0]?.code).toBe('TYPECHECK');
    expect(families.build.buildHash).toBe(good);
    expect(families.lastFailure).toBeDefined();
    expect(families.worker?.alive).toBe(true);

    project.edit("height={'tall'}", 'height={3000}');
    const fixed = await sessions.rebuild(families.id);
    if (!fixed.ok) throw new Error(JSON.stringify(fixed.diagnostics));
    expect(fixed.diff.changed).toEqual([]);
    expect(families.build.buildHash).toBe(good);
    expect(families.lastFailure).toBeUndefined();
  });

  it('rejects a module that is not an element tree', async () => {
    writeFileSync(
      join(project.dir, 'part.ts'),
      "import { box } from 'brepjs';\nexport default () => box(1, 1, 1);\n"
    );
    const r = await sessions.open('part.ts', { typecheck: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.diagnostics[0]?.code).toBe('NOT_A_MODEL');
  });

  it('kills a build that runs past its budget', async () => {
    writeFileSync(join(project.dir, 'runaway.ts'), 'export default () => {\n  for (;;) {}\n};\n');
    const r = await sessions.open('runaway.ts', { typecheck: false, timeoutMs: 4000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.diagnostics[0]?.code).toBe('BUILD_TIMEOUT');
    expect(sessions.all().map((s) => s.id)).toEqual([families.id]);
  });

  it('opens an IFC file written by another tool and queries it by category and pset', async () => {
    const r = await sessions.open(INTEROP_IFC);
    if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
    const s = r.session;
    expect(s.kind).toBe('ifc');
    expect(s.build.summary.schema).toBe('IFC4');
    const els = s.build.summary.elements;
    const walls = els.filter(
      matcher(
        parseWhere({
          category: 'wall',
          psets: [{ path: 'Pset_WallCommon.FireRating', op: 'exists' }],
        })
      )
    );
    expect(walls.length).toBeGreaterThan(0);
    const wall = walls[0];
    expect(wall?.id).toBe(wall?.guid);
    expect(wall?.storey?.name).toBe('Ground');
    expect(wall?.quantities?.['Qto_WallBaseQuantities']).toBeDefined();
    expect(wall?.volume).toBeGreaterThan(0);

    const opening = els.find((e) => e.category === 'OPENING' && e.parent !== undefined);
    const host = opening?.parent !== undefined ? s.build.index.get(opening.parent) : undefined;
    expect(host?.relationships).toContainEqual({ kind: 'Voids', target: opening?.id });
    const filled = els.find((e) => e.relationships.some((rel) => rel.kind === 'Fills'));
    const filler = filled?.relationships.find((rel) => rel.kind === 'Fills')?.target;
    expect(['DOOR', 'WINDOW']).toContain(
      filler !== undefined ? s.build.index.get(filler)?.category : undefined
    );
    sessions.close(s.id);
  });

  it('stops a rebuild in progress, and the one queued behind it, when the session closes', async () => {
    const r = await sessions.open('model.tsx', { typecheck: false });
    if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
    const s = r.session;
    const first = sessions.rebuild(s.id);
    const queued = sessions.rebuild(s.id);
    while (s.building === undefined) await new Promise((done) => setTimeout(done, 10));
    const candidate = s.building;
    sessions.close(s.id);
    await expect(first).rejects.toMatchObject({ code: 'NO_SUCH_SESSION' });
    await expect(queued).rejects.toThrow(/closed before the rebuild started/);
    expect(candidate.alive).toBe(false);
    for (let i = 0; i < 100 && s.worker?.alive; i++) await new Promise((d) => setTimeout(d, 50));
    expect(s.worker?.alive).toBe(false);
  });

  it('cancels a slow rebuild promptly when the session closes as it starts', async () => {
    writeFileSync(
      join(project.dir, 'slow.ts'),
      [
        "import { existsSync } from 'node:fs';",
        "import { el } from 'brepjs-families';",
        'export default () => {',
        "  if (existsSync(new URL('./slow.flag', import.meta.url))) {",
        '    const end = Date.now() + 15000;',
        '    while (Date.now() < end) {}',
        '  }',
        "  return el('Box', { key: 'b', size: [1, 1, 1] });",
        '};',
        '',
      ].join('\n')
    );
    const r = await sessions.open('slow.ts', { typecheck: false });
    if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
    writeFileSync(join(project.dir, 'slow.flag'), '');
    const rebuilding = sessions.rebuild(r.session.id, { timeoutMs: 60000 });
    await new Promise((done) => setImmediate(done));
    const closedAt = Date.now();
    sessions.close(r.session.id);
    await expect(rebuilding).rejects.toMatchObject({ code: 'NO_SUCH_SESSION' });
    expect(Date.now() - closedAt).toBeLessThan(5000);
  });
});
