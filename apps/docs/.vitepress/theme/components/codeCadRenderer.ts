import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PointLight,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three-stdlib';

export interface HeroFrame {
  label: string;
  vol: number;
  tris: number;
  position: string;
  normal: string;
  index: string;
  edges: string;
}

export interface HeroFramesData {
  program: string;
  bounds: { lo: number[]; hi: number[] };
  frames: HeroFrame[];
}

export interface CodeCadHandle {
  /** Show frame `i`, cross-fading from whatever is currently shown. */
  showStep(i: number, animate: boolean): void;
  /** Fade everything out (used when the build sequence replays). */
  hide(): void;
  setColorScheme(dark: boolean): void;
  destroy(): void;
}

const FADE_MS = 460;

function decodeF32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}
function decodeU32(b64: string): Uint32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Uint32Array(bytes.buffer);
}

interface Slot {
  group: Group;
  fill: MeshStandardMaterial;
  edge: LineBasicMaterial;
  opacity: number; // current
  target: number; // 0 or 1
}

export function mountCodeCad(
  canvas: HTMLCanvasElement,
  data: HeroFramesData,
  opts: { dark: boolean; reduceMotion: boolean }
): CodeCadHandle {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new Scene();

  // Orthographic, true-isometric view — the CAD convention (no perspective
  // foreshortening). brepjs builds Z-up, so the scene is Z-up too.
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100000);
  camera.up.set(0, 0, 1);
  const { lo, hi } = data.bounds;
  const center = new Vector3(
    ((lo[0] as number) + (hi[0] as number)) / 2,
    ((lo[1] as number) + (hi[1] as number)) / 2,
    ((lo[2] as number) + (hi[2] as number)) / 2
  );
  const size = Math.max(
    (hi[0] as number) - (lo[0] as number),
    (hi[1] as number) - (lo[1] as number),
    (hi[2] as number) - (lo[2] as number)
  );
  // Bounding-sphere radius — used to fit the model to whatever aspect ratio the
  // viewport ends up (portrait on mobile / when the code panel is tall).
  const radius =
    0.5 *
    Math.hypot(
      (hi[0] as number) - (lo[0] as number),
      (hi[1] as number) - (lo[1] as number),
      (hi[2] as number) - (lo[2] as number)
    );
  // True isometric direction (Z-up): azimuth 45°, elevation ~35.26°.
  const dir = new Vector3(1, 1, 1).normalize();

  const root = new Group();
  // Recentre the model on the origin so idle rotation spins about its centre.
  root.position.set(0, 0, 0);
  scene.add(root);

  const keyLight = new DirectionalLight('#ffffff', 1.45);
  keyLight.position.set(-1.6, 2.6, 2.2);
  scene.add(keyLight);
  const fillLight = new DirectionalLight('#bae6fd', 0.5);
  fillLight.position.set(2, -1.2, 1.4);
  scene.add(fillLight);
  const rim = new PointLight('#7ADBDD', 1.0, size * 12, 1.5);
  rim.position.set(center.x + size * 0.4, center.y - size * 0.6, center.z - size * 1.4);
  scene.add(rim);
  scene.add(new AmbientLight('#ffffff', 0.34));

  const FILL_DARK = '#16c0bd';
  const FILL_LIGHT = '#03b0ad';
  const EDGE = '#ffffff';

  function makeSlot(): Slot {
    const group = new Group();
    group.position.copy(center).multiplyScalar(-1);
    const fill = new MeshStandardMaterial({
      color: new Color(opts.dark ? FILL_DARK : FILL_LIGHT),
      roughness: 0.46,
      metalness: 0.12,
      transparent: true,
      opacity: 0,
      // Push faces back so the exact edge lines sit cleanly on top (no z-fight).
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
    });
    const edge = new LineBasicMaterial({ color: new Color(EDGE), transparent: true, opacity: 0 });
    root.add(group);
    return { group, fill, edge, opacity: 0, target: 0 };
  }

  // Two slots so a step can cross-fade into the next.
  const slots: [Slot, Slot] = [makeSlot(), makeSlot()];
  let active = 0; // index of the slot currently presenting

  function clearGroup(g: Group): void {
    for (const c of [...g.children]) {
      g.remove(c);
      if (c instanceof Mesh || c instanceof LineSegments) c.geometry.dispose();
    }
  }

  function buildInto(slot: Slot, frame: HeroFrame): void {
    clearGroup(slot.group);

    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(decodeF32(frame.position), 3));
    geom.setAttribute('normal', new BufferAttribute(decodeF32(frame.normal), 3));
    geom.setIndex(new BufferAttribute(decodeU32(frame.index), 1));
    const m = new Mesh(geom, slot.fill);

    // Exact B-Rep edges from the kernel (LineSegments: 2 verts per segment).
    const edgeGeom = new BufferGeometry();
    edgeGeom.setAttribute('position', new BufferAttribute(decodeF32(frame.edges), 3));
    const edges = new LineSegments(edgeGeom, slot.edge);

    slot.group.add(m);
    slot.group.add(edges);
  }

  let shown = -1;
  function showStep(i: number, animate: boolean): void {
    if (i === shown) return;
    const next = active ^ 1;
    buildInto(slots[next], data.frames[i] as HeroFrame);
    if (animate) {
      slots[next].target = 1;
      slots[active].target = 0;
    } else {
      slots[next].opacity = 1;
      slots[next].target = 1;
      slots[active].opacity = 0;
      slots[active].target = 0;
      applyOpacity();
    }
    active = next;
    shown = i;
  }

  function applyOpacity(): void {
    for (const s of slots) {
      s.fill.opacity = s.opacity;
      s.edge.opacity = s.opacity * 0.95;
      // Hide a fully-faded slot entirely, and let only the (near-)opaque slot
      // write depth — otherwise the two coincident meshes z-fight mid/after fade.
      s.group.visible = s.opacity > 0.01;
      s.fill.depthWrite = s.opacity > 0.98;
    }
  }

  function applyColorScheme(dark: boolean): void {
    const hex = dark ? FILL_DARK : FILL_LIGHT;
    for (const s of slots) s.fill.color.set(hex);
  }

  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    // Fit the bounding sphere into the ortho frustum on whichever axis is
    // tighter, so the bin never crops (incl. portrait viewports on mobile).
    const aspect = w / h;
    const half = radius * 1.18;
    const hw = aspect >= 1 ? half * aspect : half;
    const hh = aspect >= 1 ? half : half / aspect;
    camera.left = -hw;
    camera.right = hw;
    camera.top = hh;
    camera.bottom = -hh;
    camera.updateProjectionMatrix();
    if (reduceMotion) render();
  }
  const reduceMotion = opts.reduceMotion;

  // Initial isometric pose; OrbitControls then lets the viewer orbit and zoom.
  camera.position.copy(dir).multiplyScalar(radius * 6);
  camera.lookAt(0, 0, 0);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0, 0);
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.minZoom = 0.65;
  controls.maxZoom = 3.5;
  controls.enableDamping = !reduceMotion;
  controls.dampingFactor = 0.09;
  controls.rotateSpeed = 0.9;

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  function render(): void {
    renderer.render(scene, camera);
  }

  let raf = 0;
  let last = performance.now();

  function tick(now: number): void {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    let changed = false;
    for (const s of slots) {
      if (s.opacity !== s.target) {
        const stepAmt = (dt * 1000) / FADE_MS;
        s.opacity += Math.sign(s.target - s.opacity) * stepAmt;
        if (Math.abs(s.target - s.opacity) <= stepAmt) s.opacity = s.target;
        changed = true;
      }
    }
    if (changed) applyOpacity();
    controls.update();
    render();
  }

  if (reduceMotion) {
    showStep(data.frames.length - 1, false);
    controls.addEventListener('change', render);
    render();
  } else {
    raf = requestAnimationFrame(tick);
  }

  return {
    showStep,
    hide(): void {
      for (const s of slots) s.target = 0;
      // Clear the guard so a Replay during a step's dwell re-shows step 0
      // instead of being swallowed by `showStep`'s `i === shown` early-out.
      shown = -1;
    },
    setColorScheme: applyColorScheme,
    destroy(): void {
      cancelAnimationFrame(raf);
      controls.dispose();
      ro.disconnect();
      for (const s of slots) {
        clearGroup(s.group);
        s.fill.dispose();
        s.edge.dispose();
      }
      renderer.dispose();
    },
  };
}
