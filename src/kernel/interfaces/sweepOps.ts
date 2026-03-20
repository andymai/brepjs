/**
 * KernelSweepOps — extrusion, revolution, loft, and sweep operations.
 *
 * Covers basic and advanced sweep operations including pipe shells,
 * helical sweeps, and scaling-law-driven extrusions. Analogous to
 * OCCT's BRepOffsetAPI_MakePipeShell and BRepPrimAPI_MakeRevol.
 *
 * @see {@link KernelModifierOps} for post-sweep modifications (fillet, chamfer).
 */

import type { KernelShape, KernelType } from '@/kernel/types.js';

export interface KernelSweepOps {
  extrude(face: KernelShape, direction: [number, number, number], length: number): KernelShape;
  revolve(shape: KernelShape, axis: KernelType, angle: number): KernelShape;
  loft(
    wires: KernelShape[],
    ruled?: boolean,
    startShape?: KernelShape,
    endShape?: KernelShape
  ): KernelShape;
  sweep(wire: KernelShape, spine: KernelShape, options?: { transitionMode?: number }): KernelShape;
  simplePipe(profile: KernelShape, spine: KernelShape): KernelShape;

  /** Helical sweep of a profile around an axis. */
  helicalSweep(
    profile: KernelShape,
    axisOrigin: [number, number, number],
    axisDirection: [number, number, number],
    radius: number,
    pitch: number,
    turns: number
  ): KernelShape;

  /** Sweep with options (contact mode, scale law, segments). */
  sweepWithOptions(
    profile: KernelShape,
    pathEdge: KernelShape,
    contactMode: string,
    scaleValues: number[],
    segments: number
  ): KernelShape;

  /** Sweep a profile along a spine with advanced options (transition mode, auxiliary spine, law). */
  sweepPipeShell(
    profile: KernelShape,
    spine: KernelShape,
    options?: {
      transitionMode?: 'transformed' | 'round' | 'right';
      auxiliary?: KernelShape;
      law?: KernelType;
      contact?: boolean;
      correction?: boolean;
      frenet?: boolean;
      support?: KernelType;
      shellMode?: boolean;
      tolerance?: number | undefined;
      boundTolerance?: number | undefined;
      angularTolerance?: number | undefined;
      maxDegree?: number | undefined;
      maxSegments?: number | undefined;
    }
  ): KernelShape | { shape: KernelShape; firstShape: KernelShape; lastShape: KernelShape };

  /** Loft through wires with options for shell mode, ruled surface, and vertex caps. */
  loftAdvanced(
    wires: KernelShape[],
    options?: {
      solid?: boolean;
      ruled?: boolean;
      tolerance?: number;
      startVertex?: KernelShape;
      endVertex?: KernelShape;
    }
  ): KernelShape;

  /** Build an extrusion scaling law (s-curve or linear). */
  buildExtrusionLaw(profile: 'linear' | 's-curve', length: number, endFactor: number): KernelType;

  /** Revolve a shape around an axis defined by center+direction (Vec3s, not KernelType axis). */
  revolveVec(
    shape: KernelShape,
    center: [number, number, number],
    direction: [number, number, number],
    angle: number
  ): KernelShape;

  /** Create a draft prism (tapered extrusion with draft angle). */
  draftPrism(
    shape: KernelShape,
    face: KernelShape,
    baseFace: KernelShape,
    height: number | null,
    angleDeg: number,
    fuse: boolean
  ): KernelShape;
}
