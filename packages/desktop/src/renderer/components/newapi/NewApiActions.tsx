/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(newapi): conditional wrappers around the re-login button for upstream hook sites — see docs/fork/newapi-overlay.md

import { NEWAPI_MANAGED_PROVIDER_ID } from '@/common/types/newapi';
import React from 'react';
import { NewApiReloginButton } from './NewApiReloginButton';

/** Auto-mode re-login button under an auth-failed message; renders nothing for other error codes. */
export const NewApiAuthErrorAction: React.FC<{ errorCode?: string }> = ({ errorCode }) => {
  if (errorCode !== 'USER_LLM_PROVIDER_AUTH_FAILED') return null;
  return (
    <div>
      <NewApiReloginButton mode='auto' size='mini' />
    </div>
  );
};

/** Always-mode re-login button on the managed provider row; renders nothing for other providers. */
export const NewApiProviderAction: React.FC<{ providerId: string }> = ({ providerId }) => {
  if (providerId !== NEWAPI_MANAGED_PROVIDER_ID) return null;
  return <NewApiReloginButton mode='always' size='mini' />;
};
