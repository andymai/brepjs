import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { unwrap } from 'brepjs';
import { initKernel } from '../../../tests/setup.js';
import { SpfReader } from '../src/import/spfReader.js';
import { deriveIfcGuidSync } from '../src/identity/guidDerivation.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);
afterEach(() => vi.restoreAllMocks());

const roots = [
  ['IFCPROJECT', "$,'Project',$,$,$,$,$,$"],
  ['IFCGROUP', "$,'Group',$,$"],
  ['IFCWALLTYPE', "$,'Wall type',$,$,$,$,$,$,.NOTDEFINED."],
  ['IFCRELAGGREGATES', '$,$,$,#1,(#2)'],
  ['IFCPROPERTYSET', "$,'Pset',$,(#12)"],
  ['IFCSITE', "$,'Site',$,$,$,$,$,.ELEMENT.,$,$,$,$,$"],
  ['IFCBUILDING', "$,'Building',$,$,$,$,$,.ELEMENT.,$,$,$"],
  ['IFCBUILDINGSTOREY', "$,'Storey',$,$,$,$,$,.ELEMENT.,0."],
  ['IFCSPACE', "$,'Space',$,$,$,$,$,.ELEMENT.,.INTERNAL.,$"],
  ['IFCWALL', "$,'Wall',$,$,$,$,$,.NOTDEFINED."],
] as const;
const expected = roots.map(([type], i) => ({ type, id: i + 1, guid: deriveIfcGuidSync(type) }));

function fixture(extraLines = ''): Uint8Array {
  const lines = roots.map(
    ([type, fields], i) => `#${i + 1}=${type}('${deriveIfcGuidSync(type)}',${fields});`
  );
  return new TextEncoder().encode(`ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('GUID lookup regression'),'2;1');
FILE_NAME('guid-index.ifc','2026-09-20T00:00:00',(''),(''),'test','test','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
${lines.join('\n')}
#11=IFCCARTESIANPOINT((1.,2.,3.));
#12=IFCPROPERTYSINGLEVALUE('Label',$,IFCLABEL('Value'),$);
${extraLines}
ENDSEC;
END-ISO-10303-21;`);
}

describe('SpfReader root GUID lookup', () => {
  it.each(expected)('resolves $type in both directions', async ({ type, id, guid }) => {
    using reader = unwrap(await SpfReader.create(fixture()));
    expect(reader.typeNameOf(id)).toBe(type);
    expect(reader.expressIdFromGuid(guid)).toBe(id);
    expect(reader.guidFromExpressId(id)).toBe(guid);
  });

  it('ignores absent and malformed GlobalIds and unknown lookup keys', async () => {
    const malformed = ['', 'malformed', '4000000000000000000000', '000000000000000000000!'];
    const extra = malformed.map((guid, i) => `#${20 + i}=IFCGROUP('${guid}',$,'Bad',$,$);`);
    extra.push("#24=IFCGROUP($,$,'Missing',$,$);");
    using reader = unwrap(await SpfReader.create(fixture(extra.join('\n'))));
    for (const guid of [...malformed, deriveIfcGuidSync('unknown')])
      expect(reader.expressIdFromGuid(guid)).toBeUndefined();
    for (const id of [11, 12, 20, 21, 22, 23, 24, -1, 999, NaN, Infinity])
      expect(reader.guidFromExpressId(id)).toBeUndefined();
    for (const { id, guid } of expected) expect(reader.guidFromExpressId(id)).toBe(guid);
  });

  it('reads only roots and caches the complete index across both lookup directions', async () => {
    using reader = unwrap(await SpfReader.create(fixture()));
    const read = vi.spyOn(reader, 'getLine');
    for (let repeat = 0; repeat < 3; repeat++) {
      for (const { id, guid } of expected) {
        expect(reader.guidFromExpressId(id)).toBe(guid);
        expect(reader.expressIdFromGuid(guid)).toBe(id);
      }
      reader.buildGuidMap();
    }
    expect(read).toHaveBeenCalledTimes(expected.length);
    expect(read.mock.calls.map(([id]) => id).sort((a, b) => a - b)).toEqual(
      expected.map(({ id }) => id)
    );
  });

  it('rebuilds after a line read fails without publishing a partial index', async () => {
    using reader = unwrap(await SpfReader.create(fixture()));
    const read = reader.getLine.bind(reader);
    const reads = vi
      .spyOn(reader, 'getLine')
      .mockImplementationOnce(read)
      .mockImplementationOnce(() => {
        throw new Error('line read failed');
      });
    expect(() => reader.buildGuidMap()).toThrow('line read failed');
    for (const { id, guid } of expected) {
      expect(reader.expressIdFromGuid(guid)).toBe(id);
      expect(reader.guidFromExpressId(id)).toBe(guid);
    }
    expect(reads).toHaveBeenCalledTimes(expected.length + 2);
  });
});
