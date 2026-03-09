import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
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
  unwrap,
  isClosedWire,
  isOrientedFace,
  isManifoldShell,
  isValidSolid,
  closedWire,
  orientedFace,
  manifoldShell,
  validSolid,
  type ClosedWire,
  type OrientedFace,
  type ManifoldShell,
  type ValidSolid,
  type Wire,
  type Face,
  type Shell,
  type Solid,
} from '../src/index.js';

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
  if (!result.valid) throw new Error('Expected closed wire');
  return result.shape;
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
  it('returns valid=true for a closed wire', () => {
    const w = makeClosedWireRaw();
    const result = closedWire(w);
    expect(result.valid).toBe(true);
    if (result.valid) {
      // result.shape is ClosedWire — assignable to Wire
      const _asWire: Wire = result.shape;
      expect(_asWire).toBeDefined();
    }
  });

  it('returns valid=false for an open wire with a reason', () => {
    const w = makeOpenWire();
    const result = closedWire(w);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('not closed');
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
  it('returns valid=true for a valid face', () => {
    const f = makeFace();
    const result = orientedFace(f);
    expect(result.valid).toBe(true);
    if (result.valid) {
      const _asFace: Face = result.shape;
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
  it('returns valid=true for a watertight shell', () => {
    const shell = makeManifoldShell();
    const result = manifoldShell(shell);
    expect(result.valid).toBe(true);
    if (result.valid) {
      const _asShell: Shell = result.shape;
      expect(_asShell).toBeDefined();
    }
  });

  it('returns valid=false for an open shell', () => {
    const shell = makeOpenShell();
    const result = manifoldShell(shell);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('not manifold');
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
  it('returns valid=true for a box solid', () => {
    const s = makeSolid();
    const result = validSolid(s);
    expect(result.valid).toBe(true);
    if (result.valid) {
      const _asSolid: Solid = result.shape;
      expect(_asSolid).toBeDefined();
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
    if (result.valid) {
      // This assignment must compile — ClosedWire <: Wire
      const _wire: Wire = result.shape;
      expect(_wire).toBeDefined();
    }
  });

  it('OrientedFace is assignable to Face', () => {
    const f = makeFace();
    const result = orientedFace(f);
    if (result.valid) {
      const _face: Face = result.shape;
      expect(_face).toBeDefined();
    }
  });

  it('ManifoldShell is assignable to Shell', () => {
    const shell = makeManifoldShell();
    const result = manifoldShell(shell);
    if (result.valid) {
      const _shell: Shell = result.shape;
      expect(_shell).toBeDefined();
    }
  });

  it('ValidSolid is assignable to Solid', () => {
    const s = makeSolid();
    const result = validSolid(s);
    if (result.valid) {
      const _solid: Solid = result.shape;
      expect(_solid).toBeDefined();
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
    expect(cwResult.valid).toBe(true);
    if (!cwResult.valid) return;

    const faceResult = face(cwResult.shape);
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
