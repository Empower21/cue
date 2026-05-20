import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { OverlayPanel } from './components/OverlayPanel';
import { isLanguage, setLanguage } from './i18n';

interface ConfigPeek {
  language?: string;
}

export function App() {
  // Sync the active language with the persisted config once at startup.
  // SettingsPanel updates both i18next and the config when the user changes it.
  useEffect(() => {
    void invoke<ConfigPeek>('load_config').then((cfg) => {
      const lang = cfg.language;
      if (lang && isLanguage(lang)) setLanguage(lang);
    });
  }, []);

  return <OverlayPanel />;
}
