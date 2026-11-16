<script setup lang="ts">
import { computed, ref } from 'vue';
import { withBase } from 'vitepress';
import { data as catalog } from '../../../examples/examples.data';
import { searchExamples, type SearchEntry } from '../../../../playground/src/lib/examples/search';

// The same search as the playground gallery, over the build-time catalog. The
// catalog leaves the code out, so each entry carries its import list instead.
const index: SearchEntry[] = catalog.flatMap((category) =>
  category.examples.map((example) => ({
    example: { id: example.id, label: example.label, description: example.description, code: '' },
    categoryId: category.id,
    categoryLabel: category.label,
    api: example.api.map((name) => name.toLowerCase()),
    apiNames: example.api,
    label: example.label.toLowerCase(),
    description: example.description.toLowerCase(),
  }))
);

const total = index.length;
const query = ref('');
const hits = computed(() => searchExamples(index, query.value));
const searching = computed(() => query.value.trim().length > 0);

const sections = computed(() => {
  if (searching.value) {
    return [
      { id: 'results', label: `${hits.value.length} of ${total} examples`, hits: hits.value },
    ];
  }
  return catalog.map((category) => ({
    id: category.id,
    label: category.label,
    hits: hits.value.filter((hit) => hit.entry.categoryId === category.id),
  }));
});
</script>

<template>
  <div class="example-index">
    <input
      v-model="query"
      type="search"
      class="example-search"
      placeholder="Search by name or function (gear, loft, m6 screw)"
      aria-label="Search examples"
    />
    <p v-if="searching && hits.length === 0" class="example-empty">
      No example matches this search.
    </p>
    <section v-for="section in sections" :key="section.id">
      <h2 :id="section.id">{{ section.label }}</h2>
      <ul class="example-grid">
        <li v-for="hit in section.hits" :key="hit.entry.example.id">
          <a :href="withBase(`/examples/${hit.entry.example.id}`)" class="example-card">
            <img
              :src="`/playground/example-thumbs/${hit.entry.example.id}.webp`"
              alt=""
              loading="lazy"
              width="320"
              height="320"
            />
            <span class="example-card-text">
              <strong>{{ hit.entry.example.label }}</strong>
              <span class="example-card-desc">{{ hit.entry.example.description }}</span>
              <span v-if="hit.matchedApi.length" class="example-card-api">
                <code v-for="name in hit.matchedApi.slice(0, 3)" :key="name">{{ name }}()</code>
              </span>
            </span>
          </a>
        </li>
      </ul>
    </section>
  </div>
</template>
