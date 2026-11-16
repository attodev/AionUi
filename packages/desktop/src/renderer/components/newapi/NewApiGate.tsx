/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(newapi): startup gate that redirects to /newapi-login when sign-in is needed — see docs/fork/newapi-overlay.md

import AppLoader from '@renderer/components/layout/AppLoader';
import { useNewApiStatus } from '@/renderer/hooks/system/useNewApiStatus';
import { isElectronDesktop } from '@/renderer/utils/platform';
import React from 'react';
import { Navigate } from 'react-router-dom';

/** Renders children once the newapi status allows it; disabled outside the desktop runtime. */
export const NewApiGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { gate } = useNewApiStatus(isElectronDesktop());

  if (gate === 'checking') {
    return <AppLoader />;
  }

  if (gate === 'needs_login' || gate === 'not_configured') {
    return <Navigate to='/newapi-login' replace />;
  }

  return <>{children}</>;
};
