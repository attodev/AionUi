/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(newapi): entry button that opens the newapi sign-in page — see docs/fork/newapi-overlay.md

import { useNewApiStatus } from '@/renderer/hooks/system/useNewApiStatus';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Button } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

type NewApiReloginButtonProps = {
  /** `auto` queries the status on mount and renders only for `needs_login`; `always` renders unconditionally. */
  mode: 'auto' | 'always';
  size?: 'mini' | 'small';
};

/** Entry point to the newapi sign-in page; renders nothing outside the desktop runtime. */
export const NewApiReloginButton: React.FC<NewApiReloginButtonProps> = ({ mode, size = 'mini' }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isDesktopRuntime = isElectronDesktop();
  const { gate } = useNewApiStatus(isDesktopRuntime && mode === 'auto');

  if (!isDesktopRuntime) return null;
  if (mode === 'auto' && gate !== 'needs_login') return null;

  return (
    <Button
      size={size}
      type='outline'
      onClick={(e) => {
        e.stopPropagation();
        // `always` is used while the key may still be valid; force keeps the page from bouncing back to /guid.
        const from = `${location.pathname}${location.search}`;
        void navigate('/newapi-login', { state: mode === 'always' ? { force: true, from } : { from } });
      }}
    >
      {t('newapiLogin.relogin')}
    </Button>
  );
};
