import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three-stdlib';
import { cubeTiling, type Tet, type Vec3 } from './heroCubeGeometry';

const L = 1;
const TRIS_PER_PIECE = 4;
const VERTS_PER_TRI = 3;
const POSITION_FLOATS = TRIS_PER_PIECE * VERTS_PER_TRI * 3;
const NORMAL_FLOATS = POSITION_FLOATS;

const LIGHT_PALETTE = ['#07606F', '#0C8698', '#03B0AD', '#4ACECC', '#7ADBDD', '#A8E8E8'];
const DARK_PALETTE = ['#0C8698', '#03B0AD', '#4ACECC', '#7ADBDD', '#A8E8E8', '#D0F2F2'];
const LIGHT_EDGE = '#ffffff';
const DARK_EDGE = '#ffffff';
const LIGHT_BG_RIM = '#4ACECC';
const DARK_BG_RIM = '#7ADBDD';
const TET_INSET = 0.04;

interface Piece {
  mesh: Mesh;
  fillMaterial: MeshStandardMaterial;
  edgeMaterial: LineBasicMaterial;
  baseX: number;
  baseY: number;
  baseZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;
}

export interface HeroCubeHandle {
  destroy(): void;
  setColorScheme(dark: boolean): void;
  setHoverPaused(paused: boolean): void;
}

