/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(newapi): IPC bridge for /api/newapi/*, re-exported by ipcBridge.ts — see docs/fork/newapi-overlay.md

import { httpGet, httpPost, wsEmitter } from '@/common/adapter/httpBridge';
import type { INewApiAuthChangedEvent, INewApiStatus } from '@/common/types/newapi';

export const newapi = {
  status: httpGet<INewApiStatus, void>('/api/newapi/status'),
  startLogin: httpPost<{ authorize_url: string }, void>('/api/newapi/login/start'),
  authChanged: wsEmitter<INewApiAuthChangedEvent>('newapi.authChanged'),
};
