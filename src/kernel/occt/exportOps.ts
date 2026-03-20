/**
 * STEP export helper operations for OCCT.
 *
 * Wraps the OCCT string, color, and Interface_Static configuration
 * needed by XCAF-based STEP assembly exporters.
 */

import type { KernelInstance, KernelType } from '@/kernel/types.js';

/** Wrap a JS string as an OCCT TCollection_ExtendedString. */
export function wrapString(oc: KernelInstance, str: string): KernelType {
  return new oc.TCollection_ExtendedString_2(str, true);
}

/** Create an OCCT Quantity_ColorRGBA from RGB 0-255 values and alpha 0-1. */
export function wrapColorRGBA(
  oc: KernelInstance,
  red: number,
  green: number,
  blue: number,
  alpha: number
): KernelType {
  return new oc.Quantity_ColorRGBA_5(red / 255, green / 255, blue / 255, alpha);
}

/** Configure STEP writer unit settings via OCCT Interface_Static. */
export function configureStepUnits(
  oc: KernelInstance,
  unit: string | undefined,
  modelUnit: string | undefined
): void {
  if (!unit && !modelUnit) return;
  // Trigger static initialization by constructing a writer
  const initWriter = new oc.STEPCAFControl_Writer_1();
  initWriter.delete();
  oc.Interface_Static.SetCVal('xstep.cascade.unit', (modelUnit ?? unit ?? 'MM').toUpperCase());
  oc.Interface_Static.SetCVal('write.step.unit', (unit ?? modelUnit ?? 'MM').toUpperCase());
}

/** Configure STEP writer standard settings (color, layer, name, schema). */
export function configureStepWriter(oc: KernelInstance, writer: KernelType): void {
  writer.SetColorMode(true);
  writer.SetLayerMode(true);
  writer.SetNameMode(true);
  oc.Interface_Static.SetIVal('write.surfacecurve.mode', true);
  oc.Interface_Static.SetIVal('write.precision.mode', 0);
  oc.Interface_Static.SetIVal('write.step.assembly', 2);
  oc.Interface_Static.SetIVal('write.step.schema', 5);
}
