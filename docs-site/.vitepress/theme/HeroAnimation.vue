<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, useTemplateRef } from 'vue';
import {
  gearGeom,
  gearPath,
  ringSlotPath,
  PLANET_COUNT,
  Z_SUN,
  Z_PLANET,
  Z_RING,
  MODULE,
  PLANET_INITIAL_PHASE,
  RATE_CARRIER_PER_SUN,
  RATE_PLANET_PER_SUN,
} from './gearMath.js';

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

const tick = (now: number): void => {
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
    t.value = 0.78; // mid-divider-sweep, full assembly visible
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
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number): number => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
const easeOutExpo = (x: number): number => {
  const c = clamp01(x);
  return c === 1 ? 1 : 1 - Math.pow(2, -10 * c);
};
const easeOutBack = (x: number, k = 1.4): number => {
  const c = clamp01(x);
  const k1 = k + 1;
  return 1 + k1 * Math.pow(c - 1, 3) + k * Math.pow(c - 1, 2);
};
const easeInOutCubic = (x: number): number => {
  const c = clamp01(x);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};

type Eas = (x: number) => number;
const elem = (start: number, dur: number, easeFn: Eas = smooth): number =>
  easeFn((t.value - start) / dur);
const seg = (a: number, b: number, easeFn: Eas = smooth): number =>
  easeFn((t.value - a) / (b - a));

// ─── Phase windows ──────────────────────────────────────────────────────
// 0.00–0.05  ring blank fades in
// 0.05–0.15  one slot is cut + glows
// 0.15–0.28  circular pattern fills the remaining 41 slots (staggered)
// 0.28–0.36  sun + planets pop in (overshoot)
// 0.36–0.50  divider sweeps in from left
// 0.50–0.92  hold; gears rotate, callouts tick
// 0.92–1.00  loop seam fade-out
const RING_FADE_AT = [0.0, 0.05] as const;
const SLOT_CUT_AT = [0.05, 0.15] as const;
const PATTERN_AT = [0.15, 0.28] as const;
const ASSEMBLE_AT = [0.28, 0.36] as const;
const DIVIDER_IN_AT = [0.36, 0.5] as const;
const FADE_AT = [0.92, 1.0] as const;

// ─── Layout ─────────────────────────────────────────────────────────────
const VB = 400;
const CX = 200;
const CY = 200;

const sun = gearGeom(Z_SUN, MODULE, false);
const planet = gearGeom(Z_PLANET, MODULE, false);
const ring = gearGeom(Z_RING, MODULE, true);
const RIM = ring.rRoot + 1.0 * MODULE;
const CARRIER_R = sun.rPitch + planet.rPitch;

// Pre-compute static gear paths once.
const sunBrep = gearPath(sun, 'brep');
const sunMesh = gearPath(sun, 'mesh');
const planetBrep = gearPath(planet, 'brep');
const planetMesh = gearPath(planet, 'mesh');
const ringBrep = gearPath(ring, 'brep');
const ringMesh = gearPath(ring, 'mesh');

// Per-tooth slot wedges, used as cut-outs in the smooth-bore cover.
const ringSlots: string[] = Array.from({ length: Z_RING }, (_, k) =>
  ringSlotPath(ring, k, RIM),
);

// ─── Build-phase reactive state ─────────────────────────────────────────
const ringFadeAlpha = computed(
  () =>
    elem(RING_FADE_AT[0], RING_FADE_AT[1] - RING_FADE_AT[0], easeOutExpo) *
    (1 - elem(FADE_AT[0], FADE_AT[1] - FADE_AT[0], smooth)),
);

const PATTERN_STAGGER = 0.003;
const SLOT_DUR = 0.025;

// Per-slot mask-cutout opacity. Slot 0 lights up during the cut beat;
// slots 1..(Z_RING-1) stagger across the pattern beat.
const slotAlpha = (k: number): number => {
  if (k === 0) {
    const cut = elem(SLOT_CUT_AT[0], SLOT_CUT_AT[1] - SLOT_CUT_AT[0], easeOutExpo);
    const pat = elem(PATTERN_AT[0], SLOT_DUR, easeOutExpo);
    return Math.max(cut, pat);
  }
  return elem(PATTERN_AT[0] + (k - 1) * PATTERN_STAGGER, SLOT_DUR, easeOutExpo);
};

