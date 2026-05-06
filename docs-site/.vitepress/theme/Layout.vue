<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import { onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vitepress';
import { decorateCodeBlocks } from './playgroundLink';
import HeroAnimation from './HeroAnimation.vue';

const { Layout } = DefaultTheme;
const route = useRoute();

const decorate = () => {
  void nextTick(() => decorateCodeBlocks());
};

onMounted(decorate);
watch(() => route.path, decorate);
</script>

<template>
  <Layout>
    <template #home-hero-image>
      <HeroAnimation />
    </template>
  </Layout>
</template>
