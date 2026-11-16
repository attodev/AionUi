/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(newapi): types and constants for the newapi login flow — see docs/fork/newapi-overlay.md

/** Fixed id of the provider managed by the newapi login flow. */
export const NEWAPI_MANAGED_PROVIDER_ID = 'newapi-managed';

export type NewApiAuthState = 'ready' | 'needs_login' | 'not_configured';
export type NewApiAuthReason = 'no_token' | 'token_rejected' | 'offline';

export type INewApiStatus = {
  state: NewApiAuthState;
  base_url?: string;
  reason?: NewApiAuthReason;
  username?: string;
  config_path: string;
};

export type INewApiAuthChangedEvent = {
  state: NewApiAuthState;
  error?: string;
};
