import { getKernel } from '@/kernel/index.js';
import { OcctWasmAdapter } from '@/kernel/occtWasm/occtWasmAdapter.js';

/** Native live slots, including slots invisible to JavaScript handle statistics. */
export function nativeShapeCount(): number {
  const adapter = getKernel();
  if (!(adapter instanceof OcctWasmAdapter)) {
    throw new Error('The native arena oracle requires the active occt-wasm adapter');
  }
  const raw = adapter.retainedKernelOwner?.getRawKernel();
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !('getShapeCount' in raw) ||
    typeof raw.getShapeCount !== 'function'
  ) {
    throw new Error('Required occt-wasm getShapeCount() counter is unavailable');
  }
  const count: unknown = Reflect.apply(raw.getShapeCount, raw, []);
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
    throw new Error('Required occt-wasm getShapeCount() returned an invalid count');
  }
  return count;
}
