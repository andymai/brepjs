/**
 * Debug test for the lip profile 2D boolean — inspects intermediate state.
 */

/* eslint-disable no-console -- debug test that inspects intermediate geometry via console output */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { draw, drawRoundedRectangle, drawRectangle } from '@/index.js';
import type { Drawing } from '@/index.js';

const LIP_TAPER_WIDTH = 2.6;
const LIP_SMALL_TAPER = 0.7;
const LIP_VERTICAL_PART = 1.8;
const LIP_BIG_TAPER = 1.9;
const LIP_EXTENSION = 1.2;

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('lip profile 2D boolean debug', () => {
  function buildLipSketch(): Drawing {
    return draw([-LIP_TAPER_WIDTH, 0])
      .line(LIP_SMALL_TAPER, LIP_SMALL_TAPER)
      .vLine(LIP_VERTICAL_PART)
      .line(LIP_BIG_TAPER, LIP_BIG_TAPER)
      .vLineTo(-(LIP_TAPER_WIDTH + LIP_EXTENSION))
      .lineTo([-LIP_TAPER_WIDTH, -LIP_EXTENSION])
      .close();
  }

  it('inspects lip sketch blueprint', () => {
    const lipSketch = buildLipSketch();
    const bp = lipSketch.blueprint;
    console.log('Lip sketch curves:', bp.curves.length);
    for (const c of bp.curves) {
      console.log(
        `  ${c.typeName}: (${c.firstPoint[0].toFixed(4)}, ${c.firstPoint[1].toFixed(4)}) → (${c.lastPoint[0].toFixed(4)}, ${c.lastPoint[1].toFixed(4)})`
      );
    }
    expect(bp.curves.length).toBeGreaterThan(0);
  });

  it('inspects intersect result', () => {
    const lipSketch = buildLipSketch();
    const roundedRect = drawRoundedRectangle(10, 10).translate(-5, 0);

    console.log('Rounded rect curves:', roundedRect.blueprint.curves.length);
    for (const c of roundedRect.blueprint.curves) {
      console.log(
        `  ${c.typeName}: (${c.firstPoint[0].toFixed(4)}, ${c.firstPoint[1].toFixed(4)}) → (${c.lastPoint[0].toFixed(4)}, ${c.lastPoint[1].toFixed(4)})`
      );
    }

    const intersected = lipSketch.intersect(roundedRect);
    const ibp = intersected.blueprint;
    console.log('\nIntersect result curves:', ibp.curves.length);
    for (const c of ibp.curves) {
      console.log(
        `  ${c.typeName}: (${c.firstPoint[0].toFixed(4)}, ${c.firstPoint[1].toFixed(4)}) → (${c.lastPoint[0].toFixed(4)}, ${c.lastPoint[1].toFixed(4)})`
      );
    }

    // Check for degenerate curves
    let degenerateCount = 0;
    for (const c of ibp.curves) {
      const dx = Math.abs(c.firstPoint[0] - c.lastPoint[0]);
      const dy = Math.abs(c.firstPoint[1] - c.lastPoint[1]);
      if (dx < 1e-6 && dy < 1e-6) {
        degenerateCount++;
        console.log(
          `  DEGENERATE: (${c.firstPoint[0]}, ${c.firstPoint[1]}) → (${c.lastPoint[0]}, ${c.lastPoint[1]})`
        );
      }
    }
    console.log(`Degenerate curves: ${degenerateCount}`);

    expect(ibp.curves.length).toBeGreaterThan(0);
  });

  it('inspects cut result', () => {
    const lipSketch = buildLipSketch();
    const intersected = lipSketch.intersect(drawRoundedRectangle(10, 10).translate(-5, 0));
    const cutRect = drawRectangle(LIP_EXTENSION, 10).translate(-LIP_EXTENSION / 2, -5);

    console.log('Cut rect curves:', cutRect.blueprint.curves.length);
    for (const c of cutRect.blueprint.curves) {
      console.log(
        `  ${c.typeName}: (${c.firstPoint[0].toFixed(4)}, ${c.firstPoint[1].toFixed(4)}) → (${c.lastPoint[0].toFixed(4)}, ${c.lastPoint[1].toFixed(4)})`
      );
    }

    const result = intersected.cut(cutRect);
    const rbp = result.blueprint;
    console.log('\nCut result curves:', rbp.curves.length);
    for (const c of rbp.curves) {
      console.log(
        `  ${c.typeName}: (${c.firstPoint[0].toFixed(4)}, ${c.firstPoint[1].toFixed(4)}) → (${c.lastPoint[0].toFixed(4)}, ${c.lastPoint[1].toFixed(4)})`
      );
    }

    expect(rbp.curves.length).toBeGreaterThan(0);
  });
});
