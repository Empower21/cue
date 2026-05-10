import { useEffect, useRef } from 'react';
import { useTranscript } from '../hooks/useTauriEvents';

export function TranscriptStream() {
  const utterances = useTranscript();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [utterances.length]);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto pr-1">
      {utterances.length === 0 && (
        <p className="text-center text-xs text-cue-muted">Waiting for audio…</p>
      )}
      <ul className="space-y-2">
        {utterances.map((u) => (
          <li key={u.id} className="text-xs">
            <span
              className={
                'mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ' +
                (u.channel === 'mic'
                  ? 'bg-cue-accent/30 text-cue-accent'
                  : 'bg-amber-500/20 text-amber-300')
              }
            >
              {u.channel === 'mic' ? 'you' : 'them'}
            </span>
            <span className={u.isFinal ? 'text-cue-text' : 'text-cue-muted italic'}>
              {u.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
