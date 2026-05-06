<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, useTemplateRef } from 'vue';

// ---- Animation cycle ---------------------------------------------------
const CYCLE_MS = 9000;
const t = ref(0);
const reduceMotion = ref(false);
const onScreen = ref(true);
const root = useTemplateRef<HTMLDivElement>('root');
let raf = 0;
let started = 0;
let pausedAt = 0;
let pauseAccum = 0;

const tick = (now: number) => {
  if (!onScreen.value) {
    pausedAt ||= now;
    raf = requestAnimationFrame(tick);
    return;
  }
  if (pausedAt) {
    pauseAccum += now - pausedAt;
    pausedAt = 0;
  }
  t.value = (((now - started - pauseAccum) % CYCLE_MS) / CYCLE_MS + 1) % 1;
  raf = requestAnimationFrame(tick);
};

onMounted(() => {
  if (typeof window === 'undefined') return;
  reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion.value) {
    t.value = 0.86;
    return;
  }
  started = performance.now();
  raf = requestAnimationFrame(tick);
  if (root.value) {
    const io = new IntersectionObserver((entries) => {
      onScreen.value = entries[0]?.isIntersecting ?? true;
    });
    io.observe(root.value);
    onUnmounted(() => io.disconnect());
  }
});

onUnmounted(() => cancelAnimationFrame(raf));

// ---- Easing & stage helpers --------------------------------------------
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
const stage = (a: number, b: number) => ease((t.value - a) / (b - a));
const fadeOut = (a: number, dur = 0.05) => 1 - ease((t.value - a) / dur);

// ---- Phase windows -----------------------------------------------------
const SKETCH_DRAW = [0.04, 0.26] as const;
const SKETCH_DIMS_IN = [0.24, 0.36] as const;
const TILT = [0.42, 0.6] as const;
const EXTRUDE = [0.5, 0.72] as const;
const ANALYSIS_IN = [0.7, 0.84] as const;
const FADE = [0.93, 1.0] as const;

// ---- Geometry ----------------------------------------------------------
// Profile in world units (mm). Rectangle 4.0 × 2.4 with circular hole r=0.55 at (2.7, 1.2).
const W = 4.0;
const D = 2.4;
const HX = 2.7;
const HY = 1.2;
const HR = 0.55;
const H = 1.4; // extrude height

// Camera params
const CX = 200;
const CY = 200;
const SCALE = 38;

// Projection: blend top-down (k=0) → isometric (k=1)
type Pt = { x: number; y: number };
const project = (x: number, y: number, z: number, k: number): Pt => {
  const cx0 = x - W / 2;
  const cy0 = y - D / 2;
  const txTop = cx0;
  const tyTop = cy0;
  const txIso = (cx0 - cy0) * 0.866;
  const tyIso = (cx0 + cy0) * 0.5 - z;
  return {
    x: CX + (txTop * (1 - k) + txIso * k) * SCALE,
    y: CY + (tyTop * (1 - k) + tyIso * k) * SCALE,
  };
};

// ---- Reactive projection state ----------------------------------------
const tilt = computed(() => stage(TILT[0], TILT[1]));
const extrudeT = computed(() => stage(EXTRUDE[0], EXTRUDE[1]));
const ext = computed(() => extrudeT.value * H);

// 8 corners + hole top/bottom
const v = computed(() => {
  const k = tilt.value;
  const e = ext.value;
  return {
    B0: project(0, 0, 0, k),
    B1: project(W, 0, 0, k),
    B2: project(W, D, 0, k),
    B3: project(0, D, 0, k),
    T0: project(0, 0, e, k),
    T1: project(W, 0, e, k),
    T2: project(W, D, e, k),
    T3: project(0, D, e, k),
  };
});

const pathPoly = (...pts: Pt[]) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') + 'Z';

// Hole: a circle in the xy-plane at z. In iso, projects to an ellipse with
// rx = r·s·√(2)·cos30 and ry = r·s·√(2)·sin30 = r·s·√2·0.5.
// We compute axis-aligned ellipse params blended with the top-down circle.
const holeRx = computed(() => {
  const k = tilt.value;
  const rTop = HR * SCALE;
  const rIso = HR * SCALE * 0.866 * Math.SQRT2;
  return rTop * (1 - k) + rIso * k;
});
const holeRy = computed(() => {
  const k = tilt.value;
  const rTop = HR * SCALE;
  const rIso = HR * SCALE * 0.5 * Math.SQRT2;
  return rTop * (1 - k) + rIso * k;
});
const holeCenterTop = computed(() => project(HX, HY, ext.value, tilt.value));
const holeCenterBot = computed(() => project(HX, HY, 0, tilt.value));

