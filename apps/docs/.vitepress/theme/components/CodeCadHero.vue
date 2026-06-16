<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { withBase } from 'vitepress';
import { encodeCode } from '../playgroundLink';
import { tokenize, tokensToHtml } from './codeHighlight';
import type { CodeCadHandle, HeroFramesData } from './codeCadRenderer';

// The program the panel types out, and what "Open in Playground" carries — a
// real, runnable 1×1 Gridfinity bin. Mirrors scripts/genHeroFrames.ts.
const PROGRAM = `import { drawRoundedRectangle, cut, fuse, unwrap } from 'brepjs/quick';

const [W, WALL, H] = [42 - 0.5, 1.2, 3 * 7]; // 1×1 bin, 3 units tall
const r = (inset, z) => drawRoundedRectangle(W - 2*inset, W - 2*inset, 3.75 - inset).sketchOnPlane('XY', z);

// Gridfinity socket foot — mates with a baseplate
const foot = r(0, 0).loftWith([r(2.15, -2.4), r(2.95, -5)], { ruled: true });

// hollow body — walls + floor
const body = unwrap(fuse(foot, unwrap(cut(r(0, 0).extrude(H), r(WALL, 1).extrude(H)))));

// stacking lip — so bins nest when stacked
const lipOuter = r(0, H-2.6).loftWith([r(0, H+4.4)], { ruled: true });
const lipInner = r(1.2, H-2.6).loftWith([r(2.6, H-1.2), r(2.6, H), r(1.9, H+0.7), r(1.9, H+2.5), r(0.05, H+4.4)], { ruled: true });
const lip = unwrap(cut(lipOuter, lipInner));

export default unwrap(fuse(body, lip));`;

// Real syntax highlighting via the shared tokenizer. Keeping tokens (not
// pre-baked HTML) lets the panel reveal a line one character at a time.
const LINES = PROGRAM.split('\n');
const LINE_TOKENS = LINES.map(tokenize);
const LINE_LEN = LINES.map((s) => s.length);
const LINE_INDENT = LINES.map((s) => s.length - s.trimStart().length);

// When a given line finishes "typing", run this geometry step.
const STEP_AT: Record<number, { frame: number; step: number }> = {
  6: { frame: 0, step: 0 }, // socket foot
  9: { frame: 1, step: 1 }, // hollow body
  14: { frame: 2, step: 2 }, // stacking lip → final bin
};
const DONE_LINE = 16;

// Simulated IntelliSense: while typing a `.` on a line, pop a completion list of
// the real brepjs Sketch methods, then "accept" and keep typing.
interface CompletionItem {
  n: string;
  d: string;
}
const SKETCH_METHODS: CompletionItem[] = [
  { n: 'loftWith', d: '(sections, opts): Solid' },
  { n: 'extrude', d: '(distance): Solid' },
  { n: 'revolve', d: '(angle, axis?): Solid' },
  { n: 'sweep', d: '(spine): Solid' },
  { n: 'offset', d: '(distance): Sketch' },
];
const DRAW_FUNCTIONS: CompletionItem[] = [
  { n: 'drawRoundedRectangle', d: '(w, h, r?): Drawing' },
  { n: 'drawRectangle', d: '(w, h): Drawing' },
  { n: 'drawCircle', d: '(radius): Drawing' },
  { n: 'drawEllipse', d: '(rx, ry): Drawing' },
  { n: 'drawPolysides', d: '(radius, sides): Drawing' },
];
// Each fires when typing reaches `marker`; `selected` is what the code then
// types. Only the first use of a given completion actually dwells.
const COMPLETION_SPECS: {
  line: number;
  marker: string;
  selected: number;
  items: CompletionItem[];
}[] = [
  { line: 3, marker: '=> drawRounded', selected: 0, items: DRAW_FUNCTIONS }, // drawRoundedRectangle
  { line: 6, marker: 'r(0, 0).', selected: 0, items: SKETCH_METHODS }, // .loftWith
  { line: 9, marker: 'r(0, 0).', selected: 1, items: SKETCH_METHODS }, // .extrude
  { line: 12, marker: 'r(0, H-2.6).', selected: 0, items: SKETCH_METHODS }, // .loftWith (already shown)
];
const COMPLETIONS: Record<
  number,
  { at: number; selected: number; items: CompletionItem[]; method: string }
