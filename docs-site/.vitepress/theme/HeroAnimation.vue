<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, useTemplateRef } from 'vue';

// ─── Animation cycle ────────────────────────────────────────────────────
const CYCLE_MS = 10_000;
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
    t.value = 0.9;
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

// ─── Easing palette ─────────────────────────────────────────────────────
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
const easeOutQuart = (x: number) => {
  const c = clamp01(x);
  return 1 - Math.pow(1 - c, 4);
};
const easeOutExpo = (x: number) => {
  const c = clamp01(x);
  return c === 1 ? 1 : 1 - Math.pow(2, -10 * c);
};
const easeInOutCubic = (x: number) => {
  const c = clamp01(x);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};
const easeOutBack = (x: number, k = 1.4) => {
  const c = clamp01(x);
  const k1 = k + 1;
  return 1 + k1 * Math.pow(c - 1, 3) + k * Math.pow(c - 1, 2);
};

// ─── Stage helpers ──────────────────────────────────────────────────────
type Eas = (x: number) => number;
const seg = (a: number, b: number, easeFn: Eas = smooth) => easeFn((t.value - a) / (b - a));
const elem = (start: number, dur: number, easeFn: Eas = smooth) =>
  easeFn((t.value - start) / dur);

// ─── Phase windows ──────────────────────────────────────────────────────
const VERTS_T0 = 0.03;
const VERT_STAGGER = 0.025;
const VERT_DUR = 0.06;
const EDGES_T0 = 0.1;
const EDGE_STAGGER = 0.028;
const EDGE_DUR = 0.07;
const HOLE_AT = [0.21, 0.29] as const;
const DIMS_T0 = 0.3;
const DIM_STAGGER = 0.025;
const DIM_DUR = 0.07;
const SKETCH_OUT_AT = [0.4, 0.46] as const;
const TILT_AT = [0.42, 0.58] as const;
const EXTRUDE_AT = [0.52, 0.7] as const;
const HEIGHT_DIM_AT = [0.6, 0.72] as const;
const CALLOUTS_T0 = 0.72;
const CALLOUT_STAGGER = 0.035;
const CALLOUT_DUR = 0.13;
const FADE_AT = [0.96, 1.0] as const;

// ─── World geometry (mm at 10× scale, world units = cm) ─────────────────
const W = 4.0; // 40 mm
const D = 2.4; // 24 mm
const HX = 2.7;
const HY = 1.2;
const HR = 0.55; // Ø 11 mm
const H = 1.4; // 14 mm extrusion

// ─── Projection ────────────────────────────────────────────────────────
const CX = 200;
const CY = 198;
const SCALE = 36;

type Pt = { x: number; y: number };

// Yaw breathing during analysis hold (subtle ±2°)
const yaw = computed(() => {
  const inHold = elem(0.86, 0.04, smooth) * (1 - elem(FADE_AT[0], 0.04, smooth));
  if (inHold === 0) return 0;
  const phase = (t.value - 0.86) / 0.1;
  return Math.sin(phase * Math.PI * 2) * 0.035 * inHold;
});

const project = (x: number, y: number, z: number, k: number, ya: number = 0): Pt => {
  // Yaw around part center
  const dx = x - W / 2;
  const dy = y - D / 2;
  const c = Math.cos(ya);
  const s = Math.sin(ya);
  const xr = dx * c - dy * s;
  const yr = dx * s + dy * c;
  const xTop = xr;
  const yTop = yr;
  const xIso = (xr - yr) * 0.866;
  const yIso = (xr + yr) * 0.5 - z;
  return {
    x: CX + (xTop * (1 - k) + xIso * k) * SCALE,
    y: CY + (yTop * (1 - k) + yIso * k) * SCALE,
  };
};

const tilt = computed(() => seg(TILT_AT[0], TILT_AT[1], easeInOutCubic));
const ext = computed(() => seg(EXTRUDE_AT[0], EXTRUDE_AT[1], (x) => easeOutBack(x, 1.1)) * H);

const v = computed(() => {
  const k = tilt.value;
  const e = ext.value;
  const ya = yaw.value;
  return {
    B0: project(0, 0, 0, k, ya),
    B1: project(W, 0, 0, k, ya),
    B2: project(W, D, 0, k, ya),
    B3: project(0, D, 0, k, ya),
    T0: project(0, 0, e, k, ya),
    T1: project(W, 0, e, k, ya),
    T2: project(W, D, e, k, ya),
    T3: project(0, D, e, k, ya),
  };
});