// Highlight the freshly-cut slot during SLOT_CUT_AT only.
const slotHighlightAlpha = computed(() => {
  const inCut = elem(SLOT_CUT_AT[0], SLOT_CUT_AT[1] - SLOT_CUT_AT[0], easeOutExpo);
  const fadeOut = 1 - elem(PATTERN_AT[0], (PATTERN_AT[1] - PATTERN_AT[0]) * 0.4, smooth);
  return inCut * fadeOut;
});

// Sun + planets pop-in
const sunPopAlpha = computed(
  () =>
    elem(ASSEMBLE_AT[0], 0.06, smooth) *
    (1 - elem(FADE_AT[0], FADE_AT[1] - FADE_AT[0], smooth)),
);
const sunPopScale = computed(() => {
  const a = elem(ASSEMBLE_AT[0], 0.10, (x) => easeOutBack(x, 2.4));
  return 0.6 + 0.4 * a;
});
const planetPopAlpha = (i: number): number =>
  elem(ASSEMBLE_AT[0] + 0.02 + i * 0.025, 0.06, smooth) *
  (1 - elem(FADE_AT[0], FADE_AT[1] - FADE_AT[0], smooth));
const planetPopScale = (i: number): number => {
  const a = elem(ASSEMBLE_AT[0] + 0.02 + i * 0.025, 0.10, (x) => easeOutBack(x, 2.4));
  return 0.6 + 0.4 * a;
};

// ─── Settle-phase kinematics ────────────────────────────────────────────
const SETTLE_T0 = ASSEMBLE_AT[1];
const SETTLE_END = FADE_AT[0];
const SETTLE_DUR = SETTLE_END - SETTLE_T0;
const SUN_TURNS = 1.4;

// Sun rotation (degrees) over the settle.
const sunAngle = computed(() => {
  const local = clamp01((t.value - SETTLE_T0) / SETTLE_DUR);
  return local * SUN_TURNS * 360;
});
const carrierAngle = computed(() => sunAngle.value * RATE_CARRIER_PER_SUN);
// Planet body rotation in the ring (canvas) frame.
const planetBodyAngle = computed(
  () =>
    (PLANET_INITIAL_PHASE * 180) / Math.PI + sunAngle.value * RATE_PLANET_PER_SUN,
);

// ─── Divider state ──────────────────────────────────────────────────────
// dividerX is the x-coordinate of the seam in viewBox units. Mesh-side
// rendered where x < dividerX, B-Rep-side where x ≥ dividerX.
const DIVIDER_HOLD_X = CX + 30;

const dividerX = computed(() => {
  if (t.value < DIVIDER_IN_AT[0]) return 0;
  const sweepIn = seg(DIVIDER_IN_AT[0], DIVIDER_IN_AT[1], easeInOutCubic);
  return sweepIn * DIVIDER_HOLD_X;
});

const dividerAlpha = computed(
  () =>
    elem(DIVIDER_IN_AT[0], DIVIDER_IN_AT[1] - DIVIDER_IN_AT[0], smooth) *
    (1 - elem(FADE_AT[0], FADE_AT[1] - FADE_AT[0], smooth)),
);

// ─── Callout values ─────────────────────────────────────────────────────
// Per-gear B-Rep face count (4 faces per tooth flank quartet + 2 caps).
const BREP_FACES =
  Z_SUN * 4 + 2 + PLANET_COUNT * (Z_PLANET * 4 + 2) + (Z_RING * 4 + 2);
// Mesh count: ~12 triangles per B-Rep face at default chord tolerance.
const MESH_FACES_TARGET = BREP_FACES * 12;

const meshFaceCount = computed(() => {
  const sweep = clamp01(dividerX.value / DIVIDER_HOLD_X);
  return Math.round(sweep * MESH_FACES_TARGET);
});

const calloutAlpha = computed(
  () =>
    elem(DIVIDER_IN_AT[1] - 0.04, 0.10, easeOutExpo) *
    (1 - elem(FADE_AT[0], FADE_AT[1] - FADE_AT[0], smooth)),
);

// ─── Phase indicator ────────────────────────────────────────────────────
const phase = computed<0 | 1 | 2>(() => {
  if (t.value < ASSEMBLE_AT[0]) return 0;
  if (t.value < SETTLE_T0) return 1;
  return 2;
});

