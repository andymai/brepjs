import { useCallback, useEffect, useRef } from 'react';
import { Renderer } from 'brepjs-viewer';
import type { MeshData, FaceInfo, ScreenPos } from 'brepjs-viewer';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { useViewerStore } from '../../stores/viewerStore';

export default function ShapeRenderer({ data }: { data: MeshData }) {
  const viewMode = useViewerStore((s) => s.viewMode);
  const pickSelection = usePlaygroundStore((s) => s.pickSelection);
  const setHoverEntity = usePlaygroundStore((s) => s.setHoverEntity);
  const openContextMenu = usePlaygroundStore((s) => s.openContextMenu);
  // Tracks the faceId we last advertised to the global hover store so a
  // pointer-out only nulls hover when *we* are the current target. R3F can
  // fire a sibling's pointerMove before our pointerOut in the same tick;
  // unconditionally nulling here would clobber a freshly-set hover.
  const lastFaceId = useRef<number | null>(null);

  const onFacePick = useCallback(
    (info: FaceInfo, additive: boolean, pos: ScreenPos) =>
      pickSelection({ kind: 'face', info, screenPos: pos }, additive),
    [pickSelection]
  );
  const onFaceContextMenu = useCallback(
    (info: FaceInfo, pos: ScreenPos) =>
      openContextMenu({ kind: 'face', info, screenPos: pos }, pos),
    [openContextMenu]
  );
  const onFaceHover = useCallback(
    (info: FaceInfo | null, pos?: ScreenPos) => {
      if (info && pos) {
        lastFaceId.current = info.faceId;
        setHoverEntity({ kind: 'face', info, screenPos: pos });
        return;
      }
      const cur = usePlaygroundStore.getState().hoverEntity;
      if (cur?.kind === 'face' && cur.info.faceId === lastFaceId.current) {
        setHoverEntity(null);
      }
      lastFaceId.current = null;
    },
    [setHoverEntity]
  );

  // R3F doesn't synthesize pointerout for an object unmounted mid-hover (e.g.
  // a new eval drops the previous mesh). Without this cleanup the hover
  // tooltip would linger pointing at a destroyed mesh.
  useEffect(() => {
    return () => {
      const cur = usePlaygroundStore.getState().hoverEntity;
      if (cur?.kind === 'face' && cur.info.faceId === lastFaceId.current) {
        setHoverEntity(null);
      }
      lastFaceId.current = null;
    };
  }, [setHoverEntity]);

  return (
    <Renderer
      data={data}
      viewMode={viewMode}
      onFacePick={onFacePick}
      onFaceHover={onFaceHover}
      onFaceContextMenu={onFaceContextMenu}
    />
  );
}
