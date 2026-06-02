import { z } from 'zod';

/**
 * Shared Zod schemas for the optional material-layer and classification fields
 * that element specs (wall/slab/beam/column) accept. Centralised here so every
 * spec validates these fields identically.
 */

export const MaterialLayerSchema = z.object({
  name: z.string().min(1),
  thicknessMm: z.number().positive(),
  isVentilated: z.boolean().optional(),
  priority: z.number().int().optional(),
});

export const ClassificationRefSchema = z.object({
  system: z.string().min(1),
  edition: z.string().optional(),
  location: z.string().optional(),
  code: z.string().min(1),
  description: z.string().optional(),
});
