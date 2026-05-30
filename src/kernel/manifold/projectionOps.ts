import type { ProjectionCapability } from '@/kernel/types.js';
import type { ManifoldModule } from './helpers.js';
import { notImplemented } from './helpers.js';

export function makeProjectionOps(_module: ManifoldModule): ProjectionCapability {
  return {
    projectEdges: () => notImplemented('projectEdges'),
  };
}
