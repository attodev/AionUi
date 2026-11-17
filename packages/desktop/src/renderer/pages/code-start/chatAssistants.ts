/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(opencode): Chat tab lists only assistants that run on the built-in agent — see docs/fork/opencode-overlay.md

import { isAionrsAssistant, type Assistant } from '@/common/types/agent/assistantTypes';

// Memoised per input array so the result keeps a stable identity across renders (hooks list it as an effect dependency).
const cache = new WeakMap<Assistant[], Assistant[]>();

/**
 * Keeps only assistants that run on the built-in agent ("aionrs"), preserving order.
 * External CLI agents (claude, codex, opencode, ...) are dropped.
 */
export function filterChatAssistants(assistants: Assistant[]): Assistant[] {
  const cached = cache.get(assistants);
  if (cached) return cached;
  const filtered = assistants.filter((assistant) => isAionrsAssistant(assistant));
  cache.set(assistants, filtered);
  return filtered;
}
