/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(newapi): tests for the re-login button modes — see docs/fork/newapi-overlay.md

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { NewApiReloginButton } from '@/renderer/components/newapi/NewApiReloginButton';

const status = (state: INewApiStatus['state']): INewApiStatus => ({ state, config_path: '/tmp/newapi.json' });

const LoginProbe: React.FC = () => {
  const location = useLocation();
  return <div>login-page:{JSON.stringify(location.state)}</div>;
};

const renderAt = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path='/conversation/:id' element={<NewApiReloginButton mode='always' size='mini' />} />
        <Route path='/newapi-login' element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>
  );

const renderButton = (mode: 'auto' | 'always') =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path='/' element={<NewApiReloginButton mode={mode} size='mini' />} />
        <Route path='/newapi-login' element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>
  );

describe('NewApiReloginButton', () => {
  beforeEach(() => {
    statusInvoke.mockReset();
    (window as unknown as { electronAPI?: unknown }).electronAPI = {};
  });

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it('auto mode renders when status is needs_login', async () => {
    statusInvoke.mockResolvedValue(status('needs_login'));
    renderButton('auto');
    expect(await screen.findByRole('button', { name: 'newapiLogin.relogin' })).toBeTruthy();
  });

  it('auto mode renders nothing when ready', async () => {
    statusInvoke.mockResolvedValue(status('ready'));
    renderButton('auto');
    await waitFor(() => expect(statusInvoke).toHaveBeenCalled());
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('auto mode renders nothing when status fails', async () => {
    statusInvoke.mockRejectedValue(new Error('offline'));
    renderButton('auto');
    await waitFor(() => expect(statusInvoke).toHaveBeenCalled());
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('always mode renders without calling status', () => {
    renderButton('always');
    expect(screen.getByRole('button', { name: 'newapiLogin.relogin' })).toBeTruthy();
    expect(statusInvoke).not.toHaveBeenCalled();
  });

  it('click navigates to /newapi-login', async () => {
    statusInvoke.mockResolvedValue(status('needs_login'));
    renderButton('auto');
    fireEvent.click(await screen.findByRole('button', { name: 'newapiLogin.relogin' }));
    expect(await screen.findByText('login-page:{"from":"/"}')).toBeTruthy();
  });

  it('always mode click forces the login page open', async () => {
    renderButton('always');
    fireEvent.click(screen.getByRole('button', { name: 'newapiLogin.relogin' }));
    expect(await screen.findByText('login-page:{"force":true,"from":"/"}')).toBeTruthy();
  });

  it('passes the current path and search as from', async () => {
    renderAt('/conversation/abc?x=1');
    fireEvent.click(screen.getByRole('button', { name: 'newapiLogin.relogin' }));
    expect(await screen.findByText('login-page:{"force":true,"from":"/conversation/abc?x=1"}')).toBeTruthy();
  });

  it('renders nothing outside the desktop runtime', () => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
    renderButton('always');
    expect(screen.queryByRole('button')).toBeNull();
    renderButton('auto');
    expect(statusInvoke).not.toHaveBeenCalled();
  });
});
