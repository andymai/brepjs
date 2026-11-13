import type { FromWorker, MeshTransfer } from '../workers/workerProtocol';

type EvalPartial = Extract<FromWorker, { type: 'eval-partial' }>;

/** One slot for each shape of a streamed run. A failed shape holds null. */
export type MeshSlots = (MeshTransfer | null)[];

/** The meshes to show for a set of slots: each shape that has one, in shape order. */
export function shownMeshes(slots: MeshSlots): MeshTransfer[] {
  return slots.filter((m): m is MeshTransfer => m !== null);
}

/**
 * Apply one `eval-partial` message to the slots of the current run. `draft`
 * starts the stream; `shape` replaces one slot. Returns null for a `shape`
 * message that has no stream or no slot to go to, so the caller keeps what it shows.
 */
export function applyMeshPartial(slots: MeshSlots | null, msg: EvalPartial): MeshSlots | null {
  if (msg.stage === 'draft') return [...msg.meshes];
  if (slots === null || msg.index < 0 || msg.index >= slots.length) return null;
  const next = [...slots];
  next[msg.index] = msg.mesh;
  return next;
}
