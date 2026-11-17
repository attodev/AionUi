/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(opencode): tests for the Chat tab assistant filter — see docs/fork/opencode-overlay.md

import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SWRConfig, useSWRConfig } from 'swr';
import type { Assistant } from '@/common/types/agent/assistantTypes';

const { listMock, configGetMock, configSetMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  configGetMock: vi.fn(),
  configSetMock: vi.fn(),
}));

vi.mock('@/common', () => ({ ipcBridge: { assistants: { list: { invoke: listMock } } } }));
vi.mock('@/common/config/configService', () => ({ configService: { get: configGetMock, set: configSetMock } }));
vi.mock('@/renderer/hooks/agent/useManagedAgents', () => ({ useManagedAgentRuntimeCatalog: () => [] }));

import { useCustomAgentsLoader } from '@/renderer/pages/guid/hooks/useCustomAgentsLoader';
import { useGuidAssistantSelection } from '@/renderer/pages/guid/hooks/useGuidAssistantSelection';

const make = (id: string, source: Assistant['source'], agent: Assistant['agent']): Assistant =>
  ({
    id,
    source,
    name: id,
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order: 1,
    agent_id: id,
    agent,
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
    agent_status: 'online',
    team_selectable: true,
    deletable: false,
  }) as Assistant;

const full = [
  make('bare:claude', 'generated', { type: 'acp', source: 'builtin', acp_backend: 'claude' }),
  make('bare:53861a53', 'generated', { type: 'acp', source: 'builtin', acp_backend: 'opencode' }),
  make('bare:aionrs', 'generated', { type: 'aionrs', source: 'internal' }),
  make('preset-a', 'builtin', { type: 'aionrs', source: 'internal' }),
];

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0 } }, children);

describe('chat tab assistant filtering', () => {
  beforeEach(() => {
    listMock.mockResolvedValue(full);
    configGetMock.mockReturnValue(undefined);
    configSetMock.mockResolvedValue(undefined);
  });

  it('returns only built-in-agent assistants while the shared SWR cache keeps the full list', async () => {
    const { result } = renderHook(() => ({ loader: useCustomAgentsLoader(), swr: useSWRConfig() }), { wrapper });
    await waitFor(() => expect(result.current.loader.assistants.length).toBe(2));
    expect(result.current.loader.assistants.map((a) => a.id)).toEqual(['bare:aionrs', 'preset-a']);
    expect(result.current.swr.cache.get('assistants.list')?.data).toEqual(full);
  });

  it('falls back to the built-in default for a persisted external-agent selection', async () => {
    configGetMock.mockReturnValue('bare:53861a53');
    const { result } = renderHook(() => useGuidAssistantSelection({ resetAssistant: true }), { wrapper });
    await waitFor(() => expect(result.current.selectedAssistantId).toBe('bare:aionrs'));
  });

  it('falls back to the built-in default for a preselected external-agent assistant', async () => {
    const { result } = renderHook(
      () => useGuidAssistantSelection({ preselectAssistantId: 'bare:claude', locationKey: 'a' }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.selectedAssistantId).toBe('bare:aionrs'));
  });
});
