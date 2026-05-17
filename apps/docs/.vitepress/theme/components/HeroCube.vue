<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { HeroCubeHandle } from './heroCubeRenderer';

const canvasEl = ref<HTMLCanvasElement | null>(null);
const ready = ref(false);
let handle: HeroCubeHandle | null = null;
let darkObserver: MutationObserver | null = null;

function isDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

onMounted(async () => {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const { mountHeroCube } = await import('./heroCubeRenderer');
  handle = mountHeroCube(canvas, isDark());
  ready.value = true;

  darkObserver = new MutationObserver(() => handle?.setColorScheme(isDark()));
  darkObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
});

onBeforeUnmount(() => {
  handle?.destroy();
  handle = null;
  darkObserver?.disconnect();
  darkObserver = null;
});

function onHover(paused: boolean): void {
  handle?.setHoverPaused(paused);
}
</script>

<template>
  <div class="hero-cube">
    <img
      v-show="!ready"
      class="hero-cube__poster"
      src="/hero-poster.svg"
      alt="Six tetrahedra exploded apart, the scissors-congruent decomposition of a unit cube"
    />
    <canvas
      ref="canvasEl"
      class="hero-cube__canvas"
      :class="{ 'hero-cube__canvas--ready': ready }"
      aria-hidden="true"
      @pointerenter="onHover(true)"
      @pointerleave="onHover(false)"
    />
  </div>
</template>

<style scoped>
.hero-cube {
  position: relative;
  width: 100%;
  height: 100%;
}

.hero-cube__poster,
.hero-cube__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

.hero-cube__canvas {
  opacity: 0;
  transition: opacity 320ms ease;
  touch-action: pan-y;
  cursor: grab;
}

.hero-cube__canvas:active {
  cursor: grabbing;
}

.hero-cube__canvas--ready {
  opacity: 1;
}
</style>
