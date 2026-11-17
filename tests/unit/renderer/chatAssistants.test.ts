/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(opencode): tests for the Chat tab assistant filter — see docs/fork/opencode-overlay.md

import { describe, expect, it } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { filterChatAssistants } from '@/renderer/pages/code-start/chatAssistants';

const make = (id: string, source: Assistant['source'], agent?: Assistant['agent']): Assistant =>
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

describe('filterChatAssistants', () => {
  it('removes generated external-agent assistants, including opencode', () => {
    const list = [
      make('bare:claude', 'generated', { type: 'acp', source: 'builtin', acp_backend: 'claude' }),
      make('bare:codex', 'generated', { type: 'acp', source: 'builtin', acp_backend: 'codex' }),
      make('bare:53861a53', 'generated', { type: 'acp', source: 'builtin', acp_backend: 'opencode' }),
    ];
    expect(filterChatAssistants(list)).toEqual([]);
  });

  it('keeps the built-in generated assistant and aionrs presets/user assistants, in order', () => {
    const list = [
      make('preset-a', 'builtin', { type: 'aionrs', source: 'internal' }),
      make('bare:claude', 'generated', { type: 'acp', source: 'builtin', acp_backend: 'claude' }),
      make('bare:aionrs', 'generated', { type: 'aionrs', source: 'internal' }),
      make('user-1', 'user', { type: 'aionrs', source: 'internal' }),
    ];
    expect(filterChatAssistants(list).map((a) => a.id)).toEqual(['preset-a', 'bare:aionrs', 'user-1']);
  });

  it('removes a preset bound to an external agent and assistants with no agent info', () => {
    const list = [
      make('preset-claude', 'builtin', { type: 'acp', source: 'builtin', acp_backend: 'claude' }),
      make('no-agent', 'user', undefined),
    ];
    expect(filterChatAssistants(list)).toEqual([]);
  });

  it('returns an empty list for empty input', () => {
    expect(filterChatAssistants([])).toEqual([]);
  });
});
