/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(newapi): single entry point for upstream hook lines (gate, login page, action wrappers) — see docs/fork/newapi-overlay.md

import React from 'react';

export { NewApiGate } from './NewApiGate';
export { NewApiAuthErrorAction, NewApiProviderAction } from './NewApiActions';
export const NewApiLoginPage = React.lazy(() => import('@renderer/pages/newapi-login'));
