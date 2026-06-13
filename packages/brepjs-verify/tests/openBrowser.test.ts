import { describe, it, expect } from 'vitest';
import { browserCommand, shouldAutoOpen } from '@/cli/openBrowser.js';

describe('browserCommand', () => {
  it('uses the platform-appropriate opener', () => {
    expect(browserCommand('http://x', 'darwin')).toEqual(['open', ['http://x']]);
    expect(browserCommand('http://x', 'win32')).toEqual([
      'rundll32',
      ['url.dll,FileProtocolHandler', 'http://x'],
    ]);
    expect(browserCommand('http://x', 'linux')).toEqual(['xdg-open', ['http://x']]);
  });
});

describe('shouldAutoOpen', () => {
  it('opens in an interactive non-CI session', () => {
    expect(shouldAutoOpen({ env: {}, platform: 'darwin', isTTY: true })).toBe(true);
  });

  it('is suppressed when stderr is not a TTY (piped / agent runs)', () => {
    expect(shouldAutoOpen({ env: {}, platform: 'darwin', isTTY: false })).toBe(false);
  });

  it('is suppressed under CI', () => {
    expect(shouldAutoOpen({ env: { CI: '1' }, platform: 'darwin', isTTY: true })).toBe(false);
  });

  it('is suppressed on Linux without a display server', () => {
    expect(shouldAutoOpen({ env: {}, platform: 'linux', isTTY: true })).toBe(false);
    expect(shouldAutoOpen({ env: { DISPLAY: ':0' }, platform: 'linux', isTTY: true })).toBe(true);
    expect(
      shouldAutoOpen({ env: { WAYLAND_DISPLAY: 'wayland-0' }, platform: 'linux', isTTY: true })
    ).toBe(true);
  });

  it('a display server is not required off Linux', () => {
    expect(shouldAutoOpen({ env: {}, platform: 'win32', isTTY: true })).toBe(true);
  });
});
