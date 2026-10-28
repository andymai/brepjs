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
  size: { width: 1000, height: 1000 },
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
      readonly size: { width: number; height: number };
    }) => Value
  ): Value => {
    if (mockState.camera === undefined) throw new Error('mock camera is not ready');
    return selector({
      camera: mockState.camera,
      gl: { localClippingEnabled: false },
      invalidate: mockState.invalidate,
      size: mockState.size,
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
  mockState.size = { width: 1000, height: 1000 };
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

describe('ViewerCanvas framing', () => {
  // R3F's default camera is a 75° vertical FOV; a fixed 3x-radius distance fills under half of it.
  it.each([
    ['landscape', 1.6],
    ['square', 1],
    ['portrait', 0.5],
  ])('fills most of the narrower half-FOV with the bounding sphere (%s)', (_label, aspect) => {
    setAspect(aspect);
    renderView('iso');
    expectFitted(aspect);
  });

  it('re-fits on resize without changing the view direction', () => {
    setAspect(1);
    renderView('iso');
    const before = requireCamera().position.clone().sub(MESH_CENTER).normalize();

    setAspect(0.6);
    renderView('iso');
    expectFitted(0.6);
    const after = requireCamera().position.clone().sub(MESH_CENTER).normalize();
    expect(after.angleTo(before)).toBeLessThan(1e-6);
  });

  it('keeps a user zoom across a resize', () => {
    setAspect(1);
    renderView('iso');
    const camera = requireCamera();
    camera.position.sub(MESH_CENTER).multiplyScalar(0.5).add(MESH_CENTER);
    const zoomed = camera.position.distanceTo(MESH_CENTER);

    setAspect(0.6);
    renderView('iso');
    expect(camera.position.distanceTo(MESH_CENTER)).toBeCloseTo(zoomed, 9);
  });
});

// R3F's default camera: 75° vertical FOV. beforeEach's PerspectiveCamera() defaults to 50°, where
// the old fixed 3x-radius distance still fits, so pin the FOV the bug was about.
function setAspect(aspect: number): void {
  mockState.size = { width: aspect * 1000, height: 1000 };
  const persp = mockState.camera as THREE.PerspectiveCamera | undefined;
  if (persp?.isPerspectiveCamera) {
    persp.fov = 75;
    persp.aspect = aspect;
    persp.updateProjectionMatrix();
  } else {
    mockState.camera = new THREE.PerspectiveCamera(75, aspect);
  }
}

function expectFitted(aspect: number): void {
  const camera = requireCamera() as THREE.PerspectiveCamera;
  const sphereAngle = Math.asin(MESH_RADIUS / camera.position.distanceTo(MESH_CENTER));
  const halfV = THREE.MathUtils.degToRad(camera.fov) / 2;
  const halfNarrow = Math.min(halfV, Math.atan(Math.tan(halfV) * aspect));
  expect(sphereAngle).toBeLessThan(halfNarrow);
  expect(Math.tan(sphereAngle) / Math.tan(halfNarrow)).toBeGreaterThan(0.7);
}

const MESH_CENTER = new THREE.Vector3(12, 2, 2);
const MESH_RADIUS = Math.sqrt(3 * 4 * 4) / 2;
// One object for every render: a new mesh would re-run the preset framing on each render,
// which is not what a resize does.
const MESH = meshAt(10);

function renderView(view: ViewName): void {
  act(() => {
    root.render(<ViewerCanvas data={MESH} view={view} />);
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
