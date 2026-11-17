/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(opencode): tests for the code tab state hook — see docs/fork/opencode-overlay.md

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NEWAPI_MANAGED_PROVIDER_ID } from '@/common/types/newapi';
import { OPENCODE_AGENT_ID } from '@/common/types/codeTab';

const listProviders = vi.fn();
const getManagedAgents = vi.fn();
const store = new Map<string, unknown>();
const configSet = vi.fn((key: string, value: unknown) => {
  store.set(key, value);
  return Promise.resolve();
});

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: { listProviders: { invoke: (...args: unknown[]) => listProviders(...args) } },
    acpConversation: { getManagedAgents: { invoke: (...args: unknown[]) => getManagedAgents(...args) } },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => configSet(key, value),
  },
}));

import { useCodeTab } from '@/renderer/pages/code-start/useCodeTab';

const provider = (models: string[], model_enabled?: Record<string, boolean>) => ({
  id: NEWAPI_MANAGED_PROVIDER_ID,
  models,
  model_enabled,
});
const opencode = (installed: boolean) => [{ id: OPENCODE_AGENT_ID, installed }];

describe('useCodeTab', () => {
  beforeEach(() => {
    listProviders.mockReset();
    getManagedAgents.mockReset();
    configSet.mockClear();
    store.clear();
    getManagedAgents.mockResolvedValue(opencode(true));
  });

  it('ready with enabled models only', async () => {
    listProviders.mockResolvedValue([provider(['a', 'b', 'c'], { b: false })]);
    const { result } = renderHook(() => useCodeTab());
    expect(result.current.availability).toBe('checking');
    await waitFor(() => expect(result.current.availability).toBe('ready'));
    expect(result.current.models).toEqual(['a', 'c']);
  });

  it('falls back to first model when stored model is gone', async () => {
    store.set('codeTab.lastModel', 'gone');
    listProviders.mockResolvedValue([provider(['a', 'b'])]);
    const { result } = renderHook(() => useCodeTab());
    await waitFor(() => expect(result.current.availability).toBe('ready'));
    expect(result.current.selectedModel).toBe('a');
  });

  it('keeps stored model when listed', async () => {
    store.set('codeTab.lastModel', 'b');
    listProviders.mockResolvedValue([provider(['a', 'b'])]);
    const { result } = renderHook(() => useCodeTab());
    await waitFor(() => expect(result.current.availability).toBe('ready'));
    expect(result.current.selectedModel).toBe('b');
  });

  it('selectModel persists', async () => {
    listProviders.mockResolvedValue([provider(['a', 'b'])]);
    const { result } = renderHook(() => useCodeTab());
    await waitFor(() => expect(result.current.availability).toBe('ready'));
    act(() => result.current.selectModel('b'));
    expect(configSet).toHaveBeenCalledWith('codeTab.lastModel', 'b');
    expect(result.current.selectedModel).toBe('b');
  });

  it('no_opencode when the agent is not installed', async () => {
    getManagedAgents.mockResolvedValue(opencode(false));
    listProviders.mockResolvedValue([provider(['a'])]);
    const { result } = renderHook(() => useCodeTab());
    await waitFor(() => expect(result.current.availability).toBe('no_opencode'));
  });

  it('no_opencode when the agent is absent from the list', async () => {
    getManagedAgents.mockResolvedValue([]);
    listProviders.mockResolvedValue([provider(['a'])]);
    const { result } = renderHook(() => useCodeTab());
    await waitFor(() => expect(result.current.availability).toBe('no_opencode'));
  });

  it('no_models when the managed provider is missing or empty', async () => {
    listProviders.mockResolvedValue([]);
    const missing = renderHook(() => useCodeTab());
    await waitFor(() => expect(missing.result.current.availability).toBe('no_models'));

    listProviders.mockResolvedValue([provider(['a'], { a: false })]);
    const empty = renderHook(() => useCodeTab());
    await waitFor(() => expect(empty.result.current.availability).toBe('no_models'));
  });

  it('agent list failure -> no_opencode', async () => {
    getManagedAgents.mockRejectedValue(new Error('boom'));
    listProviders.mockResolvedValue([provider(['a'])]);
    const { result } = renderHook(() => useCodeTab());
    await waitFor(() => expect(result.current.availability).toBe('no_opencode'));
  });

  it('provider list failure -> no_models', async () => {
    listProviders.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCodeTab());
    await waitFor(() => expect(result.current.availability).toBe('no_models'));
  });

  it('reloads when it becomes active again without going back to checking', async () => {
    listProviders.mockResolvedValue([provider(['a', 'b'])]);
    const { result, rerender } = renderHook(({ active }) => useCodeTab(active), { initialProps: { active: true } });
    await waitFor(() => expect(result.current.availability).toBe('ready'));
    expect(result.current.models).toEqual(['a', 'b']);

    rerender({ active: false });
    listProviders.mockResolvedValue([provider(['a', 'b'], { b: false })]);
    expect(listProviders).toHaveBeenCalledTimes(1);

    rerender({ active: true });
    expect(result.current.availability).toBe('ready');
    await waitFor(() => expect(result.current.models).toEqual(['a']));
    expect(listProviders).toHaveBeenCalledTimes(2);
  });
});
