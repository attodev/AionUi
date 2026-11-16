/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(newapi): tests for the login page behaviour — see docs/fork/newapi-overlay.md

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { INewApiAuthChangedEvent, INewApiStatus } from '@/common/types/newapi';

const statusInvoke = vi.fn();
const startLoginInvoke = vi.fn();
const openExternalUrl = vi.fn();
let authChangedListener: ((event: INewApiAuthChangedEvent) => void) | null = null;

vi.mock('@/common', () => ({
  ipcBridge: {
    newapi: {
      status: { invoke: (...args: unknown[]) => statusInvoke(...args) },
      startLogin: { invoke: (...args: unknown[]) => startLoginInvoke(...args) },
      authChanged: {
        on: (cb: (event: INewApiAuthChangedEvent) => void) => {
          authChangedListener = cb;
          return () => {
            authChangedListener = null;
          };
        },
      },
    },
  },
}));

let desktop = true;
let mac = false;
vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: (...args: unknown[]) => openExternalUrl(...args),
  isElectronDesktop: () => desktop,
  isMacOS: () => mac,
}));

vi.mock('@renderer/components/layout/WindowControls', () => ({ default: () => <div>window-controls</div> }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options ? `${key}|${Object.values(options).join('|')}` : key,
  }),
}));

import NewApiLoginPage from '@/renderer/pages/newapi-login';

const status = (patch: Partial<INewApiStatus>): INewApiStatus => ({
  state: 'needs_login',
  base_url: 'https://newapi.example.com/v1',
  config_path: '/home/u/.config/aionui/newapi.json',
  ...patch,
});

