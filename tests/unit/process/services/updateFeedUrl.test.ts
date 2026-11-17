/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(update): unit tests for the update address resolver — see docs/fork/update-feed-overlay.md

import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveUpdateBaseUrl, UPDATE_FEED_SENTINEL_URL } from '@/process/services/updateFeedUrl';

describe('resolveUpdateBaseUrl', () => {
  it.each([
    ['https://updates.example.com/aionui/', 'https://updates.example.com/aionui'],
    ['https://updates.example.com', 'https://updates.example.com'],
    ['https://10.0.0.5:8443/updates', 'https://10.0.0.5:8443/updates'],
    ['  https://Updates.Example.com/x\n', 'https://updates.example.com/x'],
    ['https://a.example/x///', 'https://a.example/x'],
  ])('normalizes %j', (raw, expected) => {
    expect(resolveUpdateBaseUrl(raw)).toBe(expected);
  });

  it.each([
    undefined,
    '',
    '   ',
    'http://updates.example.com',
    'ftp://a.example',
    'updates.example.com',
    'https://',
    'https://user:pw@updates.example.com/x',
    'https://updates.example.com/x?a=1',
    'https://updates.example.com/x#f',
  ])('falls back to the sentinel for %j', (raw) => {
    expect(resolveUpdateBaseUrl(raw)).toBe(UPDATE_FEED_SENTINEL_URL);
  });
});

describe('module constants', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('derives base URL and host from the env var', async () => {
    vi.stubEnv('AIONUI_UPDATE_BASE_URL', 'https://10.0.0.5:8443/updates');
    vi.resetModules();
    const mod = await import('@/process/services/updateFeedUrl');
    expect(mod.UPDATE_BASE_URL).toBe('https://10.0.0.5:8443/updates');
    expect(mod.UPDATE_HOST).toBe('10.0.0.5');
    expect(mod.UPDATE_GITHUB_REPO).toBe('-/-');
  });

  it('uses the sentinel when the env var is empty', async () => {
    vi.stubEnv('AIONUI_UPDATE_BASE_URL', '');
    vi.resetModules();
    const mod = await import('@/process/services/updateFeedUrl');
    expect(mod.UPDATE_BASE_URL).toBe('https://update.invalid/releases');
    expect(mod.UPDATE_HOST).toBe('update.invalid');
    expect(mod.UPDATE_GITHUB_REPO).toBe('-/-');
  });
});
