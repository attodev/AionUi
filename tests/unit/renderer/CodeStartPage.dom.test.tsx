/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(opencode): tests for the code start page — see docs/fork/opencode-overlay.md

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OPENCODE_ASSISTANT_ID } from '@/common/types/codeTab';

const create = vi.fn();
const getFileMetadata = vi.fn();
const navigate = vi.fn();
let hookState: {
  availability: string;
  models: string[];
  selectedModel: string | undefined;
  selectModel: (id: string) => void;
};

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: { create: { invoke: (...args: unknown[]) => create(...args) } },
    fs: { getFileMetadata: { invoke: (...args: unknown[]) => getFileMetadata(...args) } },
  },
}));

vi.mock('@/renderer/pages/code-start/useCodeTab', () => ({ useCodeTab: () => hookState }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));
vi.mock('@/renderer/utils/workspace/workspaceHistory', () => ({ updateWorkspaceTime: vi.fn() }));
vi.mock('@/renderer/utils/emitter', () => ({ emitter: { emit: vi.fn() } }));

// The real picker opens a native dialog; a stub that reports a chosen folder is enough here.
vi.mock('@renderer/components/workspace', () => ({
  WorkspaceFolderSelect: (props: { value?: string; onChange: (v: string) => void; placeholder: string }) => (
    <div>
      <span data-testid='folder'>{props.value || props.placeholder}</span>
      <a onClick={() => props.onChange('/work/proj')}>choose</a>
    </div>
  ),
}));

import CodeStartPage from '@/renderer/pages/code-start/CodeStartPage';

const ready = () => {
  hookState = { availability: 'ready', models: ['m1', 'm2'], selectedModel: 'm1', selectModel: vi.fn() };
};
const typeInput = (text: string) =>
  fireEvent.change(screen.getByPlaceholderText('codeTab.placeholder'), { target: { value: text } });
const chooseFolder = () => fireEvent.click(screen.getByText('choose'));
const sendButton = () => screen.getByRole('button', { name: 'common.send' }) as HTMLButtonElement;

describe('CodeStartPage', () => {
  beforeEach(() => {
    create.mockReset();
    getFileMetadata.mockReset();
    navigate.mockReset();
    sessionStorage.clear();
    ready();
    getFileMetadata.mockResolvedValue({
      name: 'proj',
      path: '/work/proj',
      size: 0,
      type: 'inode/directory',
      last_modified: 1,
      is_directory: true,
    });
    create.mockResolvedValue({ id: 'c1' });
  });

  it('send disabled until a folder is chosen', () => {
    render(<CodeStartPage />);
    typeInput('hello');
    expect(sendButton().disabled).toBe(true);
    expect(screen.getByText('codeTab.folderRequired')).toBeTruthy();
    chooseFolder();
    expect(sendButton().disabled).toBe(false);
  });

  it('sends create with the opencode assistant, prefixed model, mode and workspace', async () => {
    render(<CodeStartPage />);
    typeInput('hello');
    chooseFolder();
    fireEvent.click(sendButton());
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith({
      name: 'hello',
      assistant: {
        id: OPENCODE_ASSISTANT_ID,
        locale: 'en-US',
        conversation_overrides: { model: 'newapi/m1', permission: 'build' },
      },
      extra: { workspace: '/work/proj', custom_workspace: true },
    });
  });

  it('plan mode is passed as permission', async () => {
    render(<CodeStartPage />);
    typeInput('hello');
    chooseFolder();
    fireEvent.click(screen.getByText('codeTab.mode.build'));
    fireEvent.click(await screen.findByText('codeTab.mode.plan'));
    fireEvent.click(sendButton());
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0].assistant.conversation_overrides.permission).toBe('plan');
  });

  it('navigates to the conversation on success', async () => {
    render(<CodeStartPage />);
    typeInput('hello');
    chooseFolder();
    fireEvent.click(sendButton());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/conversation/c1'));
    expect(JSON.parse(sessionStorage.getItem('acp_initial_message_c1') ?? '{}')).toEqual({ input: 'hello' });
  });

  it('no_opencode disables input and shows the notice', () => {
    hookState = { availability: 'no_opencode', models: [], selectedModel: undefined, selectModel: vi.fn() };
    render(<CodeStartPage />);
    expect(screen.getByText('codeTab.noOpencode')).toBeTruthy();
    expect((screen.getByPlaceholderText('codeTab.placeholder') as HTMLTextAreaElement).disabled).toBe(true);
    expect(sendButton().disabled).toBe(true);
  });

  it('no_models shows its notice', () => {
    hookState = { availability: 'no_models', models: [], selectedModel: undefined, selectModel: vi.fn() };
    render(<CodeStartPage />);
    expect(screen.getByText('codeTab.noModels')).toBeTruthy();
    expect((screen.getByPlaceholderText('codeTab.placeholder') as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('missing folder shows folderMissing and does not create', async () => {
    getFileMetadata.mockRejectedValue(new Error('cannot resolve path'));
    render(<CodeStartPage />);
    typeInput('hello');
    chooseFolder();
    fireEvent.click(sendButton());
    expect(await screen.findByText('codeTab.folderMissing')).toBeTruthy();
    expect(getFileMetadata).toHaveBeenCalledWith({ path: '/work/proj', workspace: '/work/proj' });
    expect(create).not.toHaveBeenCalled();
  });

  it('create failure keeps the input and shows the error', async () => {
    create.mockRejectedValue(new Error('boom'));
    render(<CodeStartPage />);
    typeInput('hello');
    chooseFolder();
    fireEvent.click(sendButton());
    expect(await screen.findByText('codeTab.createFailed')).toBeTruthy();
    expect(screen.getByText(/boom/)).toBeTruthy();
    expect((screen.getByPlaceholderText('codeTab.placeholder') as HTMLTextAreaElement).value).toBe('hello');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('Enter sends when allowed', async () => {
    render(<CodeStartPage />);
    typeInput('hello');
    chooseFolder();
    fireEvent.keyDown(screen.getByPlaceholderText('codeTab.placeholder'), { key: 'Enter' });
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  });

  it('Enter does nothing without a folder', () => {
    render(<CodeStartPage />);
    typeInput('hello');
    fireEvent.keyDown(screen.getByPlaceholderText('codeTab.placeholder'), { key: 'Enter' });
    expect(getFileMetadata).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('Shift+Enter does not send', () => {
    render(<CodeStartPage />);
    typeInput('hello');
    chooseFolder();
    const notPrevented = fireEvent.keyDown(screen.getByPlaceholderText('codeTab.placeholder'), {
      key: 'Enter',
      shiftKey: true,
    });
    expect(notPrevented).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it('model select shows a loading placeholder and stays disabled while checking', () => {
    hookState = { availability: 'checking', models: [], selectedModel: undefined, selectModel: vi.fn() };
    render(<CodeStartPage />);
    expect(screen.getAllByText('common.loading').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.arco-select-disabled').length).toBe(2);
  });

  it('a path that exists but is a regular file shows folderMissing and does not create', async () => {
    getFileMetadata.mockResolvedValue({
      name: 'f.txt',
      path: '/work/proj',
      size: 3,
      type: 'text/plain',
      last_modified: 1,
    });
    render(<CodeStartPage />);
    typeInput('hello');
    chooseFolder();
    fireEvent.click(sendButton());
    expect(await screen.findByText('codeTab.folderMissing')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });
});