// ─── Hole ellipse (axis-aligned in iso) ─────────────────────────────────
const holeRx = computed(() => {
  const k = tilt.value;
  const r = HR * SCALE;
  return r * (1 - k) + r * 0.866 * Math.SQRT2 * k;
});
const holeRy = computed(() => {
  const k = tilt.value;
  const r = HR * SCALE;
  return r * (1 - k) + r * 0.5 * Math.SQRT2 * k;
});
const holeTop = computed(() => project(HX, HY, ext.value, tilt.value, yaw.value));
const holeBot = computed(() => project(HX, HY, 0, tilt.value, yaw.value));

// Hole circle scale during sketch phase (overshoot)
const holeScale = computed(() => {
  const inA = elem(HOLE_AT[0], HOLE_AT[1] - HOLE_AT[0], (x) => easeOutBack(x, 1.6));
  const outA = 1 - elem(SKETCH_OUT_AT[0], SKETCH_OUT_AT[1] - SKETCH_OUT_AT[0], smooth);
  return inA * outA;
});
const holeAlpha = computed(() => {
  const inA = elem(HOLE_AT[0] - 0.02, 0.06, smooth);
  const outA = 1 - elem(SKETCH_OUT_AT[0], SKETCH_OUT_AT[1] - SKETCH_OUT_AT[0], smooth);
  return inA * outA;
});

// ─── Sketch element alphas (staggered) ──────────────────────────────────
const vertexAlpha = (i: number) =>
  elem(VERTS_T0 + i * VERT_STAGGER, VERT_DUR, (x) => easeOutBack(x, 2.4));

const edgeAlpha = (i: number) =>
  elem(EDGES_T0 + i * EDGE_STAGGER, EDGE_DUR, easeOutExpo);

const dimAlpha = (i: number) =>
  elem(DIMS_T0 + i * DIM_STAGGER, DIM_DUR, easeOutExpo);

const sketchOut = computed(() => 1 - elem(SKETCH_OUT_AT[0], SKETCH_OUT_AT[1] - SKETCH_OUT_AT[0], smooth));
const sketchFillAlpha = computed(() => smooth((t.value - 0.16) / 0.10) * sketchOut.value);

// ─── 3D / iso phase alphas ──────────────────────────────────────────────
const solidAlpha = computed(() => {
  const inA = elem(TILT_AT[0] - 0.02, 0.10, easeOutQuart);
  const outA = 1 - elem(FADE_AT[0], FADE_AT[1] - FADE_AT[0], smooth);
  return inA * outA;
});

const heightDimAlpha = computed(() => {
  const inA = elem(HEIGHT_DIM_AT[0], HEIGHT_DIM_AT[1] - HEIGHT_DIM_AT[0], easeOutExpo);
  const outA = 1 - elem(FADE_AT[0], FADE_AT[1] - FADE_AT[0], smooth);
  return inA * outA;
});

// Callout slide-in alphas (staggered)
const calloutAlpha = (i: number) =>
  elem(CALLOUTS_T0 + i * CALLOUT_STAGGER, CALLOUT_DUR, easeOutExpo) *
  (1 - elem(FADE_AT[0], FADE_AT[1] - FADE_AT[0], smooth));

// Slide-from-outer-edge offsets per callout (collapse to 0 as alpha→1)
const calloutSlide = (i: number, distance: number) =>
  (1 - calloutAlpha(i)) * distance;

// ValidSolid scale pop
const validScale = computed(() => {
  const a = elem(CALLOUTS_T0 + 3 * CALLOUT_STAGGER, 0.18, (x) => easeOutBack(x, 2.8));
  return 0.6 + 0.4 * a;
});
const validAlpha = computed(() => calloutAlpha(3));

// Phase indicator (3 dots)
const phaseProgress = computed(() => {
  // 0 = sketch, 1 = extrude, 2 = analyse
  if (t.value < TILT_AT[0]) return 0;
  if (t.value < CALLOUTS_T0) return 1;
  return 2;
});
const sketchPhaseAlpha = computed(() => Math.max(0, 1 - elem(SKETCH_OUT_AT[0], 0.06, smooth)));
const extrudePhaseAlpha = computed(() =>
  elem(TILT_AT[0], 0.05, smooth) * (1 - elem(EXTRUDE_AT[1], 0.05, smooth)),
);
const analysisPhaseAlpha = computed(() =>
  elem(EXTRUDE_AT[1] - 0.02, 0.08, smooth) * (1 - elem(FADE_AT[0], FADE_AT[1] - FADE_AT[0], smooth)),
);