export function mountHeroCube(canvas: HTMLCanvasElement, initialDark: boolean): HeroCubeHandle {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new Scene();

  const camera = new PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(3.2, 2.5, 3.95);
  camera.lookAt(0, 0, 0);

  const keyLight = new DirectionalLight('#ffffff', 1.4);
  keyLight.position.set(-2, 3, 2);
  scene.add(keyLight);

  const fillLight = new DirectionalLight('#bae6fd', 0.5);
  fillLight.position.set(2, -1.5, 1.5);
  scene.add(fillLight);

  const rimLight = new PointLight(LIGHT_BG_RIM, 0.9, 8, 1.6);
  rimLight.position.set(0.5, -0.6, -1.8);
  scene.add(rimLight);

  const ambient = new AmbientLight('#ffffff', 0.35);
  scene.add(ambient);

  const root = new Group();
  scene.add(root);

  const tiling = cubeTiling(L);
  const pieces: Piece[] = tiling.map((tet, i) => {
    const cx = (tet.verts[0][0] + tet.verts[1][0] + tet.verts[2][0] + tet.verts[3][0]) / 4;
    const cy = (tet.verts[0][1] + tet.verts[1][1] + tet.verts[2][1] + tet.verts[3][1]) / 4;
    const cz = (tet.verts[0][2] + tet.verts[1][2] + tet.verts[2][2] + tet.verts[3][2]) / 4;
    const s = 1 - TET_INSET;
    const localVerts = tet.verts.map(
      (v) => [(v[0] - cx) * s, (v[1] - cy) * s, (v[2] - cz) * s] as Vec3
    ) as unknown as readonly [Vec3, Vec3, Vec3, Vec3];
    const localTet: Tet = { verts: localVerts, faces: tet.faces };

    const positions = new Float32Array(POSITION_FLOATS);
    const normals = new Float32Array(NORMAL_FLOATS);
    writeTetMesh(localTet, positions, normals);
    const meshGeom = new BufferGeometry();
    meshGeom.setAttribute('position', new BufferAttribute(positions, 3));
    meshGeom.setAttribute('normal', new BufferAttribute(normals, 3));

    const fillMaterial = new MeshStandardMaterial({
      color: new Color(LIGHT_PALETTE[i]),
      flatShading: true,
      roughness: 0.55,
      metalness: 0.08,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const mesh = new Mesh(meshGeom, fillMaterial);

    const edgeGeom = new EdgesGeometry(meshGeom, 1);
    const edgeMaterial = new LineBasicMaterial({
      color: new Color(LIGHT_EDGE),
      transparent: true,
      opacity: 0.9,
    });
    const edges = new LineSegments(edgeGeom, edgeMaterial);
    mesh.add(edges);

    root.add(mesh);

    const len = Math.hypot(cx, cy, cz) || 1;
    return {
      mesh,
      fillMaterial,
      edgeMaterial,
      baseX: cx,
      baseY: cy,
      baseZ: cz,
      dirX: cx / len,
      dirY: cy / len,
      dirZ: cz / len,
    };
  });

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.rotateSpeed = 0.8;
  controls.target.set(0, 0, 0);

  let rafId = 0;
  let lastT = performance.now();
  let phase = 0.32;
  let yaw = -0.4;
  let hoverPaused = false;
  let rimIntensity = 0.9;

  const BREATHE_PERIOD_SEC = 6.8;
  const ROTATE_PERIOD_SEC = 16;
  const ROTATE_BASE = (Math.PI * 2) / ROTATE_PERIOD_SEC;
  const ROTATE_SLOWDOWN_AT_PEAK = 0.55;
  const SWAY_PERIOD_RATIO = 0.41;
  const SWAY_X_AMPLITUDE = 0.045;
  const SWAY_Z_AMPLITUDE = 0.022;
  const RIM_BASE = 0.9;
  const RIM_PULSE = 0.55;
  const MIN_EXPLODE = 0;
  const MAX_EXPLODE = L * 0.7;

  function applyColorScheme(dark: boolean): void {
    const fills = dark ? DARK_PALETTE : LIGHT_PALETTE;
    const edgeHex = dark ? DARK_EDGE : LIGHT_EDGE;
    const rimHex = dark ? DARK_BG_RIM : LIGHT_BG_RIM;
    pieces.forEach((p, i) => {
      p.fillMaterial.color.set(fills[i] as string);
      p.edgeMaterial.color.set(edgeHex);
    });
    rimLight.color.set(rimHex);
  }

  applyColorScheme(initialDark);

  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);
  resize();

  function tick(now: number): void {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    if (!hoverPaused) {
      phase += dt / BREATHE_PERIOD_SEC;
    }
    const tw = phase - Math.floor(phase);
    const breathe = breatheCurve(tw);

    if (!hoverPaused) {
      const rotSpeed = ROTATE_BASE * (1 - ROTATE_SLOWDOWN_AT_PEAK * breathe);
      yaw += dt * rotSpeed;
    }
    root.rotation.y = yaw;
    const swayPhase = phase * Math.PI * 2 * SWAY_PERIOD_RATIO;
    root.rotation.x = Math.sin(swayPhase) * SWAY_X_AMPLITUDE;
    root.rotation.z = Math.sin(swayPhase * 0.73 + 1.3) * SWAY_Z_AMPLITUDE;

    const targetRim = RIM_BASE + RIM_PULSE * breathe;
    rimIntensity += (targetRim - rimIntensity) * Math.min(1, dt * 6);
    rimLight.intensity = rimIntensity;

    const amount = MIN_EXPLODE + breathe * (MAX_EXPLODE - MIN_EXPLODE);
    for (const p of pieces) {
      p.mesh.position.set(
        p.baseX + p.dirX * amount,
        p.baseY + p.dirY * amount,
        p.baseZ + p.dirZ * amount
      );
    }

    controls.update();
    renderer.render(scene, camera);
  }

  rafId = requestAnimationFrame(tick);

  return {
    destroy(): void {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      controls.dispose();
      pieces.forEach((p) => {
        p.mesh.geometry.dispose();
        p.fillMaterial.dispose();
        p.mesh.children.forEach((child) => {
          if (child instanceof LineSegments) {
            child.geometry.dispose();
          }
        });
        p.edgeMaterial.dispose();
      });
      renderer.dispose();
    },
    setColorScheme: applyColorScheme,
    setHoverPaused(paused: boolean): void {
      hoverPaused = paused;
    },
  };
}

const BREATHE_HOLD_LOW_END = 0.03;
const BREATHE_OPEN_END = 0.42;
const BREATHE_HOLD_HIGH_END = 0.65;
const EASE_OUT_BACK_C1 = 1.5;

function easeOutBack(u: number): number {
  const c3 = EASE_OUT_BACK_C1 + 1;
  const k = u - 1;
  return 1 + c3 * k * k * k + EASE_OUT_BACK_C1 * k * k;
}

function easeInOutSine(u: number): number {
  return -(Math.cos(Math.PI * u) - 1) / 2;
}

function breatheCurve(t: number): number {
  if (t < BREATHE_HOLD_LOW_END) return 0;
  if (t < BREATHE_OPEN_END) {
    const u = (t - BREATHE_HOLD_LOW_END) / (BREATHE_OPEN_END - BREATHE_HOLD_LOW_END);
    return easeOutBack(u);
  }
  if (t < BREATHE_HOLD_HIGH_END) return 1;
  const u = (t - BREATHE_HOLD_HIGH_END) / (1 - BREATHE_HOLD_HIGH_END);
  return 1 - easeInOutSine(u);
}

function writeTetMesh(tet: Tet, positions: Float32Array, normals: Float32Array): void {
  let pi = 0;
  let ni = 0;
  for (const [a, b, c] of tet.faces) {
    const va = tet.verts[a] as Vec3;
    const vb = tet.verts[b] as Vec3;
    const vc = tet.verts[c] as Vec3;
    const ux = vb[0] - va[0];
    const uy = vb[1] - va[1];
    const uz = vb[2] - va[2];
    const wx = vc[0] - va[0];
    const wy = vc[1] - va[1];
    const wz = vc[2] - va[2];
    let nx = uy * wz - uz * wy;
    let ny = uz * wx - ux * wz;
    let nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    positions[pi++] = va[0];
    positions[pi++] = va[1];
    positions[pi++] = va[2];
    positions[pi++] = vb[0];
    positions[pi++] = vb[1];
    positions[pi++] = vb[2];
    positions[pi++] = vc[0];
    positions[pi++] = vc[1];
    positions[pi++] = vc[2];
    for (let k = 0; k < 3; k++) {
      normals[ni++] = nx;
      normals[ni++] = ny;
      normals[ni++] = nz;
    }
  }
}