// ---- Stage opacities ---------------------------------------------------
// Sketch path "draw-on" via stroke-dashoffset proxy
const sketchDraw = computed(() => stage(SKETCH_DRAW[0], SKETCH_DRAW[1]));
const sketchPathLen = 2 * (W + D) * SCALE; // rectangle perimeter, in screen units
const sketchDashOffset = computed(() => (1 - sketchDraw.value) * sketchPathLen);
const holeDraw = computed(() => stage(SKETCH_DRAW[0] + 0.1, SKETCH_DRAW[1] + 0.02));

// 2D-only elements: visible when tilt is 0
const flatAlpha = computed(() => {
  const f = 1 - stage(TILT[0] - 0.04, TILT[0] + 0.06);
  return f * fadeOut(FADE[0], 0.05);
});

// Sketch dimension annotations
const dimsAlpha = computed(() => {
  const inA = stage(SKETCH_DIMS_IN[0], SKETCH_DIMS_IN[1]);
  const outA = 1 - stage(TILT[0] - 0.02, TILT[0] + 0.08);
  return inA * outA;
});

// 3D-only elements (side faces, top face) visible when tilt > 0
const solidAlpha = computed(() => {
  return stage(TILT[0], TILT[0] + 0.08) * fadeOut(FADE[0], 0.05);
});

// Analysis callouts
const analysisAlpha = computed(() => {
  return stage(ANALYSIS_IN[0], ANALYSIS_IN[1]) * fadeOut(FADE[0], 0.05);
});

const gridAlpha = computed(() => {
  const inA = stage(0.0, 0.06);
  const outA = 1 - stage(TILT[0] - 0.04, TILT[0] + 0.06);
  return inA * outA * 0.55;
});

// Volume / surface area (precomputed for our part)
// Volume = (W*D - π*HR²) * H  [in mm³, treating units as mm at scale 10]
const volume = (W * D * 100 - Math.PI * HR * HR * 100) * H * 10; // ≈ 12,110 mm³
const surface = (() => {
  const top = (W * D - Math.PI * HR * HR) * 100;
  const bottom = top;
  const sides = 2 * (W + D) * 10 * H * 10;
  const hole = 2 * Math.PI * HR * 10 * H * 10;
  return top + bottom + sides + hole;
})();
const volStr = `${Math.round(volume).toLocaleString()} mm³`;
const surfStr = `${Math.round(surface).toLocaleString()} mm²`;

// ---- Hidden / visible edges in iso phase ------------------------------
// Visible faces in our iso convention: top (z=ext), x=W, y=D
// Hidden corner: B0; hidden edges: B0-B1, B0-B3, B0-T0
const polyTop = computed(() => {
  const { T0, T1, T2, T3 } = v.value;
  return pathPoly(T0, T1, T2, T3);
});
const polyRight = computed(() => {
  const { T1, T2, B2, B1 } = v.value;
  return pathPoly(T1, T2, B2, B1);
});
const polyLeft = computed(() => {
  const { T2, T3, B3, B2 } = v.value;
  return pathPoly(T2, T3, B3, B2);
});

// 2D sketch profile path
const sketchProfile = computed(() => {
  const { B0, B1, B2, B3 } = v.value;
  return pathPoly(B0, B1, B2, B3);
});

// Tick offset for ext labels — when extruded
const extDimAlpha = computed(() => stage(EXTRUDE[0] + 0.05, EXTRUDE[1] + 0.04) * fadeOut(FADE[0], 0.05));

// Label anchors on the part for leader lines
const anchorTop = computed(() => v.value.T0);
const anchorRight = computed(() => v.value.T1);
const anchorBackBottom = computed(() => v.value.B2);

// Fixed callout positions (within 400x400 viewBox) so leaders don't clip
const calloutVolume = { x: 20, y: 40, w: 152, h: 36 };
const calloutSurface = { x: 248, y: 40, w: 132, h: 36 };
const calloutTopology = { x: 124, y: 350, w: 152, h: 36 };

// ---- Pulse on the "valid" badge ---------------------------------------
const validPulse = computed(() => {
  const aIn = stage(ANALYSIS_IN[1] - 0.04, ANALYSIS_IN[1] + 0.02);
  return aIn;
});
</script>