// ─── Path builders ──────────────────────────────────────────────────────
const polyTop = computed(() => {
  const { T0, T1, T2, T3 } = v.value;
  return `M ${T0.x} ${T0.y} L ${T1.x} ${T1.y} L ${T2.x} ${T2.y} L ${T3.x} ${T3.y} Z`;
});
const polyRight = computed(() => {
  const { T1, T2, B2, B1 } = v.value;
  return `M ${T1.x} ${T1.y} L ${T2.x} ${T2.y} L ${B2.x} ${B2.y} L ${B1.x} ${B1.y} Z`;
});
const polyLeft = computed(() => {
  const { T2, T3, B3, B2 } = v.value;
  return `M ${T2.x} ${T2.y} L ${T3.x} ${T3.y} L ${B3.x} ${B3.y} L ${B2.x} ${B2.y} Z`;
});
const sketchProfile = computed(() => {
  const { B0, B1, B2, B3 } = v.value;
  return `M ${B0.x} ${B0.y} L ${B1.x} ${B1.y} L ${B2.x} ${B2.y} L ${B3.x} ${B3.y} Z`;
});

// Bezier leader (anchor on part → callout edge) with subtle perpendicular curl
const bezier = (a: Pt, c: Pt, curl = 0.18) => {
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const mx = (a.x + c.x) / 2;
  const my = (a.y + c.y) / 2;
  const nx = -dy / len;
  const ny = dx / len;
  const px = mx + nx * len * curl;
  const py = my + ny * len * curl;
  return `M ${a.x} ${a.y} Q ${px} ${py} ${c.x} ${c.y}`;
};

// Quadratic Bezier arc-length approximation: chord + (8/3)·h²/chord
// (small-perpendicular-offset form; accurate enough that stroke-dashoffset
// draw-on stays in sync with the easing)
const bezierLen = (a: Pt, c: Pt, curl: number) => {
  const chord = Math.hypot(c.x - a.x, c.y - a.y);
  const h = Math.abs(curl) * chord;
  return chord + (8 / 3) * (h * h) / Math.max(chord, 1e-3);
};

// ─── Numbers ────────────────────────────────────────────────────────────
const volume = (W * D * 100 - Math.PI * HR * HR * 100) * H * 10; // ≈ 12,110 mm³
const surface = (() => {
  const cap = (W * D - Math.PI * HR * HR) * 100;
  const sides = 2 * (W + D) * 10 * H * 10;
  const hole = 2 * Math.PI * HR * 10 * H * 10;
  return 2 * cap + sides + hole;
})();
const volStr = `${Math.round(volume).toLocaleString()} mm³`;
const surfStr = `${Math.round(surface).toLocaleString()} mm²`;

// Anchors for callout leaders
const anchorTop = computed(() => v.value.T0);
const anchorRight = computed(() => v.value.T1);
const anchorBackBottom = computed(() => v.value.B2);

// Fixed callout positions
const cVol = { x: 18, y: 36, w: 156, h: 38 };
const cSurf = { x: 244, y: 36, w: 138, h: 38 };
const cTop = { x: 122, y: 348, w: 156, h: 38 };

// Leader endpoints + per-leader curl + path length (used for stroke-dashoffset)
const leader0 = computed(() => {
  const a: Pt = { x: cVol.x + cVol.w, y: cVol.y + cVol.h / 2 };
  const c: Pt = { x: anchorTop.value.x - 8, y: anchorTop.value.y - 6 };
  return { a, c, curl: 0.22, len: bezierLen(a, c, 0.22) };
});
const leader1 = computed(() => {
  const a: Pt = { x: cSurf.x, y: cSurf.y + cSurf.h / 2 };
  const c: Pt = { x: anchorRight.value.x + 8, y: anchorRight.value.y - 6 };
  return { a, c, curl: -0.22, len: bezierLen(a, c, -0.22) };
});
const leader2 = computed(() => {
  const a: Pt = { x: cTop.x + cTop.w / 2, y: cTop.y };
  const c: Pt = { x: anchorBackBottom.value.x, y: anchorBackBottom.value.y + 6 };
  return { a, c, curl: 0.18, len: bezierLen(a, c, 0.18) };
});

// Edge length for stroke-dashoffset draw-on of profile edges
const edgeLen = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

// Per-edge dashoffsets for "draw on" effect. Edges in order: B0→B1, B1→B2, B2→B3, B3→B0
const e01 = computed(() => {
  const a = v.value.B0, b = v.value.B1;
  const len = edgeLen(a, b);
  return { len, off: len * (1 - edgeAlpha(0)) };
});
const e12 = computed(() => {
  const a = v.value.B1, b = v.value.B2;
  const len = edgeLen(a, b);
  return { len, off: len * (1 - edgeAlpha(1)) };
});
const e23 = computed(() => {
  const a = v.value.B2, b = v.value.B3;
  const len = edgeLen(a, b);
  return { len, off: len * (1 - edgeAlpha(2)) };
});
const e30 = computed(() => {
  const a = v.value.B3, b = v.value.B0;
  const len = edgeLen(a, b);
  return { len, off: len * (1 - edgeAlpha(3)) };
});

