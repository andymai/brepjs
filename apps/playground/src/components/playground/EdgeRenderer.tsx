import { useCallback, useEffect, useRef } from 'react';
import { EdgeRenderer as EdgeRendererBase } from 'brepjs-viewer';
import type { EdgeGroup, EdgeInfo, ScreenPos } from 'brepjs-viewer';
import { usePlaygroundStore } from '../../stores/playgroundStore';

interface Props {
  edges: Float32Array;
  edgeGroups?: EdgeGroup[];
  edgeInfos?: EdgeInfo[];
}

export default function EdgeRenderer({ edges, edgeGroups, edgeInfos }: Props) {
  const pickSelection = usePlaygroundStore((s) => s.pickSelection);
  const setHoverEntity = usePlaygroundStore((s) => s.setHoverEntity);
  const openContextMenu = usePlaygroundStore((s) => s.openContextMenu);
  // pointerOut nulls hover only when *we* are the published target — without
  // this guard an edge leaving intersection while the cursor is still on a
  // face would wipe the freshly-set face hover.
  const lastEdgeId = useRef<number | null>(null);

  const onEdgePick = useCallback(
    (info: EdgeInfo, additive: boolean, pos: ScreenPos) =>
      pickSelection({ kind: 'edge', info, screenPos: pos }, additive),
    [pickSelection]
  );
  const onEdgeContextMenu = useCallback(
    (info: EdgeInfo, pos: ScreenPos) =>
      openContextMenu({ kind: 'edge', info, screenPos: pos }, pos),
    [openContextMenu]
  );
  const onEdgeHover = useCallback(
    (info: EdgeInfo | null, pos?: ScreenPos) => {
      if (info && pos) {
        lastEdgeId.current = info.edgeId;
        setHoverEntity({ kind: 'edge', info, screenPos: pos });
        return;
      }
      const cur = usePlaygroundStore.getState().hoverEntity;
      if (cur?.kind === 'edge' && cur.info.edgeId === lastEdgeId.current) {
        setHoverEntity(null);
      }
      lastEdgeId.current = null;
    },
    [setHoverEntity]
  );

  useEffect(() => {
    return () => {
      const cur = usePlaygroundStore.getState().hoverEntity;
      if (cur?.kind === 'edge' && cur.info.edgeId === lastEdgeId.current) {
        setHoverEntity(null);
      }
      lastEdgeId.current = null;
    };
  }, [setHoverEntity]);

  return (
    <EdgeRendererBase
      edges={edges}
      edgeGroups={edgeGroups}
      edgeInfos={edgeInfos}
      onEdgePick={onEdgePick}
      onEdgeHover={onEdgeHover}
      onEdgeContextMenu={onEdgeContextMenu}
    />
  );
}