const phaseAlpha = (i: 0 | 1 | 2): number => {
  if (i === 0) return Math.max(0, 1 - elem(ASSEMBLE_AT[0], 0.04, smooth));
  if (i === 1)
    return (
      elem(ASSEMBLE_AT[0], 0.03, smooth) *
      Math.max(0, 1 - elem(SETTLE_T0, 0.04, smooth))
    );
  return (
    elem(SETTLE_T0, 0.04, smooth) *
    Math.max(0, 1 - elem(FADE_AT[0], FADE_AT[1] - FADE_AT[0], smooth))
  );
};

// ─── Transform helpers ──────────────────────────────────────────────────
const sunTransform = computed(
  () => `translate(${CX} ${CY}) rotate(${sunAngle.value}) scale(${sunPopScale.value})`,
);

const planetTransform = (i: number): string => {
  const carrierDeg = carrierAngle.value + i * 120;
  const cx = CX + CARRIER_R * Math.cos((carrierDeg * Math.PI) / 180);
  const cy = CY + CARRIER_R * Math.sin((carrierDeg * Math.PI) / 180);
  return `translate(${cx} ${cy}) rotate(${planetBodyAngle.value}) scale(${planetPopScale(i)})`;
};

const ringTransform = `translate(${CX} ${CY})`;
</script>