// Leader-line draw-on for each callout
const leaderDrawAlpha = (i: number) =>
  elem(CALLOUTS_T0 + i * CALLOUT_STAGGER + 0.04, 0.10, easeOutExpo);
</script>

<template>
  <div class="hero-anim" ref="root">
    <svg viewBox="0 0 400 400" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Animated demo: 2D sketch extruded into a 3D solid with dimension and volume analysis">
      <defs>
        <!-- Lit top face: cyan with warm rim near front edge -->
        <linearGradient id="ha-top" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stop-color="#bef0ff" />
          <stop offset="40%" stop-color="#22d3ee" />
          <stop offset="100%" stop-color="#0e7490" />
        </linearGradient>
        <!-- Right face -->
        <linearGradient id="ha-right" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#3b82f6" />
          <stop offset="100%" stop-color="#1e3a8a" />
        </linearGradient>
        <!-- Left face (deeper, in shadow) -->
        <linearGradient id="ha-left" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#1d4ed8" />
          <stop offset="100%" stop-color="#0c1f55" />
        </linearGradient>
        <!-- Top-edge highlight (rim light) -->
        <linearGradient id="ha-rim" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#e0f2fe" stop-opacity="0" />
          <stop offset="50%" stop-color="#f0f9ff" stop-opacity="0.85" />
          <stop offset="100%" stop-color="#e0f2fe" stop-opacity="0" />
        </linearGradient>
        <!-- Hole interior depth -->
        <radialGradient id="ha-hole" cx="42%" cy="38%" r="65%">
          <stop offset="0%" stop-color="#020617" />
          <stop offset="80%" stop-color="#0b1330" />
          <stop offset="100%" stop-color="#1e293b" />
        </radialGradient>
        <!-- Background mesh: two soft blobs -->
        <radialGradient id="ha-bg-a" cx="35%" cy="30%" r="55%">
          <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.20" />
          <stop offset="60%" stop-color="#22d3ee" stop-opacity="0.04" />
          <stop offset="100%" stop-color="#22d3ee" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="ha-bg-b" cx="68%" cy="72%" r="55%">
          <stop offset="0%" stop-color="#6366f1" stop-opacity="0.16" />
          <stop offset="65%" stop-color="#6366f1" stop-opacity="0.03" />
          <stop offset="100%" stop-color="#6366f1" stop-opacity="0" />
        </radialGradient>
        <!-- Floor shadow -->
        <radialGradient id="ha-floor" cx="50%" cy="50%">
          <stop offset="0%" stop-color="#020617" stop-opacity="0.55" />
          <stop offset="100%" stop-color="#020617" stop-opacity="0" />
        </radialGradient>
        <!-- Vignette -->
        <radialGradient id="ha-vignette" cx="50%" cy="50%" r="65%">
          <stop offset="65%" stop-color="#000" stop-opacity="0" />
          <stop offset="100%" stop-color="#000" stop-opacity="0.18" />
        </radialGradient>
        <!-- Sketch grid -->
        <pattern id="ha-grid" x="200" y="200" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="0" cy="0" r="0.9" fill="#22d3ee" fill-opacity="0.55" />
        </pattern>
        <!-- Drop shadow on solid -->
        <filter id="ha-soft" x="-20%" y="-20%" width="140%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3.2" />
          <feOffset dx="0" dy="4" />
          <feComponentTransfer><feFuncA type="linear" slope="0.4" /></feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <!-- Edge halo glow (2D sketch) -->
        <filter id="ha-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <!-- Background mesh gradient -->
      <rect width="400" height="400" fill="url(#ha-bg-a)" />
      <rect width="400" height="400" fill="url(#ha-bg-b)" />

      <!-- Sketch grid (only in sketch phase) -->
      <g :opacity="0.55 * sketchOut">
        <rect x="40" y="40" width="320" height="320" fill="url(#ha-grid)" />
        <line x1="200" y1="56" x2="200" y2="344" stroke="#22d3ee" stroke-opacity="0.16" stroke-width="1" />
        <line x1="56" y1="200" x2="344" y2="200" stroke="#22d3ee" stroke-opacity="0.16" stroke-width="1" />
        <!-- Origin marker (lower-left of profile) -->
        <g :transform="`translate(${v.B0.x} ${v.B0.y})`" :opacity="vertexAlpha(0)">
          <circle r="4" fill="none" stroke="#22d3ee" stroke-opacity="0.8" stroke-width="1" />
          <line x1="-7" y1="0" x2="7" y2="0" stroke="#22d3ee" stroke-opacity="0.8" stroke-width="1" />
          <line x1="0" y1="-7" x2="0" y2="7" stroke="#22d3ee" stroke-opacity="0.8" stroke-width="1" />
        </g>
      </g>

      <!-- Floor shadow (under solid) -->
      <ellipse :cx="200" :cy="262 + ext * 6" :rx="118 - ext * 4" :ry="14" fill="url(#ha-floor)" :opacity="solidAlpha" />

      <!-- ─── 3D solid (iso phase) ─── -->
      <g :opacity="solidAlpha">
        <!-- Hidden edges (dashed, behind faces) -->
        <g stroke="#7dd3fc" stroke-width="1.1" stroke-dasharray="3 3" stroke-opacity="0.32" fill="none" stroke-linecap="round">
          <line :x1="v.B0.x" :y1="v.B0.y" :x2="v.B1.x" :y2="v.B1.y" />
          <line :x1="v.B0.x" :y1="v.B0.y" :x2="v.B3.x" :y2="v.B3.y" />
          <line :x1="v.B0.x" :y1="v.B0.y" :x2="v.T0.x" :y2="v.T0.y" />
        </g>

        <g filter="url(#ha-soft)">
          <path :d="polyLeft" fill="url(#ha-left)" stroke="#0a1530" stroke-width="1.4" stroke-linejoin="round" />
          <path :d="polyRight" fill="url(#ha-right)" stroke="#0a1530" stroke-width="1.4" stroke-linejoin="round" />
          <path :d="polyTop" fill="url(#ha-top)" stroke="#0a1530" stroke-width="1.4" stroke-linejoin="round" />
        </g>

        <!-- Hole opening + interior cues -->
        <ellipse :cx="holeTop.x" :cy="holeTop.y" :rx="holeRx" :ry="holeRy" fill="url(#ha-hole)" stroke="#0a1530" stroke-width="1.2" />
        <ellipse :cx="holeBot.x" :cy="holeBot.y" :rx="holeRx" :ry="holeRy" fill="none" stroke="#0a1530" stroke-width="0.8" stroke-opacity="0.55" stroke-dasharray="2 2" />
        <ellipse :cx="holeTop.x" :cy="holeTop.y + 1.4" :rx="holeRx - 2.6" :ry="holeRy - 1.3" fill="none" stroke="#22d3ee" stroke-width="0.7" stroke-opacity="0.6" />

        <!-- Visible edges (crisp) -->
        <g stroke="#0a1530" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" fill="none">
          <path :d="polyTop" />
          <line :x1="v.T1.x" :y1="v.T1.y" :x2="v.B1.x" :y2="v.B1.y" />
          <line :x1="v.T2.x" :y1="v.T2.y" :x2="v.B2.x" :y2="v.B2.y" />
          <line :x1="v.T3.x" :y1="v.T3.y" :x2="v.B3.x" :y2="v.B3.y" />
          <line :x1="v.B1.x" :y1="v.B1.y" :x2="v.B2.x" :y2="v.B2.y" />
          <line :x1="v.B3.x" :y1="v.B3.y" :x2="v.B2.x" :y2="v.B2.y" />
        </g>

        <!-- Specular rim on top-front edge -->
        <line :x1="v.T0.x + 4" :y1="v.T0.y + 1" :x2="v.T1.x - 4" :y2="v.T1.y - 1" stroke="url(#ha-rim)" stroke-width="2" stroke-linecap="round" />

        <!-- Vertex dots -->
        <g fill="#bae6fd" stroke="#0a1530" stroke-width="1.1">
          <circle :cx="v.T0.x" :cy="v.T0.y" r="2.7" />
          <circle :cx="v.T1.x" :cy="v.T1.y" r="2.7" />
          <circle :cx="v.T2.x" :cy="v.T2.y" r="2.7" />
          <circle :cx="v.T3.x" :cy="v.T3.y" r="2.7" />
          <circle :cx="v.B1.x" :cy="v.B1.y" r="2.7" />
          <circle :cx="v.B2.x" :cy="v.B2.y" r="2.7" />
          <circle :cx="v.B3.x" :cy="v.B3.y" r="2.7" />
        </g>
      </g>

      <!-- ─── 2D sketch profile ─── -->
      <g :opacity="sketchOut">
        <!-- Profile fill -->
        <path :d="sketchProfile" fill="#22d3ee" :fill-opacity="0.07 * sketchFillAlpha" />

        <!-- Per-edge "draw on" lines (with stagger) -->
        <g stroke="#22d3ee" stroke-width="2" stroke-linecap="round" fill="none" filter="url(#ha-glow)">
          <line :x1="v.B0.x" :y1="v.B0.y" :x2="v.B1.x" :y2="v.B1.y" :stroke-dasharray="e01.len" :stroke-dashoffset="e01.off" />
          <line :x1="v.B1.x" :y1="v.B1.y" :x2="v.B2.x" :y2="v.B2.y" :stroke-dasharray="e12.len" :stroke-dashoffset="e12.off" />
          <line :x1="v.B2.x" :y1="v.B2.y" :x2="v.B3.x" :y2="v.B3.y" :stroke-dasharray="e23.len" :stroke-dashoffset="e23.off" />
          <line :x1="v.B3.x" :y1="v.B3.y" :x2="v.B0.x" :y2="v.B0.y" :stroke-dasharray="e30.len" :stroke-dashoffset="e30.off" />
        </g>

        <!-- Hole circle (sketch) — overshoot scale-up around its center -->
        <g :transform="`translate(${holeTop.x} ${holeTop.y}) scale(${holeScale})`" filter="url(#ha-glow)">
          <circle :r="holeRx" fill="none" stroke="#22d3ee" stroke-width="2" :opacity="holeAlpha" />
          <line x1="-8" y1="0" x2="8" y2="0" stroke="#22d3ee" stroke-width="1" stroke-opacity="0.85" :opacity="holeAlpha" />
          <line x1="0" y1="-8" x2="0" y2="8" stroke="#22d3ee" stroke-width="1" stroke-opacity="0.85" :opacity="holeAlpha" />
        </g>

        <!-- Vertex dots (sketch) — staggered pop-in -->
        <g fill="#bae6fd" stroke="#0c1f55" stroke-width="1">
          <circle :cx="v.B0.x" :cy="v.B0.y" :r="2.6 + (1 - vertexAlpha(0)) * 4" :opacity="vertexAlpha(0)" />
          <circle :cx="v.B1.x" :cy="v.B1.y" :r="2.6 + (1 - vertexAlpha(1)) * 4" :opacity="vertexAlpha(1)" />
          <circle :cx="v.B2.x" :cy="v.B2.y" :r="2.6 + (1 - vertexAlpha(2)) * 4" :opacity="vertexAlpha(2)" />
          <circle :cx="v.B3.x" :cy="v.B3.y" :r="2.6 + (1 - vertexAlpha(3)) * 4" :opacity="vertexAlpha(3)" />
        </g>
      </g>

      <!-- ─── 2D dimension annotations (staggered slide-in) ─── -->
      <g font-family="ui-sans-serif, system-ui, sans-serif">
        <!-- Width: 40 mm -->
        <g :opacity="dimAlpha(0) * sketchOut" :transform="`translate(0 ${(1 - dimAlpha(0)) * -10})`">
          <g stroke="#bae6fd" stroke-width="1" stroke-opacity="0.55">
            <line :x1="v.B0.x" :y1="v.B0.y - 7" :x2="v.B0.x" :y2="v.B0.y - 23" />
            <line :x1="v.B1.x" :y1="v.B1.y - 7" :x2="v.B1.x" :y2="v.B1.y - 23" />
            <line :x1="v.B0.x + 1" :y1="v.B0.y - 19" :x2="v.B1.x - 1" :y2="v.B1.y - 19" />
          </g>
          <rect :x="(v.B0.x + v.B1.x) / 2 - 24" :y="v.B0.y - 30" width="48" height="16" rx="3.5" fill="#0c0e1a" stroke="#1e3a8a" stroke-width="0.5" />
          <text :x="(v.B0.x + v.B1.x) / 2" :y="v.B0.y - 18" text-anchor="middle" font-size="10.5" font-weight="600" fill="#bae6fd" font-family="ui-monospace, monospace">40 mm</text>
        </g>

        <!-- Depth: 24 mm -->
        <g :opacity="dimAlpha(1) * sketchOut" :transform="`translate(${(1 - dimAlpha(1)) * 10} 0)`">
          <g stroke="#bae6fd" stroke-width="1" stroke-opacity="0.55">
            <line :x1="v.B1.x + 7" :y1="v.B1.y" :x2="v.B1.x + 23" :y2="v.B1.y" />
            <line :x1="v.B2.x + 7" :y1="v.B2.y" :x2="v.B2.x + 23" :y2="v.B2.y" />
            <line :x1="v.B1.x + 19" :y1="v.B1.y + 1" :x2="v.B2.x + 19" :y2="v.B2.y - 1" />
          </g>
          <rect :x="v.B1.x + 25" :y="(v.B1.y + v.B2.y) / 2 - 9" width="48" height="16" rx="3.5" fill="#0c0e1a" stroke="#1e3a8a" stroke-width="0.5" />
          <text :x="v.B1.x + 49" :y="(v.B1.y + v.B2.y) / 2 + 3" text-anchor="middle" font-size="10.5" font-weight="600" fill="#bae6fd" font-family="ui-monospace, monospace">24 mm</text>
        </g>

        <!-- Diameter: Ø 11 mm -->
        <g :opacity="dimAlpha(2) * sketchOut" :transform="`translate(0 ${(1 - dimAlpha(2)) * -8})`">
          <g stroke="#bae6fd" stroke-width="1" stroke-opacity="0.7" fill="none">
            <line :x1="holeTop.x + 11" :y1="holeTop.y - 11" :x2="holeTop.x + 38" :y2="holeTop.y - 32" />
          </g>
          <rect :x="holeTop.x + 38" :y="holeTop.y - 41" width="50" height="16" rx="3.5" fill="#0c0e1a" stroke="#1e3a8a" stroke-width="0.5" />
          <text :x="holeTop.x + 63" :y="holeTop.y - 30" text-anchor="middle" font-size="10.5" font-weight="600" fill="#bae6fd" font-family="ui-monospace, monospace">Ø 11 mm</text>
        </g>
      </g>

      <!-- ─── Height annotation (during extrude / analysis) ─── -->
      <g :opacity="heightDimAlpha" font-family="ui-monospace, monospace">
        <g stroke="#bae6fd" stroke-width="1" stroke-opacity="0.6" fill="none">
          <line :x1="v.B3.x - 7" :y1="v.B3.y" :x2="v.B3.x - 23" :y2="v.B3.y" />
          <line :x1="v.T3.x - 7" :y1="v.T3.y" :x2="v.T3.x - 23" :y2="v.T3.y" />
          <line :x1="v.B3.x - 19" :y1="v.B3.y - 1" :x2="v.T3.x - 19" :y2="v.T3.y + 1" />
        </g>
        <rect :x="v.B3.x - 67" :y="(v.B3.y + v.T3.y) / 2 - 9" width="44" height="16" rx="3.5" fill="#0c0e1a" stroke="#1e3a8a" stroke-width="0.5" />
        <text :x="v.B3.x - 45" :y="(v.B3.y + v.T3.y) / 2 + 3" text-anchor="middle" font-size="10.5" font-weight="600" fill="#bae6fd">14 mm</text>
      </g>

      <!-- ─── Phase indicator (top-left) ─── -->
      <g font-family="ui-sans-serif, system-ui, sans-serif" font-size="9">
        <!-- Three dots -->
        <g transform="translate(36 36)">
          <line x1="6" y1="0" x2="14" y2="0" :stroke="phaseProgress >= 1 ? '#22d3ee' : '#1e293b'" stroke-width="1.4" stroke-linecap="round" />
          <line x1="22" y1="0" x2="30" y2="0" :stroke="phaseProgress >= 2 ? '#22d3ee' : '#1e293b'" stroke-width="1.4" stroke-linecap="round" />
          <circle cx="2" cy="0" :r="phaseProgress === 0 ? 3 : 2" :fill="phaseProgress >= 0 ? '#22d3ee' : '#1e293b'" />
          <circle cx="18" cy="0" :r="phaseProgress === 1 ? 3 : 2" :fill="phaseProgress >= 1 ? '#22d3ee' : '#1e293b'" />
          <circle cx="34" cy="0" :r="phaseProgress === 2 ? 3 : 2" :fill="phaseProgress >= 2 ? '#22d3ee' : '#1e293b'" />
        </g>
        <!-- Phase title (mono) — only the active one renders -->
        <g font-family="ui-monospace, monospace" font-weight="600">
          <g :opacity="sketchPhaseAlpha">
            <text x="36" y="62" fill="#bae6fd" font-size="11" letter-spacing="0.2">01 · sketch</text>
            <text x="36" y="74" fill="#475569" font-size="9.5">closedWire()</text>
          </g>
          <g :opacity="extrudePhaseAlpha">
            <text x="36" y="62" fill="#bae6fd" font-size="11" letter-spacing="0.2">02 · extrude</text>
            <text x="36" y="74" fill="#475569" font-size="9.5">extrude(profile, 14)</text>
          </g>
          <g :opacity="analysisPhaseAlpha">
            <text x="36" y="62" fill="#bae6fd" font-size="11" letter-spacing="0.2">03 · analyse</text>
            <text x="36" y="74" fill="#475569" font-size="9.5">measureVolume(solid)</text>
          </g>
        </g>
      </g>

      <!-- ─── Analysis callouts (staggered slide-in with curved leaders) ─── -->
      <g font-family="ui-sans-serif, system-ui, sans-serif">
        <!-- VOLUME (top-left) -->
        <g :opacity="calloutAlpha(0)" :transform="`translate(${-calloutSlide(0, 30)} 0)`">
          <path :d="bezier(leader0.a, leader0.c, leader0.curl)"
            stroke="#22d3ee" stroke-width="1" stroke-opacity="0.6" fill="none"
            :stroke-dasharray="leader0.len" :stroke-dashoffset="(1 - leaderDrawAlpha(0)) * leader0.len" />
          <circle :cx="leader0.c.x" :cy="leader0.c.y" r="2" fill="#22d3ee" />
          <rect :x="cVol.x" :y="cVol.y" :width="cVol.w" :height="cVol.h" rx="7" fill="#0c0e1a" stroke="#1e3a8a" stroke-width="0.8" />
          <text :x="cVol.x + 12" :y="cVol.y + 14" fill="#94a3b8" font-size="9" letter-spacing="1.2" font-weight="600">VOLUME</text>
          <text :x="cVol.x + 12" :y="cVol.y + 30" fill="#bae6fd" font-size="14" font-weight="600" font-family="ui-monospace, monospace">{{ volStr }}</text>
        </g>

        <!-- SURFACE (top-right) -->
        <g :opacity="calloutAlpha(1)" :transform="`translate(${calloutSlide(1, 30)} 0)`">
          <path :d="bezier(leader1.a, leader1.c, leader1.curl)"
            stroke="#22d3ee" stroke-width="1" stroke-opacity="0.6" fill="none"
            :stroke-dasharray="leader1.len" :stroke-dashoffset="(1 - leaderDrawAlpha(1)) * leader1.len" />
          <circle :cx="leader1.c.x" :cy="leader1.c.y" r="2" fill="#22d3ee" />
          <rect :x="cSurf.x" :y="cSurf.y" :width="cSurf.w" :height="cSurf.h" rx="7" fill="#0c0e1a" stroke="#1e3a8a" stroke-width="0.8" />
          <text :x="cSurf.x + 12" :y="cSurf.y + 14" fill="#94a3b8" font-size="9" letter-spacing="1.2" font-weight="600">SURFACE</text>
          <text :x="cSurf.x + 12" :y="cSurf.y + 30" fill="#bae6fd" font-size="14" font-weight="600" font-family="ui-monospace, monospace">{{ surfStr }}</text>
        </g>

        <!-- TOPOLOGY (bottom-center) -->
        <g :opacity="calloutAlpha(2)" :transform="`translate(0 ${calloutSlide(2, 24)})`">
          <path :d="bezier(leader2.a, leader2.c, leader2.curl)"
            stroke="#22d3ee" stroke-width="1" stroke-opacity="0.6" fill="none"
            :stroke-dasharray="leader2.len" :stroke-dashoffset="(1 - leaderDrawAlpha(2)) * leader2.len" />
          <circle :cx="leader2.c.x" :cy="leader2.c.y" r="2" fill="#22d3ee" />
          <rect :x="cTop.x" :y="cTop.y" :width="cTop.w" :height="cTop.h" rx="7" fill="#0c0e1a" stroke="#1e3a8a" stroke-width="0.8" />
          <text :x="cTop.x + 12" :y="cTop.y + 14" fill="#94a3b8" font-size="9" letter-spacing="1.2" font-weight="600">TOPOLOGY</text>
          <text :x="cTop.x + 12" :y="cTop.y + 30" fill="#bae6fd" font-size="13" font-weight="600" font-family="ui-monospace, monospace">10 F · 24 E · 16 V</text>
        </g>

        <!-- ValidSolid badge (top-center, scale-pop) -->
        <g :opacity="validAlpha" :transform="`translate(200 110) scale(${validScale})`">
          <rect x="-50" y="-13" width="100" height="24" rx="12" fill="#062e2e" stroke="#10b981" stroke-width="1.4" />
          <circle cx="-34" cy="-1" r="3.6" fill="#10b981" />
          <path d="M -36 -1 L -34.4 0.7 L -31.6 -2.6" stroke="#062e2e" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          <text x="-24" y="3" fill="#34d399" font-family="ui-monospace, monospace" font-size="10.5" font-weight="700" letter-spacing="0.3">ValidSolid</text>
        </g>
      </g>

      <!-- Vignette on top of everything -->
      <rect width="400" height="400" fill="url(#ha-vignette)" pointer-events="none" />
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
