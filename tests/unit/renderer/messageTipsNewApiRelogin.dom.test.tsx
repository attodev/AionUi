/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(newapi): tests for the re-login action inside MessageTips — see docs/fork/newapi-overlay.md

import type { IMessageTips } from '@/common/chat/chatLib';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('@renderer/components/Markdown', () => ({ default: () => null }));
vi.mock('@renderer/components/base/ButlerDiagnoseButton', () => ({ default: () => null }));
vi.mock('@renderer/components/base/FeedbackButton', () => ({ default: () => null }));
vi.mock('@renderer/components/chat/CollapsibleContent', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import MessageTips from '@/renderer/pages/conversation/Messages/components/MessageTips';

const errorMessage = (code: string): IMessageTips =>
  ({
    id: 'm1',
    msg_id: 'm1',
    type: 'tips',
    position: 'center',
    conversation_id: 'c1',
    content: {
      type: 'error',
      content: 'boom',
      error: { code, message: 'boom' },
    },
  }) as unknown as IMessageTips;

const renderTips = (code: string) =>
  render(
    <MemoryRouter>
      <MessageTips message={errorMessage(code)} />
    </MemoryRouter>
  );

describe('MessageTips newapi re-login entry', () => {
  beforeEach(() => {
    statusInvoke.mockReset();
    (window as unknown as { electronAPI?: unknown }).electronAPI = {};
  });

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it('auth-failed error shows the re-login button when the managed key is rejected', async () => {
    statusInvoke.mockResolvedValue({ state: 'needs_login', config_path: '/tmp/newapi.json' });
    renderTips('USER_LLM_PROVIDER_AUTH_FAILED');
    expect(await screen.findByRole('button', { name: 'newapiLogin.relogin' })).toBeTruthy();
  });

  it('other error codes never query newapi status', async () => {
    renderTips('USER_LLM_PROVIDER_RATE_LIMITED');
    await waitFor(() => expect(screen.getAllByText(/boom/).length).toBeGreaterThan(0));
    expect(statusInvoke).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'newapiLogin.relogin' })).toBeNull();
  });
});
