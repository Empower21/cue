import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';

interface Config {
  deepgram_api_key?: string;
  job_description?: string;
  resume?: string;
  role_context?: string;
  voice_sample?: string;
  language?: string;
  mode?: string;
}

interface DocumentExtract {
  text: string;
  source_name: string;
  bytes: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ContextLoader({ open, onClose }: Props) {
  const { t } = useTranslation();
  const [jd, setJd] = useState('');
  const [resume, setResume] = useState('');
  const [role, setRole] = useState('');
  const [voice, setVoice] = useState('');
  const [voiceMeta, setVoiceMeta] = useState<{ name: string; kb: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    void invoke<Config>('load_config').then((cfg) => {
      setJd(cfg.job_description ?? '');
      setResume(cfg.resume ?? '');
      setRole(cfg.role_context ?? '');
      setVoice(cfg.voice_sample ?? '');
      setVoiceMeta(null);
      setUploadError(null);
    });
  }, [open]);

  if (!open) return null;

  // Prefer Tauri's native dialog — it returns a real file path so the Rust
  // side can parse .docx and .pdf. Falls back to the hidden HTML file input
  // if the dialog plugin isn't available (e.g. running the Vite dev server
  // outside Tauri for hot-reload styling work).
  const handleUploadClick = async () => {
    setUploadError(null);
    try {
      const picked = await openDialog({
        multiple: false,
        filters: [
          { name: 'Documents', extensions: ['txt', 'md', 'markdown', 'rst', 'docx', 'pdf'] },
        ],
      });
      if (typeof picked === 'string' && picked) {
        const extract = await invoke<DocumentExtract>('read_document', { path: picked });
        setVoice(extract.text);
        setVoiceMeta({
          name: extract.source_name,
          kb: Math.max(1, Math.round(extract.bytes / 1024)),
        });
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Only fall back to the HTML input for "not available" errors; show real
      // errors to the user.
      if (!/not (found|available)|forbidden/i.test(msg)) {
        setUploadError(msg);
        return;
      }
    }
    fileInputRef.current?.click();
  };

  // Two upload strategies, in order:
  // 1. If `path` is exposed on the File (Tauri's webkitdirectory-style mount
  //    or drag-and-drop), call Rust's read_document directly — it handles
  //    .docx and .pdf which the browser cannot parse client-side.
  // 2. Otherwise (plain HTML file input gives no path), read as text — works
  //    for .txt/.md only. We tell the user to use the Rust path for .docx/.pdf.
  const handleFile = async (file: File) => {
    setUploadError(null);
    const fileWithPath = file as File & { path?: string };
    const path = fileWithPath.path;
    try {
      if (path) {
        const extract = await invoke<DocumentExtract>('read_document', { path });
        setVoice(extract.text);
        setVoiceMeta({
          name: extract.source_name,
          kb: Math.max(1, Math.round(extract.bytes / 1024)),
        });
        return;
      }
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!['txt', 'md', 'markdown', 'rst'].includes(ext)) {
        throw new Error(
          'Drag the file onto the cue window — browser uploads only support .txt and .md.',
        );
      }
      const text = await file.text();
      setVoice(text);
      setVoiceMeta({ name: file.name, kb: Math.max(1, Math.round(file.size / 1024)) });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    }
  };

  const save = async () => {
    setSaving(true);
    const cfg = await invoke<Config>('load_config');
    await invoke('save_config', {
      config: {
        ...cfg,
        job_description: jd,
        resume,
        role_context: role,
        voice_sample: voice,
      },
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col overflow-y-auto bg-cue-bg/95 p-3 text-xs">
      <header className="flex items-center justify-between pb-2">
        <h2 className="text-sm font-semibold">{t('context.title')}</h2>
        <button type="button" onClick={onClose} className="text-cue-muted">
          ✕
        </button>
      </header>
      <Field label={t('context.jd')} value={jd} onChange={setJd} />
      <Field label={t('context.resume')} value={resume} onChange={setResume} />
      <Field label={t('context.role')} value={role} onChange={setRole} rows={2} />

      <div className="mb-2 flex flex-col">
        <span className="text-[10px] uppercase tracking-wide text-cue-muted">
          {t('context.voiceSample')}
        </span>
        <p className="mt-0.5 text-[10px] text-cue-muted">{t('context.voiceSampleHelp')}</p>
        <textarea
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          rows={4}
          className="mt-1 rounded border border-cue-subtle/40 bg-cue-surface p-1 text-xs text-cue-text focus:border-cue-accent focus:outline-none"
        />
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={handleUploadClick}
            className="rounded border border-cue-subtle/50 px-2 py-0.5 text-[11px] text-cue-text hover:border-cue-accent"
          >
            {t('context.uploadDocument')}
          </button>
          {voiceMeta && (
            <span className="text-[10px] text-cue-muted">
              {t('context.uploaded', { name: voiceMeta.name, kb: voiceMeta.kb })}
            </span>
          )}
        </div>
        {uploadError && (
          <span className="mt-1 text-[10px] text-red-400">
            {t('context.uploadFailed', { error: uploadError })}
          </span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.markdown,.rst,.docx,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-2 self-end rounded bg-cue-accent px-3 py-1 text-white"
      >
        {saving ? t('context.saving') : t('context.save')}
      </button>
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
    <label className="mb-2 flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-cue-muted">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="mt-1 rounded border border-cue-subtle/40 bg-cue-surface p-1 text-xs text-cue-text focus:border-cue-accent focus:outline-none"
      />
    </label>
  );
}
