/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(opencode): tests for the start-page tab shell — see docs/fork/opencode-overlay.md

import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
const configSet = vi.fn((key: string, value: unknown) => {
  store.set(key, value);
  return Promise.resolve();
});

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => configSet(key, value),
  },
}));

const mounts = { guid: 0, code: 0 };
const setLastFocusedComponent = vi.fn();
const Stub: React.FC<{ kind: 'guid' | 'code'; label: string }> = ({ kind, label }) => {
  React.useEffect(() => {
    mounts[kind] += 1;
  }, [kind]);
  return (
    <div>
      {label}
      <input data-testid={`${kind}-input`} />
    </div>
  );
};
vi.mock('@renderer/pages/guid', () => ({ default: () => <Stub kind='guid' label='guid-page' /> }));
vi.mock('@renderer/pages/code-start/CodeStartPage', () => ({
  default: () => <Stub kind='code' label='code-start-page' />,
}));
const pasteState = { lastFocusedComponent: 'guid-paste-id' as string };
vi.mock('@/renderer/services/PasteService', () => ({
  PasteService: {
    get lastFocusedComponent() {
      return pasteState.lastFocusedComponent;
    },
    setLastFocusedComponent: (id: string) => {
      setLastFocusedComponent(id);
      pasteState.lastFocusedComponent = id;
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import CodeStartShell from '@/renderer/pages/code-start';

let go: (state?: unknown) => void = () => {};
const Nav: React.FC = () => {
  const navigate = useNavigate();
  go = (state) => navigate('/guid', { state });
  return null;
};
const renderShell = (state?: unknown) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/guid', state }]}>
      <Nav />
      <CodeStartShell />
    </MemoryRouter>
  );

describe('StartTabs shell', () => {
  beforeEach(() => {
    store.clear();
    configSet.mockClear();
    setLastFocusedComponent.mockClear();
    mounts.guid = 0;
    mounts.code = 0;
    pasteState.lastFocusedComponent = 'guid-paste-id';
  });

  it('defaults to chat and renders the original page', () => {
    renderShell();
    expect(screen.getByText('guid-page')).toBeTruthy();
    expect(screen.queryByText('code-start-page')).toBeNull();
  });

  it('switching to code persists guid.lastStartTab', () => {
    renderShell();
    fireEvent.click(screen.getByText('codeTab.tabs.code'));
    expect(screen.getByText('code-start-page')).toBeTruthy();
    expect(configSet).toHaveBeenCalledWith('guid.lastStartTab', 'code');
  });

  it('restores the stored tab', () => {
    store.set('guid.lastStartTab', 'code');
    renderShell();
    expect(screen.getByText('code-start-page')).toBeTruthy();
    expect(screen.queryByText('guid-page')).toBeNull();
  });

  it('does not mount the code page before the Code tab is first opened', () => {
    renderShell();
    expect(mounts.code).toBe(0);
    expect(screen.queryByText('code-start-page')).toBeNull();
  });

  it('does not mount the chat page when the app starts on Code', () => {
    store.set('guid.lastStartTab', 'code');
    renderShell();
    expect(mounts.guid).toBe(0);
  });

  it('keeps both pages mounted with their state across a round trip', () => {
    renderShell();
    fireEvent.change(screen.getByTestId('guid-input'), { target: { value: 'draft chat' } });
    fireEvent.click(screen.getByText('codeTab.tabs.code'));
    fireEvent.change(screen.getByTestId('code-input'), { target: { value: 'draft code' } });
    expect(screen.getByTestId('guid-input').closest('[hidden]')).not.toBeNull();
    fireEvent.click(screen.getByText('codeTab.tabs.chat'));
    expect((screen.getByTestId('guid-input') as HTMLInputElement).value).toBe('draft chat');
    expect(screen.getByTestId('code-input').closest('[hidden]')).not.toBeNull();
    fireEvent.click(screen.getByText('codeTab.tabs.code'));
    expect((screen.getByTestId('code-input') as HTMLInputElement).value).toBe('draft code');
    expect(mounts).toEqual({ guid: 1, code: 1 });
  });

  it('stops the hidden chat page from claiming global pastes while Code is shown', () => {
    renderShell();
    fireEvent.click(screen.getByText('codeTab.tabs.code'));
    expect(setLastFocusedComponent).toHaveBeenCalledWith('code-start');
  });

  it('shows Chat and mounts GuidPage when the initial navigation carries chat intent', () => {
    store.set('guid.lastStartTab', 'code');
    renderShell({ prefillPrompt: 'hi' });
    expect(screen.getByText('guid-page')).toBeTruthy();
    expect(mounts.code).toBe(0);
    expect(configSet).toHaveBeenCalledWith('guid.lastStartTab', 'chat');
  });

  it('switches to Chat on a later navigation with chat intent', () => {
    store.set('guid.lastStartTab', 'code');
    renderShell();
    expect(screen.getByText('code-start-page')).toBeTruthy();
    act(() => go({ selectedAssistantId: 'a1' }));
    expect(screen.getByText('guid-page').closest('[hidden]')).toBeNull();
    expect(screen.getByText('code-start-page').closest('[hidden]')).not.toBeNull();
    expect(configSet).toHaveBeenCalledWith('guid.lastStartTab', 'chat');
  });

  it.each([{ workspace: '/w' }, { prefillFiles: [] }, { resetAssistant: true }])(
    'chat intent %o switches to Chat',
    (state) => {
      store.set('guid.lastStartTab', 'code');
      renderShell();
      act(() => go(state));
      expect(screen.getByText('guid-page')).toBeTruthy();
    }
  );

  it('leaves the stored tab alone for navigation without state', () => {
    store.set('guid.lastStartTab', 'code');
    renderShell();
    act(() => go());
    expect(screen.getByText('code-start-page').closest('[hidden]')).toBeNull();
    expect(screen.queryByText('guid-page')).toBeNull();
    expect(configSet).not.toHaveBeenCalled();
  });

  it('restores paste routing to the chat page when returning from Code', () => {
    renderShell();
    fireEvent.click(screen.getByText('codeTab.tabs.code'));
    expect(pasteState.lastFocusedComponent).toBe('code-start');
    fireEvent.click(screen.getByText('codeTab.tabs.chat'));
    expect(pasteState.lastFocusedComponent).toBe('guid-paste-id');
  });
});
