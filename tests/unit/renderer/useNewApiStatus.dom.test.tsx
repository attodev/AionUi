/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(newapi): tests for the status hook states — see docs/fork/newapi-overlay.md

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { INewApiAuthChangedEvent, INewApiStatus } from '@/common/types/newapi';

const statusInvoke = vi.fn();
let authChangedListener: ((event: INewApiAuthChangedEvent) => void) | null = null;

vi.mock('@/common', () => ({
  ipcBridge: {
    newapi: {
      status: { invoke: (...args: unknown[]) => statusInvoke(...args) },
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

import { useNewApiStatus } from '@/renderer/hooks/system/useNewApiStatus';

const status = (patch: Partial<INewApiStatus>): INewApiStatus => ({
  state: 'ready',
  config_path: '/tmp/config.json',
  ...patch,
});

describe('useNewApiStatus', () => {
  beforeEach(() => {
    statusInvoke.mockReset();
    authChangedListener = null;
  });

  it('disabled -> ready without calling status', () => {
    const { result } = renderHook(() => useNewApiStatus(false));
    expect(result.current.gate).toBe('ready');
    expect(statusInvoke).not.toHaveBeenCalled();
  });

  it('needs_login maps through', async () => {
    statusInvoke.mockResolvedValue(status({ state: 'needs_login', reason: 'no_token' }));
    const { result } = renderHook(() => useNewApiStatus(true));
    expect(result.current.gate).toBe('checking');
    await waitFor(() => expect(result.current.gate).toBe('needs_login'));
    expect(result.current.status?.reason).toBe('no_token');
  });

  it('not_configured maps through', async () => {
    statusInvoke.mockResolvedValue(status({ state: 'not_configured' }));
    const { result } = renderHook(() => useNewApiStatus(true));
    await waitFor(() => expect(result.current.gate).toBe('not_configured'));
  });

  it('ready with reason offline -> ready', async () => {
    statusInvoke.mockResolvedValue(status({ state: 'ready', reason: 'offline' }));
    const { result } = renderHook(() => useNewApiStatus(true));
    await waitFor(() => expect(result.current.gate).toBe('ready'));
    expect(result.current.status?.reason).toBe('offline');
  });

  it('status rejects -> unavailable', async () => {
    statusInvoke.mockRejectedValue(new Error('404'));
    const { result } = renderHook(() => useNewApiStatus(true));
    await waitFor(() => expect(result.current.gate).toBe('unavailable'));
    expect(result.current.status).toBeNull();
  });

  it('authChanged event triggers a refetch', async () => {
    statusInvoke.mockResolvedValueOnce(status({ state: 'needs_login' }));
    statusInvoke.mockResolvedValueOnce(status({ state: 'ready' }));
    const { result } = renderHook(() => useNewApiStatus(true));
    await waitFor(() => expect(result.current.gate).toBe('needs_login'));
    act(() => authChangedListener?.({ state: 'ready' }));
    await waitFor(() => expect(result.current.gate).toBe('ready'));
    expect(statusInvoke).toHaveBeenCalledTimes(2);
  });

  it('a stale overlapping refresh cannot overwrite a newer response', async () => {
    let resolveFirst: ((value: INewApiStatus) => void) | undefined;
    statusInvoke.mockImplementationOnce(() => new Promise<INewApiStatus>((resolve) => (resolveFirst = resolve)));
    const { result } = renderHook(() => useNewApiStatus(true));
    statusInvoke.mockResolvedValueOnce(status({ state: 'ready' }));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.gate).toBe('ready');
    await act(async () => {
      resolveFirst?.(status({ state: 'needs_login' }));
    });
    expect(result.current.gate).toBe('ready');
  });
});
