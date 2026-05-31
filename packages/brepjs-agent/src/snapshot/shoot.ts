export interface ShootOptions {
  file: string;
  outDir: string;
  views?: readonly ('iso' | 'front' | 'top' | 'right')[];
  port?: number;
  shutdownAfterMs?: number;
}
export interface ShootResult {
  outDir: string;
  pngs: string[];
}
export function shoot(_opts: ShootOptions): Promise<ShootResult> {
  throw new Error('not implemented — Phase D Task D3');
}
