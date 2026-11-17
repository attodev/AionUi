/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(opencode): tab shell for the start page (Chat | Code) — see docs/fork/opencode-overlay.md

import { configService } from '@/common/config/configService';
import type { StartTab } from '@/common/types/codeTab';
import GuidPage from '@renderer/pages/guid';
import { PasteService } from '@/renderer/services/PasteService';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import CodeStartPage from './CodeStartPage';
import StartTabs from './StartTabs';

/** Navigation state that only the Chat start page understands (see every `navigate('/guid', { state })` caller). */
const CHAT_INTENT_KEYS = ['prefillPrompt', 'selectedAssistantId', 'workspace', 'prefillFiles', 'resetAssistant'];

const hasChatIntent = (state: unknown): boolean =>
  typeof state === 'object' && state !== null && CHAT_INTENT_KEYS.some((key) => key in state);

// PasteService keeps a private "last focused" id; read it so Chat's routing can be restored after Code.
const pasteRouting = PasteService as unknown as { lastFocusedComponent?: string | null };
const CODE_PASTE_ID = 'code-start';

const CodeStartShell: React.FC = () => {
  const location = useLocation();
  const [tab, setTab] = useState<StartTab>(() =>
    hasChatIntent(location.state) || configService.get('guid.lastStartTab') !== 'code' ? 'chat' : 'code'
  );
  // A page stays mounted (hidden) once shown, so drafts survive tab switches; never-opened tabs cost nothing.
  const [visited, setVisited] = useState<Record<StartTab, boolean>>(() => ({
    chat: tab === 'chat',
    code: tab === 'code',
  }));
  const savedPasteTarget = useRef<string | null>(null);

  const persist = useCallback((next: StartTab) => {
    void configService.set('guid.lastStartTab', next).catch((error) => {
      console.error('[CodeTab] Failed to persist start tab:', error);
    });
  }, []);

  const handleChange = useCallback(
    (next: StartTab) => {
      setTab(next);
      setVisited((prev) => (prev[next] ? prev : { ...prev, [next]: true }));
      persist(next);
    },
    [persist]
  );

  // Existing features open the start page with state meant for Chat; show Chat before paint so GuidPage
  // handles it while visible.
  useLayoutEffect(() => {
    if (!hasChatIntent(location.state)) return;
    setTab('chat');
    setVisited((prev) => (prev.chat ? prev : { ...prev, chat: true }));
    if (configService.get('guid.lastStartTab') !== 'chat') persist('chat');
  }, [location.key, location.state, persist]);

  // The hidden chat page keeps its global paste handler registered; point paste routing away from it while
  // Code is shown and give it back afterwards. Its drag/drop and key handlers sit on its own input card, so
  // a hidden page cannot receive those events.
  useEffect(() => {
    if (tab === 'code') {
      const current = pasteRouting.lastFocusedComponent;
      if (current && current !== CODE_PASTE_ID) savedPasteTarget.current = current;
      PasteService.setLastFocusedComponent(CODE_PASTE_ID);
    } else if (savedPasteTarget.current) {
      PasteService.setLastFocusedComponent(savedPasteTarget.current);
      savedPasteTarget.current = null;
    }
  }, [tab]);

  return (
    <div className='flex size-full flex-col'>
      <StartTabs value={tab} onChange={handleChange} />
      {visited.chat && (
        <div className='min-h-0 flex-1' hidden={tab !== 'chat'}>
          <GuidPage />
        </div>
      )}
      {visited.code && (
        <div className='min-h-0 flex-1' hidden={tab !== 'code'}>
          <CodeStartPage active={tab === 'code'} />
        </div>
      )}
    </div>
  );
};

export default CodeStartShell;
