// This module takes the mesh type as a parameter and imports nothing, so the
// root test typecheck can read it without a build of the viewer package.

/** One slot for each shape of a streamed run. A failed shape holds null. */
export type MeshSlots<M> = (M | null)[];

/** The mesh content of an `eval-partial` worker message. */
export type MeshPartial<M> =
  { stage: 'draft'; meshes: (M | null)[] } | { stage: 'shape'; index: number; mesh: M | null };

/** The meshes to show for a set of slots: each shape that has one, in shape order. */
export function shownMeshes<M>(slots: MeshSlots<M>): M[] {
  return slots.filter((m): m is M => m !== null);
}

/**
 * Apply one `eval-partial` message to the slots of the current run. `draft`
 * starts the stream; `shape` replaces one slot. Returns null for a `shape`
 * message that has no stream or no slot to go to, so the caller keeps what it shows.
 */
export function applyMeshPartial<M>(
  slots: MeshSlots<M> | null,
  msg: MeshPartial<M>
): MeshSlots<M> | null {
  if (msg.stage === 'draft') return [...msg.meshes];
  if (slots === null || msg.index < 0 || msg.index >= slots.length) return null;
  const next = [...slots];
  next[msg.index] = msg.mesh;
  return next;
}
