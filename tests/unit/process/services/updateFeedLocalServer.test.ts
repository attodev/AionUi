/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(update): proves the update flow works against a local feed server with no upstream contact — see docs/fork/update-feed-overlay.md

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppUpdater } from 'electron-updater/out/AppUpdater';
import type { ProviderRuntimeOptions } from 'electron-updater/out/providers/Provider';

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

const INSTALLER = 'AionUi-2.2.3-linux-amd64.deb';
const MANUAL_FEED = 'https://updates.example.com:8443/feed';

let root: string;
let feedDir: string;
let yml: string;
let server: http.Server;
let port: number;
let brokenYml = false;
const serverPaths: string[] = [];
const fetchedUrls: string[] = [];

const startServer = (): Promise<void> =>
  new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const reqPath = (req.url ?? '/').split('?')[0];
      serverPaths.push(reqPath);
      if (brokenYml && reqPath.endsWith('.yml')) {
        res.writeHead(200).end('version: banana\n');
        return;
      }
      const file = path.join(root, 'served', reqPath);
      if (!file.startsWith(path.join(root, 'served')) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200).end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => {
      port = (server.address() as AddressInfo).port;
      resolve();
    });
  });

/** Executor stub: perform the request with Node fetch and hand back the body string. */
const makeRuntimeOptions = (): ProviderRuntimeOptions => ({
  isUseMultipleRangeRequest: true,
  platform: 'linux',
  executor: {
    request: async (options: { protocol?: string; hostname?: string; port?: number; path?: string }) => {
      const url = `${options.protocol ?? 'http:'}//${options.hostname}${options.port ? `:${options.port}` : ''}${options.path ?? ''}`;
      fetchedUrls.push(url);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return response.text();
    },
  } as unknown as ProviderRuntimeOptions['executor'],
});

const makeProvider = async (url: string) => {
  vi.resetModules();
  const { CdnGenericProvider } = await import('@/process/services/cdnGenericProvider');
  const updater = { channel: 'latest', isAddNoCacheQuery: false } as unknown as AppUpdater;
  return new CdnGenericProvider({ provider: 'custom', url }, updater, makeRuntimeOptions());
};

const loadCheckHandler = async () => {
  vi.resetModules();
  const { initUpdateBridge } = await import('@process/bridge/updateBridge');
  const { ipcBridge } = await import('@/common');
  initUpdateBridge();
  const lastCall = vi.mocked(ipcBridge.update.check.provider).mock.calls.at(-1);
  if (!lastCall) throw new Error('update.check handler not registered');
  return lastCall[0] as (params: Record<string, unknown>) => Promise<{
    success: boolean;
    msg?: string;
    data?: { updateAvailable?: boolean; latest?: { version?: string; assets?: Array<{ url: string }> } };
  }>;
};

/** Stubs global fetch (serves the yml for whichever channel file the check asks for, e.g. latest-linux.yml on this linux x64 host): feed yml for the manual feed host, everything else is recorded and fails. */
const stubFetch = (feedBody: string) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchedUrls.push(url);
      if (url.startsWith(`${MANUAL_FEED}/latest`) && url.includes('.yml'))
        return new Response(feedBody, { status: 200 });
      throw new Error(`unexpected fetch: ${url}`);
    })
  );
};

const expectNoUpstreamContact = () => {
  for (const raw of fetchedUrls) {
    const url = new URL(raw);
    expect(url.hostname).not.toBe('static.aionui.com');
    if (url.hostname === 'github.com' || url.hostname === 'api.github.com') {
      expect(url.pathname).toMatch(/^\/(repos\/)?-\/-(\/|$)/);
    }
  }
};

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-feed-'));
  const out = path.join(root, 'out');
  feedDir = path.join(root, 'served', 'feed');
  fs.mkdirSync(out, { recursive: true });
  const bytes = Buffer.from('fake installer bytes for update feed test');
  fs.writeFileSync(path.join(out, INSTALLER), bytes);
  const sha512 = createHash('sha512').update(bytes).digest('base64');
  yml = `version: 2.2.3
files:
  - url: ${INSTALLER}
    sha512: ${sha512}
    size: ${bytes.length}
path: ${INSTALLER}
sha512: ${sha512}
releaseDate: '2026-11-17T00:00:00.000Z'
`;
  fs.writeFileSync(path.join(out, 'latest-linux.yml'), yml);
  execFileSync('bash', [path.resolve(__dirname, '../../../../scripts/fork/publish-update-feed.sh'), out, feedDir], {
    stdio: 'pipe',
  });
  await startServer();
});

afterAll(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

afterEach(() => {
  // Every test checks itself: no upstream host, GitHub only for the disabled repo.
  expectNoUpstreamContact();
  fetchedUrls.length = 0;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  brokenYml = false;
});

describe('update flow against a local feed server', () => {
  it('provider resolves the latest version and installer url', async () => {
    serverPaths.length = 0;
    const provider = await makeProvider(`http://127.0.0.1:${port}/feed`);

    const info = await provider.getLatestVersion();
    expect(info.version).toBe('2.2.3');
    expect(provider.resolveFiles(info)[0].url.href).toBe(`http://127.0.0.1:${port}/feed/2.2.3/${INSTALLER}`);
    expect(serverPaths[0]).toBe('/feed/latest-linux.yml');
  });

  it('manual path assembles urls from the same feed', async () => {
    vi.stubEnv('AIONUI_UPDATE_BASE_URL', MANUAL_FEED);
    vi.stubEnv('AIONUI_GITHUB_REPO', '');
    const feedYml = fs.readFileSync(path.join(feedDir, 'latest-linux.yml'), 'utf8');
    stubFetch(feedYml);

    const handler = await loadCheckHandler();
    const result = await handler({});

    expect(result.success).toBe(true);
    expect(result.data?.latest?.version).toBe('2.2.3');
    expect(result.data?.latest?.assets?.[0].url).toBe(`${MANUAL_FEED}/2.2.3/${INSTALLER}`);
    expect(fetchedUrls.some((u) => u.startsWith(`${MANUAL_FEED}/`))).toBe(true);
    expect(fetchedUrls).toContain('https://api.github.com/repos/-/-/releases');
  });

  it('broken yml ends in an error', async () => {
    brokenYml = true;
    const provider = await makeProvider(`http://127.0.0.1:${port}/feed`);
    // electron-updater parses the yml leniently; the error surfaces when the installer files are resolved.
    await expect(provider.getLatestVersion().then((info) => provider.resolveFiles(info))).rejects.toThrow();

    vi.stubEnv('AIONUI_UPDATE_BASE_URL', MANUAL_FEED);
    stubFetch('version: banana\n');
    const handler = await loadCheckHandler();
    const result = await handler({});
    expect(result.success).toBe(false);
    expect(result.msg).toBe('update.errors.cdnManifestInvalid');
    expect(result.data?.updateAvailable).toBeFalsy();
  });

  it('unreachable server ends in an error', async () => {
    const closed = http.createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const closedPort = (closed.address() as AddressInfo).port;
    await new Promise((resolve) => closed.close(resolve));

    const provider = await makeProvider(`http://127.0.0.1:${closedPort}/feed`);
    await expect(provider.getLatestVersion()).rejects.toThrow();
  });

  it('no request leaves for the upstream host', async () => {
    vi.stubEnv('AIONUI_UPDATE_BASE_URL', MANUAL_FEED);
    stubFetch(yml);
    const handler = await loadCheckHandler();
    await handler({});
    expect(fetchedUrls.length).toBeGreaterThan(0);
    expectNoUpstreamContact();
  });
});
