/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(update): checks the vitest env default reaches the dom project — see docs/fork/update-feed-overlay.md

import { describe, expect, it } from 'vitest';

describe('vitest env (dom project)', () => {
  it('vitest env reaches both projects', () => {
    expect(process.env.AIONUI_UPDATE_BASE_URL).toBe('https://static.aionui.com/releases');
  });
});
