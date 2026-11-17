/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(update): address of the self-hosted update server, validated at build time — see docs/fork/update-feed-overlay.md

export const UPDATE_FEED_SENTINEL_URL = 'https://update.invalid/releases';
export const UPDATE_GITHUB_REPO_DISABLED = '-/-';

/** Accept only a plain https URL (no credentials, query or hash); otherwise return the sentinel. */
export function resolveUpdateBaseUrl(raw: string | undefined): string {
  let url: URL;
  try {
    url = new URL((raw ?? '').trim());
  } catch {
    return UPDATE_FEED_SENTINEL_URL;
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) {
    return UPDATE_FEED_SENTINEL_URL;
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

// Must stay this exact expression: electron.vite.config.ts `define` replaces it literally at build time.
export const UPDATE_BASE_URL = resolveUpdateBaseUrl(process.env.AIONUI_UPDATE_BASE_URL);
export const UPDATE_HOST = new URL(UPDATE_BASE_URL).hostname;
export const UPDATE_GITHUB_REPO = UPDATE_GITHUB_REPO_DISABLED;
