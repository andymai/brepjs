import type { PuppeteerNode } from 'puppeteer';
import {
  encodePreviewPayload,
  type ElementStyle,
  type PreviewModelPayload,
  type ViewMode,
} from 'brepjs-viewer';
import { startPreviewServer } from '../preview/server.js';
import { CHROME_ARGS, VIEWPORT } from '../snapshot/chrome.js';

export type RenderView = 'iso' | 'front' | 'top' | 'right';
export type SectionAxis = 'x' | 'y' | 'z';

export interface RenderSection {
  readonly axis: SectionAxis;
  /** Cut position in model millimetres. */
  readonly at: number;
  readonly keep: 'above' | 'below';
}

export interface RenderShot {
  readonly view: RenderView;
  readonly viewMode?: ViewMode | undefined;
  readonly section?: RenderSection | undefined;
  readonly projection?: 'perspective' | 'orthographic' | undefined;
}

interface ShotFrame {
  readonly position: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  /** The camera's own up axis, square to direction. */
  readonly up: readonly [number, number, number];
  /** Width over height. */
  readonly aspect: number;
}

/** The camera a shot was framed with, in model millimetres; viewer/src/screenshotApi.ts reports it. */
export type ShotCamera =
  | (ShotFrame & {
      readonly projection: 'perspective';
      /** Vertical field of view in degrees. */
      readonly fov: number;
    })
  | (ShotFrame & {
      readonly projection: 'orthographic';
      /** Visible height in millimetres. */
      readonly height: number;
    });

export interface RenderedShots {
  readonly pngs: Uint8Array[];
  /** Per shot; null when the page reported none. */
  readonly cameras: (ShotCamera | null)[];
}

export interface RenderRequest {
  readonly shots: readonly RenderShot[];
  readonly style?: ElementStyle | undefined;
  /** Burn the drawn elements' bounding-box size into the image. */
  readonly dims: boolean;
}

// The preview page renders a server-evaluated payload (no in-browser kernel), so it is ready far
// sooner than the snapshot page; the budget only has to cover a cold Chrome start.
const READY_TIMEOUT_MS = 60_000;
const SETTLE_MS = 400;

/** The page's section control takes a fraction of the model's span on the cut axis. */
export function sectionFraction(
  section: RenderSection | undefined,
  bounds: PreviewModelPayload['measurements']['bounds']
): { axis: SectionAxis; frac: number; flip: boolean } | null {
  if (section === undefined || bounds === undefined) return null;
  const lo = bounds[`${section.axis}Min`];
  const hi = bounds[`${section.axis}Max`];
  const span = hi - lo;
  const frac = span > 0 ? Math.min(1, Math.max(0, (section.at - lo) / span)) : 0.5;
  return { axis: section.axis, frac, flip: section.keep === 'below' };
}

async function loadPuppeteer(): Promise<PuppeteerNode> {
  try {
    return (await import('puppeteer')).default;
  } catch {
    throw new Error('render_view needs puppeteer and its Chrome: npm i -D puppeteer');
  }
}

/** Render a payload through the preview viewer page, one PNG and its camera per shot. */
export async function renderPayload(
  payload: PreviewModelPayload,
  req: RenderRequest
): Promise<RenderedShots> {
  const puppeteer = await loadPuppeteer();
  const server = await startPreviewServer(encodePreviewPayload(payload));
  try {
    const browser = await puppeteer.launch({ headless: true, args: [...CHROME_ARGS] });
    try {
      const page = await browser.newPage();
      await page.setViewport(VIEWPORT);
      await page.goto(`${server.url}&ui=0${req.dims ? '&dims=1' : ''}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await page.waitForFunction('window.__ready === true', { timeout: READY_TIMEOUT_MS });
      const pngs: Uint8Array[] = [];
      const cameras: (ShotCamera | null)[] = [];
      for (const shot of req.shots) {
        const scene = {
          view: shot.view,
          viewMode: shot.viewMode ?? 'solid',
          section: sectionFraction(shot.section, payload.measurements.bounds),
          elements: req.style ?? null,
          projection: shot.projection ?? 'perspective',
        };
        await page.evaluate((c) => {
          (globalThis as unknown as { __setScene(s: unknown): void }).__setScene(c);
        }, scene);
        await new Promise((done) => setTimeout(done, SETTLE_MS));
        pngs.push(await page.screenshot({ type: 'png' }));
        cameras.push(
          await page.evaluate(
            () =>
              (globalThis as unknown as { __viewCamera?: () => ShotCamera }).__viewCamera?.() ??
              null
          )
        );
      }
      return { pngs, cameras };
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
}