<template>
  <div class="hero-anim" ref="root">
    <svg viewBox="0 0 400 400" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Animated demo: 2D sketch extruded into a 3D solid with dimension and volume analysis">
      <defs>
        <linearGradient id="ha-top" x1="20%" y1="0%" x2="85%" y2="100%">
          <stop offset="0%" stop-color="#a5f3fc" />
          <stop offset="55%" stop-color="#38bdf8" />
          <stop offset="100%" stop-color="#0e7490" />
        </linearGradient>
        <linearGradient id="ha-right" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#3b82f6" />
          <stop offset="100%" stop-color="#1e3a8a" />
        </linearGradient>
        <linearGradient id="ha-left" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#1d4ed8" />
          <stop offset="100%" stop-color="#0c1f55" />
        </linearGradient>
        <radialGradient id="ha-hole" cx="42%" cy="38%" r="65%">
          <stop offset="0%" stop-color="#020617" />
          <stop offset="80%" stop-color="#0b1330" />
          <stop offset="100%" stop-color="#1e293b" />
        </radialGradient>
        <radialGradient id="ha-glow" cx="50%" cy="50%" r="62%">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.18" />
          <stop offset="60%" stop-color="#06b6d4" stop-opacity="0.05" />
          <stop offset="100%" stop-color="#06b6d4" stop-opacity="0" />
        </radialGradient>
        <pattern id="ha-grid" x="0" y="0" width="19" height="19" patternUnits="userSpaceOnUse">
          <circle cx="0" cy="0" r="1" fill="#38bdf8" fill-opacity="0.5" />
        </pattern>
        <filter id="ha-soft" x="-20%" y="-20%" width="140%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2.6" />
          <feOffset dx="0" dy="3" />
          <feComponentTransfer><feFuncA type="linear" slope="0.32" /></feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <!-- Background glow -->
      <rect width="400" height="400" fill="url(#ha-glow)" />

      <!-- Sketch grid (2D-only) -->
      <g :opacity="gridAlpha">
        <rect x="40" y="40" width="320" height="320" fill="url(#ha-grid)" />
        <!-- Origin axes -->
        <line x1="200" y1="60" x2="200" y2="340" stroke="#38bdf8" stroke-opacity="0.18" stroke-width="1" />
        <line x1="60" y1="200" x2="340" y2="200" stroke="#38bdf8" stroke-opacity="0.18" stroke-width="1" />
        <!-- Origin marker -->
        <g transform="translate(124 224)">
          <circle r="3.5" fill="none" stroke="#38bdf8" stroke-opacity="0.8" stroke-width="1" />
          <line x1="-6" y1="0" x2="6" y2="0" stroke="#38bdf8" stroke-opacity="0.8" stroke-width="1" />
          <line x1="0" y1="-6" x2="0" y2="6" stroke="#38bdf8" stroke-opacity="0.8" stroke-width="1" />
        </g>
      </g>

      <!-- =========== 3D solid (iso phase) =========== -->
      <g :opacity="solidAlpha" filter="url(#ha-soft)">
        <!-- Hidden edges (dashed) — drawn behind -->
        <g stroke="#7dd3fc" stroke-width="1.1" stroke-dasharray="3 3" stroke-opacity="0.32" fill="none" stroke-linecap="round">
          <line :x1="v.B0.x" :y1="v.B0.y" :x2="v.B1.x" :y2="v.B1.y" />
          <line :x1="v.B0.x" :y1="v.B0.y" :x2="v.B3.x" :y2="v.B3.y" />
          <line :x1="v.B0.x" :y1="v.B0.y" :x2="v.T0.x" :y2="v.T0.y" />
        </g>

        <!-- Faces back-to-front -->
        <path :d="polyLeft" fill="url(#ha-left)" stroke="#0a1530" stroke-width="1.4" stroke-linejoin="round" />
        <path :d="polyRight" fill="url(#ha-right)" stroke="#0a1530" stroke-width="1.4" stroke-linejoin="round" />
        <path :d="polyTop" fill="url(#ha-top)" stroke="#0a1530" stroke-width="1.4" stroke-linejoin="round" />

        <!-- Hole (top opening) -->
        <ellipse :cx="holeCenterTop.x" :cy="holeCenterTop.y" :rx="holeRx" :ry="holeRy" fill="url(#ha-hole)" stroke="#0a1530" stroke-width="1.2" />
        <!-- Hole bottom (visible only as a thin arc through the floor) -->
        <ellipse :cx="holeCenterBot.x" :cy="holeCenterBot.y" :rx="holeRx" :ry="holeRy" fill="none" stroke="#0a1530" stroke-width="0.8" stroke-opacity="0.55" stroke-dasharray="2 2" />
        <!-- Inner rim hint -->
        <ellipse :cx="holeCenterTop.x" :cy="holeCenterTop.y + 1.5" :rx="holeRx - 2.5" :ry="holeRy - 1.4" fill="none" stroke="#0ea5e9" stroke-width="0.7" stroke-opacity="0.55" />

        <!-- Crisp visible edges -->
        <g stroke="#0a1530" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" fill="none">
          <path :d="polyTop" />
          <line :x1="v.T1.x" :y1="v.T1.y" :x2="v.B1.x" :y2="v.B1.y" />
          <line :x1="v.T2.x" :y1="v.T2.y" :x2="v.B2.x" :y2="v.B2.y" />
          <line :x1="v.T3.x" :y1="v.T3.y" :x2="v.B3.x" :y2="v.B3.y" />
          <line :x1="v.B1.x" :y1="v.B1.y" :x2="v.B2.x" :y2="v.B2.y" />
          <line :x1="v.B3.x" :y1="v.B3.y" :x2="v.B2.x" :y2="v.B2.y" />
        </g>

        <!-- Vertex dots (visible) -->
        <g fill="#bae6fd" stroke="#0a1530" stroke-width="1.1">
          <circle :cx="v.T0.x" :cy="v.T0.y" r="2.8" />
          <circle :cx="v.T1.x" :cy="v.T1.y" r="2.8" />
          <circle :cx="v.T2.x" :cy="v.T2.y" r="2.8" />
          <circle :cx="v.T3.x" :cy="v.T3.y" r="2.8" />
          <circle :cx="v.B1.x" :cy="v.B1.y" r="2.8" />
          <circle :cx="v.B2.x" :cy="v.B2.y" r="2.8" />
          <circle :cx="v.B3.x" :cy="v.B3.y" r="2.8" />
        </g>
      </g>

      <!-- =========== 2D sketch profile (always visible during sketch + transitions during tilt) =========== -->
      <g :opacity="flatAlpha">
        <!-- Profile fill, faint -->
        <path :d="sketchProfile" fill="#38bdf8" fill-opacity="0.06" />
        <!-- Profile path drawing -->
        <path
          :d="sketchProfile"
          fill="none"
          stroke="#38bdf8"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
          :stroke-dasharray="sketchPathLen"
          :stroke-dashoffset="sketchDashOffset"
        />
        <!-- Hole (sketch) -->
        <circle
          :cx="holeCenterTop.x"
          :cy="holeCenterTop.y"
          :r="holeRx"
          fill="none"
          stroke="#38bdf8"
          stroke-width="2"
          :opacity="holeDraw"
        />
        <!-- Hole crosshair -->
        <g :opacity="holeDraw" stroke="#38bdf8" stroke-width="1" stroke-opacity="0.8">
          <line :x1="holeCenterTop.x - 7" :y1="holeCenterTop.y" :x2="holeCenterTop.x + 7" :y2="holeCenterTop.y" />
          <line :x1="holeCenterTop.x" :y1="holeCenterTop.y - 7" :x2="holeCenterTop.x" :y2="holeCenterTop.y + 7" />
        </g>
        <!-- Vertex dots (sketch) -->
        <g fill="#bae6fd" stroke="#0c1f55" stroke-width="1" :opacity="sketchDraw">
          <circle :cx="v.B0.x" :cy="v.B0.y" r="2.6" />
          <circle :cx="v.B1.x" :cy="v.B1.y" r="2.6" />
          <circle :cx="v.B2.x" :cy="v.B2.y" r="2.6" />
          <circle :cx="v.B3.x" :cy="v.B3.y" r="2.6" />
        </g>
      </g>

      <!-- =========== 2D dimensions =========== -->
      <g :opacity="dimsAlpha" font-family="'JetBrains Mono', ui-monospace, monospace" font-size="11" fill="#bae6fd">
        <!-- Width: 40mm (top of profile) -->
        <g stroke="#bae6fd" stroke-width="1" stroke-opacity="0.6">
          <line :x1="v.B0.x" :y1="v.B0.y - 6" :x2="v.B0.x" :y2="v.B0.y - 22" />
          <line :x1="v.B1.x" :y1="v.B1.y - 6" :x2="v.B1.x" :y2="v.B1.y - 22" />
          <line :x1="v.B0.x" :y1="v.B0.y - 18" :x2="v.B1.x" :y2="v.B1.y - 18" />
          <line :x1="v.B0.x" :y1="v.B0.y - 14" :x2="v.B0.x" :y2="v.B0.y - 22" />
          <line :x1="v.B1.x" :y1="v.B1.y - 14" :x2="v.B1.x" :y2="v.B1.y - 22" />
        </g>
        <rect :x="(v.B0.x + v.B1.x) / 2 - 22" :y="v.B0.y - 27" width="44" height="14" fill="#0c0e1a" rx="3" stroke="#1e3a8a" stroke-width="0.5" />
        <text :x="(v.B0.x + v.B1.x) / 2" :y="v.B0.y - 17" text-anchor="middle">40 mm</text>

        <!-- Depth: 24mm (right side of profile) -->
        <g stroke="#bae6fd" stroke-width="1" stroke-opacity="0.6">
          <line :x1="v.B1.x + 6" :y1="v.B1.y" :x2="v.B1.x + 22" :y2="v.B1.y" />
          <line :x1="v.B2.x + 6" :y1="v.B2.y" :x2="v.B2.x + 22" :y2="v.B2.y" />
          <line :x1="v.B1.x + 18" :y1="v.B1.y" :x2="v.B2.x + 18" :y2="v.B2.y" />
        </g>
        <rect :x="v.B1.x + 24" :y="(v.B1.y + v.B2.y) / 2 - 8" width="44" height="14" fill="#0c0e1a" rx="3" stroke="#1e3a8a" stroke-width="0.5" />
        <text :x="v.B1.x + 46" :y="(v.B1.y + v.B2.y) / 2 + 2" text-anchor="middle">24 mm</text>

        <!-- Hole diameter: Ø11mm (leader line) -->
        <g stroke="#bae6fd" stroke-width="1" stroke-opacity="0.7">
          <line :x1="holeCenterTop.x + 14" :y1="holeCenterTop.y - 14" :x2="holeCenterTop.x + 36" :y2="holeCenterTop.y - 30" />
        </g>
        <rect :x="holeCenterTop.x + 36" :y="holeCenterTop.y - 38" width="42" height="14" fill="#0c0e1a" rx="3" stroke="#1e3a8a" stroke-width="0.5" />
        <text :x="holeCenterTop.x + 57" :y="holeCenterTop.y - 28" text-anchor="middle">Ø 11 mm</text>
      </g>

      <!-- =========== Height annotation (during extrude) =========== -->
      <g :opacity="extDimAlpha" font-family="'JetBrains Mono', ui-monospace, monospace" font-size="11" fill="#bae6fd">
        <g stroke="#bae6fd" stroke-width="1" stroke-opacity="0.6">
          <line :x1="v.B3.x - 8" :y1="v.B3.y" :x2="v.B3.x - 22" :y2="v.B3.y" />
          <line :x1="v.T3.x - 8" :y1="v.T3.y" :x2="v.T3.x - 22" :y2="v.T3.y" />
          <line :x1="v.B3.x - 18" :y1="v.B3.y" :x2="v.T3.x - 18" :y2="v.T3.y" />
        </g>
        <rect :x="v.B3.x - 64" :y="(v.B3.y + v.T3.y) / 2 - 8" width="42" height="14" fill="#0c0e1a" rx="3" stroke="#1e3a8a" stroke-width="0.5" />
        <text :x="v.B3.x - 43" :y="(v.B3.y + v.T3.y) / 2 + 2" text-anchor="middle">14 mm</text>
      </g>

      <!-- =========== Phase label (top-left) =========== -->
      <g font-family="'JetBrains Mono', ui-monospace, monospace" font-size="10" font-weight="500">
        <g :opacity="dimsAlpha">
          <text x="48" y="56" fill="#7dd3fc">01 — sketch</text>
          <text x="48" y="68" fill="#475569" font-size="9">closedWire()</text>
        </g>
        <g :opacity="stage(EXTRUDE[0], EXTRUDE[0] + 0.06) * (1 - stage(EXTRUDE[1] + 0.02, EXTRUDE[1] + 0.08))">
          <text x="48" y="56" fill="#7dd3fc">02 — extrude</text>
          <text x="48" y="68" fill="#475569" font-size="9">extrude(profile, 14)</text>
        </g>
        <g :opacity="analysisAlpha">
          <text x="48" y="56" fill="#7dd3fc">03 — analyse</text>
          <text x="48" y="68" fill="#475569" font-size="9">measureVolume(solid)</text>
        </g>
      </g>

      <!-- =========== Volume / surface / topology analysis callouts =========== -->
      <g :opacity="analysisAlpha" font-family="'JetBrains Mono', ui-monospace, monospace">
        <!-- VOLUME: top-left corner, leader to top-front vertex -->
        <g stroke="#7dd3fc" stroke-width="1" stroke-opacity="0.55" fill="none">
          <line :x1="calloutVolume.x + calloutVolume.w" :y1="calloutVolume.y + calloutVolume.h / 2" :x2="anchorTop.x - 8" :y2="anchorTop.y - 6" />
        </g>
        <rect :x="calloutVolume.x" :y="calloutVolume.y" :width="calloutVolume.w" :height="calloutVolume.h" rx="6" fill="#0c0e1a" stroke="#1e3a8a" stroke-width="0.8" />
        <text :x="calloutVolume.x + 10" :y="calloutVolume.y + 14" fill="#94a3b8" font-size="9" letter-spacing="0.6">VOLUME</text>
        <text :x="calloutVolume.x + 10" :y="calloutVolume.y + 28" fill="#bae6fd" font-size="13" font-weight="600">{{ volStr }}</text>

        <!-- SURFACE: top-right corner, leader to top-right vertex -->
        <g stroke="#7dd3fc" stroke-width="1" stroke-opacity="0.55" fill="none">
          <line :x1="calloutSurface.x" :y1="calloutSurface.y + calloutSurface.h / 2" :x2="anchorRight.x + 6" :y2="anchorRight.y - 6" />
        </g>
        <rect :x="calloutSurface.x" :y="calloutSurface.y" :width="calloutSurface.w" :height="calloutSurface.h" rx="6" fill="#0c0e1a" stroke="#1e3a8a" stroke-width="0.8" />
        <text :x="calloutSurface.x + 10" :y="calloutSurface.y + 14" fill="#94a3b8" font-size="9" letter-spacing="0.6">SURFACE</text>
        <text :x="calloutSurface.x + 10" :y="calloutSurface.y + 28" fill="#bae6fd" font-size="13" font-weight="600">{{ surfStr }}</text>

        <!-- TOPOLOGY: bottom, leader to back-bottom vertex -->
        <g stroke="#7dd3fc" stroke-width="1" stroke-opacity="0.55" fill="none">
          <line :x1="calloutTopology.x + calloutTopology.w / 2" :y1="calloutTopology.y" :x2="anchorBackBottom.x" :y2="anchorBackBottom.y + 6" />
        </g>
        <rect :x="calloutTopology.x" :y="calloutTopology.y" :width="calloutTopology.w" :height="calloutTopology.h" rx="6" fill="#0c0e1a" stroke="#1e3a8a" stroke-width="0.8" />
        <text :x="calloutTopology.x + 10" :y="calloutTopology.y + 14" fill="#94a3b8" font-size="9" letter-spacing="0.6">TOPOLOGY</text>
        <text :x="calloutTopology.x + 10" :y="calloutTopology.y + 28" fill="#bae6fd" font-size="12" font-weight="600">10 faces · 24 edges · 16 verts</text>
      </g>

      <!-- =========== Valid badge (top-center, above part) =========== -->
      <g :opacity="analysisAlpha" font-family="'JetBrains Mono', ui-monospace, monospace" font-size="10" font-weight="600">
        <g :transform="`translate(200 110) scale(${0.95 + 0.07 * Math.sin(validPulse * Math.PI)})`">
          <rect x="-46" y="-12" width="92" height="22" rx="11" fill="#062e2e" stroke="#10b981" stroke-width="1.2" />
          <circle cx="-32" cy="-1" r="3.6" fill="#10b981" />
          <path d="M -34 -1 L -32.4 0.6 L -29.8 -2.6" stroke="#062e2e" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          <text x="-22" y="3" fill="#34d399">ValidSolid</text>
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.hero-anim {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hero-anim svg {
  max-width: 100%;
  height: auto;
}
</style>
