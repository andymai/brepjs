import opencascade from 'brepjs-opencascade';
import { initFromOC } from './kernel/index.js';

const oc = await opencascade();
initFromOC(oc);

export * from './index.js';
