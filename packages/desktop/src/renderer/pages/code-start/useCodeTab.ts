/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(opencode): state hook for the start page Code tab — see docs/fork/opencode-overlay.md

import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import { OPENCODE_AGENT_ID } from '@/common/types/codeTab';
import { NEWAPI_MANAGED_PROVIDER_ID } from '@/common/types/newapi';
import { useCallback, useEffect, useState } from 'react';

export type CodeTabAvailability = 'checking' | 'ready' | 'no_opencode' | 'no_models';

async function loadOpencodeInstalled(): Promise<boolean> {
  try {
    const agents = await ipcBridge.acpConversation.getManagedAgents.invoke();
    return Array.isArray(agents) && agents.some((agent) => agent.id === OPENCODE_AGENT_ID && agent.installed);
  } catch (error) {
    console.error('[CodeTab] Failed to load managed agents:', error);
    return false;
  }
}

async function loadManagedModels(): Promise<string[]> {
  try {
    const providers = await ipcBridge.mode.listProviders.invoke();
    const managed = Array.isArray(providers) ? providers.find((p) => p.id === NEWAPI_MANAGED_PROVIDER_ID) : undefined;
    return (managed?.models ?? []).filter((model) => managed?.model_enabled?.[model] !== false);
  } catch (error) {
    console.error('[CodeTab] Failed to load providers:', error);
    return [];
  }
}

/** `active=false` pauses loading; each switch back to true reloads without returning to `checking`. */
export function useCodeTab(active = true): {
  availability: CodeTabAvailability;
  models: string[];
  selectedModel: string | undefined;
  selectModel: (id: string) => void;
} {
  const [loaded, setLoaded] = useState<{ installed: boolean; models: string[] } | null>(null);
  const [storedModel, setStoredModel] = useState<string | undefined>(() => configService.get('codeTab.lastModel'));

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void Promise.all([loadOpencodeInstalled(), loadManagedModels()]).then(([installed, models]) => {
      if (!cancelled) setLoaded({ installed, models });
    });
    return () => {
      cancelled = true;
    };
  }, [active]);

  const selectModel = useCallback((id: string) => {
    setStoredModel(id);
    void configService.set('codeTab.lastModel', id).catch((error) => {
      console.error('[CodeTab] Failed to persist selected model:', error);
    });
  }, []);

  const models = loaded?.models ?? [];
  const selectedModel = storedModel && models.includes(storedModel) ? storedModel : models[0];
  let availability: CodeTabAvailability = 'ready';
  if (!loaded) availability = 'checking';
  else if (!loaded.installed) availability = 'no_opencode';
  else if (models.length === 0) availability = 'no_models';

  return { availability, models, selectedModel, selectModel };
}
