export interface FaceGroup {
  start: number;
  count: number;
  faceId: number;
}
export interface EdgeGroup {
  start: number;
  count: number;
  edgeId: number;
}
export interface FaceInfo {
  faceId: number;
  surfaceType: string;
  area: number;
  normal: [number, number, number];
}
export interface EdgeInfo {
  edgeId: number;
  curveType: string;
  length: number;
}
export interface MeshData {
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
  edges: Float32Array;
  faceGroups?: FaceGroup[];
  edgeGroups?: EdgeGroup[];
  faceInfos?: FaceInfo[];
  edgeInfos?: EdgeInfo[];
  color?: string;
}
export type ViewMode = 'solid' | 'wireframe' | 'xray';
export type Projection = 'perspective' | 'orthographic';
export interface ScreenPos {
  x: number;
  y: number;
}
// Camera presets for the standalone viewer's screenshot API. Defined HERE in the shared lib so
// ViewerCanvas can type its `view?` prop without importing the agent's screenshotApi.
export const VIEW_NAMES = ['iso', 'front', 'top', 'right'] as const;
export type ViewName = (typeof VIEW_NAMES)[number];
