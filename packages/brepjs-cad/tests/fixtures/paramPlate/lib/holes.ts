export type BoltSize = 'M4' | 'M5' | 'M6';

const CLEARANCE_RADIUS: Record<BoltSize, number> = { M4: 2.2, M5: 2.7, M6: 3.2 };

export function clearanceRadius(size: BoltSize): number {
  return CLEARANCE_RADIUS[size];
}
