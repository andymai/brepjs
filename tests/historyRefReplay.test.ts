/**
 * Lineage refs in the history replay engine (#1606 toponaming + #1645 consumer).
 * A step selects an entity by a lineage ref; when an upstream parameter changes
 * and the model is rebuilt, replay re-resolves the ref against the new input so
 * the operation re-targets the SAME feature. Gated to the OCCT family.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { currentKernelId } from './helpers/kernelDivergences.js';
import {
  box,
  getFaces,
  getHashCode,
  isEdge,
  unwrap,
  createHistory,
  addStep,
  createRegistry,
  registerOperation,
  replayFrom,
  modifyStep,
  assignRoles,
  createEdgeRef,
  type RoleTable,
  type Face,
} from '@/index.js';
import { sharedEdges, verticesOfEdge } from '@/topology/adjacencyFns.js';
import { vertexPosition } from '@/topology/topologyQueryFns.js';

const isOcctFamily = currentKernelId === 'occt' || currentKernelId === 'occt-wasm';

beforeAll(async () => {
  await initKernel();
}, 30000);

function faceForRole(
  shape: ReturnType<typeof box>,
  roles: Map<string, number[]>,
  role: string
): Face {
  const hashes = roles.get(role) ?? [];
  const f = getFaces(shape).find((face) => hashes.includes(getHashCode(face)));
  if (f === undefined) throw new Error(`no face for role ${role}`);
  return f;
}

describe.skipIf(!isOcctFamily)('lineage refs in history replay', () => {
  it("a step's edge ref re-resolves against the rebuilt input on replay", () => {
    // Name the top-front edge on a 20-cube.
    const base = box(20, 20, 20);
    const roles = assignRoles(base, 'box');
    const table: RoleTable = new Map([['box', roles]]);
    const [edge] = sharedEdges(
      faceForRole(base, roles, 'box:top'),
      faceForRole(base, roles, 'box:front')
    );
    if (edge === undefined) throw new Error('no top∩front edge');
    const edgeRef = createEdgeRef('box', edge, base, table);
    if (edgeRef === undefined) throw new Error('could not capture edge ref');

    // A probe op records the top-z of whatever edge it receives in params — which
    // the replay engine resolves from the ref against the step's input shape.
    let capturedTopZ = -1;
    let reg = createRegistry();
    reg = registerOperation(reg, 'box', (_inputs, p) =>
      box(p['x'] as number, p['y'] as number, p['z'] as number)
    );
    reg = registerOperation(reg, 'probe', (inputs, p) => {
      const e = p['edge'];
      if (isEdge(e)) capturedTopZ = Math.max(...verticesOfEdge(e).map((v) => vertexPosition(v)[2]));
      const [first] = inputs;
      if (first === undefined) throw new Error('probe: no input');
      return first;
    });

    let history = createHistory();
    history = addStep(
      history,
      { id: 's0', type: 'box', parameters: { x: 20, y: 20, z: 20 }, inputIds: [], outputId: 'b' },
      base
    );
    history = addStep(
      history,
      { id: 's1', type: 'probe', parameters: { edge: edgeRef }, inputIds: ['b'], outputId: 'p' },
      base
    );

    // Replay as-is: the ref resolves on the original box (top at z=20).
    unwrap(replayFrom(history, 's0', reg));
    expect(capturedTopZ).toBeCloseTo(20, 4);

    // Edit the box height to 40 and replay: the SAME ref re-resolves on the
    // rebuilt, taller box — its top-front edge is now at z=40.
    unwrap(modifyStep(history, 's0', { x: 20, y: 20, z: 40 }, reg));
    expect(capturedTopZ).toBeCloseTo(40, 4);
  });
});