const renderPage = (
  entry: string | { pathname: string; state: unknown } = '/newapi-login',
  extraEntries: string[] = []
) =>
  render(
    <MemoryRouter initialEntries={[...extraEntries, entry]} initialIndex={extraEntries.length}>
      <Routes>
        <Route path='/newapi-login' element={<NewApiLoginPage />} />
        <Route path='/prev' element={<div>prev-page</div>} />
        <Route path='/conversation/abc' element={<div>conversation-page</div>} />
        <Route path='/guid' element={<div>guid-page</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('NewApiLoginPage', () => {
  beforeEach(() => {
    desktop = true;
    mac = false;
    statusInvoke.mockReset();
    startLoginInvoke.mockReset();
    openExternalUrl.mockReset();
    authChangedListener = null;
    startLoginInvoke.mockResolvedValue({ authorize_url: 'https://newapi.example.com/oauth/authorize?x=1' });
    openExternalUrl.mockResolvedValue(undefined);
  });

  it('renders server address and sign-in button when needs_login', async () => {
    statusInvoke.mockResolvedValue(status({ reason: 'no_token' }));
    renderPage();
    expect(await screen.findByText('newapiLogin.title')).toBeTruthy();
    expect(screen.getByText('newapiLogin.server|https://newapi.example.com/v1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'newapiLogin.signIn' })).toBeTruthy();
    expect(screen.queryByText('newapiLogin.tokenRejected')).toBeNull();
  });

  it('shows the expired notice for token_rejected', async () => {
    statusInvoke.mockResolvedValue(status({ reason: 'token_rejected' }));
    renderPage();
    expect(await screen.findByText('newapiLogin.tokenRejected')).toBeTruthy();
  });

  it('clicking sign-in starts login and opens the authorize url', async () => {
    statusInvoke.mockResolvedValue(status({}));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'newapiLogin.signIn' }));
    expect(await screen.findByText('newapiLogin.waiting')).toBeTruthy();
    expect(startLoginInvoke).toHaveBeenCalledTimes(1);
    expect(openExternalUrl).toHaveBeenCalledWith('https://newapi.example.com/oauth/authorize?x=1');
  });

  it('cancel returns to the sign-in button', async () => {
    statusInvoke.mockResolvedValue(status({}));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'newapiLogin.signIn' }));
    fireEvent.click(await screen.findByRole('button', { name: 'newapiLogin.cancel' }));
    expect(await screen.findByRole('button', { name: 'newapiLogin.signIn' })).toBeTruthy();
  });

  it('ready event navigates to /guid', async () => {
    statusInvoke.mockResolvedValue(status({}));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'newapiLogin.signIn' }));
    await screen.findByText('newapiLogin.waiting');
    act(() => authChangedListener?.({ state: 'ready' }));
    expect(await screen.findByText('guid-page')).toBeTruthy();
  });

  it('error event returns to the button with the message', async () => {
    statusInvoke.mockResolvedValue(status({}));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'newapiLogin.signIn' }));
    await screen.findByText('newapiLogin.waiting');
    act(() => authChangedListener?.({ state: 'needs_login', error: 'denied' }));
    expect(await screen.findByText('newapiLogin.failed|denied')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'newapiLogin.signIn' })).toBeTruthy();
  });

  it('shows a failure when startLogin itself fails', async () => {
    statusInvoke.mockResolvedValue(status({}));
    startLoginInvoke.mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'newapiLogin.signIn' }));
    expect(await screen.findByText('newapiLogin.failed|boom')).toBeTruthy();
    expect(openExternalUrl).not.toHaveBeenCalled();
  });

  it('open again starts a new login', async () => {
    statusInvoke.mockResolvedValue(status({}));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'newapiLogin.signIn' }));
    fireEvent.click(await screen.findByRole('button', { name: 'newapiLogin.reopen' }));
    await waitFor(() => expect(startLoginInvoke).toHaveBeenCalledTimes(2));
    expect(openExternalUrl).toHaveBeenCalledTimes(2);
  });

  it('not_configured shows the config path and no button', async () => {
    statusInvoke.mockResolvedValue(status({ state: 'not_configured', base_url: undefined }));
    renderPage();
    expect(await screen.findByText('newapiLogin.notConfiguredTitle')).toBeTruthy();
    expect(screen.getByText('newapiLogin.notConfiguredBody')).toBeTruthy();
    expect(screen.getByText('/home/u/.config/aionui/newapi.json')).toBeTruthy();
    expect(screen.getByText(/"base_url": "https:\/\/newapi\.example\.com"/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('already ready redirects to /guid', async () => {
    statusInvoke.mockResolvedValue(status({ state: 'ready' }));
    renderPage();
    expect(await screen.findByText('guid-page')).toBeTruthy();
  });

  it('force state keeps the page open when ready', async () => {
    statusInvoke.mockResolvedValue(status({ state: 'ready' }));
    renderPage({ pathname: '/newapi-login', state: { force: true } });
    expect(await screen.findByRole('button', { name: 'newapiLogin.signIn' })).toBeTruthy();
    expect(screen.queryByText('guid-page')).toBeNull();
  });

  it('outside the desktop runtime redirects to /guid without calling status', async () => {
    desktop = false;
    renderPage();
    expect(await screen.findByText('guid-page')).toBeTruthy();
    expect(statusInvoke).not.toHaveBeenCalled();
  });

  it('renders the window strip in the desktop runtime, with window controls off macOS', async () => {
    statusInvoke.mockResolvedValue(status({}));
    renderPage();
    expect(await screen.findByTestId('newapi-login-titlebar')).toBeTruthy();
    expect(screen.getByText('window-controls')).toBeTruthy();
  });

  it('does not render window controls on macOS', async () => {
    mac = true;
    statusInvoke.mockResolvedValue(status({}));
    renderPage();
    expect(await screen.findByTestId('newapi-login-titlebar')).toBeTruthy();
    expect(screen.queryByText('window-controls')).toBeNull();
  });

  it('force + ready shows Back, which navigates back', async () => {
    statusInvoke.mockResolvedValue(status({ state: 'ready' }));
    renderPage({ pathname: '/newapi-login', state: { force: true } }, ['/prev']);
    fireEvent.click(await screen.findByRole('button', { name: 'newapiLogin.back' }));
    expect(await screen.findByText('prev-page')).toBeTruthy();
  });

  it('Back falls back to /guid when there is no history', async () => {
    statusInvoke.mockResolvedValue(status({ state: 'ready' }));
    renderPage({ pathname: '/newapi-login', state: { force: true } });
    fireEvent.click(await screen.findByRole('button', { name: 'newapiLogin.back' }));
    expect(await screen.findByText('guid-page')).toBeTruthy();
  });

  it('does not show Back for needs_login', async () => {
    statusInvoke.mockResolvedValue(status({}));
    renderPage({ pathname: '/newapi-login', state: { force: true } });
    await screen.findByRole('button', { name: 'newapiLogin.signIn' });
    expect(screen.queryByRole('button', { name: 'newapiLogin.back' })).toBeNull();
  });

  it('ready event navigates to the from path', async () => {
    statusInvoke.mockResolvedValue(status({}));
    renderPage({ pathname: '/newapi-login', state: { from: '/conversation/abc' } });
    fireEvent.click(await screen.findByRole('button', { name: 'newapiLogin.signIn' }));
    await screen.findByText('newapiLogin.waiting');
    act(() => authChangedListener?.({ state: 'ready' }));
    expect(await screen.findByText('conversation-page')).toBeTruthy();
  });

  it.each(['https://evil.example', '//evil.example', '/newapi-login'])(
    'ready event ignores an unsafe from (%s) and goes to /guid',
    async (from) => {
      statusInvoke.mockResolvedValue(status({}));
      renderPage({ pathname: '/newapi-login', state: { from } });
      fireEvent.click(await screen.findByRole('button', { name: 'newapiLogin.signIn' }));
      await screen.findByText('newapiLogin.waiting');
      act(() => authChangedListener?.({ state: 'ready' }));
      expect(await screen.findByText('guid-page')).toBeTruthy();
    }
  );
});