<template>
  <div class="hero-anim" ref="root">
    <svg
      viewBox="0 0 400 400"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Animated demo: a planetary gear set is constructed and compared as B-Rep splines vs tessellated mesh facets"
    >
      <defs>
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
        <radialGradient id="ha-sun" cx="35%" cy="35%" r="70%">
          <stop offset="0%" stop-color="#bef0ff" />
          <stop offset="50%" stop-color="#22d3ee" />
          <stop offset="100%" stop-color="#0e7490" />
        </radialGradient>
        <radialGradient id="ha-planet" cx="35%" cy="35%" r="70%">
          <stop offset="0%" stop-color="#7dd3fc" />
          <stop offset="55%" stop-color="#3b82f6" />
          <stop offset="100%" stop-color="#1e3a8a" />
        </radialGradient>
        <radialGradient id="ha-rim" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stop-color="#1d4ed8" stop-opacity="0" />
          <stop offset="80%" stop-color="#1d4ed8" stop-opacity="0.55" />
          <stop offset="100%" stop-color="#0c1f55" />
        </radialGradient>
        <radialGradient id="ha-vignette" cx="50%" cy="50%" r="65%">
          <stop offset="65%" stop-color="#000" stop-opacity="0" />
          <stop offset="100%" stop-color="#000" stop-opacity="0.18" />
        </radialGradient>
        <filter id="ha-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="ha-soft" x="-20%" y="-20%" width="140%" height="160%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3.0" />
          <feOffset dx="0" dy="3" />
          <feComponentTransfer><feFuncA type="linear" slope="0.35" /></feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <!-- Static gear shape symbols. We <use> them with a transform per
             frame; the path data itself never changes. -->
        <symbol id="g-sun-brep" overflow="visible">
          <path
            :d="sunBrep"
            fill="url(#ha-sun)"
            stroke="#0a1530"
            stroke-width="1"
            stroke-linejoin="round"
          />
        </symbol>
        <symbol id="g-sun-mesh" overflow="visible">
          <path
            :d="sunMesh"
            fill="url(#ha-sun)"
            stroke="#0a1530"
            stroke-width="1"
            stroke-linejoin="miter"
            opacity="0.85"
          />
        </symbol>
        <symbol id="g-planet-brep" overflow="visible">
          <path
            :d="planetBrep"
            fill="url(#ha-planet)"
            stroke="#0a1530"
            stroke-width="1"
            stroke-linejoin="round"
          />
        </symbol>
        <symbol id="g-planet-mesh" overflow="visible">
          <path
            :d="planetMesh"
            fill="url(#ha-planet)"
            stroke="#0a1530"
            stroke-width="1"
            stroke-linejoin="miter"
            opacity="0.85"
          />
        </symbol>
        <symbol id="g-ring-brep" overflow="visible">
          <circle :r="RIM" fill="url(#ha-rim)" stroke="#0a1530" stroke-width="1" />
          <path
            :d="ringBrep"
            fill="#020617"
            stroke="#0a1530"
            stroke-width="1"
            stroke-linejoin="round"
          />
        </symbol>
        <symbol id="g-ring-mesh" overflow="visible">
          <circle
            :r="RIM"
            fill="url(#ha-rim)"
            stroke="#0a1530"
            stroke-width="1"
            opacity="0.85"
          />
          <path
            :d="ringMesh"
            fill="#020617"
            stroke="#0a1530"
            stroke-width="1"
            stroke-linejoin="miter"
            opacity="0.85"
          />
        </symbol>

        <!-- Build-phase mask: starts white-everywhere (smooth bore visible),
             tooth-slot wedges punch through to black as they reveal. -->
        <mask id="ring-cover-mask" maskUnits="userSpaceOnUse" x="0" y="0" :width="VB" :height="VB">
          <rect x="0" y="0" :width="VB" :height="VB" fill="white" />
          <g :transform="ringTransform">
            <path
              v-for="(p, k) in ringSlots"
              :key="`slot-${k}`"
              :d="p"
              fill="black"
              :opacity="slotAlpha(k)"
            />
          </g>
        </mask>

        <!-- Divider clip-paths -->
        <clipPath id="clip-mesh-side">
          <rect x="0" y="0" :width="dividerX" :height="VB" />
        </clipPath>
        <clipPath id="clip-brep-side">
          <rect :x="dividerX" y="0" :width="VB - dividerX" :height="VB" />
        </clipPath>
      </defs>

      <!-- Background -->
      <rect width="400" height="400" fill="url(#ha-bg-a)" />
      <rect width="400" height="400" fill="url(#ha-bg-b)" />

      <!-- ─── Build phase ────────────────────────────────────────── -->
      <!-- Toothed B-Rep ring underneath, always visible during the build. -->
      <g :transform="ringTransform" :opacity="ringFadeAlpha" filter="url(#ha-soft)">
        <use href="#g-ring-brep" />
      </g>

      <!-- Smooth-bore cover: a dark inner disc that hides the teeth. The
           mask carves slot-shaped windows out of it as each slot is "cut" -->
      <g :transform="ringTransform" :opacity="ringFadeAlpha">
        <circle
          :r="ring.rRoot"
          fill="#020617"
          stroke="#0a1530"
          stroke-width="1"
          mask="url(#ring-cover-mask)"
        />
      </g>

      <!-- Cyan glow on the just-cut slot -->
      <g :transform="ringTransform" :opacity="slotHighlightAlpha" filter="url(#ha-glow)">
        <path
          :d="ringSlots[0]"
          fill="#22d3ee"
          fill-opacity="0.4"
          stroke="#22d3ee"
          stroke-width="1.4"
        />
      </g>

      <!-- ─── Settle phase: divided assembly ─────────────────────── -->
      <!-- Mesh side (left of divider) -->
      <g clip-path="url(#clip-mesh-side)">
        <g :transform="ringTransform" :opacity="ringFadeAlpha">
          <use href="#g-ring-mesh" />
        </g>
        <g :transform="sunTransform" :opacity="sunPopAlpha">
          <use href="#g-sun-mesh" />
        </g>
        <g
          v-for="i in PLANET_COUNT"
          :key="`pm-${i - 1}`"
          :transform="planetTransform(i - 1)"
          :opacity="planetPopAlpha(i - 1)"
        >
          <use href="#g-planet-mesh" />
        </g>
      </g>

      <!-- B-Rep side (right of divider) -->
      <g clip-path="url(#clip-brep-side)">
        <g :transform="ringTransform" :opacity="ringFadeAlpha">
          <use href="#g-ring-brep" />
        </g>
        <g :transform="sunTransform" :opacity="sunPopAlpha">
          <use href="#g-sun-brep" />
        </g>
        <g
          v-for="i in PLANET_COUNT"
          :key="`pb-${i - 1}`"
          :transform="planetTransform(i - 1)"
          :opacity="planetPopAlpha(i - 1)"
        >
          <use href="#g-planet-brep" />
        </g>
      </g>

      <!-- Divider seam -->
      <g :opacity="dividerAlpha">
        <line
          :x1="dividerX"
          y1="20"
          :x2="dividerX"
          y2="380"
          stroke="#22d3ee"
          stroke-width="1.3"
          stroke-dasharray="3 3"
          stroke-opacity="0.85"
        />
        <path
          :d="`M ${dividerX - 5} 14 L ${dividerX + 5} 14 L ${dividerX} 22 Z`"
          fill="#22d3ee"
          fill-opacity="0.85"
        />
        <path
          :d="`M ${dividerX - 5} 386 L ${dividerX + 5} 386 L ${dividerX} 378 Z`"
          fill="#22d3ee"
          fill-opacity="0.85"
        />
      </g>

      <!-- ─── Callouts ────────────────────────────────────────────── -->
      <g
        font-family="ui-sans-serif, system-ui, sans-serif"
        :opacity="calloutAlpha"
      >
        <g>
          <rect
            x="18"
            y="22"
            width="124"
            height="36"
            rx="6"
            fill="#0c0e1a"
            stroke="#1e3a8a"
            stroke-width="0.8"
          />
          <text
            x="28"
            y="36"
            fill="#94a3b8"
            font-size="9"
            letter-spacing="1.4"
            font-weight="600"
          >MESH · TRIANGLES</text>
          <text
            x="28"
            y="52"
            fill="#bae6fd"
            font-size="14"
            font-weight="600"
            font-family="ui-monospace, monospace"
          >{{ meshFaceCount.toLocaleString() }}</text>
        </g>
        <g>
          <rect
            x="258"
            y="22"
            width="124"
            height="36"
            rx="6"
            fill="#0c0e1a"
            stroke="#10b981"
            stroke-width="0.8"
          />
          <text
            x="268"
            y="36"
            fill="#94a3b8"
            font-size="9"
            letter-spacing="1.4"
            font-weight="600"
          >B-REP · FACES</text>
          <text
            x="268"
            y="52"
            fill="#34d399"
            font-size="14"
            font-weight="600"
            font-family="ui-monospace, monospace"
          >{{ BREP_FACES.toLocaleString() }}</text>
        </g>
        <g transform="translate(200 354)">
          <rect
            x="-118"
            y="0"
            width="236"
            height="32"
            rx="6"
            fill="#0c0e1a"
            stroke="#1e3a8a"
            stroke-width="0.8"
          />
          <text
            x="0"
            y="13"
            text-anchor="middle"
            fill="#94a3b8"
            font-size="9"
            letter-spacing="1.2"
            font-weight="600"
          >TOOTH FLANK</text>
          <text
            x="0"
            y="26"
            text-anchor="middle"
            fill="#bae6fd"
            font-size="10.5"
            font-weight="600"
            font-family="ui-monospace, monospace"
          >12 line segments / 1 involute spline</text>
        </g>
      </g>

      <!-- ─── Phase indicator ────────────────────────────────────── -->
      <g font-family="ui-sans-serif, system-ui, sans-serif" font-size="9">
        <g transform="translate(36 78)">
          <line
            x1="6"
            y1="0"
            x2="14"
            y2="0"
            :stroke="phase >= 1 ? '#22d3ee' : '#1e293b'"
            stroke-width="1.4"
            stroke-linecap="round"
          />
          <line
            x1="22"
            y1="0"
            x2="30"
            y2="0"
            :stroke="phase >= 2 ? '#22d3ee' : '#1e293b'"
            stroke-width="1.4"
            stroke-linecap="round"
          />
          <circle cx="2" cy="0" :r="phase === 0 ? 3 : 2" fill="#22d3ee" />
          <circle
            cx="18"
            cy="0"
            :r="phase === 1 ? 3 : 2"
            :fill="phase >= 1 ? '#22d3ee' : '#1e293b'"
          />
          <circle
            cx="34"
            cy="0"
            :r="phase === 2 ? 3 : 2"
            :fill="phase >= 2 ? '#22d3ee' : '#1e293b'"
          />
        </g>
        <g font-family="ui-monospace, monospace" font-weight="600">
          <g :opacity="phaseAlpha(0)">
            <text
              x="36"
              y="106"
              fill="#bae6fd"
              font-size="11"
              letter-spacing="0.2"
            >01 · pattern</text>
            <text x="36" y="118" fill="#475569" font-size="9.5">circularPattern(slot, 42)</text>
          </g>
          <g :opacity="phaseAlpha(1)">
            <text
              x="36"
              y="106"
              fill="#bae6fd"
              font-size="11"
              letter-spacing="0.2"
            >02 · assemble</text>
            <text x="36" y="118" fill="#475569" font-size="9.5">assemble([sun, ...planets])</text>
          </g>
          <g :opacity="phaseAlpha(2)">
            <text
              x="36"
              y="106"
              fill="#bae6fd"
              font-size="11"
              letter-spacing="0.2"
            >03 · compare</text>
            <text x="36" y="118" fill="#475569" font-size="9.5">tessellate(0.05) vs faces()</text>
          </g>
        </g>
      </g>

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
