export { Renderer, type RendererProps } from './Renderer.js';
export { ViewerErrorBoundary, type ViewerErrorBoundaryProps } from './ErrorBoundary.js';
export { default as EdgeRenderer } from './EdgeRenderer.js';
export { default as SelectionHighlight } from './SelectionHighlight.js';
export { default as SceneSetup } from './SceneSetup.js';
export { ViewerCanvas, type ViewerCanvasProps } from './ViewerCanvas.js';
export { ViewerControls, type ViewerControlsProps } from './ViewerControls.js';
export { ViewerInfoPanel, type ViewerInfoPanelProps } from './ViewerInfoPanel.js';
export { ViewerSelectionPanel, type ViewerSelectionPanelProps } from './ViewerSelectionPanel.js';
export { ViewerSectionControls, type ViewerSectionControlsProps } from './ViewerSectionControls.js';
export * from './types.js';
export {
  buildGeometry,
  buildInstancedMesh,
  instanceMatrix,
  findFaceGroupAt,
  meshSize,
  meshBounds,
  sectionPlane,
  type MeshBounds,
  type SectionAxis,
  type InstancePlacement,
  type InstancedMeshOptions,
} from './geometry.js';
export {
  modelToMeshData,
  findElementAt,
  type ElementMesh,
  type ElementRange,
  type EvaluatedModelLike,
  type EvaluatedNodeLike,
  type ModelMeshResult,
} from './model.js';
export {
  encodePreviewPayload,
  decodePreviewPayload,
  PREVIEW_PAYLOAD_MAGIC,
  PREVIEW_PAYLOAD_VERSION,
  type PreviewModelPayload,
  type PreviewTreeNode,
  type PreviewBounds,
  type PreviewMeasurements,
} from './payload.js';
