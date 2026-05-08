import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import { h } from 'vue';
import Layout from './Layout.vue';
import './custom.css';

const theme: Theme = {
  extends: DefaultTheme,
  Layout: () => h(Layout),
  enhanceApp() {
    // VitePress prerenders pages, so guard against SSR. inject() wraps
    // history.pushState — VitePress's own router uses it, so route changes
    // emit pageviews automatically once mounted.
    if (typeof window !== 'undefined') {
      void import('@vercel/analytics').then(({ inject }) => inject());
    }
  },
};

export default theme;
