import { initOC } from '@/kernel/occtWasm/occtWasmAdapter.js';

beforeAll(async () => {
  await initOC();
}, 30000);