> = {};
for (const s of COMPLETION_SPECS) {
  const idx = (LINES[s.line] ?? '').indexOf(s.marker);
  if (idx >= 0) {
    COMPLETIONS[s.line] = {
      at: idx + s.marker.length,
      selected: s.selected,
      items: s.items,
      method: s.items[s.selected]?.n ?? '',
    };
  }
}

// Hover IntelliSense: signatures shown when hovering a function/method token.
const HOVER_INFO: Record<string, string> = {
  drawRoundedRectangle: 'drawRoundedRectangle(width, height, radius?): Drawing',
  sketchOnPlane: 'Drawing.sketchOnPlane(plane, origin?): Sketch',
  loftWith: 'Sketch.loftWith(sections: Sketch[], opts?): Solid',
  extrude: 'Sketch.extrude(distance: number): Solid',
  cut: 'cut(a: Shape, b: Shape): Result<Shape3D>',
  fuse: 'fuse(a: Shape, b: Shape): Result<Shape3D>',
  unwrap: 'unwrap<T>(result: Result<T>): T',
  r: '(inset: number, z: number) => Sketch',
};

const CHAR_MS = 11; // per-character typing speed
const LINE_PAUSE = 200; // beat at the end of a typed line
const BLANK_MS = 140; // blank line
const STEP_DWELL = 2200; // hold after a geometry step appears
const COMPLETION_HOLD = 1200; // how long the IntelliSense list lingers

const playgroundHref = encodeCode(PROGRAM);

const canvasEl = ref<HTMLCanvasElement | null>(null);
const codeEl = ref<HTMLOListElement | null>(null);
const ready = ref(false);
const failed = ref(false);
const typedLine = ref(0); // line currently being typed
const typedChars = ref(0); // characters revealed on the current line
const doneLines = ref<Set<number>>(new Set());
const stepIndex = ref(-1); // -1 → nothing built yet; 0..2 for the rail
const exported = ref(false);
const finished = ref(false); // build sequence has played through once
const stepLabel = ref('');
const stepVol = ref<number | null>(null);
const completion = ref<{
  items: CompletionItem[];
  selected: number;
  top: number;
  left: number;
} | null>(null);
const hover = ref<{ sig: string; top: number; left: number } | null>(null);

let handle: CodeCadHandle | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let paused = false;
let frames: HeroFramesData['frames'] = [];
const firedCompletions = new Set<number>();
const shownMethods = new Set<string>(); // dwell on a method's popup only once

function showCompletion(c: { selected: number; items: CompletionItem[] }): void {
  completion.value = { items: c.items, selected: c.selected, top: 0, left: 54 };
  void nextTick(() => {
    const li = codeEl.value?.querySelector('li.active') as HTMLElement | null;
    if (li && completion.value) {
      completion.value = { ...completion.value, top: li.offsetTop + li.offsetHeight + 3 };
    }
  });
}

// HTML for a line given how far typing has progressed.
function lineHtml(i: number): string {
  if (i < typedLine.value) return tokensToHtml(LINE_TOKENS[i] ?? []);
  if (i === typedLine.value) return tokensToHtml(LINE_TOKENS[i] ?? [], typedChars.value);
  return '&nbsp;';
}

function scrollActive(): void {
  // Scroll only the code panel's own overflow — never call scrollIntoView,
  // which would scroll the whole page back up to the hero as lines type in.
  void nextTick(() => {
    const ol = codeEl.value;
    const li = ol?.querySelector('li.active') as HTMLElement | null;
    if (!ol || !li) return;
    const o = ol.getBoundingClientRect();
    const l = li.getBoundingClientRect();
    if (l.bottom > o.bottom) ol.scrollTop += l.bottom - o.bottom;
    else if (l.top < o.top) ol.scrollTop += l.top - o.top;
  });
}

