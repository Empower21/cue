'use client';

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Utterance } from './useCopilotState';

interface Props {
  utterances: Utterance[];
}

export function TranscriptView({ utterances }: Props) {
  const { t } = useTranslation();
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [utterances.length]);

  if (utterances.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-center text-sm text-cue-muted">
        {t('panel.pressStart')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 pb-4">
      {utterances.map((u) => (
        <div
          key={u.id}
          className={
            'rounded-lg p-3 text-sm leading-snug ' +
            (u.channel === 'mic'
              ? 'self-end bg-cue-accent/20 text-cue-text'
              : 'self-start bg-cue-surface text-cue-text') +
            (u.isFinal ? '' : ' opacity-70')
          }
        >
          <span className="mr-2 text-[10px] uppercase tracking-wide text-cue-muted">
            {u.channel === 'mic' ? t('audio.you') : t('audio.them')}
          </span>
          {u.text}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
