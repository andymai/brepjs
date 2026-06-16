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
  Vector3,
  WebGLRenderer,
} from 'three';
import { mergeVertices } from 'three-stdlib';

export interface HeroFrame {
  label: string;
  vol: number;
  tris: number;
  position: string;
  normal: string;
  index: string;
}

export interface HeroFramesData {
  program: string;
  bounds: { lo: number[]; hi: number[] };
  frames: HeroFrame[];
}

export interface CodeCadHandle {
  /** Show frame `i`, cross-fading from whatever is currently shown. */
  showStep(i: number, animate: boolean): void;
  setColorScheme(dark: boolean): void;
  setIdle(on: boolean): void;
  destroy(): void;
}

const EDGE_ANGLE = 24; // EdgesGeometry threshold — keeps B-Rep feature edges, drops facet noise.
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

  const camera = new PerspectiveCamera(34, 1, 0.1, 5000);
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
  const dist = size * 1.95;
  // Lower elevation (~26°) so the Gridfinity stepped feet read, while still
  // showing the open top and one long side.
  const dir = new Vector3(0.82, 0.46, 0.46).normalize();

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
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
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
    const pos = decodeF32(frame.position);
    const idx = decodeU32(frame.index);

    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(pos, 3));
    geom.setAttribute('normal', new BufferAttribute(decodeF32(frame.normal), 3));
    geom.setIndex(new BufferAttribute(idx, 1));
    const m = new Mesh(geom, slot.fill);

    // Weld coincident positions (a position-only copy) so EdgesGeometry shows
    // only true B-Rep feature edges — not the per-triangle tessellation that an
    // unwelded, flat-shaded kernel mesh would otherwise expose.
    const weldSrc = new BufferGeometry();
    weldSrc.setAttribute('position', new BufferAttribute(pos.slice(), 3));
    weldSrc.setIndex(new BufferAttribute(idx.slice(), 1));
    const welded = mergeVertices(weldSrc);
    const edges = new LineSegments(new EdgesGeometry(welded, EDGE_ANGLE), slot.edge);
    weldSrc.dispose();
    welded.dispose();

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
      s.edge.opacity = s.opacity * 0.92;
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
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (reduceMotion) render();
  }
  const reduceMotion = opts.reduceMotion;
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let yaw = 0;
  function placeCamera(): void {
    const offset = dir.clone().multiplyScalar(dist);
    camera.position.copy(offset);
    camera.lookAt(0, 0, 0);
  }
  placeCamera();
  resize();

  function render(): void {
    renderer.render(scene, camera);
  }

  let raf = 0;
  let last = performance.now();
  let idle = !reduceMotion;
  const YAW_RATE = (Math.PI * 2) / 26;

  function tick(now: number): void {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    let changed = false;
    for (const s of slots) {
      if (s.opacity !== s.target) {
        const step = (dt * 1000) / FADE_MS;
        s.opacity += Math.sign(s.target - s.opacity) * step;
        if (Math.abs(s.target - s.opacity) <= step) s.opacity = s.target;
        changed = true;
      }
    }
    if (changed) applyOpacity();

    if (idle) {
      yaw += dt * YAW_RATE;
      root.rotation.y = Math.sin(yaw) * 0.4 - 0.35;
      root.rotation.x = Math.sin(yaw * 0.6) * 0.05;
    }
    render();
  }

  if (reduceMotion) {
    // Static: show the finished part immediately, no animation loop.
    root.rotation.set(0.05, -0.5, 0);
    showStep(data.frames.length - 1, false);
    render();
  } else {
    raf = requestAnimationFrame(tick);
  }

  return {
    showStep,
    setColorScheme: applyColorScheme,
    setIdle(on: boolean): void {
      idle = on && !reduceMotion;
    },
    destroy(): void {
      cancelAnimationFrame(raf);
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
