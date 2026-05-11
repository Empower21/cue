import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface Config {
  deepgram_api_key?: string;
  job_description?: string;
  resume?: string;
  role_context?: string;
  mode?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ContextLoader({ open, onClose }: Props) {
  const [jd, setJd] = useState('');
  const [resume, setResume] = useState('');
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    invoke<Config>('load_config').then((cfg) => {
      setJd(cfg.job_description ?? '');
      setResume(cfg.resume ?? '');
      setRole(cfg.role_context ?? '');
    });
  }, [open]);

  if (!open) return null;

  const save = async () => {
    setSaving(true);
    const cfg = await invoke<Config>('load_config');
    await invoke('save_config', {
      config: {
        ...cfg,
        job_description: jd,
        resume,
        role_context: role,
      },
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-cue-bg/95 p-3 text-xs">
      <header className="flex items-center justify-between pb-2">
        <h2 className="text-sm font-semibold">Context</h2>
        <button type="button" onClick={onClose} className="text-cue-muted">
          ✕
        </button>
      </header>
      <Field label="Job description" value={jd} onChange={setJd} />
      <Field label="Resume" value={resume} onChange={setResume} />
      <Field label="Role / company" value={role} onChange={setRole} rows={2} />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-2 self-end rounded bg-cue-accent px-3 py-1 text-white"
      >
        {saving ? 'Saving…' : 'Save'}
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
