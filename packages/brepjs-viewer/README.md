# brepjs-viewer

Shared React + [@react-three/fiber](https://github.com/pmndrs/react-three-fiber) renderer for brepjs meshes. Extracted from the playground so both `apps/playground` and the `brepjs-agent` standalone viewer render through one source of truth (no drift).

It is a thin, store-agnostic rendering layer: it takes a `MeshData` and optional selection callbacks — it owns no application state and never imports a consumer.

## Exports

- `Renderer` — draws a `MeshData` mesh; optional `onFacePick`/`onFaceHover`/`onFaceContextMenu` callbacks for selection.
- `ViewerCanvas` — R3F `<Canvas>` wrapper that frames the model bbox, re-points the camera from a `view` prop (`iso`/`front`/`top`/`right`), re-frames on a `fitSignal` bump, and toggles `autoRotate`/`gridVisible`. Flips to `frameloop="always"` while spinning, `demand` otherwise. Fires `onFirstFrame` after first paint. Screenshot-agnostic.
- `ViewerControls` — store-agnostic, fully-controlled toolbar (view-mode, edges, grid, turntable, view presets, fit, screenshot). Each group renders only when its handler is supplied; self-contained inline styles, `className` to restyle.
- `ViewerInfoPanel` — controlled, store-agnostic measurements readout (bbox size, volume, area, triangles, validity); renders only the rows whose values are supplied.
- `EdgeRenderer`, `SelectionHighlight`, `SceneSetup` — companion components.
- `buildGeometry`, `findFaceGroupAt`, `meshSize` — pure helpers (`meshSize` returns mesh bbox extents).
- Types: `MeshData`, `FaceGroup`, `FaceInfo`, `EdgeGroup`, `EdgeInfo`, `ViewMode`, `ViewName`, `VIEW_NAMES`.

## Peer dependencies

`react`, `react-dom`, `three`, `@react-three/fiber`, `@react-three/drei` — pinned to the versions `apps/playground` uses so a single copy resolves across the monorepo.

## Usage

```tsx
import { ViewerCanvas, Renderer } from 'brepjs-viewer';

<ViewerCanvas data={meshData} view="iso">
  <Renderer data={meshData} viewMode="solid" />
</ViewerCanvas>;
```
