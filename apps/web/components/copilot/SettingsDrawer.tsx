'use client';

import { useTranslation } from 'react-i18next';
import { LANGUAGES, type Language } from '@cue/shared';
import { isLanguage } from '@/lib/i18n';
import type { WebCopilotConfig } from '@/lib/storage';

interface Props {
  open: boolean;
  config: WebCopilotConfig;
  onChange: (partial: Partial<WebCopilotConfig>) => void;
  onLanguageChange: (lang: Language) => void;
  onClose: () => void;
}

export function SettingsDrawer({ open, config, onChange, onLanguageChange, onClose }: Props) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-end bg-black/40 sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-cue-surface p-5 sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between pb-3">
          <h2 className="text-lg font-semibold">{t('settings.title')}</h2>
          <button type="button" onClick={onClose} className="text-cue-muted hover:text-cue-text">
            ✕
          </button>
        </header>

        <KeyField
          label={t('settings.deepgramKey')}
          value={config.deepgramKey ?? ''}
          onChange={(v) => onChange({ deepgramKey: v })}
        />
        <KeyField
          label={t('settings.anthropicKey')}
          value={config.anthropicKey ?? ''}
          onChange={(v) => onChange({ anthropicKey: v })}
        />

        <label className="mb-3 flex flex-col">
          <span className="text-xs uppercase tracking-wide text-cue-muted">
            {t('settings.language')}
          </span>
          <select
            value={config.language ?? 'en'}
            onChange={(e) => {
              const next = e.target.value;
              if (isLanguage(next)) {
                onChange({ language: next });
                onLanguageChange(next);
              }
            }}
            className="mt-1 rounded border border-cue-subtle/50 bg-cue-bg p-2 text-sm text-cue-text focus:border-cue-accent focus:outline-none"
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
          onClick={onClose}
          className="mt-3 w-full rounded-md bg-cue-accent py-2 text-sm font-medium text-white hover:bg-cue-accentHover sm:w-auto sm:px-6"
        >
          {t('settings.save')}
        </button>
      </div>
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
    <label className="mb-3 flex flex-col">
      <span className="text-xs uppercase tracking-wide text-cue-muted">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 rounded border border-cue-subtle/50 bg-cue-bg p-2 text-sm text-cue-text focus:border-cue-accent focus:outline-none"
      />
    </label>
  );
}
