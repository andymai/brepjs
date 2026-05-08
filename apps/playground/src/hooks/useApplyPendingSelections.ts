import { useEffect } from 'react';
import { usePlaygroundStore } from '../stores/playgroundStore';

/**
 * Drains `pendingSharedSelections` (decoded from a `&sel=` URL param) by
 * matching each id against the meshes' faceInfos / edgeInfos and calling
 * `pickSelection` for the hits. Runs once per mesh update — if the user's
 * code edits change face ids, mismatched entries silently drop.
 *
 * Selections from a share URL have no associated cursor position, so we
 * stamp the screenPos at the viewport center; the floating tooltip will
 * still render in a sane place if the user keeps the cursor off the model.
 */
export function useApplyPendingSelections() {
  const meshes = usePlaygroundStore((s) => s.meshes);
  const pending = usePlaygroundStore((s) => s.pendingSharedSelections);

  useEffect(() => {
    if (pending.length === 0 || meshes.length === 0) return;

    const setPending = usePlaygroundStore.getState().setPendingSharedSelections;
    const pickSelection = usePlaygroundStore.getState().pickSelection;

    const screenPos = (() => {
      if (typeof window === 'undefined') return { x: 0, y: 0 };
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    })();

    let hasMatched = false;
    for (const want of pending) {
      let matched = false;
      for (const mesh of meshes) {
        if (want.kind === 'face') {
          const info = mesh.faceInfos?.find((f) => f.faceId === want.id);
          if (info) {
            // Replace on first match, additive after, so the final selection
            // list is exactly the requested set in URL order.
            pickSelection({ kind: 'face', info, screenPos }, hasMatched);
            hasMatched = true;
            matched = true;
            break;
          }
        } else {
          const info = mesh.edgeInfos?.find((e) => e.edgeId === want.id);
          if (info) {
            pickSelection({ kind: 'edge', info, screenPos }, hasMatched);
            hasMatched = true;
            matched = true;
            break;
          }
        }
      }
      // Silent: a stale id (recipient ran modified code) just doesn't restore.
      if (!matched) continue;
    }

    setPending([]);
  }, [meshes, pending]);
}
