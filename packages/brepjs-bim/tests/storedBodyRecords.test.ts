import { bodyRecordContract } from './helpers/bodyRecordContract.js';
for (const category of [
  'SLAB',
  'ROOF',
  'SPACE',
  'COVERING',
  'BEAM',
  'COLUMN',
  'FOOTING',
  'PILE',
  'PROXY',
  'EARTHWORKS_FILL',
] as const) {
  bodyRecordContract(category);
}
