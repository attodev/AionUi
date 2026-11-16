/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(newapi): tests for the startup gate behaviour via Router — see docs/fork/newapi-overlay.md

import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { INewApiStatus } from '@/common/types/newapi';

const statusInvoke = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    newapi: {
      status: { invoke: (...args: unknown[]) => statusInvoke(...args) },
      authChanged: { on: () => () => {} },
    },
  },
}));

vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ status: 'authenticated', user: { id: 'u1' } }),
}));

vi.mock('@/renderer/hooks/system/useCrossSessionRateLimitNotice', () => ({
  useCrossSessionRateLimitNotice: () => {},
}));

vi.mock('@renderer/components/layout/AppLoader', () => ({ default: () => <div>app-loader</div> }));
vi.mock('@renderer/components/layout/DocumentTitle', () => ({ default: () => null }));

// Router.tsx lazy-loads every page; stub the ones the gate test navigates to.
vi.mock('@renderer/pages/guid', () => ({ default: () => <div>guid-page</div> }));
vi.mock('@renderer/pages/newapi-login', () => ({ default: () => <div>newapi-login-page</div> }));

const status = (state: INewApiStatus['state']): INewApiStatus => ({ state, config_path: '/tmp/newapi.json' });

const renderRouter = async () => {
  vi.resetModules();
  const { default: PanelRoute } = await import('@renderer/components/layout/Router');
  window.location.hash = '#/guid';
  return render(<PanelRoute layout={<div>layout-shell</div>} />);
};

describe('newapi startup gate', () => {
  beforeEach(() => {
    statusInvoke.mockReset();
    (window as unknown as { electronAPI?: unknown }).electronAPI = {};
  });

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it('needs_login redirects to /newapi-login', async () => {
    statusInvoke.mockResolvedValue(status('needs_login'));
    await renderRouter();
    expect(await screen.findByText('newapi-login-page')).toBeTruthy();
  });

  it('ready renders the layout', async () => {
    statusInvoke.mockResolvedValue(status('ready'));
    await renderRouter();
    expect(await screen.findByText('layout-shell')).toBeTruthy();
  });

  it('unavailable renders the layout', async () => {
    statusInvoke.mockRejectedValue(new Error('404'));
    await renderRouter();
    expect(await screen.findByText('layout-shell')).toBeTruthy();
  });

  it('non-desktop runtime never calls status', async () => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
    await renderRouter();
    expect(await screen.findByText('layout-shell')).toBeTruthy();
    expect(statusInvoke).not.toHaveBeenCalled();
  });
});
