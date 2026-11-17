/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(opencode): start page for the Code tab (opencode conversations) — see docs/fork/opencode-overlay.md

import { ipcBridge } from '@/common';
import { OPENCODE_ASSISTANT_ID, OPENCODE_MODEL_PREFIX } from '@/common/types/codeTab';
import { useCompositionInput } from '@/renderer/hooks/chat/useCompositionInput';
import { resolveLocaleKey } from '@/common/utils';
import { emitter } from '@/renderer/utils/emitter';
import { updateWorkspaceTime } from '@/renderer/utils/workspace/workspaceHistory';
import { WorkspaceFolderSelect } from '@renderer/components/workspace';
import { Alert, Button, Input, Select } from '@arco-design/web-react';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCodeTab } from './useCodeTab';

type CodeMode = 'build' | 'plan';

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function folderExists(folder: string): Promise<boolean> {
  try {
    // The folder doubles as the request-scoped root so a user-chosen folder outside the default sandbox resolves.
    const meta = await ipcBridge.fs.getFileMetadata.invoke({ path: folder, workspace: folder });
    // Wire shape: `type` is the MIME type and is 'inode/directory' for folders (`is_directory` is not mapped here).
    return meta.type === 'inode/directory';
  } catch {
    return false;
  }
}

type CodeStartPageProps = {
  /** False while the page is kept mounted but hidden; becoming true again refreshes agents and models. */
  active?: boolean;
};

const CodeStartPage: React.FC<CodeStartPageProps> = ({ active = true }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { availability, models, selectedModel, selectModel } = useCodeTab(active);
  const [input, setInput] = useState('');
  const [folder, setFolder] = useState('');
  const [mode, setMode] = useState<CodeMode>('build');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ title: string; detail?: string } | null>(null);
  const sendingRef = useRef(false);
  const { compositionHandlers, createKeyDownHandler } = useCompositionInput();

  const blockedNotice =
    availability === 'no_opencode'
      ? t('codeTab.noOpencode')
      : availability === 'no_models'
        ? t('codeTab.noModels')
        : '';
  const inputDisabled = availability !== 'ready';
  const canSend = !inputDisabled && !sending && !!folder && !!selectedModel && input.trim().length > 0;

  const handleSend = useCallback(async () => {
    if (sendingRef.current || !folder || !selectedModel) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      if (!(await folderExists(folder))) {
        setError({ title: t('codeTab.folderMissing') });
        return;
      }
      const conversation = await ipcBridge.conversation.create.invoke({
        name: input,
        assistant: {
          id: OPENCODE_ASSISTANT_ID,
          locale: resolveLocaleKey(i18n.language),
          conversation_overrides: { model: OPENCODE_MODEL_PREFIX + selectedModel, permission: mode },
        },
        extra: { workspace: folder, custom_workspace: true },
      });
      if (!conversation || !conversation.id) {
        setError({ title: t('codeTab.createFailed') });
        return;
      }
      updateWorkspaceTime(folder);
      emitter.emit('chat.history.refresh');
      // Same hand-off as the ACP start page: the conversation view sends this as the first turn.
      sessionStorage.setItem(`acp_initial_message_${conversation.id}`, JSON.stringify({ input }));
      await navigate(`/conversation/${conversation.id}`);
    } catch (e) {
      console.error('[CodeTab] Failed to create code conversation:', e);
      setError({ title: t('codeTab.createFailed'), detail: errorText(e) });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [folder, selectedModel, input, mode, i18n.language, navigate, t]);

  // Enter sends, Shift+Enter inserts a newline, IME composition is respected (same hook as the chat start page).
  const handleKeyDown = createKeyDownHandler(() => {
    if (canSend) void handleSend();
  });

  return (
    <div className='mx-auto flex size-full max-w-720px flex-col justify-center gap-12px px-16px'>
      {blockedNotice && <Alert type='warning' content={blockedNotice} />}
      <WorkspaceFolderSelect
        value={folder}
        onChange={setFolder}
        placeholder={t('codeTab.pickFolder')}
        recentLabel={t('team.create.recentLabel')}
        chooseDifferentLabel={t('team.create.chooseDifferentFolder')}
      />
      <Input.TextArea
        value={input}
        onChange={setInput}
        disabled={inputDisabled}
        onKeyDown={handleKeyDown}
        {...compositionHandlers}
        placeholder={t('codeTab.placeholder')}
        autoSize={{ minRows: 4, maxRows: 12 }}
      />
      {error && <Alert type='error' title={error.title} content={error.detail} />}
      {!folder && !inputDisabled && <div className='text-12px text-t-secondary'>{t('codeTab.folderRequired')}</div>}
      <div className='flex items-center justify-between gap-8px'>
        <div className='flex items-center gap-8px'>
          <Select
            size='small'
            style={{ width: 200 }}
            value={selectedModel}
            placeholder={availability === 'checking' ? t('common.loading') : undefined}
            loading={availability === 'checking'}
            disabled={inputDisabled}
            onChange={selectModel}
            options={models.map((model) => ({ label: model, value: model }))}
          />
          <Select
            size='small'
            style={{ width: 100 }}
            value={mode}
            disabled={inputDisabled}
            onChange={(value: CodeMode) => setMode(value)}
            options={[
              { label: t('codeTab.mode.build'), value: 'build' },
              { label: t('codeTab.mode.plan'), value: 'plan' },
            ]}
          />
        </div>
        <Button type='primary' disabled={!canSend} loading={sending} onClick={() => void handleSend()}>
          {t('common.send')}
        </Button>
      </div>
    </div>
  );
};

export default CodeStartPage;
