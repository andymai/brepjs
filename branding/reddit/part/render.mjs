import { shoot } from '../../../packages/brepjs-cad/dist/snapshot/shoot.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { pngs } = await shoot({
  file: resolve(here, 'pipe-tee.step'),
  outDir: resolve(here, 'shots-clean'),
  views: ['iso'],
  dimensions: false,
  settleMs: 700,
});
console.warn('rendered:', pngs);
