import { useState, type ReactNode } from 'react';
import { ModeSelector, type Mode } from './ModeSelector';

interface OverlayPanelProps {
  children?: ReactNode;
}

export function OverlayPanel({ children }: OverlayPanelProps) {
  const [mode, setMode] = useState<Mode>('listen');

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

      <main className="flex-1 overflow-y-auto py-3 text-sm text-cue-text">
        {children ?? (
          <div className="flex h-full items-center justify-center text-center text-xs text-cue-muted">
            <div>
              Foundation ready.
              <br />
              Audio + AI in Plan 2.
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-white/10 pt-2 text-[10px] text-cue-muted">
        Mode: <span className="text-cue-text">{mode}</span>
      </footer>
    </div>
  );
}
