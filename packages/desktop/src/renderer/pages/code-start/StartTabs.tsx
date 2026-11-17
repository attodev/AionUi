/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// fork(opencode): tab switcher shown above the start page — see docs/fork/opencode-overlay.md

import type { StartTab } from '@/common/types/codeTab';
import { Radio } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type StartTabsProps = {
  value: StartTab;
  onChange: (tab: StartTab) => void;
};

const StartTabs: React.FC<StartTabsProps> = ({ value, onChange }) => {
  const { t } = useTranslation();
  return (
    <div className='flex shrink-0 justify-center pt-12px'>
      <Radio.Group type='button' size='small' value={value} onChange={(next: StartTab) => onChange(next)}>
        <Radio value='chat'>{t('codeTab.tabs.chat')}</Radio>
        <Radio value='code'>{t('codeTab.tabs.code')}</Radio>
      </Radio.Group>
    </div>
  );
};

export default StartTabs;
