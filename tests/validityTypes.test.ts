import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  cylinder,
  extrude,
  isErr,
  isOk,
  line,
  solid,
  wire,
  wireLoop,
  face,
  sewShells,
  getFaces,
  getWires,
  unwrap,
  isClosedWire,
  isOrientedFace,
  isManifoldShell,
  isValidSolid,
  isPlanarFace,
  isPlanarWire,
  closedWire,
  orientedFace,
  manifoldShell,
  validSolid,
  planarFace,
  planarWire,
  type ClosedWire,
  type OrientedFace,
  type ManifoldShell,
  type ValidSolid,
  type PlanarFace,
  type PlanarWire,
  type Wire,
  type Face,
  type Shell,
  type Solid,
} from '@/index.js';
import { currentKernel } from './helpers/kernelEnv.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a closed rectangular wire (returns plain Wire for testing narrowing). */
function makeClosedWireRaw(): Wire {
  const e1 = line([0, 0, 0], [10, 0, 0]);
  const e2 = line([10, 0, 0], [10, 10, 0]);
  const e3 = line([10, 10, 0], [0, 10, 0]);
  const e4 = line([0, 10, 0], [0, 0, 0]);
  return unwrap(wire([e1, e2, e3, e4]));
}

/** Create a closed rectangular wire with ClosedWire brand. */
function makeClosedWire(): ClosedWire {
  const w = makeClosedWireRaw();
  const result = closedWire(w);
  if (!isOk(result)) throw new Error('Expected closed wire');
  return result.value;
}

/** Create an open wire (not closed). */
function makeOpenWire(): Wire {
  const e1 = line([0, 0, 0], [10, 0, 0]);
  const e2 = line([10, 0, 0], [10, 10, 0]);
  return unwrap(wire([e1, e2]));
}

/** Create a face from a closed wire. */
function makeFace(): Face {
  return unwrap(face(makeClosedWire()));
}

/** Create a solid (box). */
function makeSolid(): Solid {
  return box(10, 10, 10);
}

/** Create a manifold shell by sewing all faces of a box. */
function makeManifoldShell(): Shell {
  const s = makeSolid();
  const faces = getFaces(s);
  return unwrap(sewShells(faces));
}

/** Create an open (non-manifold) shell from two adjacent faces that don't close. */
function makeOpenShell(): Shell {
  const f1 = makeFace();
  const w2 = unwrap(
    wire([
      line([0, 0, 0], [10, 0, 0]),
      line([10, 0, 0], [10, 0, 10]),
      line([10, 0, 10], [0, 0, 10]),
      line([0, 0, 10], [0, 0, 0]),
    ])
  );
  const f2 = unwrap(face(w2 as ClosedWire));
  return unwrap(sewShells([f1, f2]));
}

// ---------------------------------------------------------------------------
// isClosedWire
// ---------------------------------------------------------------------------

