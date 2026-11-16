/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(newapi): hook that tracks newapi auth status and gate state — see docs/fork/newapi-overlay.md

import { ipcBridge } from '@/common';
import type { INewApiStatus } from '@/common/types/newapi';
import { useCallback, useEffect, useRef, useState } from 'react';

export type NewApiGateState = 'checking' | 'ready' | 'needs_login' | 'not_configured' | 'unavailable';

/**
 * Tracks the newapi login status. `unavailable` means the status request failed
 * (e.g. an older backend without the route) and must be treated as "gate passed".
 */
export function useNewApiStatus(enabled: boolean): {
  gate: NewApiGateState;
  status: INewApiStatus | null;
  refresh: () => Promise<void>;
} {
  const [gate, setGate] = useState<NewApiGateState>('checking');
  const [status, setStatus] = useState<INewApiStatus | null>(null);
  const mountedRef = useRef(true);
  // Only the most recent request may write state; a slower, older response is dropped.
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const requestId = ++requestIdRef.current;
    try {
      const next = await ipcBridge.newapi.status.invoke();
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setStatus(next);
      setGate(next.state);
    } catch {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setStatus(null);
      setGate('unavailable');
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    return ipcBridge.newapi.authChanged.on(() => {
      void refresh();
    });
  }, [enabled, refresh]);

  return enabled ? { gate, status, refresh } : { gate: 'ready', status: null, refresh };
}
