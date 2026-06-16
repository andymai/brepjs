<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { withBase } from 'vitepress';
import { encodeCode } from '../playgroundLink';
import type { CodeCadHandle, HeroFramesData } from './codeCadRenderer';

// The program shown in the panel, line by line. Mirrors the pre-baked frames in
// public/hero-frames.json (see scripts/genHeroFrames.ts) and is what the
// "Open in Playground" link carries — so the demo is runnable, not a mock.
const PROGRAM = `import { drawRoundedRectangle, cut, fuse, translate, unwrap } from 'brepjs/quick';

const cell = 42 - 0.5;          // one Gridfinity unit, less clearance
const [w, d, h] = [cell, 2*42 - 0.5, 3*7];

const block = drawRoundedRectangle(w, d, 3.75).sketchOnPlane('XY', 0).extrude(h);
const inner = drawRoundedRectangle(w-2.4, d-2.4, 2).sketchOnPlane('XY', 1).extrude(h);
const bin   = unwrap(cut(block, inner));   // hollow: walls + floor

const foot = (y) => translate(       // Gridfinity stepped foot, per cell
  drawRoundedRectangle(cell, cell, 3.75).sketchOnPlane('XY', 0).loftWith([
    drawRoundedRectangle(cell-4.3, cell-4.3, 1.6).sketchOnPlane('XY', -2.4),
    drawRoundedRectangle(cell-5.9, cell-5.9, 0.8).sketchOnPlane('XY', -5),
  ], { ruled: true }), [0, y, 0]);
const base = unwrap(fuse(foot(21), foot(-21)));

export default unwrap(fuse(bin, base));`;

const LINES_HTML = [
  `<span class="k">import</span> { drawRoundedRectangle, cut, fuse, translate, unwrap } <span class="k">from</span> <span class="s">'brepjs/quick'</span>;`,
  ``,
  `<span class="k">const</span> cell = <span class="n">42</span> - <span class="n">0.5</span>;          <span class="cm">// one Gridfinity unit, less clearance</span>`,
  `<span class="k">const</span> [w, d, h] = [cell, <span class="n">2</span>*<span class="n">42</span> - <span class="n">0.5</span>, <span class="n">3</span>*<span class="n">7</span>];`,
  ``,
  `<span class="k">const</span> block = <span class="fn">drawRoundedRectangle</span>(w, d, <span class="n">3.75</span>).<span class="fn">sketchOnPlane</span>(<span class="s">'XY'</span>, <span class="n">0</span>).<span class="fn">extrude</span>(h);`,
  `<span class="k">const</span> inner = <span class="fn">drawRoundedRectangle</span>(w-<span class="n">2.4</span>, d-<span class="n">2.4</span>, <span class="n">2</span>).<span class="fn">sketchOnPlane</span>(<span class="s">'XY'</span>, <span class="n">1</span>).<span class="fn">extrude</span>(h);`,
  `<span class="k">const</span> bin   = <span class="fn">unwrap</span>(<span class="fn">cut</span>(block, inner));   <span class="cm">// hollow: walls + floor</span>`,
  ``,
  `<span class="k">const</span> foot = (y) => <span class="fn">translate</span>(       <span class="cm">// Gridfinity stepped foot, per cell</span>`,
  `  <span class="fn">drawRoundedRectangle</span>(cell, cell, <span class="n">3.75</span>).<span class="fn">sketchOnPlane</span>(<span class="s">'XY'</span>, <span class="n">0</span>).<span class="fn">loftWith</span>([`,
  `    <span class="fn">drawRoundedRectangle</span>(cell-<span class="n">4.3</span>, cell-<span class="n">4.3</span>, <span class="n">1.6</span>).<span class="fn">sketchOnPlane</span>(<span class="s">'XY'</span>, -<span class="n">2.4</span>),`,
  `    <span class="fn">drawRoundedRectangle</span>(cell-<span class="n">5.9</span>, cell-<span class="n">5.9</span>, <span class="n">0.8</span>).<span class="fn">sketchOnPlane</span>(<span class="s">'XY'</span>, -<span class="n">5</span>),`,
  `  ], { ruled: <span class="k">true</span> }), [<span class="n">0</span>, y, <span class="n">0</span>]);`,
  `<span class="k">const</span> base = <span class="fn">unwrap</span>(<span class="fn">fuse</span>(<span class="fn">foot</span>(<span class="n">21</span>), <span class="fn">foot</span>(-<span class="n">21</span>)));`,
  ``,
  `<span class="k">export default</span> <span class="fn">unwrap</span>(<span class="fn">fuse</span>(bin, base));`,
];

// beat → which frame to show, which code line is "running", how long to dwell
const BEATS = [
  { frame: 0, line: 5, dwell: 1500 },
  { frame: 1, line: 7, dwell: 1550 },
  { frame: 2, line: 14, dwell: 1900 },
  { frame: 2, line: 16, dwell: 2600, done: true },
] as const;