describe('isClosedWire', () => {
  it('returns true for a closed rectangular wire', () => {
    const w = makeClosedWireRaw();
    expect(isClosedWire(w)).toBe(true);
  });

  it('returns false for an open wire', () => {
    const w = makeOpenWire();
    expect(isClosedWire(w)).toBe(false);
  });

  it('narrows Wire to ClosedWire in type system', () => {
    const w: Wire = makeClosedWireRaw();
    if (isClosedWire(w)) {
      // Type should be narrowed to ClosedWire
      const _closed: ClosedWire = w;
      expect(_closed).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// closedWire (smart constructor)
// ---------------------------------------------------------------------------

describe('closedWire', () => {
  it('returns Ok for a closed wire', () => {
    const w = makeClosedWireRaw();
    const result = closedWire(w);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      // result.value is ClosedWire — assignable to Wire
      const _asWire: Wire = result.value;
      expect(_asWire).toBeDefined();
    }
  });

  it('returns Err for an open wire with a reason', () => {
    const w = makeOpenWire();
    const result = closedWire(w);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toContain('not closed');
    }
  });
});

// ---------------------------------------------------------------------------
// isOrientedFace
// ---------------------------------------------------------------------------

describe('isOrientedFace', () => {
  it('returns true for a face from a closed wire', () => {
    const f = makeFace();
    expect(isOrientedFace(f)).toBe(true);
  });

  it('narrows Face to OrientedFace in type system', () => {
    const f: Face = makeFace();
    if (isOrientedFace(f)) {
      const _oriented: OrientedFace = f;
      expect(_oriented).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// orientedFace (smart constructor)
// ---------------------------------------------------------------------------

describe('orientedFace', () => {
  it('returns Ok for a valid face', () => {
    const f = makeFace();
    const result = orientedFace(f);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const _asFace: Face = result.value;
      expect(_asFace).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// isManifoldShell
// ---------------------------------------------------------------------------

describe('isManifoldShell', () => {
  it('returns true for a watertight shell from box faces', () => {
    const shell = makeManifoldShell();
    expect(isManifoldShell(shell)).toBe(true);
  });

  it('returns false for a single-face open shell', () => {
    const shell = makeOpenShell();
    expect(isManifoldShell(shell)).toBe(false);
  });

  it('narrows Shell to ManifoldShell in type system', () => {
    const shell: Shell = makeManifoldShell();
    if (isManifoldShell(shell)) {
      const _manifold: ManifoldShell = shell;
      expect(_manifold).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// manifoldShell (smart constructor)
// ---------------------------------------------------------------------------

describe('manifoldShell', () => {
  it('returns Ok for a watertight shell', () => {
    const shell = makeManifoldShell();
    const result = manifoldShell(shell);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const _asShell: Shell = result.value;
      expect(_asShell).toBeDefined();
    }
  });

  it('returns Err for an open shell', () => {
    const shell = makeOpenShell();
    const result = manifoldShell(shell);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toContain('not manifold');
    }
  });
});

// ---------------------------------------------------------------------------
// isValidSolid
// ---------------------------------------------------------------------------

describe('isValidSolid', () => {
  it('returns true for a box solid', () => {
    const s = makeSolid();
    expect(isValidSolid(s)).toBe(true);
  });

  it('narrows Solid to ValidSolid in type system', () => {
    const s: Solid = makeSolid();
    if (isValidSolid(s)) {
      const _valid: ValidSolid = s;
      expect(_valid).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// validSolid (smart constructor)
// ---------------------------------------------------------------------------

describe('validSolid', () => {
  it('returns Ok for a box solid', () => {
    const s = makeSolid();
    const result = validSolid(s);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      const _asSolid: Solid = result.value;
      expect(_asSolid).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// isPlanarFace
// ---------------------------------------------------------------------------

describe('isPlanarFace', () => {
  it('returns true for a planar face', () => {
    const w = unwrap(
      wireLoop([
        line([0, 0, 0], [10, 0, 0]),
        line([10, 0, 0], [10, 10, 0]),
        line([10, 10, 0], [0, 10, 0]),
        line([0, 10, 0], [0, 0, 0]),
      ])
    );
    const f = unwrap(face(w));
    expect(isPlanarFace(f)).toBe(true);
  });

  it('returns false for a non-planar face', () => {
    // A cylinder lateral face is definitely non-planar (cylindrical surface)
    const cyl = cylinder(5, 10);
    const faces = getFaces(cyl);
    // Find the lateral (non-planar) face — it's the one that is not planar
    const nonPlanar = faces.find((f) => !isPlanarFace(f));
    expect(nonPlanar).toBeDefined();
  });

  it('narrows Face to PlanarFace in type system', () => {
    const w = unwrap(
      wireLoop([
        line([0, 0, 0], [10, 0, 0]),
        line([10, 0, 0], [10, 10, 0]),
        line([10, 10, 0], [0, 10, 0]),
        line([0, 10, 0], [0, 0, 0]),
      ])
    );
    const f: Face = unwrap(face(w));
    if (isPlanarFace(f)) {
      const _planar: PlanarFace = f;
      expect(_planar).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// planarFace (smart constructor)
// ---------------------------------------------------------------------------

describe('planarFace', () => {
  it('returns Ok for a planar face', () => {
    const w = unwrap(
      wireLoop([
        line([0, 0, 0], [10, 0, 0]),
        line([10, 0, 0], [10, 10, 0]),
        line([10, 10, 0], [0, 10, 0]),
        line([0, 10, 0], [0, 0, 0]),
      ])
    );
    const f = unwrap(face(w));
    const result = planarFace(f);
    expect(isOk(result)).toBe(true);
  });

  it('returns Err for a non-planar face', () => {
    const cyl = cylinder(5, 10);
    const faces = getFaces(cyl);
    const nonPlanar = faces.find((f) => !isPlanarFace(f));
    expect(nonPlanar).toBeDefined();
    if (nonPlanar) {
      const result = planarFace(nonPlanar);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toContain('not planar');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// isPlanarWire
// ---------------------------------------------------------------------------

describe('isPlanarWire', () => {
  it('returns true for a wire in a plane', () => {
    const w = unwrap(
      wireLoop([
        line([0, 0, 0], [10, 0, 0]),
        line([10, 0, 0], [10, 10, 0]),
        line([10, 10, 0], [0, 10, 0]),
        line([0, 10, 0], [0, 0, 0]),
      ])
    );
    expect(isPlanarWire(w)).toBe(true);
  });

  // brepkit's makeFace + surfaceType reports 'plane' even for non-coplanar
  // wires — skip on brepkit until its surfaceType classification improves
  it.skipIf(currentKernel === 'brepkit')('returns false for a non-planar wire', () => {
    // Build a closed wire with vertices NOT in the same plane:
    // three corners at z=0 and one at z=5 — no single plane contains all four
    const w = unwrap(
      wire([
        line([0, 0, 0], [10, 0, 0]),
        line([10, 0, 0], [10, 10, 0]),
        line([10, 10, 0], [5, 5, 5]),
        line([5, 5, 5], [0, 0, 0]),
      ])
    );
    expect(isPlanarWire(w)).toBe(false);
  });

  // Supplementary: cylinder lateral wire test (also OCCT-only)
  it.skipIf(currentKernel === 'brepkit')('returns false for a cylinder lateral wire (OCCT)', () => {
    const cyl = cylinder(5, 10);
    const faces = getFaces(cyl);
    const lateralFace = faces.find((f) => !isPlanarFace(f));
    expect(lateralFace).toBeDefined();
    if (lateralFace) {
      const wires = getWires(lateralFace);
      expect(wires.length).toBeGreaterThan(0);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by length check
      expect(isPlanarWire(wires[0]!)).toBe(false);
    }
  });

  it('narrows Wire to PlanarWire in type system', () => {
    const w: Wire = unwrap(
      wireLoop([
        line([0, 0, 0], [10, 0, 0]),
        line([10, 0, 0], [10, 10, 0]),
        line([10, 10, 0], [0, 10, 0]),
        line([0, 10, 0], [0, 0, 0]),
      ])
    );
    if (isPlanarWire(w)) {
      const _planar: PlanarWire = w;
      expect(_planar).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// planarWire (smart constructor)
// ---------------------------------------------------------------------------

describe('planarWire', () => {
  it('returns Ok for a planar wire', () => {
    const w = unwrap(
      wireLoop([
        line([0, 0, 0], [10, 0, 0]),
        line([10, 0, 0], [10, 10, 0]),
        line([10, 10, 0], [0, 10, 0]),
        line([0, 10, 0], [0, 0, 0]),
      ])
    );
    const result = planarWire(w);
    expect(isOk(result)).toBe(true);
  });

  // brepkit's makeFace + surfaceType reports 'plane' even for non-coplanar
  // wires — skip on brepkit until its surfaceType classification improves
  it.skipIf(currentKernel === 'brepkit')('returns Err for a non-planar wire', () => {
    // Non-coplanar wire: three corners at z=0, one at z=5
    const w = unwrap(
      wire([
        line([0, 0, 0], [10, 0, 0]),
        line([10, 0, 0], [10, 10, 0]),
        line([10, 10, 0], [5, 5, 5]),
        line([5, 5, 5], [0, 0, 0]),
      ])
    );
    const result = planarWire(w);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toContain('not planar');
    }
  });
});

// ---------------------------------------------------------------------------
// Subtype relationships (compile-time checks verified at runtime)
// ---------------------------------------------------------------------------

describe('subtype relationships', () => {
  it('ClosedWire is assignable to Wire', () => {
    const w = makeClosedWireRaw();
    const result = closedWire(w);
    if (isOk(result)) {
      // This assignment must compile — ClosedWire <: Wire
      const _wire: Wire = result.value;
      expect(_wire).toBeDefined();
    }
  });

  it('OrientedFace is assignable to Face', () => {
    const f = makeFace();
    const result = orientedFace(f);
    if (isOk(result)) {
      const _face: Face = result.value;
      expect(_face).toBeDefined();
    }
  });

  it('ManifoldShell is assignable to Shell', () => {
    const shell = makeManifoldShell();
    const result = manifoldShell(shell);
    if (isOk(result)) {
      const _shell: Shell = result.value;
      expect(_shell).toBeDefined();
    }
  });

  it('ValidSolid is assignable to Solid', () => {
    const s = makeSolid();
    const result = validSolid(s);
    if (isOk(result)) {
      const _solid: Solid = result.value;
      expect(_solid).toBeDefined();
    }
  });

  it('PlanarFace is assignable to Face', () => {
    const f = makeFace();
    const result = planarFace(f);
    if (isOk(result)) {
      const _face: Face = result.value;
      expect(_face).toBeDefined();
    }
  });

  it('PlanarWire is assignable to Wire', () => {
    const w = makeClosedWireRaw();
    const result = planarWire(w);
    if (isOk(result)) {
      const _wire: Wire = result.value;
      expect(_wire).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 3: Consumer-side type enforcement
// ---------------------------------------------------------------------------

describe('consumer type enforcement', () => {
  it('face() accepts ClosedWire and produces OrientedFace', () => {
    const cw = makeClosedWire();
    const result = face(cw);
    expect(isOk(result)).toBe(true);
    const f = unwrap(result);
    // face() returns OrientedFace, which is assignable to Face
    const _asFace: Face = f;
    expect(_asFace).toBeDefined();
  });

  it('extrude() accepts OrientedFace and produces ValidSolid', () => {
    const f = unwrap(face(makeClosedWire()));
    const result = extrude(f, [0, 0, 10]);
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    // extrude returns ValidSolid, assignable to Solid
    const _asSolid: Solid = solid;
    expect(_asSolid).toBeDefined();
  });

  it('ClosedWire → face → extrude pipeline compiles and runs', () => {
    // Full pipeline: Wire → closedWire → face → extrude
    const w = makeClosedWireRaw();
    const cwResult = closedWire(w);
    expect(isOk(cwResult)).toBe(true);
    if (!isOk(cwResult)) return;

    const faceResult = face(cwResult.value);
    expect(isOk(faceResult)).toBe(true);

    const extrudeResult = extrude(unwrap(faceResult), [0, 0, 5]);
    expect(isOk(extrudeResult)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// wireLoop — convenience assembler + closure check
// ---------------------------------------------------------------------------

describe('wireLoop', () => {
  it('returns ClosedWire when edges form a loop', () => {
    const e1 = line([0, 0, 0], [10, 0, 0]);
    const e2 = line([10, 0, 0], [10, 10, 0]);
    const e3 = line([10, 10, 0], [0, 10, 0]);
    const e4 = line([0, 10, 0], [0, 0, 0]);
    const result = wireLoop([e1, e2, e3, e4]);
    expect(isOk(result)).toBe(true);
    // The result is ClosedWire — can pass directly to face()
    const faceResult = face(unwrap(result));
    expect(isOk(faceResult)).toBe(true);
  });

  it('returns error when edges do not form a closed loop', () => {
    const e1 = line([0, 0, 0], [10, 0, 0]);
    const e2 = line([10, 0, 0], [10, 10, 0]);
    const result = wireLoop([e1, e2]);
    expect(isErr(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// solid() returns ValidSolid
// ---------------------------------------------------------------------------

describe('solid() returns ValidSolid', () => {
  it('welding box faces produces ValidSolid', () => {
    const faces = getFaces(box(10, 10, 10));
    const result = solid(faces);
    expect(isOk(result)).toBe(true);
    const s = unwrap(result);
    // solid() returns ValidSolid, assignable to Solid
    const _asSolid: Solid = s;
    expect(_asSolid).toBeDefined();
    expect(isValidSolid(s)).toBe(true);
  });
});
