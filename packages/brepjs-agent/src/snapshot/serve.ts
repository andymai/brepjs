export interface ServeOptions {
  file?: string;
  port?: number;
  shutdownAfterMs?: number;
}
export interface ServeHandle {
  port: number;
  url: string;
  reused: boolean;
  close(): Promise<void>;
}
export function serve(_opts: ServeOptions): Promise<ServeHandle> {
  throw new Error('not implemented — Phase D Task D4');
}
