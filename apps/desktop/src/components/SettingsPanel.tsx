import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface Config {
  deepgram_api_key?: string;
  anthropic_override_key?: string;
  mode?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: Props) {
  const [deepgram, setDeepgram] = useState('');
  const [anthropic, setAnthropic] = useState('');

  useEffect(() => {
    if (!open) return;
    invoke<Config>('load_config').then((cfg) => {
      setDeepgram(cfg.deepgram_api_key ?? '');
      setAnthropic(cfg.anthropic_override_key ?? '');
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
      },
    });
    onClose();
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-cue-bg/95 p-3 text-xs">
      <header className="flex items-center justify-between pb-2">
        <h2 className="text-sm font-semibold">Settings</h2>
        <button type="button" onClick={onClose} className="text-cue-muted">
          ✕
        </button>
      </header>
      <KeyField label="Deepgram API key" value={deepgram} onChange={setDeepgram} />
      <KeyField
        label="Override Anthropic key (optional)"
        value={anthropic}
        onChange={setAnthropic}
      />
      <button
        type="button"
        onClick={save}
        className="mt-2 self-end rounded bg-cue-accent px-3 py-1 text-white"
      >
        Save
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
        className="mt-1 rounded border border-cue-subtle/40 bg-black/30 p-1 text-xs text-cue-text focus:border-cue-accent focus:outline-none"
      />
    </label>
  );
}
