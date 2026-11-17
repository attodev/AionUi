/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(update): checks the update wiring follows the configured feed address — see docs/fork/update-feed-overlay.md

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common/platform/bridge', () => ({
  bridge: {
    buildProvider: vi.fn(() => ({ provider: vi.fn(() => vi.fn()), invoke: vi.fn() })),
    buildEmitter: vi.fn(() => ({ emit: vi.fn(), on: vi.fn() })),
  },
}));

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '1.0.0'),
    getPath: vi.fn(() => '/test/path'),
    exit: vi.fn(),
    isPackaged: true,
  },
  autoUpdater: { on: vi.fn(), removeListener: vi.fn() },
}));

vi.mock('electron-updater', () => ({
  autoUpdater: {
    logger: null,
    setFeedURL: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  },
}));

vi.mock('electron-log', () => ({
  default: { transports: { file: { level: 'info' } }, debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@process/services/i18n', () => ({
  default: { t: (key: string) => key },
}));

const FEED = 'https://updates.example.com:8443/aionui/';
const FEED_NORMALIZED = 'https://updates.example.com:8443/aionui';

const YML = `version: 2.2.3
files:
  - url: AionUi-2.2.3-linux-amd64.deb
    size: 1
path: AionUi-2.2.3-linux-amd64.deb
`;

const loadBridge = async () => {
  vi.resetModules();
  return import('@process/bridge/updateBridge');
};

const getHandler = async (name: 'check' | 'download') => {
  const { initUpdateBridge } = await loadBridge();
  const { ipcBridge } = await import('@/common');
  initUpdateBridge();
  const provider = vi.mocked(ipcBridge.update[name].provider);
  const lastCall = provider.mock.calls.at(-1);
  if (!lastCall) throw new Error(`update.${name} handler not registered`);
  return lastCall[0] as (params: Record<string, unknown>) => Promise<{
    success: boolean;
    msg?: string;
    data?: { latest?: { assets?: Array<{ url: string; fallbackUrl?: string }> } };
  }>;
};

describe('update feed hooks', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('vitest env reaches both projects', () => {
    expect(process.env.AIONUI_UPDATE_BASE_URL).toBe('https://static.aionui.com/releases');
  });

  it('feed options follow AIONUI_UPDATE_BASE_URL', async () => {
    vi.stubEnv('AIONUI_UPDATE_BASE_URL', FEED);
    vi.resetModules();
    const feed = await import('@process/services/updateFeed');
    expect(feed.CDN_UPDATE_BASE_URL).toBe(FEED_NORMALIZED);
    expect(feed.buildCdnFeedOptions().url).toBe(FEED_NORMALIZED);
  });

  it('unset env never falls back to upstream', async () => {
    vi.stubEnv('AIONUI_UPDATE_BASE_URL', '');
    vi.resetModules();
    const feed = await import('@process/services/updateFeed');
    expect(feed.CDN_UPDATE_BASE_URL).toBe('https://update.invalid/releases');
    for (const value of Object.values(feed)) {
      expect(JSON.stringify(typeof value === 'function' ? (value as () => unknown)() : value)).not.toContain(
        'static.aionui.com'
      );
    }
  });

  it('manual asset urls use the configured base', async () => {
    vi.stubEnv('AIONUI_UPDATE_BASE_URL', FEED);
    const { mapCdnManifestToRelease } = await loadBridge();
    const release = mapCdnManifestToRelease(
      { version: '2.2.3', files: [{ url: 'AionUi-2.2.3-linux-amd64.deb', sha512: 'x', size: 1 }] },
      'a/b'
    );
    expect(release?.assets[0].url).toBe(`${FEED_NORMALIZED}/2.2.3/AionUi-2.2.3-linux-amd64.deb`);
  });

  it('manual check uses the disabled github repo by default', async () => {
    vi.stubEnv('AIONUI_UPDATE_BASE_URL', FEED);
    vi.stubEnv('AIONUI_GITHUB_REPO', '');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith(FEED_NORMALIZED)) return new Response(YML, { status: 200 });
        throw new Error(`unexpected fetch: ${url}`);
      })
    );
    const handler = await getHandler('check');
    const result = await handler({});
    expect(result.success).toBe(true);
    const asset = result.data?.latest?.assets?.[0];
    expect(asset?.fallbackUrl).toMatch(
      /^https:\/\/github\.com\/-\/-\/releases\/download\/v2\.2\.3\/AionUi-2\.2\.3-linux-amd64\.deb/
    );
  });

  it('download allow-list follows the feed host', async () => {
    vi.stubEnv('AIONUI_UPDATE_BASE_URL', FEED);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-length': '0' }),
        body: { getReader: () => ({ read: async () => ({ done: true, value: undefined }) }) },
      })
    );
    const handler = await getHandler('download');
    const run = (url: string, id: string) => handler({ downloadId: id, url, file_name: 'x.deb' });

    expect((await run('https://updates.example.com:8443/aionui/2.2.3/x.deb', 'd1')).success).toBe(true);
    expect((await run('http://updates.example.com:8443/aionui/2.2.3/x.deb', 'd2')).msg).toBe('update.errors.httpsOnly');
    expect((await run('https://static.aionui.com/releases/2.2.3/x.deb', 'd3')).msg).toBe(
      'update.errors.hostNotAllowed'
    );
    expect((await run('https://github.com/-/-/releases/download/v2.2.3/x.deb', 'd4')).success).toBe(true);
  });
});
