<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useData } from 'vitepress';

const props = defineProps<{ code: string }>();
const { isDark } = useData();
const svg = ref('');

// Mermaid writes this id into the SVG (marker and style references), so every
// render needs its own or two diagrams on a page share arrowheads.
let renderCount = 0;
const instance = Math.random().toString(36).slice(2, 8);

async function render(): Promise<void> {
  // Imported on demand so mermaid stays out of the SSR prerender and the main
  // chunk; only pages with a diagram fetch it.
  const { default: mermaid } = await import('mermaid');
  // Mermaid 12 defaults to a new layout, look, and palette, and its flowcharts
  // wrap labels at 120px into nodes at least 120px wide; these keep the
  // diagrams as they rendered on mermaid 11.
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark.value ? 'dark' : 'default',
    look: 'classic',
    layout: 'dagre',
    flowchart: { wrappingWidth: 200, minNodeWidth: 0 },
  });
  const id = `mermaid-${instance}-${renderCount++}`;
  const result = await mermaid.render(id, decodeURIComponent(props.code));
  svg.value = result.svg;
}

onMounted(render);
watch(isDark, render);
</script>

<template>
  <div class="mermaid" v-html="svg" />
</template>
