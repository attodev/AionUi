/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(opencode): shared constants for the start page Code tab — see docs/fork/opencode-overlay.md

/** Managed agent id of the bundled opencode agent. */
export const OPENCODE_AGENT_ID = '53861a53';
/** Assistant id used to start a conversation with the bundled opencode agent. */
export const OPENCODE_ASSISTANT_ID = 'bare:53861a53';
/** Model ids of the managed provider are prefixed with this when passed to opencode. */
export const OPENCODE_MODEL_PREFIX = 'newapi/';

export type StartTab = 'chat' | 'code';
