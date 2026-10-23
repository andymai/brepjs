/**
 * Namespace: modifiers — shape modification operations
 */
export {
  fillet,
  chamfer,
  shell,
  removeFaces,
  offset,
  thicken,
  draft,
  heal,
  simplify,
} from '@/topology/api.js';

export { variableFillet } from '@/topology/modifierFns.js';
