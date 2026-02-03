/**
 * Shared utilities for STEP/STL exporters.
 * Used by both class-based (exporters.ts) and functional (exporterFns.ts) APIs.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT types are dynamic
type OcType = any;

import { getKernel } from '../kernel/index.js';
import type { Deletable } from '../core/disposal.js';

// ---------------------------------------------------------------------------
// String and color utilities
// ---------------------------------------------------------------------------

/** Wrap a string for OCCT TCollection_ExtendedString. */
export function wrapString(str: string): OcType {
  const oc = getKernel().oc;
  return new oc.TCollection_ExtendedString_2(str, true);
}

/** Parse a 2-character hex slice at the given index. */
function parseSlice(hex: string, index: number): number {
  return parseInt(hex.slice(index * 2, (index + 1) * 2), 16);
}

/** Convert a hex color string to RGB tuple [0-255]. */
export function colorFromHex(hex: string): [number, number, number] {
  let color = hex;
  if (color.indexOf('#') === 0) color = color.slice(1);
  if (color.length === 3) {
    color = color.replace(/([0-9a-f])/gi, '$1$1');
  }
  return [parseSlice(color, 0), parseSlice(color, 1), parseSlice(color, 2)];
}

/** Create an OCCT Quantity_ColorRGBA from a hex string. */
export function wrapColor(hex: string, alpha = 1): OcType {
  const oc = getKernel().oc;
  const [red, green, blue] = colorFromHex(hex);
  return new oc.Quantity_ColorRGBA_5(red / 255, green / 255, blue / 255, alpha);
}

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/** Supported length units for STEP export. */
export type SupportedUnit = 'M' | 'CM' | 'MM' | 'INCH' | 'FT' | 'm' | 'mm' | 'cm' | 'inch' | 'ft';

// ---------------------------------------------------------------------------
// STEP writer configuration
// ---------------------------------------------------------------------------

/** Configure STEP writer unit settings. */
export function configureStepUnits(
  unit: SupportedUnit | undefined,
  modelUnit: SupportedUnit | undefined,
  r: <T extends Deletable>(v: T) => T
): void {
  if (!unit && !modelUnit) return;

  const oc = getKernel().oc;
  r(new oc.STEPCAFControl_Writer_1());
  oc.Interface_Static.SetCVal('xstep.cascade.unit', (modelUnit || unit || 'MM').toUpperCase());
  oc.Interface_Static.SetCVal('write.step.unit', (unit || modelUnit || 'MM').toUpperCase());
}

/** Configure STEP writer standard settings. */
export function configureStepWriter(writer: OcType): void {
  const oc = getKernel().oc;
  writer.SetColorMode(true);
  writer.SetLayerMode(true);
  writer.SetNameMode(true);
  oc.Interface_Static.SetIVal('write.surfacecurve.mode', true);
  oc.Interface_Static.SetIVal('write.precision.mode', 0);
  oc.Interface_Static.SetIVal('write.step.assembly', 2);
  oc.Interface_Static.SetIVal('write.step.schema', 5);
}
