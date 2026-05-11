import type { Dispatch, SetStateAction } from 'react';

export type Mode = 'listen' | 'ask' | 'auto';

interface ModeSelectorProps {
  mode: Mode;
  setMode: Dispatch<SetStateAction<Mode>>;
}

const MODES: ReadonlyArray<{ id: Mode; label: string }> = [
  { id: 'listen', label: 'Listen' },
  { id: 'ask', label: 'Ask' },
  { id: 'auto', label: 'Auto' },
];

export function ModeSelector({ mode, setMode }: ModeSelectorProps) {
  return (
    <div className="flex gap-1 rounded-md bg-cue-surface p-1">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => setMode(m.id)}
          className={
            'flex-1 rounded px-3 py-1 text-xs transition ' +
            (mode === m.id
              ? 'bg-cue-accent text-white'
              : 'text-cue-muted hover:text-cue-text')
          }
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
