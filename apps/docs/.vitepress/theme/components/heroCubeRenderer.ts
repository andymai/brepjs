import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
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
import { cubeTiling, explodeTets, type Tet, type Vec3 } from './heroCubeGeometry';

const L = 1;
const PIECE_COUNT = 6;
const TRIS_PER_PIECE = 4;
const VERTS_PER_TRI = 3;
const POSITION_FLOATS = TRIS_PER_PIECE * VERTS_PER_TRI * 3;
const NORMAL_FLOATS = POSITION_FLOATS;
const EDGE_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];
const EDGE_FLOATS = EDGE_PAIRS.length * 2 * 3;

interface PieceObjects {
  mesh: Mesh;
  edges: LineSegments;
  positions: Float32Array;
  normals: Float32Array;
  edgePositions: Float32Array;
  fillMaterial: MeshStandardMaterial;
}

const LIGHT_PALETTE = ['#07606F', '#0C8698', '#03B0AD', '#4ACECC', '#7ADBDD', '#A8E8E8'];

const DARK_PALETTE = ['#0C8698', '#03B0AD', '#4ACECC', '#7ADBDD', '#A8E8E8', '#D0F2F2'];

const LIGHT_EDGE = '#ffffff';
const DARK_EDGE = '#ffffff';
const LIGHT_BG_RIM = '#4ACECC';
const DARK_BG_RIM = '#7ADBDD';

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
  camera.position.set(1.8, 1.4, 2.2);
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
  root.position.set(-L / 2, -L / 2, -L / 2);
  scene.add(root);

  const tiling = cubeTiling(L);
  const pieces: PieceObjects[] = tiling.map((tet, i) => {
    const positions = new Float32Array(POSITION_FLOATS);
    const normals = new Float32Array(NORMAL_FLOATS);
    writeTetMesh(tet, positions, normals);
    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(positions, 3));
    geom.setAttribute('normal', new BufferAttribute(normals, 3));
    const fillMaterial = new MeshStandardMaterial({
      color: new Color(LIGHT_PALETTE[i]),
      flatShading: true,
      roughness: 0.55,
      metalness: 0.08,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const mesh = new Mesh(geom, fillMaterial);
    root.add(mesh);

    const edgePositions = new Float32Array(EDGE_FLOATS);
    writeTetEdges(tet, edgePositions);
    const edgeGeom = new BufferGeometry();
    edgeGeom.setAttribute('position', new Float32BufferAttribute(edgePositions, 3));
    const edgeMat = new LineBasicMaterial({
      color: new Color(LIGHT_EDGE),
      transparent: true,
      opacity: 0.85,
    });
    const edges = new LineSegments(edgeGeom, edgeMat);
    root.add(edges);

    return { mesh, edges, positions, normals, edgePositions, fillMaterial };
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
  let phase = 0;
  let yaw = 0;
  let hoverPaused = false;
  let lastBreathe = 0;

  const ROTATE_SPEED = (Math.PI * 2) / 12;
  const BREATHE_SPEED = (Math.PI * 2) / 6;
  const MAX_EXPLODE = L * 1.1;

  function applyColorScheme(dark: boolean): void {
    const fills = dark ? DARK_PALETTE : LIGHT_PALETTE;
    const edgeHex = dark ? DARK_EDGE : LIGHT_EDGE;
    const rimHex = dark ? DARK_BG_RIM : LIGHT_BG_RIM;
    pieces.forEach((p, i) => {
      p.fillMaterial.color.set(fills[i] as string);
      const edgeMat = p.edges.material as LineBasicMaterial;
      edgeMat.color.set(edgeHex);
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
      phase += dt * BREATHE_SPEED;
    }
    yaw += dt * ROTATE_SPEED;
    root.rotation.y = yaw;

    const breathe = 0.5 - 0.5 * Math.cos(phase);
    if (Math.abs(breathe - lastBreathe) > 1e-4 || hoverPaused === false) {
      const amount = breathe * MAX_EXPLODE;
      const exploded = explodeTets(tiling, amount);
      for (let i = 0; i < PIECE_COUNT; i++) {
        const piece = pieces[i] as PieceObjects;
        const tet = exploded[i] as Tet;
        writeTetMesh(tet, piece.positions, piece.normals);
        writeTetEdges(tet, piece.edgePositions);
        const pos = piece.mesh.geometry.getAttribute('position');
        const nrm = piece.mesh.geometry.getAttribute('normal');
        (pos as BufferAttribute).needsUpdate = true;
        (nrm as BufferAttribute).needsUpdate = true;
        const epos = piece.edges.geometry.getAttribute('position');
        (epos as BufferAttribute).needsUpdate = true;
      }
      lastBreathe = breathe;
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
        p.edges.geometry.dispose();
        (p.edges.material as LineBasicMaterial).dispose();
      });
      renderer.dispose();
    },
    setColorScheme: applyColorScheme,
    setHoverPaused(paused: boolean): void {
      hoverPaused = paused;
    },
  };
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

function writeTetEdges(tet: Tet, out: Float32Array): void {
  let i = 0;
  for (const [a, b] of EDGE_PAIRS) {
    const va = tet.verts[a] as Vec3;
    const vb = tet.verts[b] as Vec3;
    out[i++] = va[0];
    out[i++] = va[1];
    out[i++] = va[2];
    out[i++] = vb[0];
    out[i++] = vb[1];
    out[i++] = vb[2];
  }
}
