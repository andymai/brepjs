import { beforeAll, describe, expect, it } from 'vitest';
import { initKernel } from './setup.js';
import { multiSectionSweep } from '../src/index.js';
import type { Wire } from '../src/index.js';
import { getKernel } from '../src/kernel/index.js';
import { castShape } from '../src/core/shapeTypes.js';
import { DisposalScope } from '../src/core/disposal.js';
import { isOk, isErr, unwrap, unwrapErr } from '../src/core/result.js';

function makeCircleWire(radius: number, z: number = 0): Wire {
  const oc = getKernel().oc;
  const scope = new DisposalScope();
  const ax = scope.register(
    new oc.gp_Ax2_3(
      scope.register(new oc.gp_Pnt_3(0, 0, z)),
      scope.register(new oc.gp_Dir_4(0, 0, 1))
    )
  );
  const circ = scope.register(new oc.gp_Circ_2(ax, radius));
  const edgeMaker = scope.register(new oc.BRepBuilderAPI_MakeEdge_8(circ));
  const wireMaker = scope.register(new oc.BRepBuilderAPI_MakeWire_2(edgeMaker.Edge()));
  return castShape(wireMaker.Wire()) as Wire;
}

function makeLineSpine(length: number): Wire {
  const oc = getKernel().oc;
  const scope = new DisposalScope();
  const p1 = scope.register(new oc.gp_Pnt_3(0, 0, 0));
  const p2 = scope.register(new oc.gp_Pnt_3(0, 0, length));
  const edgeMaker = scope.register(new oc.BRepBuilderAPI_MakeEdge_3(p1, p2));
  const wireMaker = scope.register(new oc.BRepBuilderAPI_MakeWire_2(edgeMaker.Edge()));
  return castShape(wireMaker.Wire()) as Wire;
}

beforeAll(async () => {
  await initKernel();
});

describe('multiSectionSweep', () => {
  it('sweeps two circles along a straight line producing a solid with positive volume', () => {
    const spine = makeLineSpine(50);
    const circle1 = makeCircleWire(10);
    const circle2 = makeCircleWire(5);

    const result = multiSectionSweep([{ wire: circle1 }, { wire: circle2 }], spine, {
      solid: true,
    });

    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);

    // Compute volume via GProp_GProps
    const oc = getKernel().oc;
    const scope = new DisposalScope();
    const props = scope.register(new oc.GProp_GProps_1());
    oc.BRepGProp.VolumeProperties_1(shape.wrapped, props, false, false, false);
    const volume = props.Mass();
    expect(volume).toBeGreaterThan(0);
  });

  it('returns error for fewer than 2 sections', () => {
    const spine = makeLineSpine(50);
    const circle1 = makeCircleWire(10);

    const result = multiSectionSweep([{ wire: circle1 }], spine);

    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('MULTI_SWEEP_INSUFFICIENT_SECTIONS');
  });
});
