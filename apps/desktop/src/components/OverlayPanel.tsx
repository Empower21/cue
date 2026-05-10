import { useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ModeSelector, type Mode } from './ModeSelector';
import { useAudioSignal } from '../hooks/useTauriEvents';

interface OverlayPanelProps {
  children?: ReactNode;
}

export function OverlayPanel({ children }: OverlayPanelProps) {
  const [mode, setMode] = useState<Mode>('listen');
  const [running, setRunning] = useState(false);
  const { mic, system } = useAudioSignal();

  const toggle = async () => {
    if (running) {
      await invoke('stop_capture');
      setRunning(false);
    } else {
      await invoke('start_capture');
      setRunning(true);
    }
  };

  return (
    <div className="flex h-full w-full flex-col rounded-xl bg-cue-bg p-3 shadow-2xl backdrop-blur-md ring-1 ring-white/10">
      <header
        data-tauri-drag-region
        className="flex items-center justify-between pb-2 cursor-grab active:cursor-grabbing"
      >
        <span className="text-xs font-semibold tracking-wide text-cue-text">cue</span>
        <span className="text-[10px] text-cue-muted">⌘\</span>
      </header>

      <ModeSelector mode={mode} setMode={setMode} />

      <div className="mt-2 flex items-center justify-between rounded-md bg-black/20 px-3 py-2 text-xs">
        <button
          type="button"
          onClick={toggle}
          className="rounded bg-cue-accent px-3 py-1 text-white"
        >
          {running ? 'Stop' : 'Start'}
        </button>
        <Dot label="you" voiced={mic.voiced} />
        <Dot label="them" voiced={system.voiced} />
      </div>

      <main className="flex-1 overflow-y-auto py-3 text-sm text-cue-text">
        {children ?? (
          <div className="flex h-full items-center justify-center text-center text-xs text-cue-muted">
            <div>Audio test ready. Transcripts in Task 8.</div>
          </div>
        )}
      </main>

      <footer className="border-t border-white/10 pt-2 text-[10px] text-cue-muted">
        Mode: <span className="text-cue-text">{mode}</span>
      </footer>
    </div>
  );
}

function Dot({ label, voiced }: { label: string; voiced: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-cue-muted">{label}</span>
      <span
        className={
          'h-2 w-2 rounded-full transition-opacity ' +
          (voiced ? 'bg-green-400 opacity-100' : 'bg-green-400 opacity-20')
        }
      />
    </div>
  );
}