function advanceLine(delay: number): void {
  timer = setTimeout(() => {
    typedLine.value += 1;
    typedChars.value = 0;
    scrollActive();
    typeTick();
  }, delay);
}

function typeTick(): void {
  if (paused) return;
  const i = typedLine.value;
  if (i >= LINES.length) {
    finished.value = true; // play once — wait for Replay
    return;
  }
  const len = LINE_LEN[i] ?? 0;

  // IntelliSense: pause on the `.` to show the completion list, but only the
  // first time a given method is used, then "accept" and keep typing.
  const comp = COMPLETIONS[i];
  if (comp && typedChars.value === comp.at && !firedCompletions.has(i)) {
    firedCompletions.add(i);
    if (!shownMethods.has(comp.method)) {
      shownMethods.add(comp.method);
      showCompletion(comp);
      timer = setTimeout(() => {
        completion.value = null;
        typeTick();
      }, COMPLETION_HOLD);
      return;
    }
  }

  if (typedChars.value < len) {
    // reveal leading indent at once (it's invisible), then one char per tick
    typedChars.value =
      typedChars.value === 0 && (LINE_INDENT[i] ?? 0) > 0
        ? (LINE_INDENT[i] ?? 0)
        : typedChars.value + 1;
    timer = setTimeout(typeTick, CHAR_MS);
    return;
  }
  // line fully typed → run its geometry step (if any), then move on
  const trig = STEP_AT[i];
  if (trig && handle) {
    handle.showStep(trig.frame, true);
    stepIndex.value = trig.step;
    const f = frames[trig.frame];
    if (f) {
      stepLabel.value = f.label;
      stepVol.value = f.vol;
    }
    doneLines.value = new Set([...doneLines.value, i]);
    advanceLine(STEP_DWELL);
    return;
  }
  if (i === DONE_LINE) {
    exported.value = true;
    doneLines.value = new Set([...doneLines.value, i]);
  }
  advanceLine(len === 0 ? BLANK_MS : LINE_PAUSE);
}

function restart(): void {
  if (timer) clearTimeout(timer);
  typedLine.value = 0;
  typedChars.value = 0;
  doneLines.value = new Set();
  stepIndex.value = -1;
  exported.value = false;
  finished.value = false;
  stepLabel.value = '';
  stepVol.value = null;
  completion.value = null;
  firedCompletions.clear();
  shownMethods.clear();
  paused = false;
  handle?.hide();
  typeTick();
}

// Hover IntelliSense: show a signature tooltip over a function/method token.
function onCodeOver(e: MouseEvent): void {
  const el = e.target as HTMLElement | null;
  if (!el || !el.classList?.contains('fn')) return;
  const sig = HOVER_INFO[(el.textContent ?? '').trim()];
  if (!sig) return;
  const host = codeEl.value?.parentElement; // .codecol
  if (!host) return;
  const r = el.getBoundingClientRect();
  const h = host.getBoundingClientRect();
  hover.value = { sig, top: Math.max(r.top - h.top - 30, 2), left: r.left - h.left };
}
function onCodeOut(e: MouseEvent): void {
  const el = e.target as HTMLElement | null;
  if (el && el.classList?.contains('fn')) hover.value = null;
}

function onEnter(): void {
  paused = true;
  if (timer) clearTimeout(timer);
}
function onLeave(): void {
  hover.value = null;
  if (finished.value) return; // don't resume a finished sequence
  if (!paused) return;
  paused = false;
  typeTick();
}

