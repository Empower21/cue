import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

export type Mode = 'listen' | 'ask' | 'auto';

interface ModeSelectorProps {
  mode: Mode;
  setMode: Dispatch<SetStateAction<Mode>>;
}

const MODE_IDS: ReadonlyArray<Mode> = ['listen', 'ask', 'auto'];

export function ModeSelector({ mode, setMode }: ModeSelectorProps) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-1 rounded-md bg-cue-surface p-1">
      {MODE_IDS.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => setMode(id)}
          className={
            'flex-1 rounded px-3 py-1 text-xs transition ' +
            (mode === id
              ? 'bg-cue-accent text-white'
              : 'text-cue-muted hover:text-cue-text')
          }
        >
          {t(`modes.${id}`)}
        </button>
      ))}
    </div>
  );
}