const playgroundHref = encodeCode(PROGRAM);

const canvasEl = ref<HTMLCanvasElement | null>(null);
const codeEl = ref<HTMLOListElement | null>(null);
const ready = ref(false);
const failed = ref(false);
const activeLine = ref(-1);
const doneLines = ref<Set<number>>(new Set());
const stepIndex = ref(0); // 0..2 for the progress rail
const exported = ref(false);
const stepLabel = ref('');
const stepVol = ref<number | null>(null);

let handle: CodeCadHandle | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let paused = false;
let beat = 0;
let frames: HeroFramesData['frames'] = [];

function runBeat(animate: boolean): void {
  const b = BEATS[beat];
  if (!b || !handle) return;
  handle.showStep(b.frame, animate);
  activeLine.value = b.line;
  stepIndex.value = b.frame;
  exported.value = b.done === true;
  const f = frames[b.frame];
  if (f) {
    stepLabel.value = f.label;
    stepVol.value = f.vol;
  }
  // mark completed lines
  const next = new Set(doneLines.value);
  for (let i = 0; i < beat; i++) {
    const pb = BEATS[i];
    if (pb) next.add(pb.line);
  }
  if (b.done) next.add(b.line);
  doneLines.value = next;
  void nextTick(() => {
    codeEl.value?.querySelector('li.active')?.scrollIntoView({ block: 'nearest' });
  });
}

function advance(): void {
  if (paused) return;
  const b = BEATS[beat];
  if (!b) return;
  timer = setTimeout(() => {
    beat = (beat + 1) % BEATS.length;
    if (beat === 0) doneLines.value = new Set();
    runBeat(beat !== 0);
    advance();
  }, b.dwell);
}

function onEnter(): void {
  paused = true;
  if (timer) clearTimeout(timer);
}
function onLeave(): void {
  if (!paused) return;
  paused = false;
  advance();
}

onMounted(async () => {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let data: HeroFramesData;
  try {
    const res = await fetch(withBase('/hero-frames.json'));
    data = (await res.json()) as HeroFramesData;
  } catch {
    return; // leave the static poster in place
  }
  frames = data.frames;

  try {
    const { mountCodeCad } = await import('./codeCadRenderer');
    handle = mountCodeCad(canvas, data, { dark: true, reduceMotion });
  } catch {
    failed.value = true; // no WebGL — the code panel still tells the story
    return;
  }
  ready.value = true;

  if (reduceMotion) {
    // Final state, no playback: show the whole program as "run".
    activeLine.value = 16;
    doneLines.value = new Set([5, 7, 14, 16]);
    stepIndex.value = 2;
    exported.value = true;
    const last = frames[frames.length - 1];
    if (last) {
      stepLabel.value = last.label;
      stepVol.value = last.vol;
    }
    return;
  }
  runBeat(false);
  advance();
});

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  handle?.destroy();
  handle = null;
});
</script>

<template>
  <div class="ide" @pointerenter="onEnter" @pointerleave="onLeave">
    <div class="ide-bar">
      <span class="dot3"><i></i><i></i><i></i></span>
      <span class="fname">part.ts</span>
      <span class="run-state" :class="{ on: exported }">{{
        exported ? '✓ default export ready' : 'building…'
      }}</span>
      <a class="run-link" :href="playgroundHref" target="_blank" rel="noopener"
        >▶ Open in Playground</a
      >
    </div>

    <div class="ide-body">
      <!-- code panel: real program text (also good for SEO / no-JS) -->
      <ol ref="codeEl" class="code" aria-label="brepjs program">
        <li
          v-for="(html, i) in LINES_HTML"
          :key="i"
          :class="{
            active: i === activeLine,
            done: doneLines.has(i),
            blank: html === '',
          }"
        >
          <span class="ln">{{ i + 1 }}</span>
          <span class="src" v-html="html || '&nbsp;'"></span>
          <span v-if="i === activeLine && !exported" class="caret" aria-hidden="true"></span>
          <span v-else-if="doneLines.has(i)" class="tick" aria-hidden="true">✓</span>
        </li>
      </ol>

      <!-- viewport: pre-baked kernel meshes, rendered with three.js -->
      <div class="view">
        <canvas ref="canvasEl" class="cv" :class="{ on: ready }" aria-hidden="true"></canvas>
        <span class="vstatus" v-show="!ready">{{
          failed ? 'preview needs WebGL — read the code →' : 'compiling geometry…'
        }}</span>
        <span class="vlabel" v-show="ready">
          <b>{{ stepLabel }}</b>
          <template v-if="stepVol !== null"> · vol {{ stepVol.toLocaleString() }} mm³</template>
        </span>
        <span class="vtag" v-show="ready">kernel-meshed · three.js</span>
      </div>
    </div>

    <div class="ide-rail" aria-hidden="true">
      <span :class="{ on: stepIndex >= 0 }">extrude</span>
      <i></i>
      <span :class="{ on: stepIndex >= 1 }">hollow</span>
      <i></i>
      <span :class="{ on: stepIndex >= 2 }">gridfinity feet</span>
      <i></i>
      <span :class="{ on: exported }">export</span>
    </div>
  </div>
