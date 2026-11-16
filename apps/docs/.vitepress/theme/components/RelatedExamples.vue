<script setup lang="ts">
import { withBase } from 'vitepress';
import { data as catalog } from '../../../examples/examples.data';

const props = defineProps<{ ids: string }>();

const all = new Map(catalog.flatMap((c) => c.examples).map((e) => [e.id, e] as const));
// A page names its examples by id. An id that the library no longer has fails the
// build here, so a renamed example cannot leave a dead card behind.
const examples = props.ids
  .split(/[\s,]+/)
  .filter(Boolean)
  .map((id) => {
    const example = all.get(id);
    if (!example) throw new Error(`RelatedExamples: the playground has no example "${id}"`);
    return example;
  });
</script>

<template>
  <ul class="example-grid example-grid-compact">
    <li v-for="example in examples" :key="example.id">
      <a :href="withBase(`/examples/${example.id}`)" class="example-card">
        <img
          :src="`/playground/example-thumbs/${example.id}.webp`"
          alt=""
          loading="lazy"
          width="320"
          height="320"
        />
        <span class="example-card-text">
          <strong>{{ example.label }}</strong>
          <span class="example-card-desc">{{ example.description }}</span>
        </span>
      </a>
    </li>
  </ul>
  <p><a :href="withBase('/examples/')">See all examples →</a></p>
</template>
