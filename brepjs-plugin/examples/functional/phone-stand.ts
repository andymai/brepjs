/**
 * Phone Stand with Cable Routing
 *
 * Functional requirements:
 * - ONTO: Phone rests on angled surface
 * - THROUGH: Cable routing channel for charging
 * - Stable base, angled back support
 *
 * Manufacturing: 3D printing (FDM)
 * Material: PLA/PETG
 */

import initOpenCascade from 'opencascade.js';
import { initFromOC, box, shape, exportSTL } from 'brepjs';

interface PhoneStandParams {
  baseWidth: number;
  baseDepth: number;
  baseHeight: number;
  backHeight: number;
  angle: number; // Degrees from vertical
  cableChannelWidth: number;
}

function createPhoneStand(params: PhoneStandParams) {
  // Base plate
  const base = box(params.baseWidth, params.baseDepth, params.baseHeight);

  // Angled back support
  // (Simplified - in real implementation would use rotation)
  const back = box(params.baseWidth, 5, params.backHeight, {
    at: [0, params.baseDepth - 5, params.baseHeight],
  });

  let stand = shape(base).fuse(back).val;

  // Cable routing channel (hollow through base)
  const channel = box(
    params.cableChannelWidth,
    params.baseDepth + 2,
    params.baseHeight + 2,
    { at: [params.baseWidth / 2 - params.cableChannelWidth / 2, -1, -1] }
  );

  stand = shape(stand).cut(channel).val;

  return stand;
}

async function main() {
  const oc = await initOpenCascade();
  initFromOC(oc);

  const params: PhoneStandParams = {
    baseWidth: 80,
    baseDepth: 60,
    baseHeight: 10,
    backHeight: 100,
    angle: 70, // 70° from vertical
    cableChannelWidth: 10,
  };

  const model = createPhoneStand(params);
  await exportSTL(model, 'examples/output/phone-stand.stl');
  console.log('✓ Phone stand generated');
}

main().catch(console.error);
