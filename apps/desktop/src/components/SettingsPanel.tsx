import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, type Language } from '@cue/shared';
import { isLanguage, setLanguage } from '../i18n';

interface Config {
  deepgram_api_key?: string;
  anthropic_override_key?: string;
  language?: string;
  mode?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [deepgram, setDeepgram] = useState('');
  const [anthropic, setAnthropic] = useState('');
  const [lang, setLang] = useState<Language>(
    isLanguage(i18n.language) ? i18n.language : 'en',
  );

  useEffect(() => {
    if (!open) return;
    void invoke<Config>('load_config').then((cfg) => {
      setDeepgram(cfg.deepgram_api_key ?? '');
      setAnthropic(cfg.anthropic_override_key ?? '');
      if (cfg.language && isLanguage(cfg.language)) setLang(cfg.language);
    });
  }, [open]);

  if (!open) return null;

  const save = async () => {
    const cfg = await invoke<Config>('load_config');
    await invoke('save_config', {
      config: {
        ...cfg,
        deepgram_api_key: deepgram || undefined,
        anthropic_override_key: anthropic || undefined,
        language: lang,
      },
    });
    setLanguage(lang);
    onClose();
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-cue-bg/95 p-3 text-xs">
      <header className="flex items-center justify-between pb-2">
        <h2 className="text-sm font-semibold">{t('settings.title')}</h2>
        <button type="button" onClick={onClose} className="text-cue-muted">
          ✕
        </button>
      </header>
      <KeyField label={t('settings.deepgramKey')} value={deepgram} onChange={setDeepgram} />
      <KeyField
        label={t('settings.anthropicKey')}
        value={anthropic}
        onChange={setAnthropic}
      />
      <label className="mb-2 flex flex-col">
        <span className="text-[10px] uppercase tracking-wide text-cue-muted">
          {t('settings.language')}
        </span>
        <select
          value={lang}
          onChange={(e) => {
            const next = e.target.value;
            if (isLanguage(next)) {
              setLang(next);
              setLanguage(next);
            }
          }}
          className="mt-1 rounded border border-cue-subtle/40 bg-cue-surface p-1 text-xs text-cue-text focus:border-cue-accent focus:outline-none"
        >
          {LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {t(`languages.${code}`)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={save}
        className="mt-2 self-end rounded bg-cue-accent px-3 py-1 text-white"
      >
        {t('settings.save')}
      </button>
    </div>
  );
}

function KeyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="mb-2 flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-cue-muted">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 rounded border border-cue-subtle/40 bg-cue-surface p-1 text-xs text-cue-text focus:border-cue-accent focus:outline-none"
      />
    </label>
  );
}
