/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(newapi): newapi sign-in page — see docs/fork/newapi-overlay.md

import { ipcBridge } from '@/common';
import { useNewApiStatus } from '@/renderer/hooks/system/useNewApiStatus';
import { isElectronDesktop, isMacOS, openExternalUrl } from '@/renderer/utils/platform';
import AppLoader from '@renderer/components/layout/AppLoader';
import WindowControls from '@renderer/components/layout/WindowControls';
import '@renderer/components/layout/Titlebar/titlebar.css';
import { Button } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

const CONFIG_EXAMPLE = JSON.stringify({ base_url: 'https://newapi.example.com' }, null, 2);

/** Same-app absolute paths only; anything else (or the login page itself) falls back to the home page. */
const resolveReturnPath = (from: unknown): string => {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return '/guid';
  if (from === '/newapi-login' || from.startsWith('/newapi-login?')) return '/guid';
  return from;
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const NewApiLoginPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isDesktopRuntime = isElectronDesktop();
  const isMacRuntime = isDesktopRuntime && isMacOS();
  const routeState = location.state as { force?: boolean; from?: string } | null;
  const force = Boolean(routeState?.force);
  const returnPath = resolveReturnPath(routeState?.from);
  const { gate, status } = useNewApiStatus(isDesktopRuntime);
  const [waiting, setWaiting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    // `force` (re-login entry points) keeps the page open while the key is still valid.
    if (!isDesktopRuntime) {
      void navigate('/guid', { replace: true });
    } else if (gate === 'unavailable' || (gate === 'ready' && !force)) {
      void navigate(returnPath, { replace: true });
    }
  }, [gate, force, isDesktopRuntime, navigate, returnPath]);

  useEffect(() => {
    return ipcBridge.newapi.authChanged.on((event) => {
      if (event.state === 'ready') {
        void navigate(returnPath, { replace: true });
      } else if (event.error) {
        setWaiting(false);
        setFailure(event.error);
      }
    });
  }, [navigate, returnPath]);

  const goBack = useCallback(() => {
    // `default` key = first entry in history, nothing to go back to.
    if (location.key === 'default') void navigate('/guid', { replace: true });
    else void navigate(-1);
  }, [location.key, navigate]);

  const startLogin = useCallback(async () => {
    setStarting(true);
    setFailure(null);
    try {
      const { authorize_url } = await ipcBridge.newapi.startLogin.invoke();
      await openExternalUrl(authorize_url);
      setWaiting(true);
    } catch (error) {
      setWaiting(false);
      setFailure(errorMessage(error));
    } finally {
      setStarting(false);
    }
  }, []);

  if (!isDesktopRuntime || gate === 'checking' || gate === 'unavailable' || (gate === 'ready' && !force)) {
    return <AppLoader />;
  }

  return (
    <div className='min-h-100vh flex flex-col bg-2'>
      {/* The window is frameless and this page sits outside Layout, so it needs its own drag region and controls. */}
      <div
        data-testid='newapi-login-titlebar'
        className={`app-titlebar app-titlebar--desktop${isMacRuntime ? ' app-titlebar--mac' : ''}`}
      >
        <div />
        {!isMacRuntime && <WindowControls />}
      </div>
      <div className='flex-1 flex items-center justify-center'>
        <div className='w-420px max-w-90vw p-32px rd-12px bg-1 b-1 b-solid b-border-2 flex flex-col gap-16px'>
          {gate === 'not_configured' ? (
            <>
              <h1 className='m-0 text-18px font-600 text-t-primary'>{t('newapiLogin.notConfiguredTitle')}</h1>
              <p className='m-0 text-t-secondary'>{t('newapiLogin.notConfiguredBody')}</p>
              <code className='break-all text-t-primary'>{status?.config_path}</code>
              <pre className='m-0 p-12px rd-8px bg-2 text-t-primary overflow-auto'>
                <code>{CONFIG_EXAMPLE}</code>
              </pre>
            </>
          ) : (
            <>
              <h1 className='m-0 text-18px font-600 text-t-primary'>{t('newapiLogin.title')}</h1>
              {status?.base_url && (
                <p className='m-0 text-t-secondary break-all'>{t('newapiLogin.server', { url: status.base_url })}</p>
              )}
              {status?.reason === 'token_rejected' && (
                <p className='m-0 text-danger'>{t('newapiLogin.tokenRejected')}</p>
              )}
              {failure && <p className='m-0 text-danger'>{t('newapiLogin.failed', { message: failure })}</p>}
              {waiting ? (
                <>
                  <p className='m-0 text-t-secondary'>{t('newapiLogin.waiting')}</p>
                  <div className='flex gap-8px'>
                    <Button type='primary' loading={starting} onClick={() => void startLogin()}>
                      {t('newapiLogin.reopen')}
                    </Button>
                    <Button onClick={() => setWaiting(false)}>{t('newapiLogin.cancel')}</Button>
                  </div>
                </>
              ) : (
                <Button type='primary' long loading={starting} onClick={() => void startLogin()}>
                  {t('newapiLogin.signIn')}
                </Button>
              )}
              {gate === 'ready' && force && <Button onClick={goBack}>{t('newapiLogin.back')}</Button>}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default NewApiLoginPage;