onMounted(async () => {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const mq = (q: string): boolean =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(q).matches;
  const reduceMotion = mq('(prefers-reduced-motion: reduce)');
  // On phones the IDE collapses to a single cramped column (the 760px
  // breakpoint in the styles below), where a one-char-at-a-time build is hard
  // to follow — show the finished program and bin straight away instead.
  const staticView = reduceMotion || mq('(max-width: 760px)');

  let data: HeroFramesData;
  try {
    const res = await fetch(withBase('/hero-frames.json'));
    data = (await res.json()) as HeroFramesData;
  } catch {
    return;
  }
  frames = data.frames;

  try {
    const { mountCodeCad } = await import('./codeCadRenderer');
    handle = mountCodeCad(canvas, data, { dark: true, reduceMotion: staticView });
  } catch {
    failed.value = true; // no WebGL — the code panel still tells the story
    return;
  }
  ready.value = true;

  if (staticView) {
    // No typing/playback: show the whole program and the finished bin.
    typedLine.value = LINES.length;
    typedChars.value = 0;
    doneLines.value = new Set([6, 9, 14, DONE_LINE]);
    stepIndex.value = 2;
    exported.value = true;
    finished.value = true;
    handle.showStep(frames.length - 1, false);
    const last = frames[frames.length - 1];
    if (last) {
      stepLabel.value = last.label;
      stepVol.value = last.vol;
    }
    return;
  }
  typeTick();
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
      <span class="fname">bin.ts</span>
      <span class="run-state" :class="{ on: exported }">{{
        exported ? '✓ default export ready' : 'authoring…'
      }}</span>
      <button type="button" class="bar-btn" @click="restart">↻ Replay</button>
      <a class="run-link" :href="playgroundHref" target="_blank" rel="noopener"
        >▶ Open in Playground</a
      >
    </div>

    <div class="ide-body">
      <!-- code panel: typed in line by line -->
      <div class="codecol">
        <ol
          ref="codeEl"
          class="code"
          aria-label="brepjs program"
          @mouseover="onCodeOver"
          @mouseout="onCodeOut"
        >
          <li
            v-for="(line, i) in LINES"
            :key="i"
            :class="{ typed: i <= typedLine, active: i === typedLine, done: doneLines.has(i) }"
          >
            <span class="ln">{{ i <= typedLine ? i + 1 : '' }}</span>
            <span class="src" v-html="lineHtml(i)"></span>
            <span v-if="i === typedLine && !exported" class="caret" aria-hidden="true"></span>
            <span v-else-if="doneLines.has(i)" class="tick" aria-hidden="true">✓</span>
          </li>
        </ol>
        <!-- hover IntelliSense: signature tooltip -->
        <div
          v-if="hover"
          class="hovtip"
          :style="{ top: hover.top + 'px', left: hover.left + 'px' }"
          aria-hidden="true"
        >
          {{ hover.sig }}
        </div>
        <!-- simulated TypeScript IntelliSense -->
        <div
          v-if="completion"
          class="iset"
          :style="{ top: completion.top + 'px', left: completion.left + 'px' }"
          aria-hidden="true"
        >
          <div
            v-for="(it, k) in completion.items"
            :key="k"
            class="iset-row"
            :class="{ sel: k === completion.selected }"
          >
            <span class="iset-kind">ƒ</span>
            <span class="iset-name">{{ it.n }}</span>
            <span class="iset-sig">{{ it.d }}</span>
          </div>
        </div>
      </div>

      <!-- viewport: pre-baked kernel meshes + exact B-Rep edges, via three.js -->
      <div class="view">
        <canvas ref="canvasEl" class="cv" :class="{ on: ready }" aria-hidden="true"></canvas>
        <span class="vstatus" v-show="!ready">{{
          failed ? 'preview needs WebGL — read the code →' : 'starting kernel…'
        }}</span>
        <span class="vlabel" v-show="ready && stepLabel">
          <b>{{ stepLabel }}</b>
          <template v-if="stepVol !== null"> · vol {{ stepVol.toLocaleString() }} mm³</template>
        </span>
        <span class="vtag" v-show="ready">kernel-meshed · exact edges · three.js</span>
      </div>
    </div>

    <div class="ide-rail" aria-hidden="true">
      <span :class="{ on: stepIndex >= 0 }">socket</span>
      <i></i>
      <span :class="{ on: stepIndex >= 1 }">body</span>
      <i></i>
      <span :class="{ on: stepIndex >= 2 }">stacking lip</span>
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
.bar-btn {
  margin-left: auto;
  background: none;
  border: 1px solid var(--line-2, #283340);
  border-radius: 6px;
  color: var(--ink-1, #aab6bd);
  font-family: var(--f-mono, monospace);
  font-size: 12px;
  padding: 6px 12px; /* ≥24px tall — WCAG 2.5.8 target size */
  cursor: pointer;
  transition:
    border-color 0.12s,
    color 0.12s;
}
.bar-btn:hover {
  border-color: var(--teal-400, #03b0ad);
  color: var(--ink-0, #f1f6f7);
}
.run-link {
  color: var(--teal-200, #7adbdd);
  text-decoration: none;
}
.run-link:hover {
  color: var(--teal-100, #a8e8e8);
}
.hovtip {
  position: absolute;
  z-index: 6;
  max-width: 94%;
  background: #0b0f15;
  border: 1px solid var(--line-2, #283340);
  border-radius: 6px;
  box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.75);
  padding: 5px 9px;
  font-family: var(--f-mono, monospace);
  font-size: 11px;
  color: var(--teal-100, #a8e8e8);
  white-space: nowrap;
  pointer-events: none;
}

.ide-body {
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(0, 1fr);
  min-height: 400px;
}
.codecol {
  position: relative;
  min-width: 0;
  border-right: 1px solid var(--line, #1c2530);
}
.iset {
  position: absolute;
  z-index: 5;
  min-width: 232px;
  max-width: 92%;
  background: #0b0f15;
  border: 1px solid var(--line-2, #283340);
  border-radius: 6px;
  box-shadow: 0 14px 34px -10px rgba(0, 0, 0, 0.75);
  padding: 4px;
  font-family: var(--f-mono, monospace);
  font-size: 11.5px;
  overflow: hidden;
}
.iset-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 8px;
  border-radius: 4px;
  color: var(--ink-1, #aab6bd);
}
.iset-row.sel {
  background: rgba(3, 176, 173, 0.22);
  color: #eef6f7;
}
.iset-kind {
  flex: none;
  width: 13px;
  text-align: center;
  color: #c98bdb;
}
.iset-name {
  color: var(--ink-0, #f1f6f7);
}
.iset-sig {
  margin-left: auto;
  color: var(--ink-2, #828d96);
  font-size: 10.5px;
}
.code {
  list-style: none;
  margin: 0;
  padding: 18px 8px 18px 0;
  font-family: var(--f-mono, monospace);
  font-size: 12px;
  line-height: 1.85;
  overflow-x: hidden;
  overflow-y: auto;
}
.code li {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 1px 14px 1px 0;
  border-left: 2px solid transparent;
  color: var(--ink-2, #828d96);
  transition:
    background 0.2s,
    color 0.2s,
    border-color 0.2s;
}
.code .src {
  flex: 1;
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
.code li.typed {
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
  color: #767f8d; /* AA-legible gutter (≥4.5:1 on the panel) */
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
.code .src :deep(.cm) {
  color: #5b6b66;
}
.code .src :deep(.ty) {
  color: #6ee7c8;
}
.code .src :deep(.pr) {
  color: #9cdcfe;
}
.code .src :deep(.va) {
  color: #c8d3da;
}
.code .src :deep(.op) {
  color: #7c8794;
}
.caret {
  display: inline-block;
  width: 7px;
  height: 14px;
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
  min-height: 400px;
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
  .codecol {
    border-right: none;
  }
  /* The build plays through once to its finished state on mobile (see the
     staticView gate in script) — Replay would restart a typing run that's hard
     to follow on a phone, so drop it and let the link own the right edge. */
  .bar-btn {
    display: none;
  }
  .run-link {
    margin-left: auto;
  }
}
</style>