</template>

<style scoped>
.ide {
  border: 1px solid var(--line, #1c2530);
  border-radius: 16px;
  background: linear-gradient(180deg, #0d1116, #080b0e);
  overflow: hidden;
  box-shadow: 0 30px 80px -40px rgba(3, 176, 173, 0.4);
}
.ide-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line, #1c2530);
  font-family: var(--f-mono, monospace);
  font-size: 12.5px;
  color: var(--ink-2, #828d96);
}
.dot3 {
  display: flex;
  gap: 6px;
}
.dot3 i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--line-2, #283340);
}
.fname {
  color: var(--ink-1, #aab6bd);
}
.run-state {
  color: var(--ink-2, #828d96);
}
.run-state.on {
  color: var(--pass, #46d09a);
}
.run-link {
  margin-left: auto;
  color: var(--teal-200, #7adbdd);
  text-decoration: none;
}
.run-link:hover {
  color: var(--teal-100, #a8e8e8);
}

.ide-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.12fr);
  min-height: 380px;
}
.code {
  list-style: none;
  margin: 0;
  padding: 18px 8px 18px 0;
  border-right: 1px solid var(--line, #1c2530);
  font-family: var(--f-mono, monospace);
  font-size: 13px;
  line-height: 1.95;
  overflow-x: auto;
  counter-reset: none;
}
.code li {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 1px 16px 1px 0;
  border-left: 2px solid transparent;
  color: var(--ink-2, #828d96);
  transition:
    background 0.25s,
    color 0.25s,
    border-color 0.25s;
  white-space: pre;
}
.code li.done {
  color: var(--ink-1, #aab6bd);
}
.code li.active {
  background: rgba(3, 176, 173, 0.1);
  border-left-color: var(--teal-300, #4acecc);
  color: #eef6f7;
}
.code .ln {
  flex: none;
  width: 26px;
  text-align: right;
  color: #3a4650;
  user-select: none;
}
.code .src :deep(.k) {
  color: #c9defb;
}
.code .src :deep(.fn) {
  color: var(--teal-200, #7adbdd);
}
.code .src :deep(.s) {
  color: #ffd9a8;
}
.code .src :deep(.n) {
  color: #f2a6c2;
}
.caret {
  display: inline-block;
  width: 7px;
  height: 15px;
  margin-left: 2px;
  background: var(--teal-300, #4acecc);
  transform: translateY(2px);
  animation: blink 1.05s steps(2, start) infinite;
}
.tick {
  margin-left: auto;
  color: var(--pass, #46d09a);
  font-size: 11px;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}

.view {
  position: relative;
  min-height: 380px;
  background: radial-gradient(circle at 56% 44%, rgba(3, 176, 173, 0.12), transparent 64%);
}
.cv {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 0.4s ease;
}
.cv.on {
  opacity: 1;
}
.vstatus {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--f-mono, monospace);
  font-size: 12.5px;
  letter-spacing: 0.04em;
  color: var(--ink-2, #828d96);
}
.vlabel {
  position: absolute;
  left: 16px;
  bottom: 14px;
  font-family: var(--f-mono, monospace);
  font-size: 12px;
  color: var(--ink-1, #aab6bd);
}
.vlabel b {
  color: var(--teal-200, #7adbdd);
  font-weight: 500;
}
.vtag {
  position: absolute;
  right: 14px;
  top: 12px;
  font-family: var(--f-mono, monospace);
  font-size: 10.5px;
  letter-spacing: 0.05em;
  color: var(--ink-2, #828d96);
}

.ide-rail {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid var(--line, #1c2530);
  font-family: var(--f-mono, monospace);
  font-size: 11.5px;
  color: var(--ink-2, #828d96);
}
.ide-rail span {
  transition: color 0.3s;
}
.ide-rail span.on {
  color: var(--teal-200, #7adbdd);
}
.ide-rail i {
  flex: 1;
  height: 1px;
  background: var(--line-2, #283340);
}

@media (prefers-reduced-motion: reduce) {
  .caret {
    animation: none;
  }
  .cv {
    transition: none;
  }
}

@media (max-width: 760px) {
  .ide-body {
    grid-template-columns: 1fr;
  }
  .view {
    order: -1;
    min-height: 300px;
    border-bottom: 1px solid var(--line, #1c2530);
  }
  .code {
    border-right: none;
    font-size: 12px;
  }
}
</style>
