<script setup lang="ts">
import { onMounted, ref } from 'vue';

const props = defineProps<{ id: string; label: string; category: string; lines: number }>();

// The turntable is an optional asset. It loads after the static picture, and a
// missing file leaves the static picture in place.
const spin = ref(false);
onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const probe = new Image();
  probe.onload = () => {
    spin.value = true;
  };
  probe.src = `/playground/example-thumbs/${props.id}.turntable.webp`;
});
</script>

<template>
  <figure class="example-figure">
    <a
      :href="`/playground/examples/${id}`"
      target="_blank"
      rel="noopener"
      class="example-figure-art"
    >
      <img
        :src="`/playground/example-thumbs/${id}${spin ? '.turntable' : ''}.webp`"
        :alt="`${label}, rendered in the brepjs playground`"
        width="640"
        height="640"
      />
    </a>
    <figcaption>
      <span class="example-meta">{{ category }} · {{ lines }} lines</span>
      <a
        class="example-run-link"
        :href="`/playground/examples/${id}`"
        target="_blank"
        rel="noopener"
        >▶ Run it in the playground</a
      >
    </figcaption>
  </figure>
</template>
