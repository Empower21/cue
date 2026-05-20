'use client';

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WebCopilotConfig } from '@/lib/storage';

interface Props {
  open: boolean;
  config: WebCopilotConfig;
  onChange: (partial: Partial<WebCopilotConfig>) => void;
  onClear: () => void;
  onClose: () => void;
}

export function ContextDrawer({ open, config, onChange, onClear, onClose }: Props) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<{ name: string; kb: number } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  if (!open) return null;

  const onPickFile = async (file: File) => {
    setUploadError(null);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (['txt', 'md', 'markdown', 'rst'].includes(ext)) {
        const text = await file.text();
        onChange({ voiceSample: text });
        setUploaded({ name: file.name, kb: Math.max(1, Math.round(file.size / 1024)) });
        return;
      }
      // .docx / .pdf require server-side extraction.
      const fd = new FormData();
      fd.append('file', file);
      const resp = await fetch('/api/voice-sample', { method: 'POST', body: fd });
      if (!resp.ok) {
        setUploadError(await resp.text());
        return;
      }
      const data = (await resp.json()) as { text: string; sourceName: string; bytes: number };
      onChange({ voiceSample: data.text });
      setUploaded({ name: data.sourceName, kb: Math.max(1, Math.round(data.bytes / 1024)) });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-end bg-black/40 sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-cue-surface p-5 sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between pb-3">
          <h2 className="text-lg font-semibold">{t('context.title')}</h2>
          <button type="button" onClick={onClose} className="text-cue-muted hover:text-cue-text">
            ✕
          </button>
        </header>

        <Field
          label={t('context.jd')}
          value={config.jd ?? ''}
          onChange={(v) => onChange({ jd: v })}
        />
        <Field
          label={t('context.resume')}
          value={config.resume ?? ''}
          onChange={(v) => onChange({ resume: v })}
        />
        <Field
          label={t('context.role')}
          value={config.roleContext ?? ''}
          onChange={(v) => onChange({ roleContext: v })}
          rows={2}
        />

        <div className="mt-3">
          <span className="text-xs uppercase tracking-wide text-cue-muted">
            {t('context.voiceSample')}
          </span>
          <p className="mt-1 text-xs text-cue-muted">{t('context.voiceSampleHelp')}</p>
          <textarea
            value={config.voiceSample ?? ''}
            onChange={(e) => onChange({ voiceSample: e.target.value })}
            rows={4}
            className="mt-2 w-full rounded border border-cue-subtle/50 bg-cue-bg p-2 text-sm text-cue-text focus:border-cue-accent focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded border border-cue-subtle/60 px-3 py-1 text-xs hover:border-cue-accent"
            >
              {t('context.uploadDocument')}
            </button>
            {uploaded && (
              <span className="text-xs text-cue-muted">
                {t('context.uploaded', { name: uploaded.name, kb: uploaded.kb })}
              </span>
            )}
          </div>
          {uploadError && (
            <p className="mt-2 text-xs text-red-400">
              {t('context.uploadFailed', { error: uploadError })}
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.markdown,.rst,.docx,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickFile(f);
              e.target.value = '';
            }}
          />
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="rounded-md border border-red-500/40 px-4 py-2 text-xs text-red-300 hover:bg-red-500/10"
            >
              Clear context
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              <span>Wipe resume, JD, role, voice sample?</span>
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setUploaded(null);
                  setUploadError(null);
                  setConfirmClear(false);
                }}
                className="rounded bg-red-500/80 px-2 py-0.5 text-white hover:bg-red-500"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="text-red-200 underline-offset-2 hover:underline"
              >
                Cancel
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-cue-accent py-2 text-sm font-medium text-white hover:bg-cue-accentHover sm:px-6"
          >
            {t('context.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="mb-3 flex flex-col">
      <span className="text-xs uppercase tracking-wide text-cue-muted">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="mt-1 rounded border border-cue-subtle/50 bg-cue-bg p-2 text-sm text-cue-text focus:border-cue-accent focus:outline-none"
      />
    </label>
  );
}
