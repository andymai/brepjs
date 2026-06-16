<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import { computed, onMounted, nextTick, watch } from 'vue';
import { useData, useRoute } from 'vitepress';
import { decorateCodeBlocks } from './playgroundLink';
import Landing from './components/Landing.vue';

const { Layout } = DefaultTheme;
const { frontmatter } = useData();
const route = useRoute();

const isLanding = computed(() => frontmatter.value.landing === true);

const decorate = () => {
  void nextTick(() => decorateCodeBlocks());
};

onMounted(decorate);
watch(() => route.path, decorate);
</script>

<template>
  <Landing v-if="isLanding" />
  <Layout v-else />
</template>
