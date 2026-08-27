import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewerCanvas } from '@/ViewerCanvas.js';
import type { MeshData, ViewName } from '@/types.js';

const mockState = vi.hoisted(() => ({
  camera: undefined as THREE.Camera | undefined,
  canvasCamera: undefined as
    { readonly position?: readonly number[]; readonly up?: readonly number[] } | undefined,
  invalidate: vi.fn(),
}));

vi.mock('@react-three/fiber', () => ({
  Canvas: ({
    camera,
    children,
  }: {
    readonly camera?: { readonly position?: readonly number[]; readonly up?: readonly number[] };
    readonly children?: ReactNode;
  }) => {
    mockState.canvasCamera = camera;
    return <>{children}</>;
  },
  useThree: <Value,>(
    selector: (state: {
      readonly camera: THREE.Camera;
      readonly gl: { localClippingEnabled: boolean };
      readonly invalidate: () => void;
    }) => Value
  ): Value => {
    if (mockState.camera === undefined) throw new Error('mock camera is not ready');
    return selector({
      camera: mockState.camera,
      gl: { localClippingEnabled: false },
      invalidate: mockState.invalidate,
    });
  },
}));

vi.mock('@react-three/drei', () => ({
  OrthographicCamera: () => null,
}));

vi.mock('@/SceneSetup.js', () => ({
  default: () => null,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mockState.camera = new THREE.PerspectiveCamera();
  mockState.canvasCamera = undefined;
  mockState.invalidate.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('ViewerCanvas axes', () => {
  it('uses the brepjs Z-up axis for camera framing and orbit controls', () => {
    renderView('top');

    const camera = requireCamera();
    const topDirection = camera.position.clone().sub(MESH_CENTER).normalize();
    expect(Math.abs(topDirection.z)).toBeGreaterThan(Math.abs(topDirection.y));
    expect(topDirection.z).toBeGreaterThan(0);
    expect(camera.up.toArray()).toEqual([0, 0, 1]);
    expect(mockState.canvasCamera?.up).toEqual([0, 0, 1]);
  });

  it('maps front and right presets onto the model Y and X axes', () => {
    renderView('front');
    const frontDirection = requireCamera().position.clone().sub(MESH_CENTER).normalize();
    expect(Math.abs(frontDirection.y)).toBeGreaterThan(Math.abs(frontDirection.z));

    renderView('right');
    const rightDirection = requireCamera().position.clone().sub(MESH_CENTER).normalize();
    expect(Math.abs(rightDirection.x)).toBeGreaterThan(Math.abs(rightDirection.z));
  });
});

const MESH_CENTER = new THREE.Vector3(12, 2, 2);

function renderView(view: ViewName): void {
  act(() => {
    root.render(<ViewerCanvas data={meshAt(10)} view={view} />);
  });
}

function requireCamera(): THREE.Camera {
  const camera = mockState.camera;
  if (camera === undefined) throw new Error('mock camera is not ready');
  return camera;
}

function meshAt(x: number): MeshData {
  return {
    position: new Float32Array([x, 0, 0, x + 4, 4, 4]),
    normal: new Float32Array([0, 0, 1, 0, 0, 1]),
    index: new Uint32Array([0, 1, 0]),
    edges: new Float32Array([]),
  };
}
