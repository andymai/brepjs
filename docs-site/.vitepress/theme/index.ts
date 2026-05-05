import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import { h } from 'vue';
import Layout from './Layout.vue';
import './custom.css';

const theme: Theme = {
  extends: DefaultTheme,
  Layout: () => h(Layout),
};

export default theme;
