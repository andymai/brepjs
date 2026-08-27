import { z } from 'zod';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';

export type AssemblyPredefinedType =
  | 'ACCESSORY_ASSEMBLY'
  | 'ARCH'
  | 'BEAM_GRID'
  | 'BRACED_FRAME'
  | 'GIRDER'
  | 'REINFORCEMENT_UNIT'
  | 'RIGID_FRAME'
  | 'SLAB_FIELD'
  | 'TRUSS'
  | 'USERDEFINED'
  | 'NOTDEFINED';

/**
 * Enumeration literals transcribed verbatim from `IfcAssemblyPlaceEnum` in the
 * buildingSMART IFC 4.3 ADD2 (`IFC4X3_ADD2`) EXPRESS schema:
 * https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/IFC4X3_ADD2.exp
 */
export type AssemblyPlace = 'SITE' | 'FACTORY' | 'NOTDEFINED';

/**
 * A grouping container (IfcElementAssembly). Carries no geometry of its own;
 * parts are attached via {@link BimModel.aggregate} (IfcRelAggregates) or
 * {@link BimModel.nest} (IfcRelNests, order-preserving).
 */
export interface ElementAssemblySpec {
  readonly name?: string | undefined;
  readonly predefinedType?: AssemblyPredefinedType | undefined;
  readonly assemblyPlace?: AssemblyPlace | undefined;
}

const ElementAssemblySpecSchema = z.object({
  name: z.string().optional(),
  predefinedType: z
    .enum([
      'ACCESSORY_ASSEMBLY',
      'ARCH',
      'BEAM_GRID',
      'BRACED_FRAME',
      'GIRDER',
      'REINFORCEMENT_UNIT',
      'RIGID_FRAME',
      'SLAB_FIELD',
      'TRUSS',
      'USERDEFINED',
      'NOTDEFINED',
    ])
    .optional(),
  assemblyPlace: z.enum(['SITE', 'FACTORY', 'NOTDEFINED']).optional(),
});

export function parseElementAssemblySpec(input: unknown): Result<ElementAssemblySpec, BimError> {
  const result = ElementAssemblySpecSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_ASSEMBLY_SPEC', result.error.message, result.error));
  }
  return ok(result.data as ElementAssemblySpec);
}
